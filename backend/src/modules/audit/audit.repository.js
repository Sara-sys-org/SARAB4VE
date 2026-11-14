const db = require("../../db");

const AUDIT_SELECT = `
  a.id,
  a.occurred_at AS "occurredAt",
  a.actor_id AS "actorId",
  u.full_name AS "actorName",
  a.actor_role AS "actorRole",
  a.action,
  a.entity_type AS "entityType",
  a.entity_id AS "entityId",
  a.before_data AS "before",
  a.after_data AS "after",
  a.reason
`;

const INSERT_AUDIT = `
  INSERT INTO audit_log (
    actor_id, actor_role, action, entity_type, entity_id, before_data, after_data, reason
  )
  VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
`;

async function insertAudit(client, entry) {
  await client.query(INSERT_AUDIT, [
    entry.actorId ?? null,
    entry.actorRole,
    entry.action,
    entry.entityType,
    entry.entityId,
    entry.before == null ? null : JSON.stringify(entry.before),
    entry.after == null ? null : JSON.stringify(entry.after),
    entry.reason ?? null,
  ]);
}

function buildFilters(filters) {
  const conditions = [];
  const params = [];
  let index = 1;

  if (filters.entityType) {
    conditions.push(`a.entity_type = $${index++}`);
    params.push(filters.entityType);
  }
  if (filters.entityId) {
    conditions.push(`a.entity_id = $${index++}`);
    params.push(filters.entityId);
  }
  if (filters.action) {
    conditions.push(`a.action = $${index++}`);
    params.push(filters.action);
  }
  if (filters.actorId) {
    conditions.push(`a.actor_id = $${index++}`);
    params.push(filters.actorId);
  }
  if (filters.from) {
    conditions.push(`a.occurred_at >= $${index++}`);
    params.push(filters.from);
  }
  if (filters.to) {
    conditions.push(`a.occurred_at <= $${index++}`);
    params.push(filters.to);
  }

  return { where: conditions.length ? `WHERE ${conditions.join(" AND ")}` : "", params };
}

async function listAudit(filters) {
  const { where, params } = buildFilters(filters);
  const limit = filters.limit;
  const offset = (filters.page - 1) * limit;

  const dataQuery = `
    SELECT ${AUDIT_SELECT}
    FROM audit_log a
    LEFT JOIN users u ON u.id = a.actor_id
    ${where}
    ORDER BY a.occurred_at DESC, a.id DESC
    LIMIT $${params.length + 1} OFFSET $${params.length + 2}
  `;

  const countQuery = `
    SELECT COUNT(*)::int AS total
    FROM audit_log a
    ${where}
  `;

  const [dataResult, countResult] = await Promise.all([
    db.query(dataQuery, [...params, limit, offset]),
    db.query(countQuery, params),
  ]);

  return { items: dataResult.rows, total: countResult.rows[0]?.total ?? 0 };
}

module.exports = { insertAudit, listAudit };
