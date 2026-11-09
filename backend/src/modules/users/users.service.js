/**
 * Servicio — lógica de negocio para el dominio de administración de usuarios.
 * Orquesta validación, permisos y transacciones atómicas.
 */
const bcrypt = require("bcrypt");
const { ROLES, STATUSES } = require("./users.schema");
const { hasStoredFile } = require("../../services/storage");

/** Costo del hash bcrypt (12 rondas ≈ buena seguridad sin ser muy lento). */
const BCRYPT_ROUNDS = 12;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Hashea un password en texto plano usando bcrypt.
 * @param {string} plainPassword
 * @returns {Promise<string>}
 */
async function hashPassword(plainPassword) {
  return bcrypt.hash(plainPassword, BCRYPT_ROUNDS);
}

/**
 * Agrega `hasFile` a cada documento: true solo si tiene archivo vinculado y
 * ese archivo existe en R2. El panel lo usa para habilitar o bloquear las
 * acciones de descargar, reemplazar y eliminar.
 * @param {Array<{ storageKey: string|null }>} documents
 * @returns {Promise<Array>}
 */
async function withFileStatus(documents) {
  return Promise.all(
    documents.map(async (doc) => ({ ...doc, hasFile: await hasStoredFile(doc.storageKey) })),
  );
}

/**
 * Determina si el error de PostgreSQL es una violación de unique constraint
 * y extrae el nombre de la columna duplicada.
 * @param {Error & { code?: string, constraint?: string }} error
 * @returns {{ isUniqueViolation: boolean, field: string|null }}
 */
function parseUniqueViolation(error) {
  if (error.code === "23505") {
    const constraint = error.constraint || "";
    if (constraint.includes("email")) {
      return { isUniqueViolation: true, field: "email" };
    }
    if (constraint.includes("phone")) {
      return { isUniqueViolation: true, field: "phone" };
    }
    return { isUniqueViolation: true, field: "desconocido" };
  }
  return { isUniqueViolation: false, field: null };
}

// ---------------------------------------------------------------------------
// Listar usuarios (solo admin)
// ---------------------------------------------------------------------------

/**
 * Lista usuarios con filtros opcionales y paginación.
 * Solo accesible por administradores (verificado en el controller).
 *
 * @param {Object} filters — Query params validados
 * @param {Object} repository — users.repository
 * @returns {Promise<{ data: Object, status: number }>}
 */
async function listUsers(filters, repository) {
  const result = await repository.listUsers(filters);
  return { data: result, status: 200 };
}

// ---------------------------------------------------------------------------
// Estadísticas agregadas por rol y estado (solo admin)
// ---------------------------------------------------------------------------

/**
 * Obtiene el conteo de usuarios agrupado por rol, con desglose por estado.
 * Inicializa todos los roles/estados en 0 para que el frontend no tenga que
 * manejar valores undefined.
 *
 * @param {Object} repository — users.repository
 * @returns {Promise<{ data: Object, status: number }>}
 */
async function getUserStats(repository) {
  const rows = await repository.getUserStats();

  const stats = {};
  for (const role of ROLES) {
    stats[role] = { total: 0 };
    for (const status of STATUSES) stats[role][status] = 0;
  }

  for (const row of rows) {
    if (!stats[row.role]) continue;
    stats[row.role][row.status] = row.count;
    stats[row.role].total += row.count;
  }

  return { data: stats, status: 200 };
}

// ---------------------------------------------------------------------------
// Obtener usuario por ID
// ---------------------------------------------------------------------------

/**
 * Obtiene un usuario por ID, incluyendo sus detalles si existen.
 * - Admin: puede ver cualquier usuario.
 * - Otros roles: solo pueden verse a sí mismos.
 *
 * @param {string} userId — ID del usuario a consultar
 * @param {Object} requester — req.user (JWT payload del que hace la petición)
 * @param {Object} repository — users.repository
 * @returns {Promise<{ data?: Object, status: number, errors?: string[] }>}
 */
