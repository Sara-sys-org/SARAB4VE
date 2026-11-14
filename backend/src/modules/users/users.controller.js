/**
 * Controlador — handlers HTTP para el dominio de administración de usuarios.
 * Cada handler es una factoría que recibe service y repository.
 */
const {
  ListUsersQuery,
  UpdateUserBody,
  UpdateOrganizationProfileBody,
  UpdateVolunteerProfileBody,
} = require("./users.schema");

// ---------------------------------------------------------------------------
// Helper — convierte errores de Zod al formato { errors: string[] }
// ---------------------------------------------------------------------------

/**
 * Convierte un ZodError en el formato de errores de SARA.
 * Compatible con Zod v3 (usar .errors) y Zod v4 (usar .issues).
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
// GET /api/users — Listar usuarios (admin only)
// ---------------------------------------------------------------------------

/**
 * @param {Object} service — users.service
 * @param {Object} repository — users.repository
 * @returns {(req: import("express").Request, res: import("express").Response, next: import("express").NextFunction) => Promise<void>}
 */
function listUsers(service, repository) {
  return async (req, res, next) => {
    // Validar query params con Zod
    const validation = ListUsersQuery.safeParse(req.query);

    if (!validation.success) {
      return res.status(400).json({ errors: formatZodErrors(validation.error) });
    }

    try {
      const result = await service.listUsers(validation.data, repository);
      return res.status(result.status).json({ data: result.data });
    } catch (error) {
      return next(error);
    }
  };
}

// ---------------------------------------------------------------------------
// GET /api/users/stats — Estadísticas agregadas por rol y estado (admin only)
// ---------------------------------------------------------------------------

/**
 * @param {Object} service — users.service
 * @param {Object} repository — users.repository
 * @returns {(req: import("express").Request, res: import("express").Response, next: import("express").NextFunction) => Promise<void>}
 */
function getUserStats(service, repository) {
  return async (req, res, next) => {
    try {
      const result = await service.getUserStats(repository);
      return res.status(result.status).json({ data: result.data });
    } catch (error) {
      return next(error);
    }
  };
}

// ---------------------------------------------------------------------------
// GET /api/users/:id — Obtener usuario por ID
// ---------------------------------------------------------------------------

/**
 * @param {Object} service — users.service
 * @param {Object} repository — users.repository
 * @returns {(req: import("express").Request, res: import("express").Response, next: import("express").NextFunction) => Promise<void>}
 */
function getUserById(service, repository) {
  return async (req, res, next) => {
    try {
      const result = await service.getUserById(req.params.id, req.user, repository);

      if (result.errors) {
        return res.status(result.status).json({ errors: result.errors });
      }

      return res.status(200).json({ data: result.data });
    } catch (error) {
      return next(error);
    }
  };
}

// ---------------------------------------------------------------------------
// PATCH /api/users/:id — Actualizar usuario
// ---------------------------------------------------------------------------

/**
 * @param {Object} service — users.service
 * @param {Object} repository — users.repository
 * @returns {(req: import("express").Request, res: import("express").Response, next: import("express").NextFunction) => Promise<void>}
 */
function updateUser(service, repository) {
  return async (req, res, next) => {
    // Validar body con Zod
    const validation = UpdateUserBody.safeParse(req.body);

    if (!validation.success) {
      return res.status(400).json({ errors: formatZodErrors(validation.error) });
    }

    try {
      const result = await service.updateUser(
        req.params.id,
        validation.data,
        req.user, // Inyectado por authenticate
        repository,
      );

      if (result.errors) {
        return res.status(result.status).json({ errors: result.errors });
      }

      return res.status(200).json({ data: result.data });
    } catch (error) {
      return next(error);
    }
  };
}

// ---------------------------------------------------------------------------
// POST /api/users/:id/approve — Aprobar usuario (admin only)
// ---------------------------------------------------------------------------

/**
 * @param {Object} service — users.service
 * @param {Object} repository — users.repository
 * @returns {(req: import("express").Request, res: import("express").Response, next: import("express").NextFunction) => Promise<void>}
 */
function approveUser(service, repository) {
  return async (req, res, next) => {
    try {
      const result = await service.approveUser(
        req.params.id,
        req.user, // El admin que aprueba
        repository,
      );

      if (result.errors) {
        return res.status(result.status).json({ errors: result.errors });
      }

      return res.status(200).json({ data: result.data });
    } catch (error) {
      return next(error);
    }
  };
}

// ---------------------------------------------------------------------------
// POST /api/users/:id/reject — Rechazar usuario (admin only)
// ---------------------------------------------------------------------------

/**
 * @param {Object} service — users.service
 * @param {Object} repository — users.repository
 * @returns {(req: import("express").Request, res: import("express").Response, next: import("express").NextFunction) => Promise<void>}
 */
