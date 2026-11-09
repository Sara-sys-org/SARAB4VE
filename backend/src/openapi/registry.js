/**
 * Registro central de OpenAPI para SARA.
 *
 * Todos los schemas Zod del proyecto se importan aquí, se extienden con
 * .openapi() (ejemplos, descripciones) y se registran en el OpenAPIRegistry.
 *
 * Cada endpoint se documenta con:
 *   - method, path, tags
 *   - request body/params/query schemas
 *   - responses (éxito, error de validación, auth, conflictos)
 *   - security (bearerAuth para rutas protegidas)
 */
const { OpenAPIRegistry, extendZodWithOpenApi } = require("@asteasolutions/zod-to-openapi");
const { z } = require("zod");

// Extender Zod con el método .openapi() — requerido por zod-to-openapi v8+
extendZodWithOpenApi(z);

// ---------------------------------------------------------------------------
// Schemas del módulo auth (ya tienen .openapi() definido en auth.schema.js)
// ---------------------------------------------------------------------------
const {
  RegisterCitizenBody,
  RegisterVolunteerBody,
  RegisterOrganizationBody,
  RegisterAdminBody,
  LoginBody,
  ValidateCompletionTokenQuery,
  CompleteRegistrationBody,
  UserProfile,
  LoginResponse,
  ErrorResponse,
  ValidateCompletionTokenResponse,
  CompleteRegistrationResponse,
} = require("../modules/auth/auth.schema");

// ---------------------------------------------------------------------------
// Schemas del módulo verification (ya tienen .openapi() definido en verification.schema.js)
// ---------------------------------------------------------------------------
const {
  OrganizationRegisterBody,
  VolunteerRegisterBody,
  DocumentUploadBody,
  TransitionRequestBody,
  DocumentReviewBody,
  CatalogQuery,
  AdminVerificationsQuery,
  AdminVerificationsPagedQuery,
  AdminVerificationsResponse,
  CatalogItemResponse,
  DocumentTypeResponse,
  VerificationRequestResponse,
  VerificationDocumentResponse,
} = require("../modules/verification/verification.schema");

// ---------------------------------------------------------------------------
// Schemas del módulo users (ya tienen .openapi() definido en users.schema.js)
// ---------------------------------------------------------------------------
const {
  ListUsersQuery,
  UpdateUserBody,
  UpdateOrganizationProfileBody,
  UpdateVolunteerProfileBody,
  ListUsersResponse,
  UserStatsResponse,
} = require("../modules/users/users.schema");

// ---------------------------------------------------------------------------
// Schemas del módulo emergencies/voice (Zod con .openapi())
// ---------------------------------------------------------------------------
const { EmergenciaVozSchema } = require("../modules/emergencies/emergencies.voice");

// ---------------------------------------------------------------------------
// Schemas para módulos que aún no están migrados a Zod
// (solo se usan para documentación OpenAPI, no para validación en runtime)
// ---------------------------------------------------------------------------

/** POST /api/help-requests — body */
const HelpRequestCreateBody = z.object({
  requesterName: z.string().min(1).openapi({
    example: "Pedro López", description: "Nombre del solicitante",
  }),
  contactMethod: z.string().min(1).openapi({
    example: "whatsapp", description: "Método de contacto preferido",
  }),
  contactValue: z.string().min(1).openapi({
    example: "+584241112233", description: "Valor de contacto (teléfono, email)",
  }),
  needType: z.enum([
    "equipment", "medication", "transport", "companionship",
    "interpreter", "accessible_information", "neurodivergent_support",
    "psychosocial_support",
  ]).openapi({ example: "medication", description: "Tipo de necesidad" }),
  description: z.string().min(1).openapi({
    example: "Necesito medicación para la presión arterial",
    description: "Descripción detallada de la necesidad",
  }),
  latitude: z.number().min(-90).max(90).openapi({
    example: 10.4806, description: "Latitud en grados decimales",
  }),
  longitude: z.number().min(-180).max(180).openapi({
    example: -66.9036, description: "Longitud en grados decimales",
  }),
  urgency: z.enum(["low", "medium", "high", "critical"]).optional().openapi({
    example: "high", description: "Nivel de urgencia (default: medium)",
  }),
}).openapi({ description: "Payload para crear una solicitud de ayuda" });

/** POST /api/help-requests/:id/accept — body */
const AcceptHelpRequestBody = z.object({
  volunteerId: z.string().uuid().optional().openapi({
    example: "550e8400-e29b-41d4-a716-446655440000",
    description: "ID del voluntario que acepta (opcional, se usa req.user si no se envía)",
  }),
}).openapi({ description: "Payload para aceptar una solicitud" });

/** POST /api/emergencies — body */
const EmergencyCreateBody = z.object({
  requesterName: z.string().optional().openapi({
    example: "Persona anónima", description: "Nombre de quien reporta (opcional)",
  }),
  disabilityType: z.enum(["visual", "auditiva", "neuro", "motriz"]).openapi({
    example: "motriz", description: "Tipo de discapacidad",
  }),
  communicationMode: z.enum([
    "lengua_senas", "audifono", "implante_coclear", "vibrador_oseo",
  ]).optional().openapi({ example: "lengua_senas", description: "Modo de comunicación" }),
  disabilitySubcategory: z.string().optional().openapi({
    example: "silla_ruedas", description: "Subcategoría de discapacidad",
  }),
  needType: z.string().min(1).openapi({
    example: "Evacuación de emergencia", description: "Tipo de necesidad",
  }),
  description: z.string().min(1).openapi({
    example: "Persona en silla de ruedas atrapada en 2do piso sin ascensor",
    description: "Descripción de la emergencia",
  }),
  latitude: z.number().min(-90).max(90).openapi({
    example: 10.4806, description: "Latitud en grados decimales",
  }),
  longitude: z.number().min(-180).max(180).openapi({
    example: -66.9036, description: "Longitud en grados decimales",
  }),
  urgency: z.enum(["low", "medium", "high", "critical"]).optional().openapi({
    example: "critical", description: "Nivel de urgencia (default: medium)",
  }),
}).openapi({ description: "Payload para crear una emergencia SOS accesible" });

// ---------------------------------------------------------------------------
// Schemas para attendees
// ---------------------------------------------------------------------------

/** Response de un attendee (emergency o help-request) */
const AttendeeResponse = z.object({
  id: z.string().uuid().openapi({
    example: "550e8400-e29b-41d4-a716-446655440000",
    description: "UUID del registro attendee",
  }),
  emergencyId: z.string().uuid().optional().openapi({
    example: "550e8400-e29b-41d4-a716-446655440000",
    description: "UUID de la emergencia (solo en emergency attendees)",
  }),
  helpRequestId: z.string().uuid().optional().openapi({
    example: "550e8400-e29b-41d4-a716-446655440000",
    description: "UUID de la solicitud (solo en help-request attendees)",
  }),
  attendedBy: z.string().uuid().openapi({
    example: "550e8400-e29b-41d4-a716-446655440000",
    description: "UUID del usuario que atiende",
  }),
  attendedAt: z.string().datetime().openapi({
    example: "2026-07-13T14:30:00.000Z",
    description: "Fecha/hora en que se vinculó",
  }),
  userName: z.string().optional().openapi({
    example: "María Pérez",
    description: "Nombre del usuario (incluido en GET /list)",
  }),
  userEmail: z.string().email().optional().openapi({
    example: "maria@example.com",
    description: "Email del usuario (incluido en GET /list)",
  }),
  userRole: z.string().optional().openapi({
    example: "volunteer",
    description: "Rol del usuario (incluido en GET /list)",
  }),
}).openapi({ description: "Registro de un usuario atendiendo una emergencia o solicitud" });

// ---------------------------------------------------------------------------
// Schemas para conversaciones (chat)
// ---------------------------------------------------------------------------