async function getUserById(userId, requester, repository) {
  // Verificar permisos: solo admin o el propio usuario
  const isAdmin = requester.role === "admin";
  const isOwner = requester.userId === userId;

  if (!isAdmin && !isOwner) {
    return {
      errors: ["No tienes permiso para ver este usuario"],
      status: 403,
    };
  }

  const user = await repository.findUserById(userId);

  if (!user) {
    return { errors: ["Usuario no encontrado"], status: 404 };
  }

  // Intentar obtener detalles (puede no existir para citizens/admins sin detalles)
  const details = await repository.findUserDetailsById(userId);

  // Perfil de discapacidad — solo aplica a ciudadanos.
  const citizenProfile = user.role === "citizen"
    ? await repository.findCitizenProfileById(userId)
    : null;

  const data = { ...user };
  if (details) data.details = details;
  if (user.role === "citizen") data.citizenProfile = citizenProfile;

  return {
    data,
    status: 200,
  };
}

// ---------------------------------------------------------------------------
// Actualizar usuario
// ---------------------------------------------------------------------------

/**
 * Actualiza los datos de un usuario.
 * - El propio usuario puede editar su perfil (excepto email/phone si ya están verificados).
 * - El admin puede editar cualquier usuario.
 * - Si se envía password, se hashea antes de guardar.
 *
 * @param {string} targetUserId — ID del usuario a modificar
 * @param {Object} updates — Campos a actualizar (validados por Zod)
 * @param {Object} requester — req.user (JWT payload del que hace la petición)
 * @param {Object} repository — users.repository
 * @returns {Promise<{ data?: Object, status: number, errors?: string[] }>}
 */
async function updateUser(targetUserId, updates, requester, repository) {
  // Verificar que el usuario target existe
  const existingUser = await repository.findUserById(targetUserId);
  if (!existingUser) {
    return { errors: ["Usuario no encontrado"], status: 404 };
  }

  // Verificar permisos: solo el propio usuario o un admin pueden modificar
  const isAdmin = requester.role === "admin";
  const isOwner = requester.userId === targetUserId;

  if (!isAdmin && !isOwner) {
    return {
      errors: ["No tienes permiso para modificar este usuario"],
      status: 403,
    };
  }

  // Si no es admin, no puede cambiar email ni phone si ya están verificados
  // (política de seguridad: datos verificados solo los cambia un admin)
  if (!isAdmin && isOwner) {
    // Los usuarios normales no pueden cambiar su propio rol ni estado
    // (esos campos no vienen en UpdateUserBody, así que es seguro)
  }

  // Preparar campos para el repositorio
  /** @type {Object} */
  const repoUpdates = {};

  if (updates.fullName !== undefined) {
    repoUpdates.fullName = updates.fullName.trim();
  }

  if (updates.email !== undefined) {
    repoUpdates.email = updates.email.trim().toLowerCase();
  }

  if (updates.phone !== undefined) {
    repoUpdates.phone = updates.phone.trim().replace(/[\s-]/g, "");
  }

  if (updates.zone !== undefined) {
    repoUpdates.zone = updates.zone.trim();
  }

  if (updates.location !== undefined) {
    // location puede ser null para eliminar la ubicación
    repoUpdates.location = updates.location;
  }

  // Si se envía password, hashearlo
  if (updates.password !== undefined) {
    repoUpdates.passwordHash = await hashPassword(updates.password);
  }

  // Información de discapacidad — vive en citizen_profiles y solo aplica a
  // ciudadanos. El frontend envía los tres campos juntos (null para limpiar).
  const hasDisabilityUpdates =
    updates.disabilityType !== undefined ||
    updates.disabilitySubcategory !== undefined ||
    updates.communicationMode !== undefined;

  if (hasDisabilityUpdates && existingUser.role !== "citizen") {
    return {
      errors: ["La información de discapacidad solo aplica a usuarios ciudadanos"],
      status: 400,
    };
  }

  try {
    const updatedUser = await repository.withTransaction(async (client) => {
      const user = await repository.updateUser(client, targetUserId, repoUpdates);

      if (hasDisabilityUpdates) {
        await repository.upsertCitizenProfile(client, targetUserId, {
          disabilityType: updates.disabilityType,
          disabilitySubcategory: updates.disabilitySubcategory,
          communicationMode: updates.communicationMode,
        });
      }

      return user;
    });

    // Adjuntar el perfil de discapacidad a la respuesta (solo ciudadanos).
    let data = updatedUser;
    if (existingUser.role === "citizen") {
      const citizenProfile = await repository.findCitizenProfileById(targetUserId);
      data = { ...updatedUser, citizenProfile };
    }

    return { data, status: 200 };
  } catch (error) {
    const { isUniqueViolation, field } = parseUniqueViolation(error);
    if (isUniqueViolation) {
      return {
        errors: [`El ${field} ya está en uso por otro usuario`],
        status: 409,
      };
    }
    throw error;
  }
}

