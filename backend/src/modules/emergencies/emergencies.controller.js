/**
 * Controlador — handlers HTTP para el dominio de emergencias.
 *
 * Cada handler recibe las dependencias que necesita en lugar de importarlas
 * directamente, lo que facilita el testing unitario.
 */

/**
 * GET /api/emergencies
 */
function listEmergencies(service, repository, schema) {
  return async (req, res, next) => {
    const search = schema.validateSearchEmergencies(req.query);

    if (!search.isValid) {
      return res.status(400).json({ errors: search.errors });
    }

    try {
      const rows = await service.listEmergencies(search.filters, repository, req.user?.role);
      res.json({ data: rows });
    } catch (error) {
      next(error);
    }
  };
}

/**
 * POST /api/emergencies
 */
function createEmergency(service, schema) {
  return async (req, res, next) => {
    const validation = schema.validateCreateEmergency(req.body);

    if (!validation.isValid) {
      return res.status(400).json({ errors: validation.errors });
    }

    try {
      const emergency = await service.createEmergency(req.body, req.user?.userId || null);
      return res.status(201).json({ data: emergency });
    } catch (error) {
      return next(error);
    }
  };
}

/**
 * GET /api/emergencies/:id
 */
function getEmergencyById(service, schema, repository) {
  return async (req, res, next) => {
    if (!schema.isUuid(req.params.id)) {
      return res.status(400).json({ errors: ["id must be a valid UUID"] });
    }

    try {
      const result = await service.getEmergencyById(req.params.id, repository);

      if (result.errors) {
        return res.status(result.status).json({ errors: result.errors });
      }

      return res.json({ data: result.data });
    } catch (error) {
      return next(error);
    }
  };
}

/**
 * GET /api/emergencies/:id/processing-status
 */
function getProcessingStatus(service, schema, repository) {
  return async (req, res, next) => {
    if (!schema.isUuid(req.params.id)) {
      return res.status(400).json({ errors: ["id must be a valid UUID"] });
    }

    try {
      const result = await service.getProcessingStatus(req.params.id, repository);

      if (result.errors) {
        return res.status(result.status).json({ errors: result.errors });
      }

      return res.json({ data: result.data });
    } catch (error) {
      return next(error);
    }
  };
}

/**
 * GET /api/emergencies/stats
 */
function getEmergencyStats(service, repository) {
  return async (req, res, next) => {
    try {
      const result = await service.getEmergencyStats(repository);
      return res.status(result.status).json({ data: result.data });
    } catch (error) {
      return next(error);
    }
  };
}

module.exports = {
  listEmergencies,
  createEmergency,
  getEmergencyById,
  getProcessingStatus,
  getEmergencyStats,
};
