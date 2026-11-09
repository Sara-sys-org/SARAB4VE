/**
 * Servicio — lógica de negocio para el dominio de auth (registro).
 * Orquesta validación, hasheo de contraseñas y transacciones atómicas.
 */
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const crypto = require("crypto");
const { jwtSecret, adminSecret, appBaseUrl, validatorEmails } = require("../../config");
const emailService = require("../../services/email.service");
const { buildConfirmationEmail, buildValidatorEmail } = require("../../services/emailTemplates/verificationEmails");

/** Costo del hash bcrypt (12 rondas ≈ buena seguridad sin ser muy lento). */
const BCRYPT_ROUNDS = 12;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Duración del access token: 8 horas. */
const TOKEN_EXPIRATION = "8h";

/**
 * Hashea un password en texto plano usando bcrypt.
 * @param {string} plainPassword
 * @returns {Promise<string>}
 */
async function hashPassword(plainPassword) {
  return bcrypt.hash(plainPassword, BCRYPT_ROUNDS);
}

/**
 * Emite un JWT para un usuario recién registrado.
 * Permite que el usuario acceda inmediatamente a endpoints protegidos
 * (ej: completar su perfil de verificación) sin pasar por login,
 * que bloquearía a usuarios en estado 'pending'.
 *
 * @param {Object} user — fila de users con id, role, status
 * @returns {string} — token JWT firmado
 */