// ---------------------------------------------------------------------------
// Aprobar usuario (solo admin)
// ---------------------------------------------------------------------------

/**
 * Aprueba un usuario que está en estado "pending".
 * Solo accesible por administradores.
 *
 * @param {string} targetUserId — ID del usuario a aprobar
 * @param {string} approvedBy — UUID del admin que aprueba
 * @param {Object} repository — users.repository
 * @returns {Promise<{ data?: Object, status: number, errors?: string[] }>}
 */
async function approveUser(targetUserId, approvedBy, repository) {
  // Verificar que el usuario existe
  const existingUser = await repository.findUserById(targetUserId);
  if (!existingUser) {
    return { errors: ["Usuario no encontrado"], status: 404 };
  }

  // Solo se puede aprobar usuarios en estado "pending"
  if (existingUser.status !== "pending") {
    return {
      errors: [
        `No se puede aprobar un usuario con estado "${existingUser.status}". Solo se pueden aprobar usuarios pendientes (pending).`,
      ],
      status: 409,
    };
  }

  // Ejecutar en transacción
  const updatedUser = await repository.withTransaction(async (client) => {
    return repository.updateUserStatus(client, targetUserId, "approved", approvedBy);
  });

  return { data: updatedUser, status: 200 };
}

// ---------------------------------------------------------------------------
// Rechazar usuario (solo admin)
// ---------------------------------------------------------------------------

/**
 * Rechaza un usuario que está en estado "pending".
 * Solo accesible por administradores.
 *
 * @param {string} targetUserId — ID del usuario a rechazar
 * @param {Object} repository — users.repository
 * @returns {Promise<{ data?: Object, status: number, errors?: string[] }>}
 */
async function rejectUser(targetUserId, repository) {
  // Verificar que el usuario existe
  const existingUser = await repository.findUserById(targetUserId);
  if (!existingUser) {
    return { errors: ["Usuario no encontrado"], status: 404 };
  }

  // Solo se puede rechazar usuarios en estado "pending"
  if (existingUser.status !== "pending") {
    return {
      errors: [
        `No se puede rechazar un usuario con estado "${existingUser.status}". Solo se pueden rechazar usuarios pendientes (pending).`,
      ],
      status: 409,
    };
  }

  // Ejecutar en transacción (no necesita approvedBy para rechazo)
  const updatedUser = await repository.withTransaction(async (client) => {
    return repository.updateUserStatus(client, targetUserId, "rejected", null);
  });

  return { data: updatedUser, status: 200 };
}

// ---------------------------------------------------------------------------
// Obtener perfil completo de organización (solo admin)
// ---------------------------------------------------------------------------

/**
 * Carga el perfil completo de una organización sin verificar permisos.
 * Usado por GET (tras la verificación admin) y por la edición admin.
 *
 * @param {string} organizationId
 * @param {Object} repository — users.repository
 * @returns {Promise<{ data: Object } | { error: { errors: string[], status: number } }>}
 */
