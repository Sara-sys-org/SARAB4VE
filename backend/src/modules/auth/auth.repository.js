/**
 * Repositorio — consultas SQL para el dominio de auth (registro de usuarios).
 * Todas las funciones de escritura reciben un cliente de transacción (PoolClient)
 * para que el servicio pueda coordinarlas atómicamente.
 */
const crypto = require("crypto");
const db = require("../../db");

// ---------------------------------------------------------------------------
// Constantes — columnas explícitas (nunca SELECT *)
// ---------------------------------------------------------------------------

/** Columnas que se retornan al crear un usuario (sin passwordHash). */
const USER_SELECT_COLUMNS = `
  id,
  full_name AS "fullName",
  email,
  phone,
  role,
  status,
  ST_AsGeoJSON(location)::json AS location,
  zone,
  phone_verified AS "phoneVerified",
  email_verified AS "emailVerified",
  created_at AS "createdAt",
  updated_at AS "updatedAt"
`;

/** Columnas de user_details. */
const USER_DETAILS_SELECT_COLUMNS = `
  skills,
  available_hours AS "availableHours",
  available_days AS "availableDays",
  organization_name AS "organizationName",
  legal_document AS "legalDocument",
  work_area AS "workArea",
  accepted_terms AS "acceptedTerms",
  terms_accepted_at AS "termsAcceptedAt",
  approved_by AS "approvedBy",
  approved_at AS "approvedAt",
  updated_at AS "updatedAt"
`;

// ---------------------------------------------------------------------------
// INSERT — users
// ---------------------------------------------------------------------------

const INSERT_USER = `
  INSERT INTO users (
    full_name,
    email,
    phone,
    password_hash,
    role,
    status,
    location,
    zone
  )
  VALUES (
    $1, $2, $3, $4, $5, $6,
    CASE
      WHEN $7::jsonb IS NOT NULL
      THEN ST_SetSRID(ST_MakePoint(($7->>'lng')::float, ($7->>'lat')::float), 4326)::geography
      ELSE NULL
    END,
    $8
  )
  RETURNING ${USER_SELECT_COLUMNS}
`;

/**
 * Inserta un registro en la tabla users.
 * @param {import("pg").PoolClient} client — Cliente de transacción
 * @param {Object} user — Payload normalizado del usuario
 * @param {string} user.fullName
 * @param {string} user.email
 * @param {string} user.phone
 * @param {string} user.passwordHash — Ya hasheado por el servicio
 * @param {string} user.role
 * @param {string} user.status
 * @param {Object|null} user.location — { lat, lng } o null
 * @param {string|null} user.zone
 * @returns {Promise<Object>} — Fila insertada sin password_hash
 */
async function insertUser(client, user) {
  const locationJson = user.location ? JSON.stringify(user.location) : null;

  const result = await client.query(INSERT_USER, [
    user.fullName,
    user.email,
    user.phone,
    user.passwordHash,
    user.role,
    user.status,
    locationJson,
    user.zone,
  ]);

  return result.rows[0];
}

// ---------------------------------------------------------------------------
// INSERT — user_details
// ---------------------------------------------------------------------------

const INSERT_USER_DETAILS = `
  INSERT INTO user_details (
    user_id,
    skills,
    available_hours,
    available_days,
    organization_name,
    legal_document,
    work_area,
    accepted_terms,
    terms_accepted_at
  )
  VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW())
  RETURNING ${USER_DETAILS_SELECT_COLUMNS}
`;

/**
 * Inserta un registro en la tabla user_details.
 * @param {import("pg").PoolClient} client — Cliente de transacción
 * @param {string} userId — UUID del usuario recién creado
 * @param {Object} details — Payload normalizado de detalles
 * @param {string[]} [details.skills]
 * @param {number} [details.availableHours]
 * @param {string[]} [details.availableDays]
 * @param {string} [details.organizationName]
 * @param {string} [details.legalDocument]
 * @param {string[]} [details.workArea]
 * @param {boolean} details.acceptedTerms
 * @returns {Promise<Object>} — Fila insertada
 */
async function insertUserDetails(client, userId, details) {
  const result = await client.query(INSERT_USER_DETAILS, [
    userId,
    details.skills || null,
    details.availableHours || null,
    details.availableDays || null,
    details.organizationName || null,
    details.legalDocument || null,
    details.workArea || null,
    details.acceptedTerms,
  ]);

  return result.rows[0];
}

// ---------------------------------------------------------------------------
// Helpers de transacción
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
// SELECT — búsqueda por email (para login, incluye password_hash)
// ---------------------------------------------------------------------------

