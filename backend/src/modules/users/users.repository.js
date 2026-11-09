/**
 * Repositorio — consultas SQL para el dominio de administración de usuarios.
 * Todas las funciones de escritura reciben un cliente de transacción (PoolClient)
 * para que el servicio pueda coordinarlas atómicamente.
 */
const db = require("../../db");

// ---------------------------------------------------------------------------
// Constantes — columnas explícitas (nunca SELECT *)
// ---------------------------------------------------------------------------

/** Columnas que se retornan al consultar un usuario (sin passwordHash). */
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

/**
 * Columnas para el listado — mismas columnas que USER_SELECT_COLUMNS pero
 * calificadas con el alias "u." porque esta consulta hace LEFT JOIN con
 * user_details para traer organization_name (el nombre real de la
 * organización no vive en users.full_name, ver migración de este fix), y con
 * organization_profiles/volunteer_profiles para traer el país — cada rol
 * guarda su país en una tabla distinta, así que se toma el que corresponda
 * con COALESCE (nunca van a estar los dos a la vez, porque un usuario es de
 * un solo rol).
 */
const USER_LIST_SELECT_COLUMNS = `
  u.id,
  u.full_name AS "fullName",
  u.email,
  u.phone,
  u.role,
  u.status,
  ST_AsGeoJSON(u.location)::json AS location,
  u.zone,
  u.phone_verified AS "phoneVerified",
  u.email_verified AS "emailVerified",
  u.created_at AS "createdAt",
  u.updated_at AS "updatedAt",
  ud.organization_name AS "organizationName",
  COALESCE(op.country, vp.country) AS "country"
`;

/** Columnas de user_details. */
const USER_DETAILS_SELECT_COLUMNS = `
  user_id AS "userId",
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
// SELECT — listar usuarios con filtros y paginación
// ---------------------------------------------------------------------------

/**
 * Construye dinámicamente la consulta de listado con filtros opcionales.
 * @param {Object} filters
 * @param {string} [filters.role]
 * @param {string} [filters.roles] — lista separada por comas
 * @param {string} [filters.status]
 * @param {string} [filters.search]
 * @param {number} [filters.limit]
 * @param {number} [filters.offset]
 * @returns {{ text: string, params: Array }}
 */
function buildListUsersQuery(filters = {}) {
  const conditions = [];
  const params = [];
  let paramIndex = 1;

  if (filters.role) {
    conditions.push(`u.role = $${paramIndex++}`);
    params.push(filters.role);
  }

  if (filters.roles) {
    conditions.push(`u.role = ANY($${paramIndex++})`);
    params.push(filters.roles.split(",").map((r) => r.trim()));
  }

  if (filters.status) {
    conditions.push(`u.status = $${paramIndex++}`);
    params.push(filters.status);
  }

  if (filters.search) {
    conditions.push(
      `(u.full_name ILIKE $${paramIndex} OR u.email ILIKE $${paramIndex})`,
    );
    params.push(`%${filters.search}%`);
    paramIndex++;
  }

  const whereClause = conditions.length > 0
    ? `WHERE ${conditions.join(" AND ")}`
    : "";

  const limit = filters.limit || 50;
  const offset = filters.offset || 0;

  // Consulta de datos
  const dataQuery = `
    SELECT ${USER_LIST_SELECT_COLUMNS}
    FROM users u
    LEFT JOIN user_details ud ON ud.user_id = u.id
    LEFT JOIN organization_profiles op ON op.user_id = u.id
    LEFT JOIN volunteer_profiles vp ON vp.user_id = u.id
    ${whereClause}
    ORDER BY u.created_at DESC
    LIMIT $${paramIndex++} OFFSET $${paramIndex++}
  `;

  const dataParams = [...params, limit, offset];

  // Consulta de conteo
  const countQuery = `
    SELECT COUNT(*)::int AS total
    FROM users u
    ${whereClause}
  `;

  return { dataQuery, countQuery, dataParams, countParams: params };
}

/**
 * Lista usuarios con filtros opcionales y paginación.
 * @param {Object} filters
 * @returns {Promise<{ users: Object[], total: number, limit: number, offset: number }>}
 */
async function listUsers(filters = {}) {
  const { dataQuery, countQuery, dataParams, countParams } =
    buildListUsersQuery(filters);

  const [dataResult, countResult] = await Promise.all([
    db.query(dataQuery, dataParams),
    db.query(countQuery, countParams),
  ]);

  return {
    users: dataResult.rows,
    total: countResult.rows[0]?.total || 0,
    limit: filters.limit || 50,
    offset: filters.offset || 0,
  };
}

// ---------------------------------------------------------------------------
// SELECT — estadísticas agregadas por rol y estado
// ---------------------------------------------------------------------------

const USER_STATS_QUERY = `
  SELECT role, status, COUNT(*)::int AS count
  FROM users
  GROUP BY role, status