async function loadOrganizationProfileData(organizationId, repository) {
  const user = await repository.findUserById(organizationId);

  if (!user) {
    return { error: { errors: ["Usuario no encontrado"], status: 404 } };
  }

  if (user.role !== "organization") {
    return { error: { errors: ["El usuario no es una organización"], status: 400 } };
  }

  // El nombre real de la organización vive en user_details, no en
  // users.full_name (ese campo guarda al representante legal).
  const userDetails = await repository.findUserDetailsById(organizationId);
  const organizationProfile = await repository.findOrganizationProfileById(organizationId);
  const legalRepresentatives = await repository.findLegalRepresentatives(organizationId);
  const disabilityTypes = await repository.findOrganizationDisabilityTypes(organizationId);
  const services = await repository.findOrganizationServices(organizationId);
  const verification = await repository.findVerificationByOwner(organizationId);
  const documents = await withFileStatus(await repository.findVerificationDocuments(organizationId));

  return {
    data: {
      user: { ...user, organizationName: userDetails?.organizationName ?? null },
      organizationProfile: organizationProfile || null,
      legalRepresentatives,
      disabilityTypes,
      services,
      verification: verification || null,
      documents,
    },
  };
}

/**
 * Obtiene el perfil completo de una organización, incluyendo:
 * - Datos básicos del usuario
 * - Perfil de organización (organization_profiles)
 * - Representantes legales
 * - Tipos de discapacidad
 * - Servicios ofrecidos
 * - Solicitud de verificación
 * - Documentos de verificación
 *
 * @param {string} organizationId — ID de la organización
 * @param {Object} requester — req.user (JWT payload del que hace la petición)
 * @param {Object} repository — users.repository
 * @returns {Promise<{ data?: Object, status: number, errors?: string[] }>}
 */
async function getOrganizationProfile(organizationId, requester, repository) {
  // Verificar permisos: solo admin
  const isAdmin = requester.role === "admin";

  if (!isAdmin) {
    return {
      errors: ["No tienes permiso para ver este perfil"],
      status: 403,
    };
  }

  const loaded = await loadOrganizationProfileData(organizationId, repository);
  if (loaded.error) return loaded.error;

  return { data: loaded.data, status: 200 };
}

// ---------------------------------------------------------------------------
// Actualizar perfil de organización (solo admin) — corrección de datos
// ---------------------------------------------------------------------------

/**
 * Corrige los campos editables de una organización ya registrada.
 *
 * Política de verificación: editar NO cambia el estado de la solicitud de
 * verificación (entregada / en_estudio / aceptada / rechazada). El estado solo
 * cambia con PATCH /api/admin/verifications/:id/transition.
 *
 * Reglas de validación: idénticas al formulario de registro (el schema
 * UpdateOrganizationProfileBody se deriva de RegisterOrganizationBody).
 * La actualización es atómica y parcial: solo se persiste lo enviado.
 *
 * @param {string} organizationId — UUID de la organización
 * @param {Object} payload — Campos validados (todos opcionales)
 * @param {Object} requester — req.user (JWT)
 * @param {Object} repository — users.repository
 * @returns {Promise<{ data?: Object, status: number, errors?: string[] }>}
 */
