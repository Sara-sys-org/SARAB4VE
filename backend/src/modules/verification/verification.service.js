/**
 * Servicio — lógica de negocio para el dominio de verificación.
 *
 * Incluye la máquina de estados para el flujo de verificación:
 *
 *   entregada    -> en_estudio
 *   en_estudio   -> aceptada | rechazada
 *   rechazada    -> entregada   (reenvío tras corrección)
 *   aceptada     -> (estado final)
 *
 * Todas las operaciones de escritura que involucran múltiples tablas
 * se ejecutan dentro de una transacción atómica.
 */
const { ALLOWED_TRANSITIONS } = require("./verification.schema");
const { appBaseUrl } = require("../../config");
const emailService = require("../../services/email.service");
const {
  buildInStudyEmail,
  buildAcceptedEmail,
  buildRejectedEmail,
} = require("../../services/emailTemplates/verificationEmails");

/** Vigencia del token de completar registro tras la aprobación. */
const COMPLETION_TOKEN_TTL_HOURS = 72;

// ---------------------------------------------------------------------------
// Máquina de estados (pura, sin dependencias externas)
// ---------------------------------------------------------------------------

/**
 * Mapa de transiciones permitidas.
 * Única fuente de verdad exportada para tests y reuso.
 */
const STATE_MACHINE = Object.freeze({
  entregada: Object.freeze(["en_estudio"]),
  en_estudio: Object.freeze(["aceptada", "rechazada"]),
  rechazada: Object.freeze(["entregada"]),
  aceptada: Object.freeze([]),
});

/**
 * Valida si una transición de estado es permitida.
 *
 * @param {string} fromStatus — Estado actual
 * @param {string} toStatus   — Estado deseado
 * @returns {{ valid: boolean, error?: string }}
 */
function validateTransition(fromStatus, toStatus) {
  const allowed = STATE_MACHINE[fromStatus];

  if (!allowed) {
    return {
      valid: false,
      error: `Estado actual "${fromStatus}" no reconocido`,
    };
  }

  if (!allowed.includes(toStatus)) {
    return {
      valid: false,
      error: `Transición de "${fromStatus}" a "${toStatus}" no permitida. Permitidas: ${allowed.join(", ") || "ninguna (estado final)"}`,
    };
  }

  return { valid: true };
}

/**
 * Determina si un estado es final (sin transiciones de salida).
 * @param {string} status
 * @returns {boolean}
 */