`;

/**
 * Obtiene el conteo de usuarios agrupado por rol y estado.
 * @returns {Promise<{ role: string, status: string, count: number }[]>}
 */
async function getUserStats() {
  const result = await db.query(USER_STATS_QUERY);
  return result.rows;
}

// ---------------------------------------------------------------------------
// SELECT — buscar usuario por ID
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
// SELECT — buscar detalles de usuario
// ---------------------------------------------------------------------------

const FIND_USER_DETAILS_BY_ID = `
  SELECT ${USER_DETAILS_SELECT_COLUMNS}
  FROM user_details
  WHERE user_id = $1
`;

/**
 * Busca los detalles de un usuario (skills, org info, etc.).
 * @param {string} userId
 * @returns {Promise<Object|null>}
 */
async function findUserDetailsById(userId) {
  const result = await db.query(FIND_USER_DETAILS_BY_ID, [userId]);
  return result.rows[0] || null;
}

// ---------------------------------------------------------------------------
// SELECT — buscar perfil de ciudadano (citizen_profiles)
// ---------------------------------------------------------------------------

const CITIZEN_PROFILE_SELECT = `
  user_id AS "userId",
  disability_type AS "disabilityType",
  disability_subcategory AS "disabilitySubcategory",
  communication_mode AS "communicationMode",
  created_at AS "createdAt",
  updated_at AS "updatedAt"
`;

const FIND_CITIZEN_PROFILE_BY_ID = `
  SELECT ${CITIZEN_PROFILE_SELECT}
  FROM citizen_profiles
  WHERE user_id = $1