function issueToken(user) {
  if (!jwtSecret) {
    throw new Error("JWT_SECRET no está configurado en el entorno");
  }

  return jwt.sign(
    { userId: user.id, role: user.role, status: user.status },
    jwtSecret,
    { expiresIn: TOKEN_EXPIRATION },
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
    // El mensaje de PG incluye el nombre del constraint, ej: "users_email_key"
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

function buildVerificationLink(token) {
  return `${appBaseUrl.replace(/\/$/, "")}/api/verification/tokens/${token}?action=iniciar_revision`;
}

async function createVerificationTokensAndEmails({ result, ownerName, entityType, verificationRequest, repository, trigger }) {
  if (!verificationRequest || !verificationRequest.id) {
    return;
  }

  try {
    const tokenRecord = await repository.insertVerificationToken(
      trigger.client || null,
      verificationRequest.id,
      "iniciar_revision",
    );

    const confirmation = buildConfirmationEmail({
      nombreSolicitante: ownerName,
      tipoSolicitud: entityType === "organization" ? "Organización" : "Voluntariado",
      idSolicitud: verificationRequest.ownerId || result?.id || ownerName,
      fechaEnvio: new Date().toISOString(),
    });

    const tokenLink = buildVerificationLink(tokenRecord?.token || crypto.randomUUID());
    const validatorList = (validatorEmails || "")
      .split(",")
      .map((entry) => entry.trim())
      .filter(Boolean);

    const validatorEmail = buildValidatorEmail({
      nombreSolicitante: ownerName,
      tipoSolicitud: entityType === "organization" ? "Organización" : "Voluntariado",
      idSolicitud: verificationRequest.ownerId || result?.id || ownerName,
      fechaEnvio: new Date().toISOString(),
      resumenDatos: `Solicitante: ${ownerName} | Tipo: ${entityType === "organization" ? "Organización" : "Voluntariado"}`,
      listaDocumentos: "Documentación adjunta según formulario del registro",
      linkIniciarRevision: tokenLink,
    });

    await emailService.sendEmail(result.email || ownerName, confirmation.subject, confirmation.html);
    const validatorsTarget = validatorList.length > 0 ? validatorList.join(",") : "validadores@sara.org";
    await emailService.sendEmail(validatorsTarget, validatorEmail.subject, validatorEmail.html);
  } catch (error) {
    console.error("Error enviando correos de verificación:", error);
  }
}

// ---------------------------------------------------------------------------
// Registro — Citizen
// ---------------------------------------------------------------------------

/**
 * Registra un ciudadano.
 * Solo crea registro en users (status = approved automáticamente).
 * No crea fila en user_details.
 *
 * @param {Object} payload — cuerpo del request sin procesar
 * @param {Object} schema — auth.schema
 * @param {Object} repository — auth.repository
 * @returns {Promise<{ data: Object, status: number, errors?: string[] }>}
 */
async function registerCitizen(payload, schema, repository) {
  const normalized = schema.normalizeRegisterCitizen(payload);
  const passwordHash = await hashPassword(normalized.user.password);

  try {
    const user = await repository.withTransaction(async (client) => {
      const insertedUser = await repository.insertUser(client, {
        ...normalized.user,
        passwordHash,
      });

      if (normalized.profile.country) {
        await repository.insertCitizenProfile(client, insertedUser.id, normalized.profile);
      }

      return insertedUser;
    });

    const token = issueToken(user);

    return { data: { token, user }, status: 201 };
  } catch (error) {
    const { isUniqueViolation, field } = parseUniqueViolation(error);
    if (isUniqueViolation) {
      return {
        errors: [`El ${field} ya está registrado en el sistema`],
        status: 409,
      };
    }
    throw error;
  }
}

// ---------------------------------------------------------------------------
// Registro — Volunteer
// ---------------------------------------------------------------------------

/**
 * Registra un voluntario.
 * Crea registro en users (status = pending) + fila en user_details.
 * Usa transacción atómica: si falla details, hace rollback de users.
 *
 * @param {Object} payload — cuerpo del request sin procesar
 * @param {Object} schema — auth.schema
 * @param {Object} repository — auth.repository
 * @returns {Promise<{ data: Object, status: number, errors?: string[] }>}
 */
async function registerVolunteer(payload, schema, repository) {
  const hasExtendedFields = !!payload.volunteerType;

  const passwordHash = hasExtendedFields
    ? await hashPassword(schema.normalizeRegisterVolunteerExtended(payload).user.password)
    : await hashPassword(schema.normalizeRegisterVolunteer(payload).user.password);

  try {
    const result = await repository.withTransaction(async (client) => {
      if (hasExtendedFields) {
        // Flujo extendido: crear usuario + perfil completo + verificación
        const normalized = schema.normalizeRegisterVolunteerExtended(payload);

        const user = await repository.insertUser(client, {
          ...normalized.user,
          passwordHash,
        });

        const details = await repository.insertUserDetails(
          client,
          user.id,
          normalized.details,
        );

        const profile = await repository.insertVolunteerProfile(client, {
          userId: user.id,
          ...normalized.profile,
        });

        for (const catalogId of normalized.interestAreaIds) {
          await repository.insertVolunteerInterestArea(client, user.id, catalogId);
        }

        for (const catalogId of normalized.experienceCategoryIds) {
          await repository.insertVolunteerExperience(client, user.id, catalogId);
        }

        const verification = await repository.insertVerificationRequest(
          client,
          user.id,
          normalized.entityType,
        );

        return { ...user, details, profile, verification };
      } else {
        // Flujo básico (legacy): solo usuario + detalles
        const normalized = schema.normalizeRegisterVolunteer(payload);

        const user = await repository.insertUser(client, {
          ...normalized.user,
          passwordHash,
        });

        const details = await repository.insertUserDetails(
          client,
          user.id,
          normalized.details,
        );

        const verification = await repository.insertVerificationRequest(
          client,
          user.id,
          "volunteer_professional",
        );

        return { ...user, details, verification };
      }
    });

    await createVerificationTokensAndEmails({
      result,
      ownerName: result.fullName,
      entityType: result.verification.entityType,
      verificationRequest: result.verification,
      repository,
      trigger: { client: null },
    });

    const token = issueToken(result);

    return { data: { token, user: result }, status: 201 };
  } catch (error) {
    const { isUniqueViolation, field } = parseUniqueViolation(error);
    if (isUniqueViolation) {
      return {
        errors: [`El ${field} ya está registrado en el sistema`],
        status: 409,
      };
    }
    throw error;
  }
}

// ---------------------------------------------------------------------------
// Registro — Organization
// ---------------------------------------------------------------------------

/**
 * Registra una organización con perfil completo.
 * Crea: users + user_details + organization_profiles + legal_representatives
 *        + organization_disability_types + organization_services + verification_requests
 * Usa transacción atómica: si falla cualquier paso, hace rollback completo.
 *
 * @param {Object} payload — cuerpo del request sin procesar
 * @param {Object} schema — auth.schema
 * @param {Object} repository — auth.repository
 * @returns {Promise<{ data: Object, status: number, errors?: string[] }>}
 */
async function registerOrganization(payload, schema, repository) {
  // Usar el normalizador extendido si hay campos de perfil, sino el básico
  const hasExtendedFields = payload.organizationTypeId || payload.legalRepresentatives ||
    payload.disabilityTypeIds || payload.serviceIds || payload.mission || payload.country;

  const passwordHash = hasExtendedFields
    ? await hashPassword(schema.normalizeRegisterOrganizationExtended(payload).user.password)
    : await hashPassword(schema.normalizeRegisterOrganization(payload).user.password);

  try {
    const result = await repository.withTransaction(async (client) => {
      if (hasExtendedFields) {
        // Flujo extendido: crear usuario + perfil completo + verificación
        const normalized = schema.normalizeRegisterOrganizationExtended(payload);

        const user = await repository.insertUser(client, {
          ...normalized.user,
          passwordHash,
        });

        // Crear user_details (datos básicos)
        const details = await repository.insertUserDetails(
          client,
          user.id,
          normalized.details,
        );

        // Crear organization_profiles (perfil extendido)
        const profile = await repository.insertOrganizationProfile(
          client,
          user.id,
          normalized.profile,
        );

        // Crear legal_representatives
        const legalReps = [];
        for (const rep of normalized.legalRepresentatives) {
          const legalRep = await repository.insertLegalRepresentative(client, user.id, rep);
          legalReps.push(legalRep);
        }

        // Crear relaciones many-to-many: disability_types
        for (const disabilityTypeId of normalized.disabilityTypeIds) {
          await repository.insertOrganizationDisabilityType(client, user.id, disabilityTypeId);
        }

        // Crear relaciones many-to-many: services
        for (const serviceId of normalized.serviceIds) {
          await repository.insertOrganizationService(client, user.id, serviceId);
        }

        // Crear verification_request
        const verification = await repository.insertVerificationRequest(
          client,
          user.id,
          'organization',
        );

        return { ...user, details, profile, legalRepresentatives: legalReps, verification };
      } else {
        // Flujo básico (legacy): solo usuario + detalles
        const normalized = schema.normalizeRegisterOrganization(payload);

        const user = await repository.insertUser(client, {
          ...normalized.user,
          passwordHash,
        });

        const details = await repository.insertUserDetails(
          client,
          user.id,
          normalized.details,
        );

        return { ...user, details };
      }
    });

    await createVerificationTokensAndEmails({
      result,
      ownerName: result.fullName,
      entityType: "organization",
      verificationRequest: result.verification,
      repository,
      trigger: { client: null },
    });

    const token = issueToken(result);

    return { data: { token, user: result }, status: 201 };
  } catch (error) {
    const { isUniqueViolation, field } = parseUniqueViolation(error);
    if (isUniqueViolation) {
      return {
        errors: [`El ${field} ya está registrado en el sistema`],
        status: 409,
      };
    }
    throw error;
  }
}

// ---------------------------------------------------------------------------
// Registro — Admin
// ---------------------------------------------------------------------------

/**
 * Registra un administrador.
 * Solo crea registro en users (status = approved automáticamente).
 * No crea fila en user_details.
 * Protegido por ADMIN_SECRET: el payload debe incluir el secreto correcto.
 *
 * @param {Object} payload — cuerpo del request sin procesar
 * @param {Object} schema — auth.schema
 * @param {Object} repository — auth.repository
 * @returns {Promise<{ data: Object, status: number, errors?: string[] }>}
 */
async function registerAdmin(payload, schema, repository) {
  
  const normalized = schema.normalizeRegisterAdmin(payload);
  const passwordHash = await hashPassword(normalized.user.password);

  try {
    const user = await repository.withTransaction(async (client) => {
      return repository.insertUser(client, {
        ...normalized.user,
        passwordHash,
      });
    });

    return { data: user, status: 201 };
  } catch (error) {
    const { isUniqueViolation, field } = parseUniqueViolation(error);
    if (isUniqueViolation) {
      return {
        errors: [`El ${field} ya está registrado en el sistema`],
        status: 409,
      };
    }
    throw error;
  }
}

// ---------------------------------------------------------------------------
// Autenticación — Login
// ---------------------------------------------------------------------------

/** Estados de registro que NO pueden iniciar sesión. */
const BLOCKED_STATUSES = new Set(["pending", "rejected", "suspended"]);

/**
 * Inicia sesión con email + password.
 * Verifica credenciales, estado de registro, y emite un JWT.
 * Por seguridad, nunca revela si el email existe o no — siempre responde
 * "credenciales inválidas" ante cualquier fallo de autenticación, excepto
 * cuando la cuenta está bloqueada por estado (pending/rejected/suspended),
 * donde se informa el motivo real para que el usuario sepa qué esperar.
 *
 * @param {string} email
 * @param {string} password — texto plano
 * @param {Object} repository — auth.repository
 * @returns {Promise<{ data?: { token: string, user: Object }, status: number, errors?: string[] }>}
 */
async function login(email, password, repository) {
  // Buscar usuario por email
  const user = await repository.findUserByEmail(email);

  // Si no existe → credenciales inválidas (sin revelar si el email existe)
  if (!user) {
    return {
      errors: ["Credenciales inválidas"],
      status: 401,
    };
  }

  // Verificar que el estado permita iniciar sesión
  if (BLOCKED_STATUSES.has(user.status)) {
    const mensajes = {
      pending: "Tu cuenta está pendiente de aprobación. Recibirás una notificación cuando sea revisada.",
      rejected: "Tu cuenta ha sido rechazada. Contacta al equipo de soporte para más información.",
      suspended: "Tu cuenta ha sido suspendida. Contacta al equipo de soporte para más información.",
    };
    return {
      errors: [mensajes[user.status] || `Tu cuenta no puede iniciar sesión (estado: ${user.status})`],
      status: 403,
    };
  }

  // Comparar contraseñas
  const isPasswordValid = await bcrypt.compare(password, user.passwordHash);
  if (!isPasswordValid) {
    return {
      errors: ["Credenciales inválidas"],
      status: 401,
    };
  }

  // Generar JWT
  const token = issueToken(user);

  // Eliminar passwordHash de la respuesta
  const { passwordHash, ...safeUser } = user;

  return {
    data: { token, user: safeUser },
    status: 200,
  };
}

// ---------------------------------------------------------------------------
// Autenticación — Verify Token
// ---------------------------------------------------------------------------

/**
 * Verifica y decodifica un JWT.
 * @param {string} token
 * @returns {{ valid: boolean, payload?: { userId: string, role: string, status: string }, error?: string }}
 */
function verifyToken(token) {
  if (!jwtSecret) {
    return { valid: false, error: "JWT_SECRET no está configurado en el entorno" };
  }

  try {
    const payload = jwt.verify(token, jwtSecret);
    return { valid: true, payload };
  } catch (error) {
    if (error.name === "TokenExpiredError") {
      return { valid: false, error: "El token ha expirado. Inicia sesión nuevamente." };
    }
    if (error.name === "JsonWebTokenError") {
      return { valid: false, error: "Token inválido" };
    }
    return { valid: false, error: "Error al verificar el token" };
  }
}

// ---------------------------------------------------------------------------
// Completar registro — token de acción 'completar_registro' (HU-3)
// ---------------------------------------------------------------------------

/** Mensaje genérico: no distingue "no existe" de "usado" o "expirado". */
const COMPLETION_TOKEN_ERROR = "El enlace no es válido o ya fue usado";

/**
 * Carga un token de completar-registro solo si está en condiciones de
 * usarse: existe, no fue usado, no expiró, y la solicitud sigue en
 * 'aceptada'. Devuelve null en cualquier otro caso sin distinguir el motivo.
 * @param {string} token
 * @param {Object} repository — auth.repository
 * @returns {Promise<Object|null>}
 */
async function loadUsableCompletionToken(token, repository) {
  const record = await repository.findCompletionToken(token);

  if (!record) return null;
  if (record.usedAt) return null;
  if (record.expiresAt && new Date(record.expiresAt) <= new Date()) return null;
  if (record.requestStatus !== "aceptada") return null;

  return record;
}

/**
 * Valida un token de completar-registro para la pantalla pública.
 * @param {string} token
 * @param {Object} repository — auth.repository
 * @returns {Promise<{ data: { valid: boolean, status?: string } }>}
 */
async function validateCompletionToken(token, repository) {
  const record = await loadUsableCompletionToken(token, repository);

  if (!record) {
    return { data: { valid: false } };
  }

  return { data: { valid: true, status: record.requestStatus } };
}

/**
 * Completa el registro: define la contraseña definitiva del usuario ya
 * aprobado y consume el token de un solo uso.
 * @param {{ token: string, password: string }} payload
 * @param {Object} repository — auth.repository
 * @returns {Promise<import("./auth.types").ServiceResult>}
 */
async function completeRegistration(payload, repository) {
  const record = await loadUsableCompletionToken(payload.token, repository);

  if (!record) {
    return { errors: [COMPLETION_TOKEN_ERROR], status: 400 };
  }

  const passwordHash = await hashPassword(payload.password);

  try {
    await repository.withTransaction(async (client) => {
      const marked = await repository.markCompletionTokenUsed(client, record.tokenId);
      if (!marked) {
        throw new Error("COMPLETION_TOKEN_ALREADY_USED");
      }
      await repository.updateUserPassword(client, record.ownerId, passwordHash);
    });
  } catch (error) {
    if (error.message === "COMPLETION_TOKEN_ALREADY_USED") {
      return { errors: [COMPLETION_TOKEN_ERROR], status: 400 };
    }
    throw error;
  }

  return { data: { completed: true } };
}

module.exports = {
  registerCitizen,
  registerVolunteer,
  registerOrganization,
  registerAdmin,
  login,
  verifyToken,
  issueToken,
  validateCompletionToken,
  completeRegistration,
};
