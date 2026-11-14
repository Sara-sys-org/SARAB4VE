/**
 * Repositorio — consultas SQL para el dominio de verificación.
 *
 * Todas las funciones de escritura que necesitan atomicidad reciben un
 * cliente de transacción (PoolClient) para que el servicio las coordine.
 */
const db = require("../../db");
const { insertVerificationToken } = require("../auth/auth.repository");

// ---------------------------------------------------------------------------
// Constantes — columnas explícitas
// ---------------------------------------------------------------------------

const CATALOG_SELECT = `id, type, name`;

const DOCUMENT_TYPE_SELECT = `id, code, name, entity_type AS "entityType", is_required AS "isRequired"`;

const VERIFICATION_REQUEST_SELECT = `
  id,
  owner_id AS "ownerId",
  entity_type AS "entityType",
  status,
  rejection_reason AS "rejectionReason",
  submitted_at AS "submittedAt",
  reviewed_by AS "reviewedBy",
  reviewed_at AS "reviewedAt"
`;

const VERIFICATION_DOCUMENT_SELECT = `
  id,
  owner_id AS "ownerId",
  document_type_id AS "documentTypeId",
  storage_key AS "storageKey",
  status,
  rejection_reason AS "rejectionReason",
  uploaded_at AS "uploadedAt",
  reviewed_by AS "reviewedBy",
  reviewed_at AS "reviewedAt"
`;

const ORGANIZATION_PROFILE_SELECT = `
  user_id AS "userId",
  organization_type_id AS "organizationTypeId",
  tax_id AS "taxId",
  registry_number AS "registryNumber",
  founded_at AS "foundedAt",
  country,
  province,
  city,
  address,
  website,
  social_links AS "socialLinks",
  mission,
  vision,
  scope,
  served_groups AS "servedGroups",
  created_at AS "createdAt",
  updated_at AS "updatedAt"
`;

const VOLUNTEER_PROFILE_SELECT = `
  user_id AS "userId",
  volunteer_type AS "volunteerType",
  document_type AS "documentType",
  document_number AS "documentNumber",
  birth_date AS "birthDate",
  profession,
  languages,
  availability_mode AS "availabilityMode",
  has_prior_experience AS "hasPriorExperience",
  transport_available AS "transportAvailable",
  created_at AS "createdAt",
  updated_at AS "updatedAt"
`;

// ---------------------------------------------------------------------------
// Catálogo unificado
// ---------------------------------------------------------------------------

const SELECT_CATALOG_BY_TYPE = `
  SELECT ${CATALOG_SELECT}
  FROM catalog
  WHERE type = $1
  ORDER BY name
`;

/**
 * Obtiene todas las entradas del catálogo de un tipo dado.
 * @param {string} type — catalog_type
 * @returns {Promise<Array>}
 */
async function findCatalogByType(type) {
  const result = await db.query(SELECT_CATALOG_BY_TYPE, [type]);
  return result.rows;
}

// ---------------------------------------------------------------------------
// Tipos de documento (document_types)
// ---------------------------------------------------------------------------

const SELECT_DOCUMENT_TYPES_BY_ENTITY = `
  SELECT ${DOCUMENT_TYPE_SELECT}
  FROM document_types
  WHERE entity_type = $1
  ORDER BY id
`;

/**
 * Obtiene los tipos de documento requeridos para un tipo de entidad.
 * @param {string} entityType
 * @returns {Promise<Array>}
 */
async function findDocumentTypesByEntity(entityType) {
  const result = await db.query(SELECT_DOCUMENT_TYPES_BY_ENTITY, [entityType]);
  return result.rows;
}

// ---------------------------------------------------------------------------
// Organization profiles
// ---------------------------------------------------------------------------

const INSERT_ORGANIZATION_PROFILE = `
  INSERT INTO organization_profiles (
    user_id, organization_type_id, tax_id, registry_number, founded_at,
    country, province, city, address, website, social_links,
    mission, vision, scope, served_groups
  )
  VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11::jsonb, $12, $13, $14, $15)
  RETURNING ${ORGANIZATION_PROFILE_SELECT}
`;

/**
 * Inserta el perfil de una organización.
 * @param {import("pg").PoolClient} client
 * @param {Object} profile
 * @returns {Promise<Object>}
 */
