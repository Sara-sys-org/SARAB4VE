/**
 * Repositorio — consultas SQL para el dominio de help-requests.
 */
const db = require("../../db");

// ---------------------------------------------------------------------------
// Helper geo
// ---------------------------------------------------------------------------

/**
 * @param {number} latitudeIndex
 * @param {number} longitudeIndex
 * @returns {string}
 */
function buildDistanceExpression(latitudeIndex, longitudeIndex) {
  return `
    6371 * acos(
      least(
        1,
        greatest(
          -1,
          cos(radians($${latitudeIndex})) * cos(radians(latitude)) *
          cos(radians(longitude) - radians($${longitudeIndex})) +
          sin(radians($${latitudeIndex})) * sin(radians(latitude))
        )
      )
    )
  `;
}

// ---------------------------------------------------------------------------
// Queries de lectura
// ---------------------------------------------------------------------------

/**
 * @param {Object} filters — salida de validateSearchHelpRequests().filters
 * @returns {{ sql: string, values: Array }}
 */
function buildListHelpRequestsQuery(filters) {
  const values = [];
  const baseConditions = [];

  if (filters.statuses && filters.statuses.length > 0) {
    const placeholders = filters.statuses.map((_, i) => `$${values.length + i + 1}`).join(", ");
    values.push(...filters.statuses);
    baseConditions.push(`status IN (${placeholders})`);
  }

  const sortDirection = filters.sortOrder === "asc" ? "ASC" : "DESC";

  if (!filters.hasGeoFilter) {
    let sql = `
      SELECT id,
             requester_name AS "requesterName",
             contact_method AS "contactMethod",
             contact_value AS "contactValue",
             need_type AS "needType",
             description,
             latitude, longitude, urgency, status,
             address,
             country,
             gender,
             age,
             disability_type AS "disabilityType",
             disability_other_note AS "disabilityOtherNote",
             voice_note_url AS "voiceNoteUrl",
             assigned_at AS "assignedAt",
             resolved_at AS "resolvedAt",
             created_at AS "createdAt"
      FROM help_requests
    `;

    if (baseConditions.length > 0) {
      sql += ` WHERE ${baseConditions.join(" AND ")}`;
    }

    sql += ` ORDER BY "createdAt" ${sortDirection} LIMIT 100`;

    return { sql, values };
  }

  values.push(filters.latitude);
  const latitudeIndex = values.length;
  values.push(filters.longitude);
  const longitudeIndex = values.length;
  values.push(filters.radiusKm);
  const radiusIndex = values.length;

  // Excluir filas sin coordenadas — no se puede calcular distancia sin ellas
  baseConditions.push("latitude IS NOT NULL AND longitude IS NOT NULL");

  const distanceExpression = buildDistanceExpression(latitudeIndex, longitudeIndex);
  const whereClause = baseConditions.length > 0 ? `WHERE ${baseConditions.join(" AND ")}` : "";

  const sql = `
    WITH scoped_help_requests AS (
      SELECT id,
             requester_name AS "requesterName",
             contact_method AS "contactMethod",
             contact_value AS "contactValue",
             need_type AS "needType",
             description,
             latitude, longitude, urgency, status,
             address,
             country,
             gender,
             age,
             disability_type AS "disabilityType",
             disability_other_note AS "disabilityOtherNote",
             voice_note_url AS "voiceNoteUrl",
             assigned_at AS "assignedAt",
             resolved_at AS "resolvedAt",
             created_at AS "createdAt",
             ROUND((${distanceExpression})::numeric, 3) AS "distanceKm"
      FROM help_requests
      ${whereClause}
    )
    SELECT *
    FROM scoped_help_requests
    WHERE "distanceKm" <= $${radiusIndex}
    ORDER BY "distanceKm" ASC, "createdAt" ${sortDirection}
    LIMIT 100
  `;

  return { sql, values };
}

// ---------------------------------------------------------------------------
// Queries de escritura
// ---------------------------------------------------------------------------

const INSERT_HELP_REQUEST = `
  INSERT INTO help_requests (
    user_id,
    requester_name,
    contact_method,
    contact_value,
    need_type,
    description,
    latitude,
    longitude,
    urgency,
    address,
    country,
    gender,
    age,
    disability_type,
    disability_other_note,
    disability_card_key,
    voice_note_url
  )
  VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17)
  RETURNING id,
            user_id AS "userId",
            requester_name AS "requesterName",
            contact_method AS "contactMethod",
            contact_value AS "contactValue",
            need_type AS "needType",
            description,
            latitude, longitude, urgency, status,
            address,
            country,
            gender,
            age,
            disability_type AS "disabilityType",
            disability_other_note AS "disabilityOtherNote",
            disability_card_key AS "disabilityCardKey",
            voice_note_url AS "voiceNoteUrl",
            assigned_at AS "assignedAt",
            resolved_at AS "resolvedAt",
            created_at AS "createdAt"
`;

