/**
 * Controlador — handlers HTTP para el dominio de verificación.
 *
 * Cada handler es una factoría que recibe service, schema y repository.
 * La validación usa Zod.safeParse() antes de delegar al servicio.
 */
const {
  OrganizationRegisterBody,
  VolunteerRegisterBody,
  DocumentUploadBody,
  DocumentFileBody,
  TransitionRequestBody,
  DocumentReviewBody,
  CatalogQuery,
  AdminVerificationsQuery,
  AdminVerificationsPagedQuery,
} = require("./verification.schema");

// ---------------------------------------------------------------------------
// Helper — conversión de errores Zod
// ---------------------------------------------------------------------------

/**
 * Convierte un ZodError en el formato de errores de SARA.
 * @param {import("zod").ZodError} zodError
 * @returns {string[]}
 */
function formatZodErrors(zodError) {
  const issues = zodError?.issues || zodError?.errors || [];
  return issues.map(
    (e) => `${e.path.join(".")}: ${e.message}`,
  );
}

// ---------------------------------------------------------------------------
// GET /api/catalog?type=service
// ---------------------------------------------------------------------------

/**
 * @param {Object} service
 * @param {Object} repository
 * @returns {(req, res, next) => Promise<void>}
 */
function getCatalog(service, repository) {
  return async (req, res, next) => {
    const validation = CatalogQuery.safeParse(req.query);

    if (!validation.success) {
      return res.status(400).json({ errors: formatZodErrors(validation.error) });
    }

    try {
      const result = await service.getCatalog(validation.data.type, repository);
      return res.json({ data: result.data });
    } catch (error) {
      return next(error);
    }
  };
}

// ---------------------------------------------------------------------------
// POST /api/organizations/register
// ---------------------------------------------------------------------------

/**
 * @param {Object} service
 * @param {Object} schema
 * @param {Object} repository
 * @returns {(req, res, next) => Promise<void>}
 */
function registerOrganization(service, schema, repository) {
  return async (req, res, next) => {
    const validation = OrganizationRegisterBody.safeParse(req.body);

    if (!validation.success) {
      return res.status(400).json({ errors: formatZodErrors(validation.error) });
    }

    try {
      const result = await service.registerOrganization(
        validation.data,
        req.user.userId,
        schema,
        repository,
      );

      if (result.errors) {
        return res.status(result.status).json({ errors: result.errors });
      }

      return res.status(201).json({ data: result.data });
    } catch (error) {
      return next(error);
    }
  };
}

// ---------------------------------------------------------------------------
// POST /api/volunteers/register
// ---------------------------------------------------------------------------

/**
 * @param {Object} service
 * @param {Object} schema
 * @param {Object} repository
 * @returns {(req, res, next) => Promise<void>}
 */
function registerVolunteer(service, schema, repository) {
  return async (req, res, next) => {
    const validation = VolunteerRegisterBody.safeParse(req.body);

    if (!validation.success) {
      return res.status(400).json({ errors: formatZodErrors(validation.error) });
    }

    try {
      const result = await service.registerVolunteer(
        validation.data,
        req.user.userId,
        schema,
        repository,
      );

      if (result.errors) {
        return res.status(result.status).json({ errors: result.errors });
      }

      return res.status(201).json({ data: result.data });
    } catch (error) {
      return next(error);
    }
  };
}

// ---------------------------------------------------------------------------
// GET /api/verification/status — mi estado de verificación
// ---------------------------------------------------------------------------

/**
 * @param {Object} service
 * @param {Object} repository
 * @returns {(req, res, next) => Promise<void>}
 */
function getMyVerificationStatus(service, repository) {
  return async (req, res, next) => {
    try {
      const result = await service.getMyVerificationStatus(req.user.userId, repository);

      if (result.errors) {
        return res.status(result.status).json({ errors: result.errors });
      }

      return res.json({ data: result.data });
    } catch (error) {
      return next(error);
    }
  };
}

// ---------------------------------------------------------------------------
// POST /api/verification-documents
// ---------------------------------------------------------------------------

/**
 * @param {Object} service
 * @param {Object} repository
 * @returns {(req, res, next) => Promise<void>}
 */