async function insertOrganizationProfile(client, profile) {
  const result = await client.query(INSERT_ORGANIZATION_PROFILE, [
    profile.userId,
    profile.organizationTypeId,
    profile.taxId,
    profile.registryNumber,
    profile.foundedAt,
    profile.country,
    profile.province,
    profile.city,
    profile.address,
    profile.website,
    profile.socialLinks ? JSON.stringify(profile.socialLinks) : null,
    profile.mission,
    profile.vision,
    profile.scope,
    profile.servedGroups,
  ]);
  return result.rows[0];
}

// ---------------------------------------------------------------------------
// Legal representatives
// ---------------------------------------------------------------------------

const INSERT_LEGAL_REPRESENTATIVE = `
  INSERT INTO legal_representatives (organization_id, full_name, position, phone, email)
  VALUES ($1, $2, $3, $4, $5)
  RETURNING id
`;

/**
 * Inserta un representante legal.
 * @param {import("pg").PoolClient} client
 * @param {string} organizationId
 * @param {Object} rep
 * @returns {Promise<Object>}
 */
async function insertLegalRepresentative(client, organizationId, rep) {
  const result = await client.query(INSERT_LEGAL_REPRESENTATIVE, [
    organizationId,
    rep.fullName,
    rep.position,
    rep.phone,
    rep.email,
  ]);
  return result.rows[0];
}

// ---------------------------------------------------------------------------
// Volunteer profiles
// ---------------------------------------------------------------------------

const INSERT_VOLUNTEER_PROFILE = `
  INSERT INTO volunteer_profiles (
    user_id, volunteer_type, document_type, document_number, birth_date,
    profession, languages, availability_mode, has_prior_experience,
    transport_available
  )
  VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
  RETURNING ${VOLUNTEER_PROFILE_SELECT}
`;

/**
 * Inserta el perfil de un voluntario.
 * @param {import("pg").PoolClient} client
 * @param {Object} profile
 * @returns {Promise<Object>}
 */
async function insertVolunteerProfile(client, profile) {
  const result = await client.query(INSERT_VOLUNTEER_PROFILE, [
    profile.userId,
    profile.volunteerType,
    profile.documentType,
    profile.documentNumber,
    profile.birthDate,
    profile.profession,
    profile.languages,
    profile.availabilityMode,
    profile.hasPriorExperience,
    profile.transportAvailable,
  ]);
  return result.rows[0];
}

// ---------------------------------------------------------------------------
// Tablas puente (many-to-many contra catalog)
// ---------------------------------------------------------------------------

const INSERT_ORGANIZATION_DISABILITY_TYPE = `
  INSERT INTO organization_disability_types (organization_id, catalog_id, catalog_type)
  VALUES ($1, $2, 'disability_type')
  ON CONFLICT DO NOTHING
`;

const INSERT_ORGANIZATION_SERVICE = `
  INSERT INTO organization_services (organization_id, catalog_id, catalog_type)
  VALUES ($1, $2, 'service')
  ON CONFLICT DO NOTHING
`;

const INSERT_VOLUNTEER_INTEREST_AREA = `
  INSERT INTO volunteer_interest_areas (user_id, catalog_id, catalog_type)
  VALUES ($1, $2, 'interest_area')
  ON CONFLICT DO NOTHING
`;

const INSERT_VOLUNTEER_EXPERIENCE = `
  INSERT INTO volunteer_experience (user_id, catalog_id, catalog_type)
  VALUES ($1, $2, 'experience_category')
  ON CONFLICT DO NOTHING
`;

/**
 * Inserta relaciones many-to-many para una organización.
 * @param {import("pg").PoolClient} client
 * @param {string} organizationId
 * @param {string} tableName
 * @param {number[]} catalogIds
 */
async function insertCatalogRelations(client, organizationId, tableName, catalogIds) {
  const queries = {
    organization_disability_types: INSERT_ORGANIZATION_DISABILITY_TYPE,
    organization_services: INSERT_ORGANIZATION_SERVICE,
    volunteer_interest_areas: INSERT_VOLUNTEER_INTEREST_AREA,
    volunteer_experience: INSERT_VOLUNTEER_EXPERIENCE,
  };

  const sql = queries[tableName];
  if (!sql) throw new Error(`Unknown catalog relation table: ${tableName}`);

  for (const catalogId of catalogIds) {
    await client.query(sql, [organizationId, catalogId]);
  }
}

// ---------------------------------------------------------------------------
// Verification requests
// ---------------------------------------------------------------------------