/**
 * @param {Object} payload — ya normalizado (incluye disabilityCardKey/voiceNoteUrl
 *   ya subidos a R2 por el service, si se adjuntaron)
 * @returns {Promise<Object>}
 */
async function insertHelpRequest(payload) {
  const result = await db.query(INSERT_HELP_REQUEST, [
    payload.userId,
    payload.requesterName,
    payload.contactMethod,
    payload.contactValue,
    payload.needType,
    payload.description,
    payload.latitude,
    payload.longitude,
    payload.urgency,
    payload.address,
    payload.country,
    payload.gender,
    payload.age,
    payload.disabilityType,
    payload.disabilityOtherNote,
    payload.disabilityCardKey || null,
    payload.voiceNoteUrl || null,
  ]);
  return result.rows[0];
}

const ACCEPT_HELP_REQUEST = `
  UPDATE help_requests
  SET volunteer_name = $2,
      volunteer_contact_method = $3,
      volunteer_contact_value = $4,
      status = 'assigned',
      assigned_at = NOW()
  WHERE id = $1 AND status = 'open'
  RETURNING id,
            requester_name AS "requesterName",
            contact_method AS "contactMethod",
            contact_value AS "contactValue",
            need_type AS "needType",
            description,
            latitude, longitude, urgency, status,
            created_at AS "createdAt",
            volunteer_name AS "volunteerName",
            volunteer_contact_method AS "volunteerContactMethod",
            volunteer_contact_value AS "volunteerContactValue",
            assigned_at AS "assignedAt",
            resolved_at AS "resolvedAt"
`;

/**
 * @param {string} id
 * @param {Object} payload — ya normalizado
 * @returns {Promise<Object|null>}
 */
async function acceptHelpRequestById(id, payload) {
  const result = await db.query(ACCEPT_HELP_REQUEST, [
    id,
    payload.volunteerName,
    payload.volunteerContactMethod,
    payload.volunteerContactValue,
  ]);
  return result.rows[0] || null;
}

const RESOLVE_HELP_REQUEST = `
  UPDATE help_requests
  SET status = 'resolved',
      resolved_at = NOW()
  WHERE id = $1 AND status = 'assigned'
  RETURNING id,
            requester_name AS "requesterName",
            contact_method AS "contactMethod",
            contact_value AS "contactValue",
            need_type AS "needType",
            description,
            latitude, longitude, urgency, status,
            created_at AS "createdAt",
            volunteer_name AS "volunteerName",
            volunteer_contact_method AS "volunteerContactMethod",
            volunteer_contact_value AS "volunteerContactValue",
            assigned_at AS "assignedAt",
            resolved_at AS "resolvedAt"
`;

/**
 * @param {string} id
 * @returns {Promise<Object|null>}
 */
async function resolveHelpRequestById(id) {
  const result = await db.query(RESOLVE_HELP_REQUEST, [id]);
  return result.rows[0] || null;
}

const FIND_STATUS_BY_ID = "SELECT status FROM help_requests WHERE id = $1";

/**
 * @param {string} id
 * @returns {Promise<Object|null>}
 */
async function findHelpRequestStatusById(id) {
  const result = await db.query(FIND_STATUS_BY_ID, [id]);
  return result.rows[0] || null;
}

const FIND_BY_ID = `
  SELECT id,
         user_id AS "userId",
         requester_name AS "requesterName",
         contact_method AS "contactMethod",
         contact_value AS "contactValue",
         need_type AS "needType",
         description,
         latitude, longitude, urgency, status,
         address,
         country,
         gender,
         age,
         disability_type AS "disabilityType",
         disability_other_note AS "disabilityOtherNote",
         disability_card_key AS "disabilityCardKey",
         voice_note_url AS "voiceNoteUrl",
         volunteer_name AS "volunteerName",
         volunteer_contact_method AS "volunteerContactMethod",
         volunteer_contact_value AS "volunteerContactValue",
         assigned_at AS "assignedAt",
         resolved_at AS "resolvedAt",
         created_at AS "createdAt"
  FROM help_requests
  WHERE id = $1
`;