`;

/**
 * Busca el perfil de discapacidad de un ciudadano.
 * @param {string} userId
 * @returns {Promise<Object|null>}
 */
async function findCitizenProfileById(userId) {
  const result = await db.query(FIND_CITIZEN_PROFILE_BY_ID, [userId]);
  return result.rows[0] || null;
}

/**
 * Crea o actualiza el perfil de discapacidad de un ciudadano.
 * Recibe los tres campos completos (el frontend los envía juntos), por lo
 * que un `null` limpia explícitamente el valor correspondiente.
 *
 * @param {import("pg").PoolClient} client — Cliente de transacción
 * @param {string} userId
 * @param {{ disabilityType: string|null, disabilitySubcategory: string|null, communicationMode: string|null }} profile
 * @returns {Promise<Object>} — Fila insertada/actualizada
 */
async function upsertCitizenProfile(client, userId, profile) {
  const query = `
    INSERT INTO citizen_profiles (
      user_id, disability_type, disability_subcategory, communication_mode
    )
    VALUES ($1, $2, $3, $4)
    ON CONFLICT (user_id) DO UPDATE SET
      disability_type = EXCLUDED.disability_type,
      disability_subcategory = EXCLUDED.disability_subcategory,
      communication_mode = EXCLUDED.communication_mode,
      updated_at = NOW()
    RETURNING ${CITIZEN_PROFILE_SELECT}
  `;

  const result = await (client || db).query(query, [
    userId,
    profile.disabilityType ?? null,
    profile.disabilitySubcategory ?? null,
    profile.communicationMode ?? null,
  ]);

  return result.rows[0] || null;
}

// ---------------------------------------------------------------------------
// UPDATE — actualizar datos básicos del usuario
// ---------------------------------------------------------------------------

/**
 * Construye dinámicamente el UPDATE de users con solo los campos enviados.
 * @param {import("pg").PoolClient} client — Cliente de transacción
 * @param {string} userId
 * @param {Object} updates — Campos a actualizar (fullName, email, phone, zone, location, passwordHash)
 * @returns {Promise<Object>} — Fila actualizada sin password_hash
 */
async function updateUser(client, userId, updates) {
  const setClauses = [];
  const params = [];
  let paramIndex = 1;

  // Siempre actualizar updated_at
  setClauses.push(`updated_at = NOW()`);

  if (updates.fullName !== undefined) {
    setClauses.push(`full_name = $${paramIndex++}`);
    params.push(updates.fullName);
  }

  if (updates.email !== undefined) {
    setClauses.push(`email = $${paramIndex++}`);
    params.push(updates.email);
  }

  if (updates.phone !== undefined) {
    setClauses.push(`phone = $${paramIndex++}`);
    params.push(updates.phone);
  }

  if (updates.zone !== undefined) {
    setClauses.push(`zone = $${paramIndex++}`);
    params.push(updates.zone);
  }

  if (updates.location !== undefined) {
    setClauses.push(
      `location = CASE WHEN $${paramIndex}::jsonb IS NOT NULL THEN ST_SetSRID(ST_MakePoint(($${paramIndex}->>'lng')::float, ($${paramIndex}->>'lat')::float), 4326)::geography ELSE NULL END`,
    );
    params.push(updates.location ? JSON.stringify(updates.location) : null);
    paramIndex++;
  }

  if (updates.passwordHash !== undefined) {
    setClauses.push(`password_hash = $${paramIndex++}`);
    params.push(updates.passwordHash);
  }

  // Si no hay nada que actualizar (solo updated_at), no hacemos nada
  if (setClauses.length === 1 && updates.passwordHash === undefined) {
    // Solo updated_at — devolver el usuario sin cambios
    return findUserById(userId);
  }

  params.push(userId);

  const query = `
    UPDATE users
    SET ${setClauses.join(", ")}
    WHERE id = $${paramIndex}
    RETURNING ${USER_SELECT_COLUMNS}
  `;

  const result = await (client || db).query(query, params);
  return result.rows[0] || null;
}

// ---------------------------------------------------------------------------
// UPDATE — cambiar estado del usuario (aprobar/rechazar)
// ---------------------------------------------------------------------------

/**
 * Actualiza el estado de un usuario. Si es 'approved', también actualiza
 * user_details con approved_by y approved_at.
 *
 * @param {import("pg").PoolClient} client — Cliente de transacción
 * @param {string} userId
 * @param {"approved"|"rejected"|"suspended"} newStatus
 * @param {string} approvedBy — UUID del admin que aprueba/rechaza
 * @returns {Promise<Object>} — Fila actualizada sin password_hash
 */
async function updateUserStatus(client, userId, newStatus, approvedBy) {
  const updateUserQuery = `
    UPDATE users
    SET status = $1, updated_at = NOW()
    WHERE id = $2
    RETURNING ${USER_SELECT_COLUMNS}
  `;

  const result = await client.query(updateUserQuery, [newStatus, userId]);

  // Si es approved, actualizar user_details
  if (newStatus === "approved") {
    const updateDetailsQuery = `
      UPDATE user_details
      SET approved_by = $1, approved_at = NOW(), updated_at = NOW()
      WHERE user_id = $2
    `;
    await client.query(updateDetailsQuery, [approvedBy, userId]);
  }

  return result.rows[0] || null;
}

// ---------------------------------------------------------------------------
// UPDATE — user_details (corrección admin de perfiles de organización/voluntario)
// ---------------------------------------------------------------------------

/** Mapa campo-de-servicio → columna real de user_details. */
const USER_DETAILS_COLUMN_MAP = {
  skills: "skills",
  availableHours: "available_hours",
  availableDays: "available_days",
  organizationName: "organization_name",
  legalDocument: "legal_document",
  workArea: "work_area",
};

/**
 * Actualiza dinámicamente user_details con solo los campos enviados.
 * @param {import("pg").PoolClient} client — Cliente de transacción
 * @param {string} userId
 * @param {Object} updates — Subconjunto de USER_DETAILS_COLUMN_MAP
 * @returns {Promise<Object|null>} — Fila actualizada o null si no había cambios
 */
async function updateUserDetails(client, userId, updates) {
  const setClauses = [];
  const params = [];
  let paramIndex = 1;

  for (const [field, column] of Object.entries(USER_DETAILS_COLUMN_MAP)) {
    if (updates[field] === undefined) continue;
    setClauses.push(`${column} = $${paramIndex++}`);
    params.push(updates[field]);
  }

  if (setClauses.length === 0) return null;

  setClauses.push("updated_at = NOW()");
  params.push(userId);

  const query = `
    UPDATE user_details
    SET ${setClauses.join(", ")}
    WHERE user_id = $${paramIndex}
    RETURNING ${USER_DETAILS_SELECT_COLUMNS}
  `;

  const result = await (client || db).query(query, params);
  return result.rows[0] || null;
}

// ---------------------------------------------------------------------------
// UPDATE — organization_profiles (corrección admin)
// ---------------------------------------------------------------------------

/** Mapa campo-de-servicio → columna real de organization_profiles. */
const ORGANIZATION_PROFILE_COLUMN_MAP = {
  organizationTypeId: "organization_type_id",
  taxId: "tax_id",
  taxIdType: "tax_id_type",
  otherEntityType: "other_entity_type",
  registryNumber: "registry_number",
  foundedAt: "founded_at",
  country: "country",
  province: "province",
  city: "city",
  address: "address",
  website: "website",
  socialLinks: "social_links",
  mission: "mission",
  vision: "vision",
  scope: "scope",
  servedGroups: "served_groups",
};

/**
 * Actualiza dinámicamente organization_profiles con solo los campos enviados.
 * `socialLinks` se serializa a jsonb; el resto son escalares/null.
 * @param {import("pg").PoolClient} client — Cliente de transacción
 * @param {string} userId
 * @param {Object} updates — Subconjunto de ORGANIZATION_PROFILE_COLUMN_MAP
 * @returns {Promise<number>} — Cantidad de filas afectadas
 */
async function updateOrganizationProfile(client, userId, updates) {
  const setClauses = [];
  const params = [];
  let paramIndex = 1;

  for (const [field, column] of Object.entries(ORGANIZATION_PROFILE_COLUMN_MAP)) {
    if (updates[field] === undefined) continue;
    if (field === "socialLinks") {
      setClauses.push(`${column} = $${paramIndex}::jsonb`);
      params.push(updates[field] ? JSON.stringify(updates[field]) : null);
    } else {
      setClauses.push(`${column} = $${paramIndex}`);
      params.push(updates[field]);
    }
    paramIndex++;
  }

  if (setClauses.length === 0) return 0;

  // El trigger trg_organization_profiles_updated_at lo hace igual; se deja
  // explícito por claridad y por si el trigger no existe en algún entorno.
  setClauses.push("updated_at = NOW()");
  params.push(userId);

  const query = `
    UPDATE organization_profiles
    SET ${setClauses.join(", ")}
    WHERE user_id = $${paramIndex}
  `;

  const result = await (client || db).query(query, params);
  return result.rowCount || 0;
}

// ---------------------------------------------------------------------------
// UPDATE — volunteer_profiles (corrección admin)
// ---------------------------------------------------------------------------

/** Mapa campo-de-servicio → columna real de volunteer_profiles. */
const VOLUNTEER_PROFILE_COLUMN_MAP = {
  volunteerType: "volunteer_type",
  documentType: "document_type",
  documentNumber: "document_number",
  birthDate: "birth_date",
  address: "address",
  country: "country",
  profession: "profession",
  languages: "languages",
  availabilityMode: "availability_mode",
  hasPriorExperience: "has_prior_experience",
  transportAvailable: "transport_available",
};

/**
 * Actualiza dinámicamente volunteer_profiles con solo los campos enviados.
 * @param {import("pg").PoolClient} client — Cliente de transacción
 * @param {string} userId
 * @param {Object} updates — Subconjunto de VOLUNTEER_PROFILE_COLUMN_MAP
 * @returns {Promise<number>} — Cantidad de filas afectadas
 */
async function updateVolunteerProfile(client, userId, updates) {
  const setClauses = [];
  const params = [];
  let paramIndex = 1;

  for (const [field, column] of Object.entries(VOLUNTEER_PROFILE_COLUMN_MAP)) {
    if (updates[field] === undefined) continue;
    setClauses.push(`${column} = $${paramIndex++}`);
    params.push(updates[field]);
  }

  if (setClauses.length === 0) return 0;

  setClauses.push("updated_at = NOW()");
  params.push(userId);

  const query = `
    UPDATE volunteer_profiles
    SET ${setClauses.join(", ")}
    WHERE user_id = $${paramIndex}
  `;

  const result = await (client || db).query(query, params);
  return result.rowCount || 0;
}

// ---------------------------------------------------------------------------
// REPLACE — legal_representatives (corrección admin: reemplazo total)
// ---------------------------------------------------------------------------

/**
 * Reemplaza todos los representantes legales de una organización.
 * Borra los existentes e inserta la lista recibida (puede ser vacía).
 * @param {import("pg").PoolClient} client — Cliente de transacción
 * @param {string} organizationId
 * @param {Array<{fullName: string, position?: string|null, phone?: string|null, email?: string|null}>} reps
 * @returns {Promise<void>}
 */
async function replaceLegalRepresentatives(client, organizationId, reps) {
  await client.query(
    "DELETE FROM legal_representatives WHERE organization_id = $1",
    [organizationId],
  );

  for (const rep of reps) {
    await client.query(
      `INSERT INTO legal_representatives (organization_id, full_name, position, phone, email)
       VALUES ($1, $2, $3, $4, $5)`,
      [organizationId, rep.fullName, rep.position ?? null, rep.phone ?? null, rep.email ?? null],
    );
  }
}

// ---------------------------------------------------------------------------
// REPLACE — tablas puente many-to-many (corrección admin: reemplazo total)
// ---------------------------------------------------------------------------

/**
 * Whitelist de tablas puente: nombre de tabla → columna del dueño y tipo de
 * catálogo. El nombre de tabla/columna se interpola en SQL a partir de este
 * mapa fijo (nunca de input del usuario), por lo que es seguro.
 */
const CATALOG_RELATION_TABLES = {
  organization_disability_types: { ownerColumn: "organization_id", catalogType: "disability_type" },
  organization_services: { ownerColumn: "organization_id", catalogType: "service" },
  volunteer_interest_areas: { ownerColumn: "user_id", catalogType: "interest_area" },
  volunteer_experience: { ownerColumn: "user_id", catalogType: "experience_category" },
};

/**
 * Reemplaza las relaciones de una tabla puente: borra las del dueño e inserta
 * la lista recibida (puede ser vacía). Idempotente por ON CONFLICT DO NOTHING.
 * @param {import("pg").PoolClient} client — Cliente de transacción
 * @param {string} tableName — Una de las claves de CATALOG_RELATION_TABLES
 * @param {string} ownerId — UUID del dueño (organización o voluntario)
 * @param {number[]} catalogIds
 * @returns {Promise<void>}
 */
async function replaceCatalogRelations(client, tableName, ownerId, catalogIds) {
  const config = CATALOG_RELATION_TABLES[tableName];
  if (!config) throw new Error(`Unknown catalog relation table: ${tableName}`);

  await client.query(
    `DELETE FROM ${tableName} WHERE ${config.ownerColumn} = $1`,
    [ownerId],
  );

  for (const catalogId of catalogIds) {
    await client.query(
      `INSERT INTO ${tableName} (${config.ownerColumn}, catalog_id, catalog_type)
       VALUES ($1, $2, $3)
       ON CONFLICT DO NOTHING`,
      [ownerId, catalogId, config.catalogType],
    );
  }
}

// ---------------------------------------------------------------------------
// UPDATE — entity_type de la solicitud de verificación (sincroniza volunteerType)
// ---------------------------------------------------------------------------

/**
 * Sincroniza el entity_type de la solicitud de verificación de un voluntario.
 * NO cambia el estado (verificación de que editar no altera el flujo).
 * @param {import("pg").PoolClient} client — Cliente de transacción
 * @param {string} ownerId — UUID del voluntario
 * @param {"volunteer_professional"|"volunteer_non_professional"} entityType
 * @returns {Promise<void>}
 */
async function updateVerificationEntityType(client, ownerId, entityType) {
  await client.query(
    "UPDATE verification_requests SET entity_type = $1 WHERE owner_id = $2",
    [entityType, ownerId],
  );
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
// SELECT — obtener perfil completo de organización
// ---------------------------------------------------------------------------

const ORGANIZATION_PROFILE_SELECT = `
  op.user_id AS "userId",
  op.organization_type_id AS "organizationTypeId",
  ct.name AS "organizationTypeName",
  op.tax_id AS "taxId",
  op.tax_id_type AS "taxIdType",
  op.other_entity_type AS "otherEntityType",
  op.registry_number AS "registryNumber",
  op.founded_at AS "foundedAt",
  op.country, op.province, op.city, op.address,
  op.website, op.social_links AS "socialLinks",
  op.mission, op.vision, op.scope,
  op.served_groups AS "servedGroups",
  op.created_at AS "createdAt",
  op.updated_at AS "updatedAt"