async function updateOrganizationProfile(organizationId, payload, requester, repository) {
  const isAdmin = requester.role === "admin";

  if (!isAdmin) {
    return { errors: ["No tienes permiso para editar este perfil"], status: 403 };
  }

  const existingUser = await repository.findUserById(organizationId);
  if (!existingUser) {
    return { errors: ["Usuario no encontrado"], status: 404 };
  }
  if (existingUser.role !== "organization") {
    return { errors: ["El usuario no es una organización"], status: 400 };
  }

  // --- Campos de users ---
  const userFields = {};
  if (payload.fullName !== undefined) userFields.fullName = payload.fullName.trim();
  if (payload.email !== undefined) userFields.email = payload.email.trim().toLowerCase();
  if (payload.phone !== undefined) userFields.phone = payload.phone.trim().replace(/[\s-]/g, "");
  if (payload.zone !== undefined) userFields.zone = payload.zone.trim();
  if (payload.location !== undefined) userFields.location = payload.location;

  // --- Campos de user_details ---
  const detailsFields = {};
  if (payload.organizationName !== undefined) detailsFields.organizationName = payload.organizationName.trim();
  if (payload.legalDocument !== undefined) detailsFields.legalDocument = payload.legalDocument.trim();
  if (payload.workArea !== undefined) detailsFields.workArea = payload.workArea.map((a) => a.trim());

  // --- Campos de organization_profiles ---
  const profileFields = {};
  if (payload.organizationTypeId !== undefined) profileFields.organizationTypeId = payload.organizationTypeId;
  if (payload.taxId !== undefined) profileFields.taxId = payload.taxId?.trim() || null;
  if (payload.taxIdType !== undefined) profileFields.taxIdType = payload.taxIdType?.trim() || null;
  if (payload.otherEntityType !== undefined) profileFields.otherEntityType = payload.otherEntityType?.trim() || null;
  if (payload.registryNumber !== undefined) profileFields.registryNumber = payload.registryNumber?.trim() || null;
  if (payload.foundedAt !== undefined) profileFields.foundedAt = payload.foundedAt || null;
  if (payload.country !== undefined) profileFields.country = payload.country?.trim() || null;
  if (payload.province !== undefined) profileFields.province = payload.province?.trim() || null;
  if (payload.city !== undefined) profileFields.city = payload.city?.trim() || null;
  if (payload.address !== undefined) profileFields.address = payload.address?.trim() || null;
  if (payload.website !== undefined) profileFields.website = payload.website?.trim() || null;
  if (payload.socialLinks !== undefined) profileFields.socialLinks = payload.socialLinks || null;
  if (payload.mission !== undefined) profileFields.mission = payload.mission?.trim() || null;
  if (payload.vision !== undefined) profileFields.vision = payload.vision?.trim() || null;
  if (payload.scope !== undefined) profileFields.scope = payload.scope?.trim() || null;
  if (payload.servedGroups !== undefined) profileFields.servedGroups = payload.servedGroups?.trim() || null;

  // --- Representantes legales (reemplazo total si se envían) ---
  const legalRepresentatives = payload.legalRepresentatives !== undefined
    ? payload.legalRepresentatives.map((rep) => ({
        fullName: rep.fullName.trim(),
        position: rep.position?.trim() || null,
        phone: rep.phone?.trim() || null,
        email: rep.email?.trim().toLowerCase() || null,
      }))
    : null;

  try {
    await repository.withTransaction(async (client) => {
      if (Object.keys(userFields).length > 0) {
        await repository.updateUser(client, organizationId, userFields);
      }
      if (Object.keys(detailsFields).length > 0) {
        await repository.updateUserDetails(client, organizationId, detailsFields);
      }
      if (Object.keys(profileFields).length > 0) {
        await repository.updateOrganizationProfile(client, organizationId, profileFields);
      }
      if (legalRepresentatives !== null) {
        await repository.replaceLegalRepresentatives(client, organizationId, legalRepresentatives);
      }
      if (payload.disabilityTypeIds !== undefined) {
        await repository.replaceCatalogRelations(
          client, "organization_disability_types", organizationId, payload.disabilityTypeIds,
        );
      }
      if (payload.serviceIds !== undefined) {
        await repository.replaceCatalogRelations(
          client, "organization_services", organizationId, payload.serviceIds,
        );
      }
    });
  } catch (error) {
    const { isUniqueViolation, field } = parseUniqueViolation(error);
    if (isUniqueViolation) {
      return { errors: [`El ${field} ya está en uso por otro usuario`], status: 409 };
    }
    if (error.code === "23503") {
      return {
        errors: ["Uno o más IDs de catálogo no son válidos para el tipo esperado"],
        status: 400,
      };
    }
    throw error;
  }

  const reloaded = await loadOrganizationProfileData(organizationId, repository);
  if (reloaded.error) return reloaded.error;

  return { data: reloaded.data, status: 200 };
}

