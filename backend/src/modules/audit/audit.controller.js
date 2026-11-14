const { AuditQuery } = require("./audit.schema");

function formatZodErrors(zodError) {
  const issues = zodError?.issues || zodError?.errors || [];
  return issues.map((issue) => `${issue.path.join(".")}: ${issue.message}`);
}

function listAudit(service, repository) {
  return async (req, res, next) => {
    const validation = AuditQuery.safeParse(req.query);

    if (!validation.success) {
      return res.status(400).json({ errors: formatZodErrors(validation.error) });
    }

    try {
      const result = await service.list(validation.data, repository);
      return res.json(result);
    } catch (error) {
      return next(error);
    }
  };
}

module.exports = { listAudit };
