const { z } = require("zod");

const AUDIT_ACTIONS = ["create", "update", "replace", "delete", "approve", "reject", "transition", "review"];

const AuditQuery = z.object({
  entityType: z.string().trim().min(1).max(60).optional(),
  entityId: z.string().trim().min(1).max(120).optional(),
  action: z.enum(AUDIT_ACTIONS).optional(),
  actorId: z.string().uuid().optional(),
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(25),
}).refine((data) => !data.from || !data.to || data.from <= data.to, {
  message: "from must be earlier than or equal to to",
  path: ["from"],
});

module.exports = { AuditQuery, AUDIT_ACTIONS };