const INSERT_VERIFICATION_REQUEST = `
  INSERT INTO verification_requests (owner_id, entity_type, status)
  VALUES ($1, $2, 'entregada')
  RETURNING ${VERIFICATION_REQUEST_SELECT}
`;

/**
 * Crea una solicitud de verificación.
 * @param {import("pg").PoolClient} client
 * @param {string} ownerId
 * @param {string} entityType
 * @returns {Promise<Object>}
 */
async function insertVerificationRequest(client, ownerId, entityType) {
  const result = await client.query(INSERT_VERIFICATION_REQUEST, [ownerId, entityType]);
  return result.rows[0];
}

const FIND_VERIFICATION_BY_OWNER = `
  SELECT ${VERIFICATION_REQUEST_SELECT}
  FROM verification_requests
  WHERE owner_id = $1
`;

/**
 * Busca la solicitud de verificación de un usuario.
 * @param {string} ownerId
 * @returns {Promise<Object|null>}
 */
async function findVerificationByOwner(ownerId) {
  const result = await db.query(FIND_VERIFICATION_BY_OWNER, [ownerId]);
  return result.rows[0] || null;
}

const FIND_VERIFICATION_BY_ID = `
  SELECT ${VERIFICATION_REQUEST_SELECT}
  FROM verification_requests
  WHERE id = $1
`;

/**
 * Busca una solicitud de verificación por ID.
 * @param {number} id
 * @returns {Promise<Object|null>}
 */
async function findVerificationById(id) {
  const result = await db.query(FIND_VERIFICATION_BY_ID, [id]);
  return result.rows[0] || null;
}

const FIND_VERIFICATION_OWNER_CONTACT = `
  SELECT
    vr.id,
    vr.status,
    vr.entity_type AS "entityType",
    u.id AS "ownerId",
    u.full_name AS "ownerName",
    u.email AS "ownerEmail"
  FROM verification_requests vr
  JOIN users u ON u.id = vr.owner_id
  WHERE vr.id = $1
`;

/**
 * Busca los datos de contacto del dueño de una solicitud de verificación,
 * para construir notificaciones por correo.
 * @param {number} id
 * @returns {Promise<Object|null>}
 */
async function findVerificationOwnerContact(id) {
  const result = await db.query(FIND_VERIFICATION_OWNER_CONTACT, [id]);
  return result.rows[0] || null;
}

// ---------------------------------------------------------------------------
// Admin: listar verificaciones
// ---------------------------------------------------------------------------

const LIST_VERIFICATIONS = `
  SELECT
    vr.id,
    vr.owner_id AS "ownerId",
    vr.entity_type AS "entityType",
    vr.status,
    vr.rejection_reason AS "rejectionReason",
    vr.submitted_at AS "submittedAt",
    vr.reviewed_by AS "reviewedBy",
    vr.reviewed_at AS "reviewedAt",
    u.full_name AS "ownerName",
    u.email AS "ownerEmail"
  FROM verification_requests vr
  JOIN users u ON u.id = vr.owner_id
  WHERE ($1::verification_status IS NULL OR vr.status = $1)
    AND ($2::entity_type IS NULL OR vr.entity_type = $2)
  ORDER BY vr.submitted_at ASC
`;

async function listVerifications(status, entityType) {
  const result = await db.query(LIST_VERIFICATIONS, [status || null, entityType || null]);
  return result.rows;
}

function buildListVerificationsPaginatedQuery(status, entityType, search, limit = 50, offset = 0) {
  const conditions = [];
  const params = [];
  let paramIndex = 1;

  if (status) {
    conditions.push(`vr.status = $${paramIndex++}`);
    params.push(status);
  }

  if (entityType) {
    conditions.push(`vr.entity_type = $${paramIndex++}`);
    params.push(entityType);
  }

  if (search) {
    conditions.push(`(u.full_name ILIKE $${paramIndex} OR u.email ILIKE $${paramIndex})`);
    params.push(`%${search}%`);
    paramIndex++;
  }

  const whereClause = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";

  const dataQuery = `
    SELECT
      vr.id,
      vr.owner_id AS "ownerId",
      vr.entity_type AS "entityType",
      vr.status,
      vr.rejection_reason AS "rejectionReason",
      vr.submitted_at AS "submittedAt",
      vr.reviewed_by AS "reviewedBy",
      vr.reviewed_at AS "reviewedAt",
      u.full_name AS "ownerName",
      u.email AS "ownerEmail"
    FROM verification_requests vr
    JOIN users u ON u.id = vr.owner_id
    ${whereClause}
    ORDER BY vr.submitted_at ASC
    LIMIT $${paramIndex++} OFFSET $${paramIndex++}
  `;

  const countQuery = `
    SELECT COUNT(*)::int AS total
    FROM verification_requests vr
    JOIN users u ON u.id = vr.owner_id
    ${whereClause}
  `;

  return {
    dataQuery,
    countQuery,
    dataParams: [...params, limit, offset],
    countParams: params,
  };
}