function rejectUser(service, repository) {
  return async (req, res, next) => {
    try {
      const result = await service.rejectUser(
        req.params.id,
        req.user,
        repository,
      );

      if (result.errors) {
        return res.status(result.status).json({ errors: result.errors });
      }

      return res.status(200).json({ data: result.data });
    } catch (error) {
      return next(error);
    }
  };
}

// ---------------------------------------------------------------------------
// GET /api/users/:id/organization-profile — Obtener perfil completo de organización (admin only)
// ---------------------------------------------------------------------------

/**
 * Obtiene el perfil completo de una organización: datos de usuario, perfil extendido,
 * representantes legales, tipos de discapacidad, servicios, verificación y documentos.
 * @param {Object} service — users.service
 * @param {Object} repository — users.repository
 * @returns {(req: import("express").Request, res: import("express").Response, next: import("express").NextFunction) => Promise<void>}
 */
function getOrganizationProfile(service, repository) {
  return async (req, res, next) => {
    try {
      const result = await service.getOrganizationProfile(
        req.params.id,
        req.user,
        repository,
      );

      if (result.errors) {
        return res.status(result.status).json({ errors: result.errors });
      }

      return res.status(200).json({ data: result.data });
    } catch (error) {
      return next(error);
    }
  };
}

// ---------------------------------------------------------------------------
// GET /api/users/:id/volunteer-profile — Obtener perfil completo de voluntario (admin only)
// ---------------------------------------------------------------------------

/**
 * Obtiene el perfil completo de un voluntario: datos de usuario, perfil extendido,
 * áreas de interés, categorías de experiencia, verificación y documentos.
 * @param {Object} service — users.service
 * @param {Object} repository — users.repository
 * @returns {(req: import("express").Request, res: import("express").Response, next: import("express").NextFunction) => Promise<void>}
 */
function getVolunteerProfile(service, repository) {
  return async (req, res, next) => {
    try {
      const result = await service.getVolunteerProfile(
        req.params.id,
        req.user,
        repository,
      );

      if (result.errors) {
        return res.status(result.status).json({ errors: result.errors });
      }

      return res.status(200).json({ data: result.data });
    } catch (error) {
      return next(error);
    }
  };
}

// ---------------------------------------------------------------------------
// PATCH /api/users/:id/organization-profile — Corregir perfil de organización (solo admin)
// ---------------------------------------------------------------------------

/**
 * Corrige los campos editables de una organización ya registrada.
 * Valida con las mismas reglas del formulario de registro.
 * @param {Object} service — users.service
 * @param {Object} repository — users.repository
 * @returns {(req: import("express").Request, res: import("express").Response, next: import("express").NextFunction) => Promise<void>}
 */
function updateOrganizationProfile(service, repository) {
  return async (req, res, next) => {
    const validation = UpdateOrganizationProfileBody.safeParse(req.body);

    if (!validation.success) {
      return res.status(400).json({ errors: formatZodErrors(validation.error) });
    }

    try {
      const result = await service.updateOrganizationProfile(
        req.params.id,
        validation.data,
        req.user,
        repository,
      );

      if (result.errors) {
        return res.status(result.status).json({ errors: result.errors });
      }

      return res.status(200).json({ data: result.data });
    } catch (error) {
      return next(error);
    }
  };
}

// ---------------------------------------------------------------------------
// PATCH /api/users/:id/volunteer-profile — Corregir perfil de voluntario (solo admin)
// ---------------------------------------------------------------------------

/**
 * Corrige los campos editables de un voluntario ya registrado.
 * Valida con las mismas reglas del formulario de registro.
 * @param {Object} service — users.service
 * @param {Object} repository — users.repository
 * @returns {(req: import("express").Request, res: import("express").Response, next: import("express").NextFunction) => Promise<void>}
 */
function updateVolunteerProfile(service, repository) {
  return async (req, res, next) => {
    const validation = UpdateVolunteerProfileBody.safeParse(req.body);

    if (!validation.success) {
      return res.status(400).json({ errors: formatZodErrors(validation.error) });
    }

    try {
      const result = await service.updateVolunteerProfile(
        req.params.id,
        validation.data,
        req.user,
        repository,
      );

      if (result.errors) {
        return res.status(result.status).json({ errors: result.errors });
      }

      return res.status(200).json({ data: result.data });
    } catch (error) {
      return next(error);
    }
  };
}

module.exports = {
  listUsers,
  getUserStats,
  getUserById,
  updateUser,
  approveUser,
  rejectUser,
  getOrganizationProfile,
  getVolunteerProfile,
  updateOrganizationProfile,
  updateVolunteerProfile,
};