const ConversationResponse = z.object({
  id: z.string().uuid(),
  emergencyId: z.string().uuid().nullable(),
  helpRequestId: z.string().uuid().nullable(),
  status: z.enum(["active", "closed"]),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

const MessageResponse = z.object({
  id: z.string().uuid(),
  conversationId: z.string().uuid(),
  senderUserId: z.string().uuid().nullable(),
  body: z.string(),
  createdAt: z.string().datetime(),
  readAt: z.string().datetime().nullable(),
});

// ---------------------------------------------------------------------------
// Registry
// ---------------------------------------------------------------------------

const registry = new OpenAPIRegistry();

// ── Security Scheme (bearerAuth JWT) ─────────────────────────────────────

registry.registerComponent("securitySchemes", "bearerAuth", {
  type: "http",
  scheme: "bearer",
  bearerFormat: "JWT",
  description: [
    "Token JWT obtenido en POST /api/auth/login.",
    "En Swagger UI, haz clic en **Authorize** y pega solo el token (sin 'Bearer ').",
  ].join(" "),
});

// ── Schemas reutilizables ─────────────────────────────────────────────────

registry.register("ErrorResponse", ErrorResponse);
registry.register("UserProfile", UserProfile);

// =========================================================================
// AUTH — Registro
// =========================================================================

registry.registerPath({
  method: "post",
  path: "/api/auth/register/citizen",
  summary: "Registrar ciudadano",
  description: "Registra un nuevo ciudadano con aprobación automática. No requiere autenticación previa.",
  tags: ["Auth"],
  request: {
    body: {
      content: { "application/json": { schema: RegisterCitizenBody } },
      description: "Datos del ciudadano",
      required: true,
    },
  },
  responses: {
    201: {
      description: "Ciudadano registrado exitosamente",
      content: { "application/json": { schema: z.object({ data: z.object({ token: z.string(), user: UserProfile }) }) } },
    },
    400: {
      description: "Error de validación (campos requeridos, formato inválido)",
      content: { "application/json": { schema: ErrorResponse } },
    },
    409: {
      description: "Conflicto — email o teléfono ya registrado",
      content: { "application/json": { schema: ErrorResponse } },
    },
  },
});

registry.registerPath({
  method: "post",
  path: "/api/auth/register/volunteer",
  summary: "Registrar voluntario",
  description: [
    "Registra un nuevo voluntario.",
    "Requiere habilidades, disponibilidad horaria y aceptación de términos.",
    "Queda en estado 'pending' hasta que un administrador apruebe la cuenta.",
  ].join(" "),
  tags: ["Auth"],
  request: {
    body: {
      content: { "application/json": { schema: RegisterVolunteerBody } },
      description: "Datos del voluntario",
      required: true,
    },
  },
  responses: {
    201: {
      description: "Voluntario registrado (pendiente de aprobación)",
      content: { "application/json": { schema: z.object({ data: z.object({ token: z.string(), user: UserProfile }) }) } },
    },
    400: {
      description: "Error de validación",
      content: { "application/json": { schema: ErrorResponse } },
    },
    409: {
      description: "Conflicto — email o teléfono ya registrado",
      content: { "application/json": { schema: ErrorResponse } },
    },
  },
});

registry.registerPath({
  method: "post",
  path: "/api/auth/register/organization",
  summary: "Registrar organización",
  description: [
    "Registra una nueva organización humanitaria.",
    "Requiere datos legales (nombre, documento).",
    "Queda en estado 'pending' hasta que un administrador apruebe la cuenta.",
  ].join(" "),
  tags: ["Auth"],
  request: {
    body: {
      content: { "application/json": { schema: RegisterOrganizationBody } },
      description: "Datos de la organización",
      required: true,
    },
  },
  responses: {
    201: {
      description: "Organización registrada (pendiente de aprobación)",
      content: { "application/json": { schema: z.object({ data: z.object({ token: z.string(), user: UserProfile }) }) } },
    },
    400: {
      description: "Error de validación",
      content: { "application/json": { schema: ErrorResponse } },
    },
    409: {
      description: "Conflicto — email o teléfono ya registrado",
      content: { "application/json": { schema: ErrorResponse } },
    },
  },
});

registry.registerPath({
  method: "post",
  path: "/api/auth/register/admin",
  summary: "Registrar administrador",
  description: [
    "Registra un nuevo administrador.",
    "Protegido por ADMIN_SECRET — el payload debe incluir el secreto",
    "configurado en el servidor.",
  ].join(" "),
  tags: ["Auth"],
  security: [{ bearerAuth: [] }],
  request: {
    body: {
      content: { "application/json": { schema: RegisterAdminBody } },
      description: "Datos del administrador + adminSecret",
      required: true,
    },
  },
  responses: {
    201: {
      description: "Administrador registrado exitosamente",
      content: { "application/json": { schema: z.object({ data: UserProfile }) } },
    },
    400: {
      description: "Error de validación o adminSecret incorrecto",
      content: { "application/json": { schema: ErrorResponse } },
    },
    409: {
      description: "Conflicto — email o teléfono ya registrado",
      content: { "application/json": { schema: ErrorResponse } },
    },
  },
});

// =========================================================================
// AUTH — Login
// =========================================================================

registry.registerPath({
  method: "post",
  path: "/api/auth/login",
  summary: "Iniciar sesión",
  description: [
    "Autentica al usuario con email y contraseña.",
    "Retorna un JWT válido por 8 horas.",
    "Usa el token en las demás rutas con el header:",
    "`Authorization: Bearer <token>`",
  ].join(" "),
  tags: ["Auth"],
  request: {
    body: {
      content: { "application/json": { schema: LoginBody } },
      description: "Credenciales de acceso",
      required: true,
    },
  },
  responses: {
    200: {
      description: "Inicio de sesión exitoso",
      content: { "application/json": { schema: LoginResponse } },
    },
    400: {
      description: "Error de validación (email/password faltantes)",
      content: { "application/json": { schema: ErrorResponse } },
    },
    401: {
      description: "Credenciales inválidas (email no existe o password incorrecto)",
      content: { "application/json": { schema: ErrorResponse } },
    },
    403: {
      description: "Cuenta bloqueada (pendiente, rechazada o suspendida)",
      content: { "application/json": { schema: ErrorResponse } },
    },
  },
});

// =========================================================================
// AUTH — Perfil (protegido)
// =========================================================================

registry.registerPath({
  method: "get",
  path: "/api/auth/me",
  summary: "Obtener perfil del usuario autenticado",
  description: "Devuelve el perfil del usuario correspondiente al token JWT enviado.",
  tags: ["Auth"],
  security: [{ bearerAuth: [] }],
  responses: {
    200: {
      description: "Perfil del usuario autenticado",
      content: { "application/json": { schema: z.object({ data: UserProfile }) } },
    },
    401: {
      description: "No autenticado — token faltante, expirado o inválido",
      content: { "application/json": { schema: ErrorResponse } },
    },
    404: {
      description: "Usuario no encontrado",
      content: { "application/json": { schema: ErrorResponse } },
    },
  },
});

// =========================================================================
// AUTH — Completar registro (público, HU-3)
// =========================================================================

registry.registerPath({
  method: "get",
  path: "/api/auth/validate-completion-token",
  summary: "Validar token de completar registro",
  description: [
    "Endpoint público (sin autenticación). Valida un token de un solo uso",
    "generado al aprobar una solicitud de verificación. No distingue el",
    "motivo específico de invalidez (inexistente, usado, expirado, o la",
    "solicitud ya no está en 'aceptada'): todos devuelven valid: false.",
  ].join(" "),
  tags: ["Auth"],
  request: {
    query: ValidateCompletionTokenQuery,
  },
  responses: {
    200: {
      description: "Resultado de la validación (valid: true|false)",
      content: { "application/json": { schema: ValidateCompletionTokenResponse } },
    },
  },
});

registry.registerPath({
  method: "post",
  path: "/api/auth/complete-registration",
  summary: "Completar registro definiendo la contraseña",
  description: [
    "Endpoint público (sin autenticación). Define la contraseña definitiva",
    "de un usuario ya aprobado y consume el token de un solo uso.",
  ].join(" "),
  tags: ["Auth"],
  request: {
    body: {
      content: { "application/json": { schema: CompleteRegistrationBody } },
      description: "Token de completar registro + nueva contraseña",
      required: true,
    },
  },
  responses: {
    200: {
      description: "Registro completado",
      content: { "application/json": { schema: CompleteRegistrationResponse } },
    },
    400: {
      description: "Token inválido, expirado, ya usado, o contraseña inválida",
      content: { "application/json": { schema: ErrorResponse } },
    },
  },
});

// =========================================================================
// HELP REQUESTS
// =========================================================================

registry.registerPath({
  method: "get",
  path: "/api/help-requests",
  summary: "Listar solicitudes de ayuda",
  description: [
    "Lista solicitudes de ayuda con filtros opcionales por geolocalización y estado.",
    "Requiere autenticación y rol admin, organization o volunteer.",
  ].join(" "),
  tags: ["Help Requests"],
  security: [{ bearerAuth: [] }],
  request: {
    query: z.object({
      latitude: z.string().optional().openapi({
        example: "10.4806", description: "Latitud para filtro geoespacial",
      }),
      longitude: z.string().optional().openapi({
        example: "-66.9036", description: "Longitud para filtro geoespacial",
      }),
      radiusKm: z.string().optional().openapi({
        example: "10", description: "Radio en km (default 10, max 100)",
      }),
      status: z.enum(["open", "assigned", "resolved"]).optional().openapi({
        example: "open", description: "Filtrar por estado",
      }),
    }),
  },
  responses: {
    200: { description: "Lista de solicitudes (puede ser vacía)" },
    400: {
      description: "Error de validación en query params",
      content: { "application/json": { schema: ErrorResponse } },
    },
    401: {
      description: "No autenticado",
      content: { "application/json": { schema: ErrorResponse } },
    },
    403: {
      description: "Rol no autorizado",
      content: { "application/json": { schema: ErrorResponse } },
    },
  },
});

registry.registerPath({
  method: "post",
  path: "/api/help-requests",
  summary: "Crear solicitud de ayuda",
  description: "Crea una nueva solicitud de ayuda (SOS). Requiere autenticación.",
  tags: ["Help Requests"],
  request: {
    body: {
      content: { "application/json": { schema: HelpRequestCreateBody } },
      description: "Datos de la solicitud",
      required: true,
    },
  },
  responses: {
    201: { description: "Solicitud creada exitosamente" },
    400: {
      description: "Error de validación",
      content: { "application/json": { schema: ErrorResponse } },
    },
    401: {
      description: "No autenticado",
      content: { "application/json": { schema: ErrorResponse } },
    },
  },
});

registry.registerPath({
  method: "post",
  path: "/api/help-requests/{id}/accept",
  summary: "Aceptar solicitud de ayuda",
  description: "Un voluntario u organización acepta atender una solicitud. Requiere rol admin/organization.",
  tags: ["Help Requests"],
  security: [{ bearerAuth: [] }],
  request: {
    params: z.object({
      id: z.string().uuid().openapi({
        example: "550e8400-e29b-41d4-a716-446655440000",
        description: "UUID de la solicitud",
      }),
    }),
    body: {
      content: { "application/json": { schema: AcceptHelpRequestBody } },
      description: "ID del voluntario (opcional)",
    },
  },
  responses: {
    200: { description: "Solicitud aceptada y asignada" },
    400: {
      description: "ID inválido o error de validación",
      content: { "application/json": { schema: ErrorResponse } },
    },
    401: {
      description: "No autenticado",
      content: { "application/json": { schema: ErrorResponse } },
    },
    403: {
      description: "Rol no autorizado",
      content: { "application/json": { schema: ErrorResponse } },
    },
    404: {
      description: "Solicitud no encontrada",
      content: { "application/json": { schema: ErrorResponse } },
    },
  },
});

registry.registerPath({
  method: "post",
  path: "/api/help-requests/{id}/resolve",
  summary: "Resolver solicitud de ayuda",
  description: "Marca una solicitud como resuelta. Requiere rol admin/organization.",
  tags: ["Help Requests"],
  security: [{ bearerAuth: [] }],
  request: {
    params: z.object({
      id: z.string().uuid().openapi({
        example: "550e8400-e29b-41d4-a716-446655440000",
        description: "UUID de la solicitud",
      }),
    }),
  },
  responses: {
    200: { description: "Solicitud resuelta exitosamente" },
    400: {
      description: "ID inválido",
      content: { "application/json": { schema: ErrorResponse } },
    },
    401: {
      description: "No autenticado",
      content: { "application/json": { schema: ErrorResponse } },
    },
    403: {
      description: "Rol no autorizado",
      content: { "application/json": { schema: ErrorResponse } },
    },
    404: {
      description: "Solicitud no encontrada",
      content: { "application/json": { schema: ErrorResponse } },
    },
  },
});

registry.registerPath({
  method: "get",
  path: "/api/help-requests/{id}",
  summary: "Obtener solicitud por ID",
  description: "Obtiene el detalle completo de una solicitud de ayuda por su UUID. Requiere autenticación y rol admin, organization o volunteer.",
  tags: ["Help Requests"],
  security: [{ bearerAuth: [] }],
  request: {
    params: z.object({
      id: z.string().uuid().openapi({
        example: "550e8400-e29b-41d4-a716-446655440000",
        description: "UUID de la solicitud",
      }),
    }),
  },
  responses: {
    200: { description: "Detalle completo de la solicitud" },
    400: {
      description: "ID inválido (no es UUID)",
      content: { "application/json": { schema: ErrorResponse } },
    },
    401: {
      description: "No autenticado",
      content: { "application/json": { schema: ErrorResponse } },
    },
    403: {
      description: "Rol no autorizado",
      content: { "application/json": { schema: ErrorResponse } },
    },
    404: {
      description: "Solicitud no encontrada",
      content: { "application/json": { schema: ErrorResponse } },
    },
  },
});

registry.registerPath({
  method: "get",
  path: "/api/help-requests/stats",
  summary: "Estadísticas de solicitudes de ayuda",
  description: "Conteo de solicitudes de ayuda agrupado por estado (open, assigned, resolved) más el total. Requiere rol admin, organization o volunteer.",
  tags: ["Help Requests"],
  security: [{ bearerAuth: [] }],
  responses: {
    200: {
      description: "Conteo por estado y total",
      content: {
        "application/json": {
          schema: z.object({
            data: z.object({
              total: z.number().int().openapi({ example: 0 }),
              open: z.number().int().openapi({ example: 0 }),
              assigned: z.number().int().openapi({ example: 0 }),
              resolved: z.number().int().openapi({ example: 0 }),
            }),
          }),
        },
      },
    },
    401: {
      description: "No autenticado",
      content: { "application/json": { schema: ErrorResponse } },
    },
    403: {
      description: "Rol no autorizado",
      content: { "application/json": { schema: ErrorResponse } },
    },
  },
});

// =========================================================================
// EMERGENCIES
// =========================================================================

registry.registerPath({
  method: "get",
  path: "/api/emergencies",
  summary: "Listar emergencias",
  description: "Lista todas las emergencias activas con filtros opcionales. Público.",
  tags: ["Emergencies"],
  security: [{ bearerAuth: [] }],
  request: {
    query: z.object({
      status: z.enum(["received", "assigned", "resolved"]).optional().openapi({
        example: "received", description: "Filtrar por estado",
      }),
      urgency: z.enum(["low", "medium", "high", "critical"]).optional().openapi({
        example: "critical", description: "Filtrar por urgencia",
      }),
    }),
  },
  responses: {
    200: { description: "Lista de emergencias" },
    400: {
      description: "Error de validación en query params",
      content: { "application/json": { schema: ErrorResponse } },
    },
  },
});

registry.registerPath({
  method: "get",
  path: "/api/emergencies/stats",
  summary: "Estadísticas de emergencias",
  description: "Conteo de emergencias agrupado por estado (received, assigned, resolved) más el total. Requiere rol admin, organization o volunteer.",
  tags: ["Emergencies"],
  security: [{ bearerAuth: [] }],
  responses: {
    200: {
      description: "Conteo por estado y total",
      content: {
        "application/json": {
          schema: z.object({
            data: z.object({
              total: z.number().int().openapi({ example: 0 }),
              received: z.number().int().openapi({ example: 0 }),
              assigned: z.number().int().openapi({ example: 0 }),
              resolved: z.number().int().openapi({ example: 0 }),
            }),
          }),
        },
      },
    },
    401: {
      description: "No autenticado",
      content: { "application/json": { schema: ErrorResponse } },
    },
    403: {
      description: "Rol no autorizado",
      content: { "application/json": { schema: ErrorResponse } },
    },
  },
});

registry.registerPath({
  method: "post",
  path: "/api/emergencies",
  summary: "Crear emergencia SOS",
  description: "Crea una nueva emergencia SOS accesible. No requiere autenticación.",
  tags: ["Emergencies"],
  request: {
    body: {
      content: { "application/json": { schema: EmergencyCreateBody } },
      description: "Datos de la emergencia",
      required: true,
    },
  },
  responses: {
    201: { description: "Emergencia creada exitosamente" },
    400: {
      description: "Error de validación",
      content: { "application/json": { schema: ErrorResponse } },
    },
  },
});

// ── Voz: reporte con audio + transcripción ──

registry.registerPath({
  method: "post",
  path: "/api/emergencies/voice",
  summary: "Reportar emergencia por voz",
  description: [
    "Crea una emergencia a partir de un archivo de audio y su transcripción.",
    "El audio se sube a R2 y el registro se guarda con `report_origin='voz'`.",
    "",
    "**Requiere autenticación.** Cualquier rol autenticado puede reportar.",
    "",
    "**Formato:** `multipart/form-data` con los siguientes campos:",
    "- `audio` (file, opcional): archivo de audio (webm, mp4, mpeg, wav, ogg)",
    "- `transcript` (string, requerido): texto transcrito del audio",
    "- `tipo_emergencia` (string, opcional): tipo detectado (vacío si no se detectó)",
    "- `latitude` (string, requerido): latitud en grados decimales",
    "- `longitude` (string, requerido): longitud en grados decimales",
    "- `disabilityType`, `needType`, `description`, `urgency`, `requesterName`, etc.",
    "",
    "**Fallback:** Si el archivo de audio no se envía o falla la subida a R2,",
    "el registro se crea igual con `voice_note_url=null`, conservando la transcripción.",
  ].join("\n"),
  tags: ["Emergencies"],
  security: [{ bearerAuth: [] }],
  request: {
    body: {
      content: {
        "multipart/form-data": {
          schema: EmergenciaVozSchema,
        },
      },
      description: "Form-data con archivo de audio + campos de la emergencia",
      required: true,
    },
  },
  responses: {
    201: {
      description: "Emergencia por voz creada exitosamente",
    },
    400: {
      description: "Error de validación (transcript faltante, coordenadas inválidas, etc.)",
      content: { "application/json": { schema: ErrorResponse } },
    },
    401: {
      description: "No autenticado — token faltante, expirado o inválido",
      content: { "application/json": { schema: ErrorResponse } },
    },
  },
});

registry.registerPath({
  method: "get",
  path: "/api/emergencies/{id}",
  summary: "Obtener emergencia por ID",
  description: "Obtiene el detalle completo de una emergencia por su UUID. Requiere autenticación y rol admin, organization o volunteer.",
  tags: ["Emergencies"],
  security: [{ bearerAuth: [] }],
  request: {
    params: z.object({
      id: z.string().uuid().openapi({
        example: "550e8400-e29b-41d4-a716-446655440000",
        description: "UUID de la emergencia",
      }),
    }),
  },
  responses: {
    200: { description: "Detalle completo de la emergencia" },
    400: {
      description: "ID inválido (no es UUID)",
      content: { "application/json": { schema: ErrorResponse } },
    },
    401: {
      description: "No autenticado",
      content: { "application/json": { schema: ErrorResponse } },
    },
    403: {
      description: "Rol no autorizado",
      content: { "application/json": { schema: ErrorResponse } },
    },
    404: {
      description: "Emergencia no encontrada",
      content: { "application/json": { schema: ErrorResponse } },
    },
  },
});

// =========================================================================
// USERS — Administración de usuarios
// =========================================================================

registry.registerPath({
  method: "get",
  path: "/api/users",
  summary: "Listar usuarios",
  description: [
    "Lista todos los usuarios registrados con filtros opcionales y paginación.",
    "Solo accesible por administradores.",
  ].join(" "),
  tags: ["Users"],
  security: [{ bearerAuth: [] }],
  request: {
    query: ListUsersQuery,
  },
  responses: {
    200: {
      description: "Lista paginada de usuarios",
      content: { "application/json": { schema: ListUsersResponse } },
    },
    400: {
      description: "Error de validación en query params",
      content: { "application/json": { schema: ErrorResponse } },
    },
    401: {
      description: "No autenticado",
      content: { "application/json": { schema: ErrorResponse } },
    },
    403: {
      description: "Acceso denegado — solo administradores",
      content: { "application/json": { schema: ErrorResponse } },
    },
  },
});

registry.registerPath({
  method: "get",
  path: "/api/users/stats",
  summary: "Estadísticas agregadas de usuarios",
  description: [
    "Conteo de usuarios agrupado por rol (citizen, volunteer, organization, admin),",
    "desglosado por estado (pending, approved, rejected, suspended).",
    "Solo accesible por administradores.",
  ].join(" "),
  tags: ["Users"],
  security: [{ bearerAuth: [] }],
  responses: {
    200: {
      description: "Conteo de usuarios agrupado por rol y estado",
      content: { "application/json": { schema: UserStatsResponse } },
    },
    401: {
      description: "No autenticado",
      content: { "application/json": { schema: ErrorResponse } },
    },
    403: {
      description: "Acceso denegado — solo administradores",
      content: { "application/json": { schema: ErrorResponse } },
    },
  },
});

registry.registerPath({
  method: "get",
  path: "/api/users/{id}",
  summary: "Obtener usuario por ID",
  description: [
    "Obtiene los datos de un usuario específico por su UUID.",
    "Los administradores pueden ver cualquier usuario.",
    "Otros roles solo pueden ver su propio perfil.",
  ].join(" "),
  tags: ["Users"],
  security: [{ bearerAuth: [] }],
  request: {
    params: z.object({
      id: z.string().uuid().openapi({
        example: "550e8400-e29b-41d4-a716-446655440000",
        description: "UUID del usuario",
      }),
    }),
  },
  responses: {
    200: {
      description: "Usuario encontrado",
      content: { "application/json": { schema: z.object({ data: UserProfile }) } },
    },
    401: {
      description: "No autenticado",
      content: { "application/json": { schema: ErrorResponse } },
    },
    403: {
      description: "No tienes permiso para ver este usuario",
      content: { "application/json": { schema: ErrorResponse } },
    },
    404: {
      description: "Usuario no encontrado",
      content: { "application/json": { schema: ErrorResponse } },
    },
  },
});

registry.registerPath({
  method: "patch",
  path: "/api/users/{id}",
  summary: "Actualizar usuario",
  description: [
    "Actualiza los datos de un usuario.",
    "Los administradores pueden modificar cualquier usuario.",
    "Otros roles solo pueden modificar su propio perfil.",
    "Todos los campos son opcionales — solo se actualiza lo enviado.",
    "Si se incluye `password`, se hashea automáticamente.",
  ].join(" "),
  tags: ["Users"],
  security: [{ bearerAuth: [] }],
  request: {
    params: z.object({
      id: z.string().uuid().openapi({
        example: "550e8400-e29b-41d4-a716-446655440000",
        description: "UUID del usuario a modificar",
      }),
    }),
    body: {
      content: { "application/json": { schema: UpdateUserBody } },
      description: "Campos a actualizar (todos opcionales)",
      required: true,
    },
  },
  responses: {
    200: {
      description: "Usuario actualizado exitosamente",
      content: { "application/json": { schema: z.object({ data: UserProfile }) } },
    },
    400: {
      description: "Error de validación",
      content: { "application/json": { schema: ErrorResponse } },
    },
    401: {
      description: "No autenticado",
      content: { "application/json": { schema: ErrorResponse } },
    },
    403: {
      description: "No tienes permiso para modificar este usuario",
      content: { "application/json": { schema: ErrorResponse } },
    },
    404: {
      description: "Usuario no encontrado",
      content: { "application/json": { schema: ErrorResponse } },
    },
    409: {
      description: "Conflicto — email o teléfono ya en uso por otro usuario",
      content: { "application/json": { schema: ErrorResponse } },
    },
  },
});

registry.registerPath({
  method: "patch",
  path: "/api/users/{id}/organization-profile",
  summary: "Corregir perfil de organización (admin)",
  description: [
    "Actualiza los campos editables de una organización ya registrada.",
    "Valida con **exactamente las mismas reglas del formulario de registro**",
    "(mismas restricciones de cada campo), con todos los campos opcionales.",
    "Solo accesible por administradores autenticados.",
    "",
    "**Política de verificación:** editar los datos **NO cambia el estado** de la",
    "solicitud de verificación (entregada / en_estudio / aceptada / rechazada).",
    "El estado solo cambia mediante `PATCH /api/admin/verifications/{id}/transition`.",
    "",
    "Actualiza de forma atómica: `users`, `user_details`, `organization_profiles`,",
    "`legal_representatives` (reemplazo total si se envía) y las tablas puente",
    "`organization_disability_types` / `organization_services` (reemplazo total",
    "si se envían `disabilityTypeIds` / `serviceIds`). Responde con el perfil",
    "completo, en el mismo formato que `GET /api/users/{id}/organization-profile`.",
  ].join("\n"),
  tags: ["Users"],
  security: [{ bearerAuth: [] }],
  request: {
    params: z.object({
      id: z.string().uuid().openapi({
        example: "550e8400-e29b-41d4-a716-446655440000",
        description: "UUID de la organización a corregir",
      }),
    }),
    body: {
      content: { "application/json": { schema: UpdateOrganizationProfileBody } },
      description: "Campos a corregir (todos opcionales)",
      required: true,
    },
  },
  responses: {
    200: {
      description: "Perfil de organización actualizado",
      content: { "application/json": { schema: z.object({ data: z.object({}).openapi({ description: "Perfil completo (user, organizationProfile, legalRepresentatives, disabilityTypes, services, verification, documents)" }) }) } },
    },
    400: {
      description: "Error de validación o el usuario no es una organización",
      content: { "application/json": { schema: ErrorResponse } },
    },
    401: {
      description: "No autenticado",
      content: { "application/json": { schema: ErrorResponse } },
    },
    403: {
      description: "Acceso denegado — solo administradores",
      content: { "application/json": { schema: ErrorResponse } },
    },
    404: {
      description: "Usuario no encontrado",
      content: { "application/json": { schema: ErrorResponse } },
    },
    409: {
      description: "Conflicto — email o teléfono ya en uso por otro usuario",
      content: { "application/json": { schema: ErrorResponse } },
    },
  },
});

registry.registerPath({
  method: "patch",
  path: "/api/users/{id}/volunteer-profile",
  summary: "Corregir perfil de voluntario (admin)",
  description: [
    "Actualiza los campos editables de un voluntario ya registrado.",
    "Valida con **exactamente las mismas reglas del formulario de registro**",
    "(mismas restricciones de cada campo), con todos los campos opcionales.",
    "Solo accesible por administradores autenticados.",
    "",
    "**Política de verificación:** editar los datos **NO cambia el estado** de la",
    "solicitud de verificación. Si se envía `volunteerType`, se sincroniza el",
    "`entity_type` (volunteer_professional / volunteer_non_professional) para",
    "mantener la coherencia con el checklist de documentos, sin tocar el estado.",
    "",
    "Actualiza de forma atómica: `users`, `user_details`, `volunteer_profiles` y",
    "las tablas puente `volunteer_interest_areas` / `volunteer_experience`",
    "(reemplazo total si se envían `interestAreaIds` / `experienceCategoryIds`).",
    "Responde con el perfil completo, en el mismo formato que",
    "`GET /api/users/{id}/volunteer-profile`.",
  ].join("\n"),
  tags: ["Users"],
  security: [{ bearerAuth: [] }],
  request: {
    params: z.object({
      id: z.string().uuid().openapi({
        example: "550e8400-e29b-41d4-a716-446655440000",
        description: "UUID del voluntario a corregir",
      }),
    }),
    body: {
      content: { "application/json": { schema: UpdateVolunteerProfileBody } },
      description: "Campos a corregir (todos opcionales)",
      required: true,
    },
  },
  responses: {
    200: {
      description: "Perfil de voluntario actualizado",
      content: { "application/json": { schema: z.object({ data: z.object({}).openapi({ description: "Perfil completo (user, details, volunteerProfile, interestAreas, experience, verification, documents)" }) }) } },
    },
    400: {
      description: "Error de validación o el usuario no es un voluntario",
      content: { "application/json": { schema: ErrorResponse } },
    },
    401: {
      description: "No autenticado",
      content: { "application/json": { schema: ErrorResponse } },
    },
    403: {
      description: "Acceso denegado — solo administradores",
      content: { "application/json": { schema: ErrorResponse } },
    },
    404: {
      description: "Usuario no encontrado",
      content: { "application/json": { schema: ErrorResponse } },
    },
    409: {
      description: "Conflicto — email o teléfono ya en uso por otro usuario",
      content: { "application/json": { schema: ErrorResponse } },
    },
  },
});

registry.registerPath({
  method: "post",
  path: "/api/users/{id}/approve",
  summary: "Aprobar usuario",
  description: [
    "Aprueba un usuario que está en estado `pending`.",
    "Solo accesible por administradores.",
    "El usuario pasa a estado `approved` y se registra quién lo aprobó.",
  ].join(" "),
  tags: ["Users"],
  security: [{ bearerAuth: [] }],
  request: {
    params: z.object({
      id: z.string().uuid().openapi({
        example: "550e8400-e29b-41d4-a716-446655440000",
        description: "UUID del usuario a aprobar",
      }),
    }),
  },
  responses: {
    200: {
      description: "Usuario aprobado exitosamente",
      content: { "application/json": { schema: z.object({ data: UserProfile }) } },
    },
    401: {
      description: "No autenticado",
      content: { "application/json": { schema: ErrorResponse } },
    },
    403: {
      description: "Acceso denegado — solo administradores",
      content: { "application/json": { schema: ErrorResponse } },
    },
    404: {
      description: "Usuario no encontrado",
      content: { "application/json": { schema: ErrorResponse } },
    },
    409: {
      description: "El usuario no está en estado pendiente",
      content: { "application/json": { schema: ErrorResponse } },
    },
  },
});

registry.registerPath({
  method: "post",
  path: "/api/users/{id}/reject",
  summary: "Rechazar usuario",
  description: [
    "Rechaza un usuario que está en estado `pending`.",
    "Solo accesible por administradores.",
    "El usuario pasa a estado `rejected`.",
  ].join(" "),
  tags: ["Users"],
  security: [{ bearerAuth: [] }],
  request: {
    params: z.object({
      id: z.string().uuid().openapi({
        example: "550e8400-e29b-41d4-a716-446655440000",
        description: "UUID del usuario a rechazar",
      }),
    }),
  },
  responses: {
    200: {
      description: "Usuario rechazado exitosamente",
      content: { "application/json": { schema: z.object({ data: UserProfile }) } },
    },
    401: {
      description: "No autenticado",
      content: { "application/json": { schema: ErrorResponse } },
    },
    403: {
      description: "Acceso denegado — solo administradores",
      content: { "application/json": { schema: ErrorResponse } },
    },
    404: {
      description: "Usuario no encontrado",
      content: { "application/json": { schema: ErrorResponse } },
    },
    409: {
      description: "El usuario no está en estado pendiente",
      content: { "application/json": { schema: ErrorResponse } },
    },
  },
});

// =========================================================================
// EMERGENCY ATTENDEES
// =========================================================================

registry.registerPath({
  method: "post",
  path: "/api/emergencies/{emergencyId}/attendees",
  summary: "Vincularse como atendiendo una emergencia",
  description: [
    "El usuario autenticado se vincula como atendiendo una emergencia.",
    "El `attendedBy` se obtiene automáticamente del token JWT, no se envía en el body.",
    "Requiere rol admin, organization o volunteer.",
  ].join(" "),
  tags: ["Emergency Attendees"],
  security: [{ bearerAuth: [] }],
  request: {
    params: z.object({
      emergencyId: z.string().uuid().openapi({
        example: "550e8400-e29b-41d4-a716-446655440000",
        description: "UUID de la emergencia",
      }),
    }),
  },
  responses: {
    201: {
      description: "Usuario vinculado exitosamente",
      content: { "application/json": { schema: z.object({ data: AttendeeResponse }) } },
    },
    400: {
      description: "ID de emergencia inválido",
      content: { "application/json": { schema: ErrorResponse } },
    },
    401: {
      description: "No autenticado",
      content: { "application/json": { schema: ErrorResponse } },
    },
    403: {
      description: "Rol no autorizado",
      content: { "application/json": { schema: ErrorResponse } },
    },
    409: {
      description: "El usuario ya está vinculado a esta emergencia",
      content: { "application/json": { schema: ErrorResponse } },
    },
  },
});

registry.registerPath({
  method: "get",
  path: "/api/emergencies/{emergencyId}/attendees",
  summary: "Listar usuarios que atienden una emergencia",
  description: [
    "Devuelve la lista de usuarios (con nombre, email y rol) que están vinculados",
    "como atendiendo una emergencia específica.",
    "Requiere rol admin, organization o volunteer.",
  ].join(" "),
  tags: ["Emergency Attendees"],
  security: [{ bearerAuth: [] }],
  request: {
    params: z.object({
      emergencyId: z.string().uuid().openapi({
        example: "550e8400-e29b-41d4-a716-446655440000",
        description: "UUID de la emergencia",
      }),
    }),
  },
  responses: {
    200: {
      description: "Lista de usuarios que atienden la emergencia",
      content: {
        "application/json": {
          schema: z.object({
            data: z.array(AttendeeResponse),
          }),
        },
      },
    },
    400: {
      description: "ID de emergencia inválido",
      content: { "application/json": { schema: ErrorResponse } },
    },
    401: {
      description: "No autenticado",
      content: { "application/json": { schema: ErrorResponse } },
    },
    403: {
      description: "Rol no autorizado",
      content: { "application/json": { schema: ErrorResponse } },
    },
  },
});

// =========================================================================
// HELP REQUEST ATTENDEES
// =========================================================================

registry.registerPath({
  method: "post",
  path: "/api/help-requests/{helpRequestId}/attendees",
  summary: "Vincularse como atendiendo una solicitud de ayuda",
  description: [
    "El usuario autenticado se vincula como atendiendo una solicitud de ayuda.",
    "El `attendedBy` se obtiene automáticamente del token JWT, no se envía en el body.",
    "Requiere rol admin, organization o volunteer.",
  ].join(" "),
  tags: ["Help Request Attendees"],
  security: [{ bearerAuth: [] }],
  request: {
    params: z.object({
      helpRequestId: z.string().uuid().openapi({
        example: "550e8400-e29b-41d4-a716-446655440000",
        description: "UUID de la solicitud de ayuda",
      }),
    }),
  },
  responses: {
    201: {
      description: "Usuario vinculado exitosamente",
      content: { "application/json": { schema: z.object({ data: AttendeeResponse }) } },
    },
    400: {
      description: "ID de solicitud inválido",
      content: { "application/json": { schema: ErrorResponse } },
    },
    401: {
      description: "No autenticado",
      content: { "application/json": { schema: ErrorResponse } },
    },
    403: {
      description: "Rol no autorizado",
      content: { "application/json": { schema: ErrorResponse } },
    },
    409: {
      description: "El usuario ya está vinculado a esta solicitud",
      content: { "application/json": { schema: ErrorResponse } },
    },
  },
});

registry.registerPath({
  method: "get",
  path: "/api/help-requests/{helpRequestId}/attendees",
  summary: "Listar usuarios que atienden una solicitud de ayuda",
  description: [
    "Devuelve la lista de usuarios (con nombre, email y rol) que están vinculados",
    "como atendiendo una solicitud de ayuda específica.",
    "Requiere rol admin, organization o volunteer.",
  ].join(" "),
  tags: ["Help Request Attendees"],
  security: [{ bearerAuth: [] }],
  request: {
    params: z.object({
      helpRequestId: z.string().uuid().openapi({
        example: "550e8400-e29b-41d4-a716-446655440000",
        description: "UUID de la solicitud de ayuda",
      }),
    }),
  },
  responses: {
    200: {
      description: "Lista de usuarios que atienden la solicitud",
      content: {
        "application/json": {
          schema: z.object({
            data: z.array(AttendeeResponse),
          }),
        },
      },
    },
    400: {
      description: "ID de solicitud inválido",
      content: { "application/json": { schema: ErrorResponse } },
    },
    401: {
      description: "No autenticado",
      content: { "application/json": { schema: ErrorResponse } },
    },
    403: {
      description: "Rol no autorizado",
      content: { "application/json": { schema: ErrorResponse } },
    },
  },
});

// =========================================================================
// CONVERSATIONS (CHAT)
// =========================================================================

registry.registerPath({
  method: "get",
  path: "/api/conversations",
  summary: "Listar conversaciones del usuario autenticado",
  description: [
    "Retorna todas las conversaciones donde el usuario participa como attended_by.",
    "Requiere autenticación JWT.",
  ].join(" "),
  tags: ["Conversations"],
  security: [{ bearerAuth: [] }],
  responses: {
    200: {
      description: "Lista de conversaciones",
      content: {
        "application/json": {
          schema: z.object({
            data: z.array(ConversationResponse),
          }),
        },
      },
    },
    401: {
      description: "No autenticado",
      content: { "application/json": { schema: ErrorResponse } },
    },
  },
});

registry.registerPath({
  method: "get",
  path: "/api/conversations/mine",
  summary: "Listar conversaciones del ciudadano anónimo",
  description: [
    "Retorna las conversaciones asociadas a la emergencia del ciudadano.",
    "Requiere token de ciudadano en query param ?t= o header X-Citizen-Token.",
  ].join(" "),
  tags: ["Conversations"],
  parameters: [
    {
      name: "t",
      in: "query",
      required: false,
      description: "Token de acceso del ciudadano (alternativa al header)",
      schema: { type: "string" },
    },
  ],
  responses: {
    200: {
      description: "Lista de conversaciones del ciudadano",
      content: {
        "application/json": {
          schema: z.object({
            data: z.array(ConversationResponse),
          }),
        },
      },
    },
    401: {
      description: "Token inválido o faltante",
      content: { "application/json": { schema: ErrorResponse } },
    },
  },
});

registry.registerPath({
  method: "get",
  path: "/api/conversations/{id}/messages",
  summary: "Listar mensajes de una conversación",
  description: [
    "Retorna los mensajes de una conversación específica con paginación por cursor.",
    "Acepta JWT o token de ciudadano. Valida pertenencia a la conversación.",
  ].join(" "),
  tags: ["Conversations"],
  security: [{ bearerAuth: [] }],
  request: {
    params: z.object({
      id: z.string().uuid().openapi({
        example: "550e8400-e29b-41d4-a716-446655440000",
        description: "UUID de la conversación",
      }),
    }),
    query: z.object({
      cursor: z.string().uuid().optional().openapi({
        example: "550e8400-e29b-41d4-a716-446655440001",
        description: "UUID del mensaje desde el cual paginar (exclusivo)",
      }),
      limit: z.number().int().min(1).max(100).default(50).openapi({
        example: 50,
        description: "Cantidad máxima de mensajes a retornar (1-100, default 50)",
      }),
    }),
  },
  responses: {
    200: {
      description: "Lista de mensajes",
      content: {
        "application/json": {
          schema: z.object({
            data: z.array(MessageResponse),
          }),
        },
      },
    },
    400: {
      description: "Error de validación",
      content: { "application/json": { schema: ErrorResponse } },
    },
    401: {
      description: "No autenticado",
      content: { "application/json": { schema: ErrorResponse } },
    },
    403: {
      description: "No tienes acceso a esta conversación",
      content: { "application/json": { schema: ErrorResponse } },
    },
  },
});

registry.registerPath({
  method: "post",
  path: "/api/conversations/{id}/messages",
  summary: "Enviar mensaje a una conversación",
  description: [
    "Envía un nuevo mensaje a una conversación específica.",
    "Acepta JWT o token de ciudadano. Valida pertenencia a la conversación.",
    "El senderUserId se obtiene del JWT o es null si es ciudadano anónimo.",
  ].join(" "),
  tags: ["Conversations"],
  security: [{ bearerAuth: [] }],
  request: {
    params: z.object({
      id: z.string().uuid().openapi({
        example: "550e8400-e29b-41d4-a716-446655440000",
        description: "UUID de la conversación",
      }),
    }),
    body: {
      content: {
        "application/json": {
          schema: z.object({
            body: z.string().min(1).max(5000).openapi({
              example: "Hola, ya voy en camino",
              description: "Texto del mensaje (1-5000 caracteres)",
            }),
          }),
        },
      },
    },
  },
  responses: {
    201: {
      description: "Mensaje enviado exitosamente",
      content: {
        "application/json": {
          schema: z.object({ data: MessageResponse }),
        },
      },
    },
    400: {
      description: "Error de validación o conversación cerrada",
      content: { "application/json": { schema: ErrorResponse } },
    },
    401: {
      description: "No autenticado",
      content: { "application/json": { schema: ErrorResponse } },
    },
    403: {
      description: "No tienes acceso a esta conversación",
      content: { "application/json": { schema: ErrorResponse } },
    },
  },
});

registry.registerPath({
  method: "patch",
  path: "/api/messages/{id}/read",
  summary: "Marcar mensaje como leído",
  description: [
    "Marca un mensaje específico como leído.",
    "Acepta JWT o token de ciudadano.",
  ].join(" "),
  tags: ["Messages"],
  security: [{ bearerAuth: [] }],
  request: {
    params: z.object({
      id: z.string().uuid().openapi({
        example: "550e8400-e29b-41d4-a716-446655440000",
        description: "UUID del mensaje",
      }),
    }),
  },
  responses: {
    200: {
      description: "Mensaje marcado como leído",
      content: {
        "application/json": {
          schema: z.object({ data: MessageResponse }),
        },
      },
    },
    401: {
      description: "No autenticado",
      content: { "application/json": { schema: ErrorResponse } },
    },
    404: {
      description: "Mensaje no encontrado o ya marcado como leído",
      content: { "application/json": { schema: ErrorResponse } },
    },
  },
});

// =========================================================================
// VERIFICATION — Catálogo, Registro, Documentos, Revisión
// =========================================================================

// ── Catálogo unificado ──────────────────────────────────────────────────

registry.registerPath({
  method: "get",
  path: "/api/catalog",
  summary: "Listar entradas del catálogo unificado",
  description: [
    "Devuelve todas las entradas del catálogo para un tipo específico.",
    "Tipos disponibles: organization_type, disability_type, service,",
    "interest_area, experience_category.",
  ].join(" "),
  tags: ["Verification"],
  security: [{ bearerAuth: [] }],
  request: {
    query: CatalogQuery,
  },
  responses: {
    200: {
      description: "Lista de entradas del catálogo",
      content: {
        "application/json": {
          schema: z.object({ data: z.array(CatalogItemResponse) }),
        },
      },
    },
    400: {
      description: "Error de validación — type inválido o faltante",
      content: { "application/json": { schema: ErrorResponse } },
    },
    401: {
      description: "No autenticado",
      content: { "application/json": { schema: ErrorResponse } },
    },
  },
});

// ── Registro de Organización ────────────────────────────────────────────

registry.registerPath({
  method: "post",
  path: "/api/organizations/register",
  summary: "Registrar organización",
  description: [
    "Crea el perfil de organización, representantes legales, relaciones",
    "many-to-many y una solicitud de verificación con status 'entregada'.",
    "Requiere autenticación. El userId se obtiene del JWT.",
  ].join(" "),
  tags: ["Verification"],
  security: [{ bearerAuth: [] }],
  request: {
    body: {
      content: { "application/json": { schema: OrganizationRegisterBody } },
      description: "Datos del perfil de la organización",
      required: true,
    },
  },
  responses: {
    201: {
      description: "Organización registrada y solicitud de verificación creada",
      content: {
        "application/json": {
          schema: z.object({
            data: z.object({
              profile: z.object({}).openapi({ description: "Perfil de organización creado" }),
              verification: VerificationRequestResponse,
            }),
          }),
        },
      },
    },
    400: {
      description: "Error de validación",
      content: { "application/json": { schema: ErrorResponse } },
    },
    401: {
      description: "No autenticado",
      content: { "application/json": { schema: ErrorResponse } },
    },
    409: {
      description: "Conflicto — ya existe un perfil o solicitud para este usuario",
      content: { "application/json": { schema: ErrorResponse } },
    },
  },
});

// ── Registro de Voluntario ──────────────────────────────────────────────

registry.registerPath({
  method: "post",
  path: "/api/volunteers/register",
  summary: "Registrar voluntario",
  description: [
    "Crea el perfil de voluntario (profesional o no profesional), relaciones",
    "many-to-many y una solicitud de verificación con status 'entregada'.",
    "Requiere autenticación. El userId se obtiene del JWT.",
  ].join(" "),
  tags: ["Verification"],
  security: [{ bearerAuth: [] }],
  request: {
    body: {
      content: { "application/json": { schema: VolunteerRegisterBody } },
      description: "Datos del perfil del voluntario",
      required: true,
    },
  },
  responses: {
    201: {
      description: "Voluntario registrado y solicitud de verificación creada",
      content: {
        "application/json": {
          schema: z.object({
            data: z.object({
              profile: z.object({}).openapi({ description: "Perfil de voluntario creado" }),
              verification: VerificationRequestResponse,
            }),
          }),
        },
      },
    },
    400: {
      description: "Error de validación",
      content: { "application/json": { schema: ErrorResponse } },
    },
    401: {
      description: "No autenticado",
      content: { "application/json": { schema: ErrorResponse } },
    },
    409: {
      description: "Conflicto — ya existe un perfil o solicitud para este usuario",
      content: { "application/json": { schema: ErrorResponse } },
    },
  },
});

// ── Estado de verificación del usuario autenticado ──────────────────────

registry.registerPath({
  method: "get",
  path: "/api/verification/status",
  summary: "Consultar mi estado de verificación",
  description: "Devuelve la solicitud de verificación activa del usuario autenticado.",
  tags: ["Verification"],
  security: [{ bearerAuth: [] }],
  responses: {
    200: {
      description: "Solicitud de verificación encontrada",
      content: {
        "application/json": {
          schema: z.object({ data: VerificationRequestResponse }),
        },
      },
    },
    401: {
      description: "No autenticado",
      content: { "application/json": { schema: ErrorResponse } },
    },
    404: {
      description: "No se encontró solicitud de verificación",
      content: { "application/json": { schema: ErrorResponse } },
    },
  },
});

// ── Documentos de verificación ──────────────────────────────────────────

registry.registerPath({
  method: "post",
  path: "/api/verification-documents",
  summary: "Subir documento de verificación",
  description: [
    "Genera una URL prefirmada de subida (S3/R2) y crea el registro",
    "en verification_documents con status 'pending'.",
    "Requiere autenticación.",
  ].join(" "),
  tags: ["Verification"],
  security: [{ bearerAuth: [] }],
  request: {
    body: {
      content: { "application/json": { schema: DocumentUploadBody } },
      description: "Tipo de documento y nombre de archivo",
      required: true,
    },
  },
  responses: {
    201: {
      description: "Documento subido a R2 y registrado en la base de datos",
      content: {
        "application/json": {
          schema: z.object({ data: VerificationDocumentResponse }),
        },
      },
    },
    400: {
      description: "Error de validación",
      content: { "application/json": { schema: ErrorResponse } },
    },
    401: {
      description: "No autenticado",
      content: { "application/json": { schema: ErrorResponse } },
    },
  },
});

registry.registerPath({
  method: "get",
  path: "/api/verification-documents/{ownerId}",
  summary: "Checklist de documentos de verificación",
  description: [
    "Devuelve los tipos de documentos requeridos según document_types.entity_type",
    "con el estado actual de cada uno (pendiente, subido, aprobado, rechazado).",
    "Requiere autenticación.",
  ].join(" "),
  tags: ["Verification"],
  security: [{ bearerAuth: [] }],
  request: {
    params: z.object({
      ownerId: z.string().uuid().openapi({
        example: "550e8400-e29b-41d4-a716-446655440000",
        description: "UUID del usuario dueño de los documentos",
      }),
    }),
  },
  responses: {
    200: {
      description: "Checklist de documentos con su estado",
      content: {
        "application/json": {
          schema: z.object({
            data: z.array(
              z.object({
                documentType: DocumentTypeResponse,
                submission: VerificationDocumentResponse.nullable(),
                isComplete: z.boolean(),
              }),
            ),
          }),
        },
      },
    },
    401: {
      description: "No autenticado",
      content: { "application/json": { schema: ErrorResponse } },
    },
    404: {
      description: "No se encontró solicitud de verificación para este usuario",
      content: { "application/json": { schema: ErrorResponse } },
    },
  },
});

registry.registerPath({
  method: "patch",
  path: "/api/verification-documents/{id}/review",
  summary: "Revisar documento (admin)",
  description: [
    "Aprueba o rechaza un documento de verificación.",
    "Solo accesible por administradores.",
  ].join(" "),
  tags: ["Verification"],
  security: [{ bearerAuth: [] }],
  request: {
    params: z.object({
      id: z.string().openapi({
        example: "1",
        description: "ID numérico del documento",
      }),
    }),
    body: {
      content: { "application/json": { schema: DocumentReviewBody } },
      description: "Decisión de revisión",
      required: true,
    },
  },
  responses: {
    200: {
      description: "Documento revisado exitosamente",
      content: {
        "application/json": {
          schema: z.object({ data: VerificationDocumentResponse }),
        },
      },
    },
    400: {
      description: "Error de validación",
      content: { "application/json": { schema: ErrorResponse } },
    },
    401: {
      description: "No autenticado",
      content: { "application/json": { schema: ErrorResponse } },
    },
    403: {
      description: "Acceso denegado — solo administradores",
      content: { "application/json": { schema: ErrorResponse } },
    },
    404: {
      description: "Documento no encontrado",
      content: { "application/json": { schema: ErrorResponse } },
    },
  },
});

const DocumentFileResponse = z.object({
  data: VerificationDocumentResponse.extend({ hasFile: z.boolean() }),
  message: z.string().optional().openapi({ description: "Mensaje de éxito para mostrar al usuario" }),
  notice: z.string().optional().openapi({ description: "Aviso: la operación salió bien pero hay algo que advertir" }),
});

const DocumentIdParams = z.object({
  id: z.string().openapi({ example: "1", description: "ID numérico del documento" }),
});

registry.registerPath({
  method: "put",
  path: "/api/verification-documents/{id}/file",
  summary: "Agregar o reemplazar el archivo de un documento (admin)",
  description: [
    "Sube un archivo nuevo (multipart/form-data, campo 'file') al documento indicado.",
    "El documento conserva su tipo y su dueño; la extensión puede cambiar.",
    "Formatos: PDF, JPG, PNG, Word (.doc/.docx). Máximo 10 MB. El archivo anterior se elimina de R2",
    "y el documento vuelve a 'pending'. Si algo falla, no se cambia nada.",
    "Solo accesible por administradores.",
  ].join(" "),
  tags: ["Verification"],
  security: [{ bearerAuth: [] }],
  request: {
    params: DocumentIdParams,
    body: {
      content: {
        "multipart/form-data": {
          schema: z.object({ file: z.any().openapi({ type: "string", format: "binary" }) }),
        },
      },
      required: true,
    },
  },
  responses: {
    200: {
      description: "Archivo guardado",
      content: { "application/json": { schema: DocumentFileResponse } },
    },
    400: {
      description: "Formato no permitido, archivo muy grande o sin archivo",
      content: { "application/json": { schema: ErrorResponse } },
    },
    401: {
      description: "No autenticado",
      content: { "application/json": { schema: ErrorResponse } },
    },
    403: {
      description: "Acceso denegado — solo administradores",
      content: { "application/json": { schema: ErrorResponse } },
    },
    404: {
      description: "Documento no encontrado",
      content: { "application/json": { schema: ErrorResponse } },
    },
    502: {
      description: "No se pudo guardar el archivo en el almacenamiento (no se cambió nada)",
      content: { "application/json": { schema: ErrorResponse } },
    },
  },
});

registry.registerPath({
  method: "delete",
  path: "/api/verification-documents/{id}/file",
  summary: "Eliminar el archivo de un documento (admin)",
  description: [
    "Elimina el archivo de R2 y deja el documento sin archivo (storage_key NULL).",
    "El documento se conserva para poder agregar un archivo nuevo más adelante.",
    "Solo accesible por administradores.",
  ].join(" "),
  tags: ["Verification"],
  security: [{ bearerAuth: [] }],
  request: { params: DocumentIdParams },
  responses: {
    200: {
      description: "Archivo eliminado",
      content: { "application/json": { schema: DocumentFileResponse } },
    },
    401: {
      description: "No autenticado",
      content: { "application/json": { schema: ErrorResponse } },
    },
    403: {
      description: "Acceso denegado — solo administradores",
      content: { "application/json": { schema: ErrorResponse } },
    },
    404: {
      description: "Documento no encontrado",
      content: { "application/json": { schema: ErrorResponse } },
    },
    409: {
      description: "El documento ya no tenía archivo",
      content: { "application/json": { schema: ErrorResponse } },
    },
    502: {
      description: "No se pudo eliminar el archivo del almacenamiento (no se cambió nada)",
      content: { "application/json": { schema: ErrorResponse } },
    },
  },
});

// ── Panel de administración ─────────────────────────────────────────────

registry.registerPath({
  method: "get",
  path: "/api/admin/verifications",
  summary: "Cola de revisión (admin)",
  description: [
    "Lista solicitudes de verificación con filtros opcionales por status y entityType.",
    "Solo accesible por administradores.",
  ].join(" "),
  tags: ["Verification"],
  security: [{ bearerAuth: [] }],
  request: {
    query: AdminVerificationsQuery,
  },
  responses: {
    200: {
      description: "Lista de solicitudes de verificación",
      content: {
        "application/json": {
          schema: z.object({
            data: z.array(VerificationRequestResponse.extend({
              ownerName: z.string(),
              ownerEmail: z.string().email(),
            })),
          }),
        },
      },
    },
    400: {
      description: "Error de validación",
      content: { "application/json": { schema: ErrorResponse } },
    },
    401: {
      description: "No autenticado",
      content: { "application/json": { schema: ErrorResponse } },
    },
    403: {
      description: "Acceso denegado — solo administradores",
      content: { "application/json": { schema: ErrorResponse } },
    },
  },
});

registry.registerPath({
  method: "get",
  path: "/api/admin/verifications/paginated",
  summary: "Cola de revisión paginada (admin)",
  description: [
    "Lista solicitudes de verificación con filtros opcionales y paginación.",
    "Solo accesible por administradores.",
  ].join(" "),
  tags: ["Verification"],
  security: [{ bearerAuth: [] }],
  request: {
    query: AdminVerificationsPagedQuery,
  },
  responses: {
    200: {
      description: "Lista paginada de solicitudes de verificación",
      content: {
        "application/json": {
          schema: z.object({ data: AdminVerificationsResponse }),
        },
      },
    },
    400: {
      description: "Error de validación",
      content: { "application/json": { schema: ErrorResponse } },
    },
    401: {
      description: "No autenticado",
      content: { "application/json": { schema: ErrorResponse } },
    },
    403: {
      description: "Acceso denegado — solo administradores",
      content: { "application/json": { schema: ErrorResponse } },
    },
  },
});

registry.registerPath({
  method: "patch",
  path: "/api/admin/verifications/{id}/transition",
  summary: "Transicionar estado de verificación (admin)",
  description: [
    "Cambia el estado de una solicitud de verificación aplicando la máquina de estados:",
    "entregada → en_estudio → aceptada | rechazada; rechazada → entregada (reenvío).",
    "Si transiciona a 'aceptada', activa la cuenta del usuario (status = 'approved').",
    "Solo accesible por administradores.",
  ].join(" "),
  tags: ["Verification"],
  security: [{ bearerAuth: [] }],
  request: {
    params: z.object({
      id: z.string().openapi({
        example: "1",
        description: "ID numérico de la solicitud de verificación",
      }),
    }),
    body: {
      content: { "application/json": { schema: TransitionRequestBody } },
      description: "Nuevo estado y motivo opcional",
      required: true,
    },
  },
  responses: {
    200: {
      description: "Transición aplicada exitosamente",
      content: {
        "application/json": {
          schema: z.object({ data: VerificationRequestResponse }),
        },
      },
    },
    400: {
      description: "Error de validación",
      content: { "application/json": { schema: ErrorResponse } },
    },
    401: {
      description: "No autenticado",
      content: { "application/json": { schema: ErrorResponse } },
    },
    403: {
      description: "Acceso denegado — solo administradores",
      content: { "application/json": { schema: ErrorResponse } },
    },
    404: {
      description: "Solicitud de verificación no encontrada",
      content: { "application/json": { schema: ErrorResponse } },
    },
    422: {
      description: "Transición no permitida por la máquina de estados",
      content: { "application/json": { schema: ErrorResponse } },
    },
  },
});

// =========================================================================
// SYSTEM
// =========================================================================

registry.registerPath({
  method: "get",
  path: "/health",
  summary: "Health check",
  description: "Endpoint de monitoreo para verificar que el servidor está operativo.",
  tags: ["System"],
  responses: {
    200: {
      description: "Servidor operativo",
      content: {
        "application/json": {
          schema: z.object({ status: z.literal("ok") }).openapi({
            example: { status: "ok" },
          }),
        },
      },
    },
  },
});

module.exports = { registry };