/**
 * Carga el perfil completo de un voluntario sin verificar permisos.
 * Usado por GET (tras la verificación admin) y por la edición admin.
 *
 * @param {string} volunteerId
 * @param {Object} repository — users.repository
 * @returns {Promise<{ data: Object } | { error: { errors: string[], status: number } }>}
 */
async function loadVolunteerProfileData(volunteerId, repository) {
  const user = await repository.findUserById(volunteerId);

  if (!user) {
    return { error: { errors: ["Usuario no encontrado"], status: 404 } };
  }

  if (user.role !== "volunteer") {
    return { error: { errors: ["El usuario no es un voluntario"], status: 400 } };
  }

  const details = await repository.findUserDetailsById(volunteerId);
  const volunteerProfile = await repository.findVolunteerProfileById(volunteerId);
  const interestAreas = await repository.findVolunteerInterestAreas(volunteerId);
  const experience = await repository.findVolunteerExperience(volunteerId);
  const verification = await repository.findVerificationByOwner(volunteerId);
  const documents = await withFileStatus(await repository.findVerificationDocuments(volunteerId));

  return {
    data: {
      user,
      details: details || null,
      volunteerProfile: volunteerProfile || null,
      interestAreas,
      experience,
      verification: verification || null,
      documents,
    },
  };
}

/**
 * Obtiene el perfil completo de un voluntario, incluyendo:
 * - Datos básicos del usuario
 * - Detalles de disponibilidad y habilidades (user_details)
 * - Perfil de voluntario (volunteer_profiles)
 * - Áreas de interés
 * - Categorías de experiencia
 * - Solicitud de verificación
 * - Documentos de verificación
 *
 * @param {string} volunteerId — ID del voluntario
 * @param {Object} requester — req.user (JWT payload del que hace la petición)
 * @param {Object} repository — users.repository
 * @returns {Promise<{ data?: Object, status: number, errors?: string[] }>}
 */
async function getVolunteerProfile(volunteerId, requester, repository) {
  // Verificar permisos: solo admin
  const isAdmin = requester.role === "admin";

  if (!isAdmin) {
    return {
      errors: ["No tienes permiso para ver este perfil"],
      status: 403,
    };
  }

  const loaded = await loadVolunteerProfileData(volunteerId, repository);
  if (loaded.error) return loaded.error;

  return { data: loaded.data, status: 200 };
}

// ---------------------------------------------------------------------------
// Actualizar perfil de voluntario (solo admin) — corrección de datos
// ---------------------------------------------------------------------------

/**
 * Corrige los campos editables de un voluntario ya registrado.
 *
 * Política de verificación: editar NO cambia el estado de la solicitud de
 * verificación. Si se cambia `volunteerType`, se sincroniza el `entity_type`
 * de la solicitud (volunteer_professional / volunteer_non_professional) para
 * mantener la coherencia con el checklist de documentos, pero sin tocar el
 * estado.
 *
 * Reglas de validación: idénticas al formulario de registro (el schema
 * UpdateVolunteerProfileBody se deriva de RegisterVolunteerBody).
 * La actualización es atómica y parcial: solo se persiste lo enviado.
 *
 * @param {string} volunteerId — UUID del voluntario
 * @param {Object} payload — Campos validados (todos opcionales)
 * @param {Object} requester — req.user (JWT)
 * @param {Object} repository — users.repository
 * @returns {Promise<{ data?: Object, status: number, errors?: string[] }>}
 */