/**
 * Lista solicitudes de verificación paginadas (vista admin).
 * @param {string|null} status
 * @param {string|null} entityType
 * @param {string|null} search
 * @param {number} [limit]
 * @param {number} [offset]
 * @returns {Promise<{ items: Array, total: number, limit: number, offset: number }>}
 */
async function listVerificationsPaginated(status, entityType, search, limit = 50, offset = 0) {
  const {
    dataQuery,
    countQuery,
    dataParams,
    countParams,
  } = buildListVerificationsPaginatedQuery(status, entityType, search, limit, offset);

  const [dataResult, countResult] = await Promise.all([
    db.query(dataQuery, dataParams),
    db.query(countQuery, countParams),
  ]);

  return {
    items: dataResult.rows,
    total: countResult.rows[0]?.total || 0,
    limit,
    offset,
  };
}

// ---------------------------------------------------------------------------
// Transición de estado
// ---------------------------------------------------------------------------

const UPDATE_VERIFICATION_STATUS = `
  UPDATE verification_requests
  SET status = $1,
      rejection_reason = $2,
      reviewed_by = $3,
      reviewed_at = NOW()
  WHERE id = $4
  RETURNING ${VERIFICATION_REQUEST_SELECT}
`;

/**
 * Actualiza el estado de una solicitud de verificación.
 * @param {import("pg").PoolClient} client
 * @param {number} verificationId
 * @param {string} newStatus
 * @param {string|null} reason
 * @param {string|null} reviewerId
 * @returns {Promise<Object>}
 */
async function updateVerificationStatus(client, verificationId, newStatus, reason, reviewerId) {
  const result = await client.query(UPDATE_VERIFICATION_STATUS, [
    newStatus,
    reason || null,
    reviewerId || null,
    verificationId,
  ]);
  return result.rows[0];
}

const INSERT_STATUS_HISTORY = `
  INSERT INTO verification_status_history (verification_request_id, from_status, to_status, changed_by, reason)
  VALUES ($1, $2, $3, $4, $5)
  RETURNING id
`;

/**
 * Registra una entrada en el historial de cambios de estado.
 * @param {import("pg").PoolClient} client
 * @param {number} verificationRequestId
 * @param {string|null} fromStatus
 * @param {string} toStatus
 * @param {string|null} changedBy
 * @param {string|null} reason
 */
async function insertStatusHistory(client, verificationRequestId, fromStatus, toStatus, changedBy, reason) {
  await client.query(INSERT_STATUS_HISTORY, [
    verificationRequestId,
    fromStatus || null,
    toStatus,
    changedBy || null,
    reason || null,
  ]);
}

// ---------------------------------------------------------------------------
// Actualizar estado de usuario (activación/rechazo tras verificación)
// ---------------------------------------------------------------------------

const APPROVE_USER = `
  UPDATE users
  SET status = 'approved',
      updated_at = NOW()
  WHERE id = $1
  RETURNING id, role, status
`;

/**
 * Activa la cuenta del usuario cuando su verificación es aceptada.
 * @param {import("pg").PoolClient} client
 * @param {string} userId
 * @returns {Promise<Object>}
 */
async function approveUser(client, userId) {
  const result = await client.query(APPROVE_USER, [userId]);
  return result.rows[0];
}

const REJECT_USER = `
  UPDATE users
  SET status = 'rejected',
      updated_at = NOW()
  WHERE id = $1
  RETURNING id, role, status
`;

/**
 * Rechaza la cuenta del usuario cuando su verificación es rechazada.
 * @param {import("pg").PoolClient} client
 * @param {string} userId
 * @returns {Promise<Object>}
 */
async function rejectUser(client, userId) {
  const result = await client.query(REJECT_USER, [userId]);
  return result.rows[0];
}

// ---------------------------------------------------------------------------
// Verification documents
// ---------------------------------------------------------------------------

