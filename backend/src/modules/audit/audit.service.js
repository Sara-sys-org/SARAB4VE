const { createHash } = require("node:crypto");
const { isDeepStrictEqual } = require("node:util");
const repository = require("./audit.repository");

const MAX_STRING_LENGTH = 2000;
const MAX_ARRAY_ITEMS = 50;
const MAX_DEPTH = 3;
const SENSITIVE_KEY = /(password|passwd|hash|token|secret|storage_?key|authorization)/i;

function sanitizeValue(value, depth = 0) {
  if (value === null || value === undefined) return null;

  if (typeof value === "string") {
    if (value.length <= MAX_STRING_LENGTH) return value;

    // Keep a short hash so two long values that differ beyond the visible
    // prefix still produce different audit snapshots.
    const suffix = `…[${createHash("sha256").update(value).digest("hex").slice(0, 8)}]`;
    return `${value.slice(0, MAX_STRING_LENGTH - suffix.length)}${suffix}`;
  }

  if (typeof value === "number" || typeof value === "boolean") return value;
  if (value instanceof Date) return value.toISOString();

  if (Array.isArray(value)) {
    if (depth >= MAX_DEPTH) return "[nested array omitted]";
    const items = value.slice(0, MAX_ARRAY_ITEMS).map((item) => sanitizeValue(item, depth + 1));
    if (value.length > MAX_ARRAY_ITEMS) items.push(`[+${value.length - MAX_ARRAY_ITEMS} more]`);
    return items;
  }

  if (typeof value === "object") {
    if (depth >= MAX_DEPTH) return "[nested object omitted]";
    const out = {};
    for (const [key, raw] of Object.entries(value)) {
      if (raw === undefined || SENSITIVE_KEY.test(key)) continue;
      out[key] = sanitizeValue(raw, depth + 1);
    }
    return out;
  }

  return String(value);
}

function sanitizeSnapshot(snapshot) {
  if (snapshot === null || snapshot === undefined) return null;
  const clean = sanitizeValue(snapshot, 0);
  if (clean && typeof clean === "object" && !Array.isArray(clean) && Object.keys(clean).length === 0) {
    return null;
  }
  return clean;
}

function normalizeDateOnly(value) {
  if (value === null || value === undefined) return null;

  if (value instanceof Date) {
    const year = value.getFullYear();
    const month = String(value.getMonth() + 1).padStart(2, "0");
    const day = String(value.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  }

  const text = String(value);
  return text.length >= 10 ? text.slice(0, 10) : text;
}

function diffChanges(before, after) {
  if ((before === null || before === undefined) && (after === null || after === undefined)) {
    return null;
  }

  if (after === null) {
    const cleanBefore = sanitizeSnapshot(before);
    return cleanBefore === null ? null : { before: cleanBefore, after: null };
  }

  if (before === null || before === undefined) {
    const cleanAfter = sanitizeSnapshot(after);
    return cleanAfter === null ? null : { before: null, after: cleanAfter };
  }

  // Compare raw values first: sanitizing before comparing would hide real
  // changes that fall beyond the truncation limits.
  const keys = new Set([...Object.keys(before), ...Object.keys(after)]);
  const beforeOut = {};
  const afterOut = {};

  for (const key of keys) {
    if (SENSITIVE_KEY.test(key)) continue;
    const from = before[key];
    const to = after[key];
    if (isDeepStrictEqual(from, to)) continue;
    if (from !== undefined) beforeOut[key] = sanitizeValue(from);
    if (to !== undefined) afterOut[key] = sanitizeValue(to);
  }

  if (Object.keys(beforeOut).length === 0 && Object.keys(afterOut).length === 0) {
    return null;
  }

  return {
    before: Object.keys(beforeOut).length > 0 ? beforeOut : null,
    after: Object.keys(afterOut).length > 0 ? afterOut : null,
  };
}

async function record(client, event, auditRepository = repository) {
  const changes = diffChanges(event.before ?? null, event.after ?? null);
  if (!changes) return false;

  await auditRepository.insertAudit(client, {
    actorId: event.actor?.userId ?? null,
    actorRole: event.actor?.role ?? "unknown",
    action: event.action,
    entityType: event.entityType,
    entityId: String(event.entityId),
    before: changes.before,
    after: changes.after,
    reason: event.reason ?? null,
  });

  return true;
}

async function list(filters, auditRepository = repository) {
  const { items, total } = await auditRepository.listAudit(filters);
  return { data: items, meta: { total, page: filters.page, limit: filters.limit } };
}

module.exports = { record, list, diffChanges, sanitizeValue, normalizeDateOnly };