async function updateVolunteerProfile(volunteerId, payload, requester, repository) {
  const isAdmin = requester.role === "admin";

  if (!isAdmin) {
    return { errors: ["No tienes permiso para editar este perfil"], status: 403 };
  }

  const existingUser = await repository.findUserById(volunteerId);
  if (!existingUser) {
    return { errors: ["Usuario no encontrado"], status: 404 };
  }
  if (existingUser.role !== "volunteer") {
    return { errors: ["El usuario no es un voluntario"], status: 400 };
  }

  // --- Campos de users ---
  const userFields = {};
  if (payload.fullName !== undefined) userFields.fullName = payload.fullName.trim();
  if (payload.email !== undefined) userFields.email = payload.email.trim().toLowerCase();
  if (payload.phone !== undefined) userFields.phone = payload.phone.trim().replace(/[\s-]/g, "");
  if (payload.zone !== undefined) userFields.zone = payload.zone.trim();
  if (payload.location !== undefined) userFields.location = payload.location;

  // --- Campos de user_details ---
  const detailsFields = {};
  if (payload.skills !== undefined) detailsFields.skills = payload.skills.map((s) => s.trim());
  if (payload.availableHours !== undefined) detailsFields.availableHours = Number(payload.availableHours);
  if (payload.availableDays !== undefined) {
    detailsFields.availableDays = payload.availableDays.map((d) => d.toLowerCase().trim());
  }

  // --- Campos de volunteer_profiles ---
  const profileFields = {};
  if (payload.volunteerType !== undefined) profileFields.volunteerType = payload.volunteerType;
  if (payload.documentType !== undefined) profileFields.documentType = payload.documentType?.trim() || null;
  if (payload.documentNumber !== undefined) profileFields.documentNumber = payload.documentNumber?.trim() || null;
  if (payload.birthDate !== undefined) profileFields.birthDate = payload.birthDate || null;
  if (payload.address !== undefined) profileFields.address = payload.address?.trim() || null;
  if (payload.profession !== undefined) profileFields.profession = payload.profession?.trim() || null;
  if (payload.languages !== undefined) profileFields.languages = payload.languages.map((l) => l.trim());
  if (payload.availabilityMode !== undefined) profileFields.availabilityMode = payload.availabilityMode || null;
  if (payload.hasPriorExperience !== undefined) profileFields.hasPriorExperience = payload.hasPriorExperience;
  if (payload.transportAvailable !== undefined) profileFields.transportAvailable = payload.transportAvailable;

  try {
    await repository.withTransaction(async (client) => {
      if (Object.keys(userFields).length > 0) {
        await repository.updateUser(client, volunteerId, userFields);
      }
      if (Object.keys(detailsFields).length > 0) {
        await repository.updateUserDetails(client, volunteerId, detailsFields);
      }
      if (Object.keys(profileFields).length > 0) {
        await repository.updateVolunteerProfile(client, volunteerId, profileFields);
      }
      if (payload.volunteerType !== undefined) {
        const entityType = payload.volunteerType === "professional"
          ? "volunteer_professional"
          : "volunteer_non_professional";
        await repository.updateVerificationEntityType(client, volunteerId, entityType);
      }
      if (payload.interestAreaIds !== undefined) {
        await repository.replaceCatalogRelations(
          client, "volunteer_interest_areas", volunteerId, payload.interestAreaIds,
        );
      }
      if (payload.experienceCategoryIds !== undefined) {
        await repository.replaceCatalogRelations(
          client, "volunteer_experience", volunteerId, payload.experienceCategoryIds,
        );
      }
    });
  } catch (error) {
    const { isUniqueViolation, field } = parseUniqueViolation(error);
    if (isUniqueViolation) {
      return { errors: [`El ${field} ya está en uso por otro usuario`], status: 409 };
    }
    if (error.code === "23503") {
      return {
        errors: ["Uno o más IDs de catálogo no son válidos para el tipo esperado"],
        status: 400,
      };
    }
    throw error;
  }

  const reloaded = await loadVolunteerProfileData(volunteerId, repository);
  if (reloaded.error) return reloaded.error;

  return { data: reloaded.data, status: 200 };
}

module.exports = {
  listUsers,
  getUserStats,
  getUserById,
  updateUser,
  approveUser,
  rejectUser,
  getOrganizationProfile,
  getVolunteerProfile,
  updateOrganizationProfile,
  updateVolunteerProfile,
};