const FIND_USER_BY_EMAIL = `
  SELECT
    id,
    full_name AS "fullName",
    email,
    phone,
    password_hash AS "passwordHash",
    role,
    status,
    ST_AsGeoJSON(location)::json AS location,
    zone,
    phone_verified AS "phoneVerified",
    email_verified AS "emailVerified",
    created_at AS "createdAt",
    updated_at AS "updatedAt"
  FROM users
  WHERE email = $1
`;

/**
 * Busca un usuario por email. Retorna todas las columnas incluyendo password_hash
 * para que el servicio pueda comparar contraseñas.
 * @param {string} email
 * @returns {Promise<Object|null>}
 */
async function findUserByEmail(email) {
  const result = await db.query(FIND_USER_BY_EMAIL, [email.toLowerCase().trim()]);
  return result.rows[0] || null;
}

// ---------------------------------------------------------------------------
// SELECT — búsqueda por ID (para /me, sin password_hash)
// ---------------------------------------------------------------------------

const FIND_USER_BY_ID = `
  SELECT ${USER_SELECT_COLUMNS}
  FROM users
  WHERE id = $1
`;

/**
 * Busca un usuario por ID. No retorna password_hash.
 * @param {string} userId
 * @returns {Promise<Object|null>}
 */
async function findUserById(userId) {
  const result = await db.query(FIND_USER_BY_ID, [userId]);
  return result.rows[0] || null;
}

// ---------------------------------------------------------------------------
// INSERT — organization_profiles (perfil extendido)
// ---------------------------------------------------------------------------

const INSERT_ORGANIZATION_PROFILE = `
  INSERT INTO organization_profiles (
    user_id, organization_type_id, tax_id, tax_id_type, other_entity_type, registry_number, founded_at,
    country, province, city, address, website, social_links,
    mission, vision, scope, served_groups
  )
  VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13::jsonb, $14, $15, $16, $17)
  RETURNING user_id AS "userId", organization_type_id AS "organizationTypeId",
            tax_id AS "taxId", tax_id_type AS "taxIdType", other_entity_type AS "otherEntityType",
            registry_number AS "registryNumber", founded_at AS "foundedAt",
            country, province, city, address, website, social_links AS "socialLinks",
            mission, vision, scope, served_groups AS "servedGroups",
            created_at AS "createdAt", updated_at AS "updatedAt"
`;

/**
 * Inserta el perfil extendido de una organización.
 * @param {import("pg").PoolClient} client — Cliente de transacción
 * @param {string} userId — UUID del usuario recién creado
 * @param {Object} profile — Payload normalizado del perfil
 * @returns {Promise<Object>} — Fila insertada
 */