`;

/**
 * Obtiene el perfil completo de una organización.
 * @param {string} userId - ID del usuario/organización
 * @returns {Promise<Object|null>}
 */
async function findOrganizationProfileById(userId) {
  const query = `
    SELECT ${ORGANIZATION_PROFILE_SELECT}
    FROM organization_profiles op
    LEFT JOIN catalog ct ON ct.id = op.organization_type_id AND ct.type = 'organization_type'
    WHERE op.user_id = $1
  `;
  const result = await db.query(query, [userId]);
  return result.rows[0] || null;
}

/**
 * Obtiene los representantes legales de una organización.
 * @param {string} organizationId - ID de la organización
 * @returns {Promise<Array>}
 */
async function findLegalRepresentatives(organizationId) {
  const query = `
    SELECT id, full_name AS "fullName", position, phone, email, created_at AS "createdAt"
    FROM legal_representatives
    WHERE organization_id = $1
    ORDER BY created_at ASC
  `;
  const result = await db.query(query, [organizationId]);
  return result.rows;
}

/**
 * Obtiene los tipos de discapacidad asociados a una organización.
 * @param {string} organizationId - ID de la organización
 * @returns {Promise<Array>}
 */
async function findOrganizationDisabilityTypes(organizationId) {
  const query = `
    SELECT c.id, c.name, c.type
    FROM organization_disability_types odt
    JOIN catalog c ON c.id = odt.catalog_id
    WHERE odt.organization_id = $1
    ORDER BY c.name ASC
  `;
  const result = await db.query(query, [organizationId]);
  return result.rows;
}

/**
 * Obtiene los servicios asociados a una organización.
 * @param {string} organizationId - ID de la organización
 * @returns {Promise<Array>}
 */
async function findOrganizationServices(organizationId) {
  const query = `
    SELECT c.id, c.name, c.type
    FROM organization_services os
    JOIN catalog c ON c.id = os.catalog_id
    WHERE os.organization_id = $1
    ORDER BY c.name ASC
  `;
  const result = await db.query(query, [organizationId]);
  return result.rows;
}

/**
 * Obtiene la solicitud de verificación de un usuario.
 * @param {string} ownerId - ID del usuario
 * @returns {Promise<Object|null>}
 */
async function findVerificationByOwner(ownerId) {
  const query = `
    SELECT id, owner_id AS "ownerId", entity_type AS "entityType", status,
           rejection_reason AS "rejectionReason",
           submitted_at AS "submittedAt",
           reviewed_by AS "reviewedBy", reviewed_at AS "reviewedAt"
    FROM verification_requests
    WHERE owner_id = $1
  `;
  const result = await db.query(query, [ownerId]);
  return result.rows[0] || null;
}

/**
 * Obtiene los documentos de verificación de un usuario.
 * @param {string} ownerId - ID del usuario
 * @returns {Promise<Array>}
 */
async function findVerificationDocuments(ownerId) {
  const query = `
    SELECT vd.id, vd.document_type_id AS "documentTypeId",
           vd.storage_key AS "storageKey", vd.status,
           vd.rejection_reason AS "rejectionReason",
           vd.uploaded_at AS "uploadedAt",
           vd.reviewed_by AS "reviewedBy", vd.reviewed_at AS "reviewedAt",
           dt.code AS "documentTypeCode", dt.name AS "documentTypeName"
    FROM verification_documents vd
    JOIN document_types dt ON dt.id = vd.document_type_id
    WHERE vd.owner_id = $1
    ORDER BY vd.uploaded_at ASC
  `;
  const result = await db.query(query, [ownerId]);
  return result.rows;
}

// ---------------------------------------------------------------------------
// SELECT — obtener perfil completo de voluntario
// ---------------------------------------------------------------------------

const VOLUNTEER_PROFILE_SELECT = `
  user_id AS "userId",
  volunteer_type AS "volunteerType",
  document_type AS "documentType",
  document_number AS "documentNumber",
  birth_date AS "birthDate",
  address,
  country,
  profession, languages,
  availability_mode AS "availabilityMode",
  has_prior_experience AS "hasPriorExperience",
  transport_available AS "transportAvailable",
  created_at AS "createdAt",
  updated_at AS "updatedAt"