/**
 * Busca un help request por ID (fila completa).
 * @param {string} id
 * @returns {Promise<Object|null>}
 */
async function findHelpRequestById(id) {
  const result = await db.query(FIND_BY_ID, [id]);
  return result.rows[0] || null;
}

const UPDATE_STATUS_TO_ASSIGNED = `
  UPDATE help_requests hr
  SET status = 'assigned',
      assigned_at = NOW(),
      volunteer_name = u.full_name,
      volunteer_contact_method = CASE 
        WHEN u.phone IS NOT NULL AND u.phone != '' THEN 'phone'
        ELSE 'email'
      END,
      volunteer_contact_value = COALESCE(u.phone, u.email)
  FROM users u
  WHERE hr.id = $1 
    AND hr.status = 'open'
    AND u.id = $2
  RETURNING hr.id, hr.status, hr.assigned_at AS "assignedAt",
            hr.volunteer_name AS "volunteerName",
            hr.volunteer_contact_method AS "volunteerContactMethod",
            hr.volunteer_contact_value AS "volunteerContactValue"
`;

/**
 * Cambia el estado de un help request de "open" a "assigned" y llena los datos del voluntario.
 * @param {string} id - ID del help request
 * @param {string} volunteerId - ID del voluntario que atiende
 * @returns {Promise<Object|null>}
 */
async function updateHelpRequestStatusToAssigned(id, volunteerId) {
  const result = await db.query(UPDATE_STATUS_TO_ASSIGNED, [id, volunteerId]);
  return result.rows[0] || null;
}

const LINK_REQUESTER_USER = `
  UPDATE help_requests
  SET user_id = $2
  WHERE id = $1 AND user_id IS NULL
  RETURNING id, user_id AS "userId"
`;

/**
 * Vincula un help request (creado sin login) con la cuenta del ciudadano
 * que se registró después. No pisa un vínculo ya existente (p.ej. si ya
 * quedó asociado al crearse, porque quien la envió ya tenía sesión).
 * @param {string} id
 * @param {string} userId
 * @returns {Promise<Object|null>}
 */
async function linkRequesterUser(id, userId) {
  const result = await db.query(LINK_REQUESTER_USER, [id, userId]);
  return result.rows[0] || null;
}

const FIND_BY_USER_ID = `
  SELECT id,
         user_id AS "userId",
         requester_name AS "requesterName",
         contact_method AS "contactMethod",
         contact_value AS "contactValue",
         need_type AS "needType",
         description,
         latitude, longitude, urgency, status,
         address,
         country,
         gender,
         age,
         disability_type AS "disabilityType",
         disability_other_note AS "disabilityOtherNote",
         voice_note_url AS "voiceNoteUrl",
         volunteer_name AS "volunteerName",
         volunteer_contact_method AS "volunteerContactMethod",
         volunteer_contact_value AS "volunteerContactValue",
         assigned_at AS "assignedAt",
         resolved_at AS "resolvedAt",
         created_at AS "createdAt"
  FROM help_requests
  WHERE user_id = $1
  ORDER BY created_at DESC
`;

/**
 * Lista las solicitudes de ayuda vinculadas a un usuario (propias).
 * @param {string} userId
 * @returns {Promise<Array>}
 */
async function findHelpRequestsByUserId(userId) {
  const result = await db.query(FIND_BY_USER_ID, [userId]);
  return result.rows;
}

// ---------------------------------------------------------------------------
// SELECT — conteo agrupado por estado (contadores del dashboard)
// ---------------------------------------------------------------------------

const COUNT_BY_STATUS = `
  SELECT status, COUNT(*)::int AS count
  FROM help_requests
  GROUP BY status
`;

/**
 * Obtiene el conteo de help-requests agrupado por estado.
 * @returns {Promise<{ status: string, count: number }[]>}
 */
async function countHelpRequestsByStatus() {
  const result = await db.query(COUNT_BY_STATUS);
  return result.rows;
}

module.exports = {
  // queries de lectura
  buildListHelpRequestsQuery,
  findHelpRequestsByUserId,
  countHelpRequestsByStatus,
  // queries de escritura
  insertHelpRequest,
  acceptHelpRequestById,
  resolveHelpRequestById,
  findHelpRequestStatusById,
  findHelpRequestById,
  updateHelpRequestStatusToAssigned,
  linkRequesterUser,
};
