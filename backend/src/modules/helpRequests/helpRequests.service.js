/**
 * Servicio — lógica de negocio para el dominio de help-requests.
 */
const crypto = require("crypto");
const storage = require("../../services/storage");
const { notifyNewHelpRequest } = require("../notifications/requestNotifications.service");
const { REQUEST_STATUSES } = require("./helpRequests.schema");

/** Roles que pueden ver el nombre, contacto y demás datos personales del solicitante. */
const PRIVILEGED_ROLES = ["admin", "organization", "volunteer"];

/**
 * Quita del listado público los datos personales del solicitante (nombre,
 * contacto, dirección, género, edad, nota de voz) — solo admin/organización/
 * voluntario logueados pueden verlos. El mapa y /solicitudes deben ser
 * visibles para cualquiera (es el requisito original del producto), pero
 * sin exponer esos datos a quien no tiene un rol de atención.
 * @param {Object[]} rows
 * @returns {Object[]}
 */
function redactPersonalData(rows) {
  return rows.map((row) => ({
    ...row,
    requesterName: null,
    contactMethod: null,
    contactValue: null,
    address: null,
    country: null,
    gender: null,
    age: null,
    disabilityType: null,
    disabilityOtherNote: null,
    voiceNoteUrl: null,
  }));
}

/**
 * Crea un help-request. Si vienen archivos adjuntos (carnet de
 * discapacidad y/o nota de voz), los sube a R2 antes de insertar la fila.
 *
 * La subida de adjuntos es "best-effort": son opcionales y una falla de
 * almacenamiento (p. ej. R2 sin configurar) NUNCA debe impedir registrar
 * la solicitud de ayuda. Si un adjunto falla, se crea la solicitud sin él
 * y se devuelve el motivo en `warnings`.
 *
 * @param {Object} payload — ya validado
 * @param {Object} schema
 * @param {Object} repository
 * @param {string|null} [userId] — id del usuario autenticado (opcional)
 * @param {Object} [files] — req.files de multer, ej. { carnet: [file], voiceNote: [file] }
 * @returns {Promise<Object>}
 */
async function createHelpRequest(payload, schema, repository, userId, files = {}) {
  const normalized = schema.normalizeCreateHelpRequest(payload, userId);
  const warnings = [];

  const carnetFile = files.carnet?.[0];
  if (carnetFile) {
    try {
      const { storageKey } = await storage.uploadDocument(
        carnetFile.buffer,
        carnetFile.originalname,
        carnetFile.mimetype,
        crypto.randomUUID(),
      );
      normalized.disabilityCardKey = storageKey;
    } catch (error) {
      warnings.push(
        "No se pudo guardar el carnet de discapacidad; tu solicitud se registró sin ese adjunto.",
      );
      console.warn("[helpRequests] No se pudo subir el carnet:", error.message);
    }
  }

  const voiceNoteFile = files.voiceNote?.[0];
  if (voiceNoteFile) {
    try {
      normalized.voiceNoteUrl = await storage.uploadAudio(
        voiceNoteFile.buffer,
        voiceNoteFile.originalname,
        voiceNoteFile.mimetype,
      );
    } catch (error) {
      warnings.push(
        "No se pudo guardar la nota de voz; tu solicitud se registró sin ese adjunto.",
      );
      console.warn("[helpRequests] No se pudo subir la nota de voz:", error.message);
    }
  }

  const row = await repository.insertHelpRequest(normalized);

  // Notificación best-effort: nunca debe impedir registrar la solicitud.
  notifyNewHelpRequest(row).catch((error) => {
    console.warn("[helpRequests] No se pudo notificar la nueva solicitud:", error?.message || error);
  });

  return warnings.length > 0 ? { ...row, warnings } : row;
}

/**
 * Lista help-requests usando los filtros ya validados.
 * @param {Object} filters
 * @param {Object} repository
 * @returns {Promise<Array>}
 */