function uploadDocument(service, repository) {
  return async (req, res, next) => {
    // req.file viene de multer
    if (!req.file) {
      return res.status(400).json({ errors: ["El archivo es requerido (campo 'file')"] });
    }

    // documentTypeId viene como campo de texto en multipart/form-data
    const documentTypeId = parseInt(req.body?.documentTypeId, 10);
    if (isNaN(documentTypeId) || documentTypeId <= 0) {
      return res.status(400).json({ errors: ["documentTypeId debe ser un entero positivo"] });
    }

    const validation = DocumentUploadBody.safeParse({
      documentTypeId,
      fileName: req.file.originalname,
      mimeType: req.file.mimetype,
    });

    if (!validation.success) {
      return res.status(400).json({ errors: formatZodErrors(validation.error) });
    }

    try {
      const result = await service.uploadDocument(
        {
          ...validation.data,
          fileBuffer: req.file.buffer,
        },
        req.user.userId,
        repository,
      );

      if (result.errors) {
        return res.status(result.status).json({ errors: result.errors });
      }

      return res.status(201).json({ data: result.data });
    } catch (error) {
      return next(error);
    }
  };
}

// ---------------------------------------------------------------------------
// GET /api/verification-documents/:ownerId
// ---------------------------------------------------------------------------

/**
 * @param {Object} service
 * @param {Object} repository
 * @returns {(req, res, next) => Promise<void>}
 */
function getDocumentChecklist(service, repository) {
  return async (req, res, next) => {
    const { ownerId } = req.params;

    if (!ownerId) {
      return res.status(400).json({ errors: ["ownerId es requerido"] });
    }

    try {
      // Inferir entityType desde la solicitud de verificación del owner
      const verification = await repository.findVerificationByOwner(ownerId);

      if (!verification) {
        return res.status(404).json({ errors: ["No se encontró solicitud de verificación para este usuario"] });
      }

      const result = await service.getDocumentChecklist(
        ownerId,
        verification.entityType,
        repository,
      );

      return res.json({ data: result.data });
    } catch (error) {
      return next(error);
    }
  };
}

// ---------------------------------------------------------------------------
// GET /api/verification-documents/:id/download — URL prefirmada temporal
// ---------------------------------------------------------------------------

/**
 * @param {Object} service
 * @param {Object} repository
 * @returns {(req, res, next) => Promise<void>}
 */
function getDownloadUrl(service, repository) {
  return async (req, res, next) => {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) {
      return res.status(400).json({ errors: ["id debe ser un número entero"] });
    }

    try {
      const result = await service.getDownloadUrl(
        id,
        { userId: req.user.userId, role: req.user.role },
        repository,
      );

      if (result.errors) {
        return res.status(result.status).json({ errors: result.errors });
      }

      return res.json({ data: result.data });
    } catch (error) {
      return next(error);
    }
  };
}

// ---------------------------------------------------------------------------
// PATCH /api/verification-documents/:id/review (admin)
// ---------------------------------------------------------------------------

/**
 * @param {Object} service
 * @param {Object} repository
 * @returns {(req, res, next) => Promise<void>}
 */
function reviewDocument(service, repository) {
  return async (req, res, next) => {
    const validation = DocumentReviewBody.safeParse(req.body);

    if (!validation.success) {
      return res.status(400).json({ errors: formatZodErrors(validation.error) });
    }

    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) {
      return res.status(400).json({ errors: ["id debe ser un número entero"] });
    }

    try {
      const result = await service.reviewDocument(
        id,
        validation.data,
        req.user.userId,
        repository,
      );

      if (result.errors) {
        return res.status(result.status).json({ errors: result.errors });
      }

      return res.json({ data: result.data });
    } catch (error) {
      return next(error);
    }
  };
}

// ---------------------------------------------------------------------------
// PUT /api/verification-documents/:id/file (admin) — agregar o reemplazar
// ---------------------------------------------------------------------------

/**
 * @param {Object} service
 * @param {Object} repository
 * @returns {(req, res, next) => Promise<void>}
 */