const INSERT_VERIFICATION_DOCUMENT = `
  INSERT INTO verification_documents (owner_id, document_type_id, storage_key, status)
  VALUES ($1, $2, $3, 'pending')
  RETURNING ${VERIFICATION_DOCUMENT_SELECT}
`;

/**
 * Crea un registro de documento de verificación.
 * @param {import("pg").PoolClient} client
 * @param {string} ownerId
 * @param {number} documentTypeId
 * @param {string} storageKey
 * @returns {Promise<Object>}
 */
async function insertVerificationDocument(client, ownerId, documentTypeId, storageKey) {
  const result = await client.query(INSERT_VERIFICATION_DOCUMENT, [
    ownerId,
    documentTypeId,
    storageKey,
  ]);
  return result.rows[0];
}

const FIND_DOCUMENTS_BY_OWNER = `
  SELECT ${VERIFICATION_DOCUMENT_SELECT}
  FROM verification_documents
  WHERE owner_id = $1
  ORDER BY uploaded_at DESC
`;

/**
 * Lista los documentos de verificación de un usuario.
 * @param {string} ownerId
 * @returns {Promise<Array>}
 */
async function findDocumentsByOwner(ownerId) {
  const result = await db.query(FIND_DOCUMENTS_BY_OWNER, [ownerId]);
  return result.rows;
}

const FIND_DOCUMENT_BY_ID = `
  SELECT ${VERIFICATION_DOCUMENT_SELECT}
  FROM verification_documents
  WHERE id = $1
`;

/**
 * Busca un documento por ID.
 * @param {number} id
 * @returns {Promise<Object|null>}
 */
async function findDocumentById(id) {
  const result = await db.query(FIND_DOCUMENT_BY_ID, [id]);
  return result.rows[0] || null;
}

/**
 * Busca un documento por su storage_key en R2.
 * @param {string} storageKey
 * @returns {Promise<Object|null>}
 */
async function findDocumentByStorageKey(storageKey) {
  const result = await db.query(
    `SELECT ${VERIFICATION_DOCUMENT_SELECT} FROM verification_documents WHERE storage_key = $1`,
    [storageKey],
  );
  return result.rows[0] || null;
}

const UPDATE_DOCUMENT_STATUS = `
  UPDATE verification_documents
  SET status = $1,
      rejection_reason = $2,
      reviewed_by = $3,
      reviewed_at = NOW()
  WHERE id = $4
  RETURNING ${VERIFICATION_DOCUMENT_SELECT}
`;

/**
 * Actualiza el estado de revisión de un documento.
 * @param {import("pg").PoolClient|null} client — Cliente de transacción (opcional)
 * @param {number} documentId
 * @param {string} status
 * @param {string|null} reason
 * @param {string|null} reviewerId
 * @returns {Promise<Object>}
 */
async function updateDocumentStatus(client, documentId, status, reason, reviewerId) {
  const result = await (client || db).query(UPDATE_DOCUMENT_STATUS, [
    status,
    reason || null,
    reviewerId || null,
    documentId,
  ]);
  return result.rows[0];
}

// ---------------------------------------------------------------------------
// Transaction helper
// ---------------------------------------------------------------------------

/**
 * Abre una transacción y ejecuta el callback.
 * Hace commit si el callback resuelve, rollback si lanza error.
 * Siempre libera el cliente al final.
 *
 * @template T
 * @param {(client: import("pg").PoolClient) => Promise<T>} callback
 * @returns {Promise<T>}
 */
async function withTransaction(callback) {
  const client = await db.getClient();
  try {
    await client.query("BEGIN");
    const result = await callback(client);
    await client.query("COMMIT");
    return result;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

// ---------------------------------------------------------------------------
// Exports
// ---------------------------------------------------------------------------

module.exports = {
  findCatalogByType,
  findDocumentTypesByEntity,

  insertOrganizationProfile,
  insertLegalRepresentative,
  insertVolunteerProfile,

  insertCatalogRelations,

  insertVerificationRequest,
  findVerificationByOwner,
  findVerificationById,
  findVerificationOwnerContact,
  listVerifications,
  listVerificationsPaginated,
  updateVerificationStatus,
  insertStatusHistory,

  approveUser,
  rejectUser,

  insertVerificationToken,

  insertVerificationDocument,
  findDocumentsByOwner,
  findDocumentById,
  findDocumentByStorageKey,
  updateDocumentStatus,

  withTransaction,
};