async function listHelpRequests(filters, repository, requesterRole) {
  const { sql, values } = repository.buildListHelpRequestsQuery(filters);
  // Necesitamos db aquí, así que lo importamos directamente
  const db = require("../../db");
  const result = await db.query(sql, values);

  if (!requesterRole || !PRIVILEGED_ROLES.includes(requesterRole)) {
    return redactPersonalData(result.rows);
  }

  return result.rows;
}

/**
 * Acepta un help-request (un voluntario lo toma).
 * @param {string} id
 * @param {Object} payload — ya validado
 * @param {Object} schema
 * @param {Object} repository
 * @returns {Promise<{ data: Object|null, status: number, errors?: string[] }>}
 */
async function acceptHelpRequest(id, payload, schema, repository) {
  const normalized = schema.normalizeAcceptHelpRequest(payload);

  const updated = await repository.acceptHelpRequestById(id, normalized);
  if (updated) {
    return { data: updated, status: 200 };
  }

  const existing = await repository.findHelpRequestStatusById(id);
  if (!existing) {
    return { errors: ["help request not found"], status: 404 };
  }

  return { errors: ["help request is not open"], status: 409 };
}

/**
 * Resuelve un help-request.
 * @param {string} id
 * @param {Object} repository
 * @returns {Promise<{ data: Object|null, status: number, errors?: string[] }>}
 */
async function resolveHelpRequest(id, repository) {
  const updated = await repository.resolveHelpRequestById(id);
  if (updated) {
    return { data: updated, status: 200 };
  }

  const existing = await repository.findHelpRequestStatusById(id);
  if (!existing) {
    return { errors: ["help request not found"], status: 404 };
  }

  return { errors: ["help request is not assigned"], status: 409 };
}

/**
 * Obtiene un help request por ID (detalle completo).
 * @param {string} id
 * @param {Object} repository
 * @returns {Promise<{ data: Object|null, status: number, errors?: string[] }>}
 */
async function getHelpRequestById(id, repository) {
  const row = await repository.findHelpRequestById(id);
  if (!row) {
    return { errors: ["help request not found"], status: 404 };
  }
  return { data: row, status: 200 };
}

/**
 * Vincula un help request con la cuenta del ciudadano que se registró
 * después de enviarlo. No pisa un vínculo ya existente.
 * @param {string} id
 * @param {string} userId
 * @param {Object} repository
 * @returns {Promise<{ data: Object|null, status: number, errors?: string[] }>}
 */
async function linkRequesterUser(id, userId, repository) {
  const updated = await repository.linkRequesterUser(id, userId);
  if (updated) {
    return { data: updated, status: 200 };
  }

  const existing = await repository.findHelpRequestStatusById(id);
  if (!existing) {
    return { errors: ["help request not found"], status: 404 };
  }

  return { errors: ["help request is already linked to an account"], status: 409 };
}

/**
 * Lista las solicitudes de ayuda del usuario autenticado.
 * @param {string} userId
 * @param {Object} repository
 * @returns {Promise<Array>}
 */
async function listMyHelpRequests(userId, repository) {
  return repository.findHelpRequestsByUserId(userId);
}

/**
 * Estadísticas de help-requests: conteo por estado + total.
 * Todos los estados vienen inicializados en 0 para que el cliente pueda
 * distinguir "cero real" de "sin datos".
 * @param {Object} repository
 * @returns {Promise<{ data: Object, status: number }>}
 */
async function getHelpRequestStats(repository) {
  const rows = await repository.countHelpRequestsByStatus();

  const stats = { total: 0 };
  for (const status of REQUEST_STATUSES) stats[status] = 0;

  for (const row of rows) {
    if (!(row.status in stats)) continue;
    stats[row.status] = row.count;
    stats.total += row.count;
  }

  return { data: stats, status: 200 };
}

module.exports = {
  createHelpRequest,
  listHelpRequests,
  acceptHelpRequest,
  resolveHelpRequest,
  getHelpRequestById,
  linkRequesterUser,
  listMyHelpRequests,
  getHelpRequestStats,
};
