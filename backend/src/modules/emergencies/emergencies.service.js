/**
 * Servicio — lógica de negocio para el dominio de emergencias.
 */
const crypto = require("crypto");
const bcrypt = require("bcrypt");
const db = require("../../db");
const { notifyNewEmergency } = require("../notifications/requestNotifications.service");
const { EMERGENCY_STATUSES } = require("./emergencies.schema");

/** Roles que pueden ver el nombre y tipo de discapacidad del solicitante en el listado. */
const PRIVILEGED_ROLES = ["admin", "organization", "volunteer"];

/**
 * Quita del listado público el nombre y el tipo de discapacidad del
 * solicitante — solo admin/organización/voluntario logueados pueden verlos.
 * El mapa debe ser visible para cualquiera sin exponer esos datos a quien
 * no tiene un rol de atención. No afecta el ícono del pin: eso depende solo
 * de `kind`/`urgency`, no de `disabilityType` (ver LeafletMap.tsx).
 * @param {Object[]} rows
 * @returns {Object[]}
 */
function redactPersonalData(rows) {
  return rows.map((row) => ({ ...row, requesterName: null, disabilityType: null }));
}

/** Costo del hash bcrypt para access tokens. */
const BCRYPT_ROUNDS = 10;

/**
 * Genera un access token aleatorio para ciudadanos anónimos.
 * @returns {string} token de 32 bytes en hex
 */
function generateAccessToken() {
  return crypto.randomBytes(32).toString("hex");
}

/**
 * Hashea un access token usando bcrypt.
 * @param {string} token — token en texto plano
 * @returns {Promise<string>} hash bcrypt
 */
async function hashAccessToken(token) {
  return bcrypt.hash(token, BCRYPT_ROUNDS);
}

/**
 * Normaliza el payload de creación (camelCase → snake_case interno).
 * @param {Object} payload — cuerpo del request sin procesar
 * @returns {Object} payload listo para INSERT
 */
function normalizeCreateEmergency(payload, userId) {
  return {
    userId: userId || null,
    requesterName: (payload.requesterName || "Persona en emergencia").trim(),
    isInjured: Boolean(payload.isInjured),
    cannotMove: Boolean(payload.cannotMove),
    disabilityType: payload.disabilityType,
    communicationMode: payload.communicationMode || null,
    disabilitySubcategory: payload.disabilitySubcategory || null,
    extraInfo: payload.extraInfo ? payload.extraInfo.trim() : null,
    voiceNoteUrl: payload.voiceNoteUrl || null,
    voiceNoteDurationSec: payload.voiceNoteDurationSec
      ? Number(payload.voiceNoteDurationSec)
      : null,
    latitude: Number(payload.latitude),
    longitude: Number(payload.longitude),
    urgency: payload.urgency || "high",
    needType: payload.needType,
    description: payload.description.trim(),
  };
}

/**
 * Inserta una nueva emergencia en la base de datos.
 * Genera automáticamente un access_token para que el ciudadano anónimo pueda
 * acceder al chat sin necesidad de JWT.
 * @param {Object} payload — ya validado
 * @param {string|null} [userId] — id del usuario autenticado (opcional)
 * @returns {Promise<Object>} fila insertada + accessToken en texto plano
 */
async function createEmergency(payload, userId) {
  const data = normalizeCreateEmergency(payload, userId);

  // Generar access token para ciudadano anónimo
  const accessToken = generateAccessToken();
  const accessTokenHash = await hashAccessToken(accessToken);

  const result = await db.query(
    `
      INSERT INTO emergencies (
        user_id,
        requester_name,
        is_injured,
        cannot_move,
        disability_type,
        communication_mode,
        disability_subcategory,
        extra_info,
        voice_note_url,
        voice_note_duration_sec,
        latitude,
        longitude,
        urgency,
        need_type,
        description,
        access_token_hash
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)
      RETURNING id, user_id AS "userId", requester_name, is_injured, cannot_move,
                disability_type, communication_mode, disability_subcategory, extra_info,
                voice_note_url, voice_note_duration_sec, latitude, longitude,
                urgency, need_type, description, status, assigned_at,
                resolved_at, created_at, updated_at
    `,
    [
      data.userId,
      data.requesterName,
      data.isInjured,
      data.cannotMove,
      data.disabilityType,
      data.communicationMode,
      data.disabilitySubcategory,
      data.extraInfo,
      data.voiceNoteUrl,
      data.voiceNoteDurationSec,
      data.latitude,
      data.longitude,
      data.urgency,
      data.needType,
      data.description,
      accessTokenHash,
    ],
  );

  const emergency = result.rows[0];

  // Notificación best-effort: nunca debe impedir registrar la emergencia.
  notifyNewEmergency(emergency).catch((error) => {
    console.warn("[emergencies] No se pudo notificar la emergencia:", error?.message || error);
  });

  // Retornar la emergencia + el access token en texto plano (solo una vez)
  // El ciudadano usará este token para acceder al chat via ?t=<token> o header X-Citizen-Token
  return { ...emergency, accessToken };
}

/**
 * Lista emergencias usando los filtros ya validados.
 * @param {Object} filters — salida de validateSearchEmergencies().filters
 * @returns {Promise<Array>}
 */
async function listEmergencies(filters, repository, requesterRole) {
  const { sql, values } = repository.buildListEmergenciesQuery(filters);
  const result = await db.query(sql, values);

  if (!requesterRole || !PRIVILEGED_ROLES.includes(requesterRole)) {
    return redactPersonalData(result.rows);
  }

  return result.rows;
}

/**
 * Obtiene una emergencia por ID (detalle completo).
 * @param {string} id
 * @param {Object} repository
 * @returns {Promise<{ data: Object|null, status: number, errors?: string[] }>}
 */
async function getEmergencyById(id, repository) {
  const row = await repository.findEmergencyById(id, db);
  if (!row) {
    return { errors: ["emergency not found"], status: 404 };
  }
  return { data: row, status: 200 };
}

/**
 * Obtiene el estado de procesamiento de una emergencia.
 * @param {string} id
 * @param {Object} repository
 * @returns {Promise<{ data: Object|null, status: number, errors?: string[] }>}
 */
async function getProcessingStatus(id, repository) {
  const row = await repository.getProcessingStatus(id);
  if (!row) {
    return { errors: ["emergency not found"], status: 404 };
  }
  return { data: row, status: 200 };
}

/**
 * Estadísticas de emergencias: conteo por estado + total.
 * Todos los estados vienen inicializados en 0 para que el cliente pueda
 * distinguir "cero real" de "sin datos".
 * @param {Object} repository
 * @returns {Promise<{ data: Object, status: number }>}
 */
async function getEmergencyStats(repository) {
  const rows = await repository.countEmergenciesByStatus();

  const stats = { total: 0 };
  for (const status of EMERGENCY_STATUSES) stats[status] = 0;

  for (const row of rows) {
    if (!(row.status in stats)) continue;
    stats[row.status] = row.count;
    stats.total += row.count;
  }

  return { data: stats, status: 200 };
}

module.exports = {
  generateAccessToken,
  hashAccessToken,
  normalizeCreateEmergency,
  createEmergency,
  listEmergencies,
  getEmergencyById,
  getProcessingStatus,
  getEmergencyStats,
};
