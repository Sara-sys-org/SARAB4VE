const test = require("node:test");
const assert = require("node:assert/strict");

const auditService = require("../src/modules/audit/audit.service");

test("diffChanges returns only the changed keys", () => {
  const result = auditService.diffChanges(
    { fullName: "Ana", email: "ana@example.com", phone: "123" },
    { fullName: "Ana Pérez", email: "ana@example.com", phone: "456" },
  );

  assert.deepEqual(result, {
    before: { fullName: "Ana", phone: "123" },
    after: { fullName: "Ana Pérez", phone: "456" },
  });
});

test("diffChanges returns null when nothing changed", () => {
  const result = auditService.diffChanges(
    { fullName: "Ana", email: "ana@example.com" },
    { fullName: "Ana", email: "ana@example.com" },
  );

  assert.equal(result, null);
});

test("diffChanges stores the full previous snapshot when the record is deleted", () => {
  const result = auditService.diffChanges(
    { fullName: "Ana", email: "ana@example.com" },
    null,
  );

  assert.deepEqual(result, {
    before: { fullName: "Ana", email: "ana@example.com" },
    after: null,
  });
});

test("sanitizeValue drops sensitive keys, truncates strings and caps arrays", () => {
  const longText = "a".repeat(2005);
  const array = Array.from({ length: 55 }, (_, index) => index);

  const clean = auditService.sanitizeValue({
    fullName: "Ana",
    passwordHash: "$2b$12$secret",
    notes: longText,
    items: array,
  });

  assert.equal(clean.fullName, "Ana");
  assert.equal(Object.hasOwn(clean, "passwordHash"), false);
  assert.equal(clean.notes.length, 2000);
  assert.match(clean.notes, /…\[[0-9a-f]{8}\]$/);
  assert.equal(clean.items.length, 51);
  assert.equal(clean.items[50], "[+5 more]");
});

test("diffChanges detects a change that falls beyond the stored string limit", () => {
  const prefix = "a".repeat(2000);

  const result = auditService.diffChanges(
    { mission: `${prefix}OLD` },
    { mission: `${prefix}NEW` },
  );

  assert.notEqual(result, null);
  assert.notEqual(result.before.mission, result.after.mission);
});

test("diffChanges never stores sensitive top-level keys", () => {
  const onlySensitive = auditService.diffChanges(
    { passwordHash: "old-hash" },
    { passwordHash: "new-hash" },
  );
  assert.equal(onlySensitive, null);

  const mixed = auditService.diffChanges(
    { passwordHash: "old-hash", fullName: "Ana" },
    { passwordHash: "new-hash", fullName: "Ana Pérez" },
  );
  assert.deepEqual(mixed, {
    before: { fullName: "Ana" },
    after: { fullName: "Ana Pérez" },
  });
});

test("normalizeDateOnly converts pg DATE values and date strings to YYYY-MM-DD", () => {
  assert.equal(auditService.normalizeDateOnly(new Date(2020, 0, 1)), "2020-01-01");
  assert.equal(auditService.normalizeDateOnly("2020-01-01"), "2020-01-01");
  assert.equal(auditService.normalizeDateOnly("2020-01-01T04:00:00.000Z"), "2020-01-01");
  assert.equal(auditService.normalizeDateOnly(null), null);
});

test("record skips the insert when the diff is empty", async () => {
  let inserted = false;

  const result = await auditService.record(
    {},
    {
      actor: { userId: "user-1", role: "admin" },
      action: "update",
      entityType: "user",
      entityId: "target-1",
      before: { fullName: "Ana" },
      after: { fullName: "Ana" },
    },
    {
      insertAudit: async () => {
        inserted = true;
      },
    },
  );

  assert.equal(result, false);
  assert.equal(inserted, false);
});

test("record passes only changed fields to insertAudit", async () => {
  let entry = null;

  await auditService.record(
    {},
    {
      actor: { userId: "user-1", role: "admin" },
      action: "update",
      entityType: "user",
      entityId: "target-1",
      before: { fullName: "Ana", email: "ana@example.com" },
      after: { fullName: "Ana Pérez", email: "ana@example.com" },
    },
    {
      insertAudit: async (_client, auditEntry) => {
        entry = auditEntry;
      },
    },
  );

  assert.deepEqual(entry.before, { fullName: "Ana" });
  assert.deepEqual(entry.after, { fullName: "Ana Pérez" });
});

test("record maps actor, entity, action and reason correctly", async () => {
  let entry = null;

  const inserted = await auditService.record(
    {},
    {
      actor: { userId: "user-1", role: "admin" },
      action: "approve",
      entityType: "user",
      entityId: 42,
      before: { status: "pending" },
      after: { status: "approved" },
      reason: "manual review",
    },
    {
      insertAudit: async (_client, auditEntry) => {
        entry = auditEntry;
      },
    },
  );

  assert.equal(inserted, true);
  assert.deepEqual(entry, {
    actorId: "user-1",
    actorRole: "admin",
    action: "approve",
    entityType: "user",
    entityId: "42",
    before: { status: "pending" },
    after: { status: "approved" },
    reason: "manual review",
  });
});