function uploadDocumentFile(service, repository) {
  return async (req, res, next) => {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) {
      return res.status(400).json({ errors: ["id debe ser un número entero"] });
    }

    // req.file viene de multer
    if (!req.file) {
      return res.status(400).json({ errors: ["Selecciona un archivo para subir."] });
    }

    const validation = DocumentFileBody.safeParse({
      fileName: req.file.originalname,
      mimeType: req.file.mimetype,
    });

    if (!validation.success) {
      // Mensajes pensados para el usuario final: sin el nombre del campo
      const issues = validation.error.issues || [];
      return res.status(400).json({ errors: issues.map((e) => e.message) });
    }

    try {
      const result = await service.uploadDocumentFile(
        id,
        { ...validation.data, fileBuffer: req.file.buffer },
        repository,
      );

      if (result.errors) {
        return res.status(result.status).json({ errors: result.errors });
      }

      return res.json({ data: result.data, message: result.message, notice: result.notice });
    } catch (error) {
      return next(error);
    }
  };
}

// ---------------------------------------------------------------------------
// DELETE /api/verification-documents/:id/file (admin)
// ---------------------------------------------------------------------------

/**
 * @param {Object} service
 * @param {Object} repository
 * @returns {(req, res, next) => Promise<void>}
 */
function deleteDocumentFile(service, repository) {
  return async (req, res, next) => {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) {
      return res.status(400).json({ errors: ["id debe ser un número entero"] });
    }

    try {
      const result = await service.deleteDocumentFile(id, repository);

      if (result.errors) {
        return res.status(result.status).json({ errors: result.errors });
      }

      return res.json({ data: result.data, message: result.message, notice: result.notice });
    } catch (error) {
      return next(error);
    }
  };
}

// ---------------------------------------------------------------------------
// GET /api/admin/verifications (admin)
// ---------------------------------------------------------------------------

/**
 * @param {Object} service
 * @param {Object} repository
 * @returns {(req, res, next) => Promise<void>}
 */
function listAdminVerifications(service, repository) {
  return async (req, res, next) => {
    const validation = AdminVerificationsQuery.safeParse(req.query);

    if (!validation.success) {
      return res.status(400).json({ errors: formatZodErrors(validation.error) });
    }

    try {
      const result = await service.listAdminVerifications(validation.data, repository);
      return res.json({ data: result.data });
    } catch (error) {
      return next(error);
    }
  };
}

function listAdminVerificationsPaginated(service, repository) {
  return async (req, res, next) => {
    const validation = AdminVerificationsPagedQuery.safeParse(req.query);

    if (!validation.success) {
      return res.status(400).json({ errors: formatZodErrors(validation.error) });
    }

    try {
      const result = await service.listAdminVerificationsPaginated(validation.data, repository);
      return res.json({ data: result.data });
    } catch (error) {
      return next(error);
    }
  };
}

// ---------------------------------------------------------------------------
// PATCH /api/admin/verifications/:id/transition (admin)
// ---------------------------------------------------------------------------

/**
 * @param {Object} service
 * @param {Object} repository
 * @returns {(req, res, next) => Promise<void>}
 */
function transitionVerification(service, repository) {
  return async (req, res, next) => {
    const validation = TransitionRequestBody.safeParse(req.body);

    if (!validation.success) {
      return res.status(400).json({ errors: formatZodErrors(validation.error) });
    }

    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) {
      return res.status(400).json({ errors: ["id debe ser un número entero"] });
    }

    try {
      const result = await service.transitionVerification(
        id,
        validation.data,
        req.user.userId,
        repository,
      );

      if (result.errors) {
        return res.status(result.status).json({ errors: result.errors });
      }

      return res.json({ data: result.data });
    } catch (error) {
      return next(error);
    }
  };
}

// ---------------------------------------------------------------------------
// Exports
// ---------------------------------------------------------------------------

module.exports = {
  getCatalog,
  registerOrganization,
  registerVolunteer,
  getMyVerificationStatus,
  uploadDocument,
  getDocumentChecklist,
  getDownloadUrl,
  reviewDocument,
  uploadDocumentFile,
  deleteDocumentFile,
  listAdminVerifications,
  listAdminVerificationsPaginated,
  transitionVerification,
};