function isTerminalStatus(status) {
  const allowed = STATE_MACHINE[status];
  return allowed !== undefined && allowed.length === 0;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Determina si el error de PostgreSQL es una violación de unique constraint
 * o de foreign key, y extrae información útil.
 * @param {Error & { code?: string, constraint?: string, detail?: string }} error
 * @returns {{ isUniqueViolation: boolean, isForeignKeyViolation: boolean, field: string|null }}
 */
function parseDbError(error) {
  if (error.code === "23505") {
    const constraint = error.constraint || "";
    if (constraint.includes("pkey") || constraint.includes("primary")) {
      return { isUniqueViolation: true, isForeignKeyViolation: false, field: "perfil" };
    }
    if (constraint.includes("owner")) {
      return { isUniqueViolation: true, isForeignKeyViolation: false, field: "solicitud" };
    }
    return { isUniqueViolation: true, isForeignKeyViolation: false, field: "desconocido" };
  }
  if (error.code === "23503") {
    // foreign_key_violation — normalmente un catalog_id que no existe con ese type
    const constraint = error.constraint || error.detail || "";
    if (constraint.includes("disability_type")) {
      return { isUniqueViolation: false, isForeignKeyViolation: true, field: "disabilityTypeIds" };
    }
    if (constraint.includes("service")) {
      return { isUniqueViolation: false, isForeignKeyViolation: true, field: "serviceIds" };
    }
    if (constraint.includes("interest_area")) {
      return { isUniqueViolation: false, isForeignKeyViolation: true, field: "interestAreaIds" };
    }
    if (constraint.includes("experience")) {
      return { isUniqueViolation: false, isForeignKeyViolation: true, field: "experienceCategoryIds" };
    }
    if (constraint.includes("organization_type")) {
      return { isUniqueViolation: false, isForeignKeyViolation: true, field: "organizationTypeId" };
    }
    return { isUniqueViolation: false, isForeignKeyViolation: true, field: "catalogId" };
  }
  return { isUniqueViolation: false, isForeignKeyViolation: false, field: null };
}

// ---------------------------------------------------------------------------
// Registro de Organización
// ---------------------------------------------------------------------------

/**
 * Registra una organización: perfil, representantes, relaciones many-to-many
 * y solicitud de verificación.
 *
 * @param {import("./verification.types").OrganizationRegisterInput} payload — ya validado
 * @param {Object} schema — verification.schema (normalizadores)
 * @param {Object} repository — verification.repository
 * @returns {Promise<import("./verification.types").ServiceResult>}
 */
async function registerOrganization(payload, userId, schema, repository) {
  const normalized = schema.normalizeOrganizationRegister(payload, userId);

  try {
    const result = await repository.withTransaction(async (client) => {
      // 1. Insertar perfil
      const profile = await repository.insertOrganizationProfile(client, normalized.profile);

      // 2. Insertar representantes legales
      for (const rep of normalized.legalRepresentatives) {
        await repository.insertLegalRepresentative(client, userId, rep);
      }

      // 3. Relaciones many-to-many
      if (normalized.disabilityTypeIds.length > 0) {
        await repository.insertCatalogRelations(
          client, userId, "organization_disability_types", normalized.disabilityTypeIds,
        );
      }
      if (normalized.serviceIds.length > 0) {
        await repository.insertCatalogRelations(
          client, userId, "organization_services", normalized.serviceIds,
        );
      }

      // 4. Solicitud de verificación
      const verification = await repository.insertVerificationRequest(
        client, userId, "organization",
      );

      return { profile, verification };
    });

    return { data: result, status: 201 };
  } catch (error) {
    const { isUniqueViolation, isForeignKeyViolation, field } = parseDbError(error);
    if (isUniqueViolation) {
      return {
        errors: [`Ya existe un ${field} de verificación para este usuario`],
        status: 409,
      };
    }
    if (isForeignKeyViolation) {
      return {
        errors: [`Uno o más IDs en "${field}" no existen en el catálogo para el tipo esperado`],
        status: 400,
      };
    }
    throw error;
  }
}

// ---------------------------------------------------------------------------
// Registro de Voluntario
// ---------------------------------------------------------------------------

/**
 * Registra un voluntario (profesional o no profesional): perfil, relaciones
 * many-to-many y solicitud de verificación.
 *
 * @param {import("./verification.types").VolunteerRegisterInput} payload — ya validado
 * @param {Object} schema — verification.schema (normalizadores)
 * @param {Object} repository — verification.repository
 * @returns {Promise<import("./verification.types").ServiceResult>}
 */
async function registerVolunteer(payload, userId, schema, repository) {
  const normalized = schema.normalizeVolunteerRegister(payload, userId);

  try {
    const result = await repository.withTransaction(async (client) => {
      // 1. Insertar perfil
      const profile = await repository.insertVolunteerProfile(client, normalized.profile);

      // 2. Relaciones many-to-many
      if (normalized.interestAreaIds.length > 0) {
        await repository.insertCatalogRelations(
          client, userId, "volunteer_interest_areas", normalized.interestAreaIds,
        );
      }
      if (normalized.experienceCategoryIds.length > 0) {
        await repository.insertCatalogRelations(
          client, userId, "volunteer_experience", normalized.experienceCategoryIds,
        );
      }

      // 3. Solicitud de verificación
      const verification = await repository.insertVerificationRequest(
        client, userId, normalized.entityType,
      );

      return { profile, verification };
    });

    return { data: result, status: 201 };
  } catch (error) {
    const { isUniqueViolation, isForeignKeyViolation, field } = parseDbError(error);
    if (isUniqueViolation) {
      return {
        errors: [`Ya existe un ${field} de verificación para este usuario`],
        status: 409,
      };
    }
    if (isForeignKeyViolation) {
      return {
        errors: [`Uno o más IDs en "${field}" no existen en el catálogo para el tipo esperado`],
        status: 400,
      };
    }
    throw error;
  }
}

// ---------------------------------------------------------------------------
// Documentos de verificación
// ---------------------------------------------------------------------------

/**
 * Sube un documento de verificación a Cloudflare R2 (carpeta `documents_verifications/`)
 * y crea el registro en verification_documents.
 *
 * @param {import("./verification.types").DocumentUploadInput & { fileBuffer: Buffer }} payload
 * @param {string} ownerId
 * @param {Object} repository
 * @returns {Promise<import("./verification.types").ServiceResult>}
 */
async function uploadDocument(payload, ownerId, repository) {
  const { uploadDocument: uploadToR2 } = require("../../services/storage");

  try {
    // 1. Subir archivo a R2 → carpeta documents_verifications/<ownerId>/
    const { storageKey } = await uploadToR2(
      payload.fileBuffer,
      payload.fileName,
      payload.mimeType,
      ownerId,
    );

    // 2. Registrar en la base de datos
    const document = await repository.withTransaction(async (client) => {
      return repository.insertVerificationDocument(
        client, ownerId, payload.documentTypeId, storageKey,
      );
    });

    return {
      data: {
        ...document,
        storageKey,
      },
      status: 201,
    };
  } catch (error) {
    throw error;
  }
}

/**
 * Obtiene el checklist de documentos requeridos con su estado actual.
 * Combina document_types (requeridos) con verification_documents (subidos).
 *
 * @param {string} ownerId
 * @param {string} entityType
 * @param {Object} repository
 * @returns {Promise<import("./verification.types").ServiceResult>}
 */
async function getDocumentChecklist(ownerId, entityType, repository) {
  const requiredDocs = await repository.findDocumentTypesByEntity(entityType);
  const submittedDocs = await repository.findDocumentsByOwner(ownerId);

  // Construir checklist: cada tipo de documento con su estado
  const checklist = requiredDocs.map((docType) => {
    const submitted = submittedDocs.find(
      (d) => d.documentTypeId === docType.id,
    );
    return {
      documentType: docType,
      submission: submitted || null,
      isComplete: submitted ? submitted.status !== "rejected" : false,
    };
  });

  return { data: checklist };
}

/**
 * Genera una URL prefirmada temporal para descargar un documento privado de R2.
 * Valida que el solicitante sea el propietario del documento o un admin.
 *
 * @param {number} documentId
 * @param {{ userId: string, role: string }} requester — Usuario que solicita la descarga
 * @param {Object} repository
 * @returns {Promise<import("./verification.types").ServiceResult>}
 */
async function getDownloadUrl(documentId, requester, repository) {
  const document = await repository.findDocumentById(documentId);

  if (!document) {
    return { errors: ["Documento no encontrado"], status: 404 };
  }

  // Validar acceso: el solicitante debe ser el propietario o un admin
  const isAdmin = requester.role === "admin";
  const isOwner = document.ownerId === requester.userId;

  if (!isOwner && !isAdmin) {
    return { errors: ["No tienes acceso a este documento"], status: 403 };
  }

  if (!document.storageKey) {
    return { errors: ["Este documento no tiene archivo cargado."], status: 400 };
  }

  const { getPresignedDownloadUrl } = require("../../services/storage");
  const presignedUrl = await getPresignedDownloadUrl(document.storageKey);

  return { data: { downloadUrl: presignedUrl, expiresIn: 3600 } };
}

/**
 * Revisa un documento (solo admin).
 *
 * @param {number} documentId
 * @param {import("./verification.types").DocumentReviewInput} review
 * @param {string} reviewerId
 * @param {Object} repository
 * @returns {Promise<import("./verification.types").ServiceResult>}
 */
async function reviewDocument(documentId, review, reviewerId, repository) {
  const document = await repository.findDocumentById(documentId);

  if (!document) {
    return { errors: ["Documento no encontrado"], status: 404 };
  }

  const updated = await repository.updateDocumentStatus(
    documentId,
    review.status,
    review.reason || null,
    reviewerId,
  );

  return { data: updated };
}

/** Mensajes para el administrador al subir o eliminar archivos (sin lenguaje técnico). */
const DOCUMENT_FILE_MESSAGES = {
  notFound: "Este documento ya no existía.",
  added: "Documento agregado correctamente.",
  replaced: "Documento reemplazado correctamente.",
  previousMissing: "Se guardó el nuevo documento. El archivo anterior ya no existía.",
  replaceFailed: "No se pudo reemplazar el documento. Se mantiene el archivo anterior. Inténtalo de nuevo.",
  addFailed: "No se pudo agregar el documento. Inténtalo de nuevo.",
  deleted: "Archivo eliminado. Puedes agregar uno nuevo cuando lo necesites.",
  deletedMissing: "El archivo ya no existía. El documento quedó sin archivo.",
  alreadyEmpty: "Este documento ya no tenía archivo.",
  deleteFailed: "No se pudo eliminar el archivo. Inténtalo de nuevo.",
};

/** Intentos para borrar de R2 un archivo nuevo cuando se revierte un reemplazo. */
const CLEANUP_ATTEMPTS = 3;
const CLEANUP_DELAY_MS = 500;

/**
 * Borra un objeto de R2 reintentando ante fallos transitorios, para no dejar
 * archivos sueltos cuando se revierte un reemplazo.
 * @param {Object} storage
 * @param {string} storageKey
 * @returns {Promise<boolean>} true si se borró
 */
async function deleteWithRetry(storage, storageKey) {
  for (let attempt = 1; attempt <= CLEANUP_ATTEMPTS; attempt++) {
    try {
      await storage.deleteDocument(storageKey);
      return true;
    } catch (error) {
      console.error(`[verification] Intento ${attempt}/${CLEANUP_ATTEMPTS} de borrar ${storageKey} falló:`, error.message);
      if (attempt < CLEANUP_ATTEMPTS) {
        await new Promise((resolve) => setTimeout(resolve, CLEANUP_DELAY_MS * attempt));
      }
    }
  }
  return false;
}

/**
 * Sube un archivo a un documento existente (solo admin). Sirve para
 * agregar (documento sin archivo) y para reemplazar: el documento conserva
 * su tipo y su dueño; solo cambia el archivo, que puede tener otra extensión.
 *
 * Todo o nada: si falla la subida, la actualización en la base o el borrado
 * del archivo anterior en R2, se hace rollback, se borra el archivo nuevo
 * (con reintentos) y el documento queda exactamente como estaba.
 *
 * @param {number} documentId
 * @param {{ fileName: string, mimeType: string, fileBuffer: Buffer }} payload
 * @param {Object} repository
 * @returns {Promise<import("./verification.types").ServiceResult>}
 */
async function uploadDocumentFile(documentId, payload, repository) {
  const storage = require("../../services/storage");

  const document = await repository.findDocumentById(documentId);
  if (!document) {
    return { errors: [DOCUMENT_FILE_MESSAGES.notFound], status: 404 };
  }

  const previousKey = document.storageKey;
  const previousExists = await storage.hasStoredFile(previousKey);
  const failedMessage = previousKey ? DOCUMENT_FILE_MESSAGES.replaceFailed : DOCUMENT_FILE_MESSAGES.addFailed;

  let storageKey;
  try {
    ({ storageKey } = await storage.uploadDocument(
      payload.fileBuffer,
      payload.fileName,
      payload.mimeType,
      document.ownerId,
    ));
  } catch (error) {
    console.error(`[verification] Error subiendo archivo del documento ${documentId}:`, error);
    return { errors: [failedMessage], status: 502 };
  }

  let updated;
  try {
    updated = await repository.withTransaction(async (client) => {
      const row = await repository.setDocumentFile(client, documentId, storageKey);
      if (previousExists) {
        await storage.deleteDocument(previousKey);
      }
      return row;
    });
  } catch (error) {
    console.error(`[verification] Error reemplazando archivo del documento ${documentId}:`, error);
    const cleaned = await deleteWithRetry(storage, storageKey);
    if (!cleaned) {
      console.error(`[verification] ARCHIVO HUÉRFANO en R2 tras rollback (documento ${documentId}): ${storageKey}`);
    }
    return { errors: [failedMessage], status: 502 };
  }

  const data = { ...updated, hasFile: true };

  if (!previousKey) {
    return { data, message: DOCUMENT_FILE_MESSAGES.added };
  }
  if (!previousExists) {
    return { data, notice: DOCUMENT_FILE_MESSAGES.previousMissing };
  }
  return { data, message: DOCUMENT_FILE_MESSAGES.replaced };
}

/**
 * Elimina el archivo de un documento (solo admin). El documento se
 * conserva sin archivo (storage_key = NULL) para que siga apareciendo en
 * el panel y se pueda agregar uno nuevo más adelante.
 *
 * @param {number} documentId
 * @param {Object} repository
 * @returns {Promise<import("./verification.types").ServiceResult>}
 */
async function deleteDocumentFile(documentId, repository) {
  const storage = require("../../services/storage");

  const document = await repository.findDocumentById(documentId);
  if (!document) {
    return { errors: [DOCUMENT_FILE_MESSAGES.notFound], status: 404 };
  }
  if (!document.storageKey) {
    return { errors: [DOCUMENT_FILE_MESSAGES.alreadyEmpty], status: 409 };
  }

  const fileExists = await storage.hasStoredFile(document.storageKey);

  let updated;
  try {
    updated = await repository.withTransaction(async (client) => {
      const row = await repository.setDocumentFile(client, documentId, null);
      if (fileExists) {
        await storage.deleteDocument(document.storageKey);
      }
      return row;
    });
  } catch (error) {
    console.error(`[verification] Error eliminando archivo del documento ${documentId}:`, error);
    return { errors: [DOCUMENT_FILE_MESSAGES.deleteFailed], status: 502 };
  }

  const data = { ...updated, hasFile: false };

  if (!fileExists) {
    return { data, notice: DOCUMENT_FILE_MESSAGES.deletedMissing };
  }
  return { data, message: DOCUMENT_FILE_MESSAGES.deleted };
}

// ---------------------------------------------------------------------------
// Transición de estado (admin)
// ---------------------------------------------------------------------------

/**
 * Transiciona una solicitud de verificación a un nuevo estado.
 * Aplica la máquina de estados y efectos secundarios:
 *   - aceptada -> activa la cuenta del usuario (status = 'approved'), genera
 *     un token de un solo uso ('completar_registro') y envía el Correo 4A
 *   - rechazada -> marca la cuenta como rechazada y envía el Correo 4B
 *   - en_estudio -> envía el Correo 3
 * Un fallo de envío de correo no revierte la transición ya aplicada.
 *
 * @param {number} verificationId
 * @param {import("./verification.types").TransitionInput} transition
 * @param {string} reviewerId — UUID del admin que realiza la transición
 * @param {Object} repository
 * @returns {Promise<import("./verification.types").ServiceResult>}
 */
/**
 * Notifica al solicitante el resultado de una transición ya aplicada.
 * Nunca lanza: un fallo de envío no debe revertir una transición de estado
 * ya confirmada (mismo criterio no-bloqueante usado en el registro inicial).
 *
 * @param {Object} params
 * @param {number} params.verificationId
 * @param {string} params.toStatus
 * @param {string|null} params.reason
 * @param {Object} params.repository
 * @returns {Promise<void>}
 */
async function notifyTransitionOutcome({ verificationId, toStatus, reason, repository }) {
  try {
    const owner = await repository.findVerificationOwnerContact(verificationId);
    if (!owner) return;

    if (toStatus === "en_estudio") {
      const email = buildInStudyEmail({
        nombreSolicitante: owner.ownerName,
        idSolicitud: owner.ownerId,
      });
      await emailService.sendEmail(owner.ownerEmail, email.subject, email.html);
      return;
    }

    if (toStatus === "rechazada") {
      const email = buildRejectedEmail({
        nombreSolicitante: owner.ownerName,
        idSolicitud: owner.ownerId,
        motivoRechazo: reason || "No se cumplieron los requisitos de verificación.",
      });
      await emailService.sendEmail(owner.ownerEmail, email.subject, email.html);
      return;
    }

    if (toStatus === "aceptada") {
      const expiresAt = new Date(Date.now() + COMPLETION_TOKEN_TTL_HOURS * 60 * 60 * 1000);
      const tokenRecord = await repository.insertVerificationToken(
        null, verificationId, "completar_registro", undefined, expiresAt,
      );
      const link = `${appBaseUrl.replace(/\/$/, "")}/completar-registro?token=${tokenRecord.token}`;

      const email = buildAcceptedEmail({
        nombreSolicitante: owner.ownerName,
        idSolicitud: owner.ownerId,
        linkCompletarRegistro: link,
      });
      await emailService.sendEmail(owner.ownerEmail, email.subject, email.html);
    }
  } catch (error) {
    console.error("Error enviando notificación de transición de verificación:", error);
  }
}

async function transitionVerification(verificationId, transition, reviewerId, repository) {
  // 1. Buscar la solicitud actual
  const current = await repository.findVerificationById(verificationId);

  if (!current) {
    return { errors: ["Solicitud de verificación no encontrada"], status: 404 };
  }

  // 2. Validar transición contra la máquina de estados
  const validation = validateTransition(current.status, transition.toStatus);

  if (!validation.valid) {
    return { errors: [validation.error], status: 422 };
  }

  // 3. Ejecutar transición con efectos secundarios en una transacción
  try {
    const result = await repository.withTransaction(async (client) => {
      // Actualizar estado
      const updated = await repository.updateVerificationStatus(
        client, verificationId, transition.toStatus,
        transition.reason || null, reviewerId,
      );

      // Registrar historial
      await repository.insertStatusHistory(
        client, verificationId, current.status, transition.toStatus,
        reviewerId, transition.reason || null,
      );

      // Efecto secundario: si se acepta, activar la cuenta del usuario
      if (transition.toStatus === "aceptada") {
        await repository.approveUser(client, current.ownerId);
      }

      // Efecto secundario: si se rechaza, marcar la cuenta como rechazada
      if (transition.toStatus === "rechazada") {
        await repository.rejectUser(client, current.ownerId);
      }

      return updated;
    });

    // Notificar al solicitante el resultado (correo 3, 4A o 4B según el caso).
    // Fuera de la transacción: es un efecto de notificación, no parte de la
    // transición ya confirmada.
    await notifyTransitionOutcome({
      verificationId,
      toStatus: transition.toStatus,
      reason: transition.reason || null,
      repository,
    });

    return { data: result };
  } catch (error) {
    throw error;
  }
}

// ---------------------------------------------------------------------------
// Consultas (catálogo, admin queue)
// ---------------------------------------------------------------------------

/**
 * Obtiene entradas del catálogo unificado por tipo.
 * @param {string} type — catalog_type
 * @param {Object} repository
 * @returns {Promise<import("./verification.types").ServiceResult>}
 */
async function getCatalog(type, repository) {
  const items = await repository.findCatalogByType(type);
  return { data: items };
}

/**
 * Obtiene la cola de verificaciones para administración.
 * @param {Object} filters — { status?, entityType? }
 * @param {Object} repository
 * @returns {Promise<import("./verification.types").ServiceResult>}
 */
async function listAdminVerifications(filters, repository) {
  const rows = await repository.listVerifications(
    filters.status || null,
    filters.entityType || null,
  );
  return { data: rows };
}

async function listAdminVerificationsPaginated(filters, repository) {
  const result = await repository.listVerificationsPaginated(
    filters.status || null,
    filters.entityType || null,
    filters.search || null,
    filters.limit,
    filters.offset,
  );
  return { data: result };
}

/**
 * Obtiene el estado de verificación de un usuario.
 * @param {string} ownerId
 * @param {Object} repository
 * @returns {Promise<import("./verification.types").ServiceResult>}
 */
async function getMyVerificationStatus(ownerId, repository) {
  const verification = await repository.findVerificationByOwner(ownerId);

  if (!verification) {
    return { errors: ["No tienes una solicitud de verificación activa"], status: 404 };
  }

  return { data: verification };
}

// ---------------------------------------------------------------------------
// Exports
// ---------------------------------------------------------------------------

module.exports = {
  // Máquina de estados (exportada para tests y reuso)
  STATE_MACHINE,
  validateTransition,
  isTerminalStatus,

  // Operaciones
  registerOrganization,
  registerVolunteer,
  uploadDocument,
  getDocumentChecklist,
  getDownloadUrl,
  reviewDocument,
  uploadDocumentFile,
  deleteDocumentFile,
  transitionVerification,
  getCatalog,
  listAdminVerifications,
  listAdminVerificationsPaginated,
  getMyVerificationStatus,
};