async function insertOrganizationProfile(client, userId, profile) {
  const result = await client.query(INSERT_ORGANIZATION_PROFILE, [
    userId,
    profile.organizationTypeId,
    profile.taxId,
    profile.taxIdType,
    profile.otherEntityType,
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
// INSERT — legal_representatives
// ---------------------------------------------------------------------------

const INSERT_LEGAL_REPRESENTATIVE = `
  INSERT INTO legal_representatives (organization_id, full_name, position, phone, email)
  VALUES ($1, $2, $3, $4, $5)
  RETURNING id, full_name AS "fullName", position, phone, email
`;

/**
 * Inserta un representante legal de la organización.
 * @param {import("pg").PoolClient} client — Cliente de transacción
 * @param {string} organizationId — UUID de la organización (user_id)
 * @param {Object} rep — Datos del representante
 * @returns {Promise<Object>} — Fila insertada
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
// INSERT — organization_disability_types (relación many-to-many)
// ---------------------------------------------------------------------------

const INSERT_ORGANIZATION_DISABILITY_TYPE = `
  INSERT INTO organization_disability_types (organization_id, catalog_id, catalog_type)
  VALUES ($1, $2, 'disability_type')
  ON CONFLICT DO NOTHING
`;

/**
 * Inserta la relación entre organización y tipo de discapacidad.
 * @param {import("pg").PoolClient} client — Cliente de transacción
 * @param {string} organizationId — UUID de la organización
 * @param {number} disabilityTypeId — ID del tipo de discapacidad (catálogo)
 * @returns {Promise<void>}
 */
async function insertOrganizationDisabilityType(client, organizationId, disabilityTypeId) {
  await client.query(INSERT_ORGANIZATION_DISABILITY_TYPE, [organizationId, disabilityTypeId]);
}

// ---------------------------------------------------------------------------
// INSERT — organization_services (relación many-to-many)
// ---------------------------------------------------------------------------

const INSERT_ORGANIZATION_SERVICE = `
  INSERT INTO organization_services (organization_id, catalog_id, catalog_type)
  VALUES ($1, $2, 'service')
  ON CONFLICT DO NOTHING
`;

/**
 * Inserta la relación entre organización y servicio ofrecido.
 * @param {import("pg").PoolClient} client — Cliente de transacción
 * @param {string} organizationId — UUID de la organización
 * @param {number} serviceId — ID del servicio (catálogo)
 * @returns {Promise<void>}
 */
async function insertOrganizationService(client, organizationId, serviceId) {
  await client.query(INSERT_ORGANIZATION_SERVICE, [organizationId, serviceId]);
}

// ---------------------------------------------------------------------------
// INSERT — volunteer_profiles (perfil extendido)
// ---------------------------------------------------------------------------

const INSERT_VOLUNTEER_PROFILE = `
  INSERT INTO volunteer_profiles (
    user_id, volunteer_type, document_type, document_number, birth_date, address,
    country, profession, languages, availability_mode, has_prior_experience,
    transport_available
  )
  VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
  RETURNING user_id AS "userId", volunteer_type AS "volunteerType",
            document_type AS "documentType", document_number AS "documentNumber",
            birth_date AS "birthDate", address, country, profession, languages,
            availability_mode AS "availabilityMode",
            has_prior_experience AS "hasPriorExperience",
            transport_available AS "transportAvailable",
            created_at AS "createdAt", updated_at AS "updatedAt"
`;

/**
 * Inserta el perfil extendido de un voluntario.
 * @param {import("pg").PoolClient} client — Cliente de transacción
 * @param {Object} profile — Payload normalizado del perfil
 * @returns {Promise<Object>} — Fila insertada
 */
async function insertVolunteerProfile(client, profile) {
  const result = await client.query(INSERT_VOLUNTEER_PROFILE, [
    profile.userId,
    profile.volunteerType,
    profile.documentType,
    profile.documentNumber,
    profile.birthDate,
    profile.address,
    profile.country,
    profile.profession,
    profile.languages,
    profile.availabilityMode,
    profile.hasPriorExperience,
    profile.transportAvailable,
  ]);
  return result.rows[0];
}

// ---------------------------------------------------------------------------
// INSERT — volunteer_interest_areas / volunteer_experience (relaciones many-to-many)
// ---------------------------------------------------------------------------

const INSERT_VOLUNTEER_INTEREST_AREA = `
  INSERT INTO volunteer_interest_areas (user_id, catalog_id, catalog_type)
  VALUES ($1, $2, 'interest_area')
  ON CONFLICT DO NOTHING
`;

/**
 * Inserta la relación entre voluntario y área de interés.
 * @param {import("pg").PoolClient} client — Cliente de transacción
 * @param {string} userId — UUID del voluntario
 * @param {number} catalogId — ID del área de interés (catálogo)
 * @returns {Promise<void>}
 */
async function insertVolunteerInterestArea(client, userId, catalogId) {
  await client.query(INSERT_VOLUNTEER_INTEREST_AREA, [userId, catalogId]);
}

const INSERT_VOLUNTEER_EXPERIENCE = `
  INSERT INTO volunteer_experience (user_id, catalog_id, catalog_type)
  VALUES ($1, $2, 'experience_category')
  ON CONFLICT DO NOTHING
`;

/**
 * Inserta la relación entre voluntario y categoría de experiencia.
 * @param {import("pg").PoolClient} client — Cliente de transacción
 * @param {string} userId — UUID del voluntario
 * @param {number} catalogId — ID de la categoría de experiencia (catálogo)
 * @returns {Promise<void>}
 */
async function insertVolunteerExperience(client, userId, catalogId) {
  await client.query(INSERT_VOLUNTEER_EXPERIENCE, [userId, catalogId]);
}

// ---------------------------------------------------------------------------
// INSERT — verification_requests
// ---------------------------------------------------------------------------

const INSERT_VERIFICATION_REQUEST = `
  INSERT INTO verification_requests (owner_id, entity_type, status)
  VALUES ($1, $2, 'entregada')
  RETURNING id, owner_id AS "ownerId", entity_type AS "entityType", status,
            rejection_reason AS "rejectionReason", submitted_at AS "submittedAt",
            reviewed_by AS "reviewedBy", reviewed_at AS "reviewedAt"
`;

/**
 * Crea una solicitud de verificación para la organización.
 * @param {import("pg").PoolClient} client — Cliente de transacción
 * @param {string} ownerId — UUID del usuario/organización
 * @param {string} entityType — Tipo de entidad ('organization', 'volunteer_professional', etc.)
 * @returns {Promise<Object>} — Fila insertada
 */
async function insertVerificationRequest(client, ownerId, entityType) {
  const result = await client.query(INSERT_VERIFICATION_REQUEST, [ownerId, entityType]);
  return result.rows[0];
}

// ---------------------------------------------------------------------------
// INSERT — verification_tokens
// ---------------------------------------------------------------------------

const INSERT_VERIFICATION_TOKEN = `
  INSERT INTO verification_tokens (verification_request_id, token, action, expires_at)
  VALUES ($1, $2, $3, $4)
  RETURNING id,
            verification_request_id AS "verificationRequestId",
            token,
            action,
            used_at AS "usedAt",
            expires_at AS "expiresAt",
            created_at AS "createdAt"
`;

/**
 * Crea un token de acción para una solicitud de verificación.
 * Si no se pasa cliente, se ejecuta en la conexión global de la app.
 * @param {import("pg").PoolClient | null} client
 * @param {number} verificationRequestId
 * @param {string} action
 * @param {string} [tokenValue]
 * @param {Date|null} [expiresAt]
 * @returns {Promise<Object>}
 */
async function insertVerificationToken(client, verificationRequestId, action, tokenValue, expiresAt) {
  const token = tokenValue || crypto.randomUUID();
  const query = client ? client.query.bind(client) : db.query.bind(db);
  const result = await query(INSERT_VERIFICATION_TOKEN, [verificationRequestId, token, action, expiresAt || null]);
  return result.rows[0];
}

// ---------------------------------------------------------------------------
// SELECT / UPDATE — verification_tokens (acción 'completar_registro')
// ---------------------------------------------------------------------------

const FIND_COMPLETION_TOKEN = `
  SELECT
    vt.id AS "tokenId",
    vt.used_at AS "usedAt",
    vt.expires_at AS "expiresAt",
    vr.status AS "requestStatus",
    u.id AS "ownerId",
    u.email AS "ownerEmail",
    u.full_name AS "ownerName"
  FROM verification_tokens vt
  JOIN verification_requests vr ON vr.id = vt.verification_request_id
  JOIN users u ON u.id = vr.owner_id
  WHERE vt.token = $1 AND vt.action = 'completar_registro'
`;

/**
 * Busca un token de acción 'completar_registro' junto con el estado de la
 * solicitud y los datos del dueño. No valida vigencia; eso es responsabilidad
 * del servicio.
 * @param {string} token — UUID del token
 * @returns {Promise<Object|null>}
 */
async function findCompletionToken(token) {
  const result = await db.query(FIND_COMPLETION_TOKEN, [token]);
  return result.rows[0] || null;
}

const MARK_COMPLETION_TOKEN_USED = `
  UPDATE verification_tokens
  SET used_at = now()
  WHERE id = $1 AND used_at IS NULL
  RETURNING id
`;

/**
 * Marca un token como usado, solo si no lo estaba ya (evita doble-canje
 * concurrente). Devuelve null si el token ya estaba usado.
 * @param {import("pg").PoolClient} client
 * @param {string} tokenId — UUID (id de verification_tokens, no el token en sí)
 * @returns {Promise<Object|null>}
 */
async function markCompletionTokenUsed(client, tokenId) {
  const result = await client.query(MARK_COMPLETION_TOKEN_USED, [tokenId]);
  return result.rows[0] || null;
}

const UPDATE_USER_PASSWORD = `
  UPDATE users
  SET password_hash = $2, email_verified = true, updated_at = now()
  WHERE id = $1
`;

/**
 * Actualiza la contraseña de un usuario al completar su registro.
 * @param {import("pg").PoolClient} client
 * @param {string} userId
 * @param {string} passwordHash
 * @returns {Promise<void>}
 */
async function updateUserPassword(client, userId, passwordHash) {
  await client.query(UPDATE_USER_PASSWORD, [userId, passwordHash]);
}

module.exports = {
  USER_SELECT_COLUMNS,
  USER_DETAILS_SELECT_COLUMNS,
  insertUser,
  insertUserDetails,
  insertOrganizationProfile,
  insertLegalRepresentative,
  insertOrganizationDisabilityType,
  insertOrganizationService,
  insertVolunteerProfile,
  insertVolunteerInterestArea,
  insertVolunteerExperience,
  insertVerificationRequest,
  insertVerificationToken,
  findCompletionToken,
  markCompletionTokenUsed,
  updateUserPassword,
  withTransaction,
  findUserByEmail,
  findUserById,
};