`;

/**
 * Obtiene el perfil completo de un voluntario.
 * @param {string} userId - ID del usuario/voluntario
 * @returns {Promise<Object|null>}
 */
async function findVolunteerProfileById(userId) {
  const query = `
    SELECT ${VOLUNTEER_PROFILE_SELECT}
    FROM volunteer_profiles
    WHERE user_id = $1
  `;
  const result = await db.query(query, [userId]);
  return result.rows[0] || null;
}

/**
 * Obtiene las áreas de interés de un voluntario.
 * @param {string} userId - ID del voluntario
 * @returns {Promise<Array>}
 */
async function findVolunteerInterestAreas(userId) {
  const query = `
    SELECT c.id, c.name, c.type
    FROM volunteer_interest_areas via
    JOIN catalog c ON c.id = via.catalog_id
    WHERE via.user_id = $1
    ORDER BY c.name ASC
  `;
  const result = await db.query(query, [userId]);
  return result.rows;
}

/**
 * Obtiene las categorías de experiencia de un voluntario.
 * @param {string} userId - ID del voluntario
 * @returns {Promise<Array>}
 */
async function findVolunteerExperience(userId) {
  const query = `
    SELECT c.id, c.name, c.type
    FROM volunteer_experience ve
    JOIN catalog c ON c.id = ve.catalog_id
    WHERE ve.user_id = $1
    ORDER BY c.name ASC
  `;
  const result = await db.query(query, [userId]);
  return result.rows;
}

module.exports = {
  USER_SELECT_COLUMNS,
  USER_LIST_SELECT_COLUMNS,
  USER_DETAILS_SELECT_COLUMNS,
  buildListUsersQuery,
  listUsers,
  getUserStats,
  findUserById,
  findUserDetailsById,
  findCitizenProfileById,
  upsertCitizenProfile,
  findOrganizationProfileById,
  findLegalRepresentatives,
  findOrganizationDisabilityTypes,
  findVolunteerProfileById,
  findVolunteerInterestAreas,
  findVolunteerExperience,
  findOrganizationServices,
  findVerificationByOwner,
  findVerificationDocuments,
  updateUser,
  updateUserStatus,
  updateUserDetails,
  updateOrganizationProfile,
  updateVolunteerProfile,
  replaceLegalRepresentatives,
  replaceCatalogRelations,
  updateVerificationEntityType,
  withTransaction,
};
