/**
 * Esquema — schemas Zod para el dominio de administración de usuarios.
 *
 * Cada DTO se define como schema Zod. El mismo schema:
 *   1. Valida el request body/query en el controller (safeParse)
 *   2. Genera la documentación OpenAPI automáticamente (.openapi())
 */
const { z } = require("zod");
const { extendZodWithOpenApi } = require("@asteasolutions/zod-to-openapi");

// Schemas del formulario de registro: única fuente de verdad de las reglas de
// validación. La edición admin los reutiliza (partial + omit) para garantizar
// que "editar" valide exactamente igual que "registrar".
const {
  RegisterOrganizationBody,
  RegisterVolunteerBody,
} = require("../auth/auth.schema");

// Extender Zod con el método .openapi()
extendZodWithOpenApi(z);

// ---------------------------------------------------------------------------
// Constantes
// ---------------------------------------------------------------------------

/** Roles válidos en el sistema. */
const ROLES = ["citizen", "volunteer", "organization", "admin"];

/** Estados válidos para un usuario. */
const STATUSES = ["pending", "approved", "rejected", "suspended"];

/**
 * Catálogo de discapacidad para el perfil de ciudadano.
 * Espeja los valores de emergencies.schema.js (mismo formulario de SOS) para
 * que el perfil y las emergencias hablen el mismo idioma sin acoplar módulos.
 */
const CITIZEN_DISABILITY_TYPES = ["visual", "auditiva", "neuro", "motriz"];

const CITIZEN_COMMUNICATION_MODES = [
  "lengua_senas",
  "audifono",
  "implante_coclear",
  "vibrador_oseo",
];

const CITIZEN_DISABILITY_SUBCATEGORIES = [
  // visual
  "guia_voz",
  "braille",
  "perro_guia",
  // neuro
  "ambiente_calmado",
  "comunicacion_clara",
  "acompanamiento",
  // motriz
  "silla_ruedas",
  "traslado_asistido",
  "evacuacion_accesible",
];

// ---------------------------------------------------------------------------
// Sub-schemas reutilizables
// ---------------------------------------------------------------------------

/** Coordenadas geográficas { lat, lng }. */
const LocationSchema = z.object({
  lat: z.number()
    .min(-90, "location.lat debe ser una coordenada válida (-90 a 90)")
    .max(90, "location.lat debe ser una coordenada válida (-90 a 90)"),
  lng: z.number()
    .min(-180, "location.lng debe ser una coordenada válida (-180 a 180)")
    .max(180, "location.lng debe ser una coordenada válida (-180 a 180)"),
}).openapi({ description: "Coordenadas geográficas del usuario" });

// ---------------------------------------------------------------------------
// GET /api/users — Query params para listar usuarios
// ---------------------------------------------------------------------------

const ListUsersQuery = z.object({
  role: z.enum(ROLES).optional()
    .openapi({ example: "volunteer", description: "Filtrar por rol" }),

  roles: z.string().optional()
    .refine(
      (value) => !value || value.split(",").every((r) => ROLES.includes(r.trim())),
      "roles contiene un rol inválido",
    )
    .openapi({
      example: "volunteer,organization,citizen",
      description: "Filtrar por varios roles a la vez (lista separada por comas)",
    }),

  status: z.enum(STATUSES).optional()
    .openapi({ example: "pending", description: "Filtrar por estado" }),

  search: z.string().optional()
    .openapi({ example: "María", description: "Búsqueda por nombre o email" }),

  limit: z.coerce.number().int().min(1).max(200).default(50)
    .openapi({ example: 50, description: "Máximo de resultados (1-200)" }),

  offset: z.coerce.number().int().min(0).default(0)
    .openapi({ example: 0, description: "Offset para paginación" }),
}).openapi({
  description: "Filtros para listar usuarios (query string)",
});

// ---------------------------------------------------------------------------
// PATCH /api/users/:id — Body para actualizar usuario
// ---------------------------------------------------------------------------

const UpdateUserBody = z.object({
  fullName: z.string()
    .min(1, "fullName no puede estar vacío")
    .optional()
    .openapi({ example: "María González", description: "Nuevo nombre completo" }),

  email: z.string()
    .email("email no tiene un formato válido")
    .optional()
    .openapi({ example: "maria@email.com", description: "Nuevo correo electrónico" }),

  phone: z.string()
    .refine(
      (val) => /^\+?[0-9]{7,15}$/.test(val.replace(/[\s-]/g, "")),
      "phone no tiene un formato válido (mínimo 7 dígitos)",
    )
    .optional()
    .openapi({ example: "+584241234567", description: "Nuevo teléfono" }),

  zone: z.string().optional()
    .openapi({ example: "Caracas - Zona 2", description: "Nueva zona o sector" }),

  location: LocationSchema.nullable().optional()
    .openapi({ description: "Nueva ubicación geográfica (pasar null para eliminar)" }),

  password: z.string()
    .min(8, "password debe tener al menos 8 caracteres")
    .optional()
    .openapi({ example: "nuevaClave2024!", description: "Nueva contraseña (mín. 8 caracteres)" }),

  // Información de discapacidad (solo perfil de ciudadano).
  // `null` limpia el valor; omitir el campo lo deja intacto.
  disabilityType: z.enum(CITIZEN_DISABILITY_TYPES).nullable().optional()
    .openapi({ example: "visual", description: "Tipo de discapacidad (null para limpiar)" }),

  disabilitySubcategory: z.enum(CITIZEN_DISABILITY_SUBCATEGORIES).nullable().optional()
    .openapi({ example: "guia_voz", description: "Subcategoría de la discapacidad" }),

  communicationMode: z.enum(CITIZEN_COMMUNICATION_MODES).nullable().optional()
    .openapi({ example: "lengua_senas", description: "Modo de comunicación (discapacidad auditiva)" }),

  // País (solo perfil de ciudadano — organización/voluntario lo editan por
  // su propio endpoint de perfil extendido).
  country: z.string().max(60, "country no puede exceder 60 caracteres").optional()
    .openapi({ example: "Venezuela", description: "País (solo ciudadanos)" }),
}).refine(
  (data) => Object.keys(data).length > 0,
  { message: "Debe enviar al menos un campo para actualizar" },
).openapi({
  description: "Payload para actualizar un usuario. Todos los campos son opcionales.",
  example: {
    fullName: "María González Actualizada",
    zone: "Caracas - Zona 2",
  },
});

// ---------------------------------------------------------------------------
// PATCH /api/users/:id/organization-profile — Body para corregir una organización
// ---------------------------------------------------------------------------

/**
 * Derivado 1:1 de RegisterOrganizationBody (mismas reglas del formulario de
 * registro). `partial()` hace todos los campos opcionales (edición parcial) y
 * `omit()` excluye password/acceptedTerms: corregir datos no reestablece la
 * contraseña ni vuelve a aceptar términos.
 */
const UpdateOrganizationProfileBody = RegisterOrganizationBody
  .partial()
  .omit({ password: true, acceptedTerms: true })
  .refine(
    (data) => Object.keys(data).length > 0,
    { message: "Debe enviar al menos un campo para actualizar" },
  )
  .openapi({
    description: [
      "Payload para corregir los datos de una organización ya registrada.",
      "Reutiliza exactamente las mismas reglas de validación del formulario de",
      "registro (RegisterOrganizationBody), con todos los campos opcionales.",
      "No permite cambiar password ni acceptedTerms.",
      "Editar estos datos NO modifica el estado de verificación del registro.",
    ].join(" "),
    example: {
      organizationName: "Cruz Roja Venezolana",
      taxId: "J-12345678-9",
      city: "Caracas",
      mission: "Aliviar el sufrimiento humano",
      disabilityTypeIds: [12, 14],
    },
  });

// ---------------------------------------------------------------------------
// PATCH /api/users/:id/volunteer-profile — Body para corregir un voluntario
// ---------------------------------------------------------------------------

/**
 * Derivado 1:1 de RegisterVolunteerBody (mismas reglas del formulario de
 * registro). `partial()` hace todos los campos opcionales y `omit()` excluye
 * password/acceptedTerms.
 *
 * Nota: si se envía `volunteerType`, el backend mantiene sincronizado el
 * `entity_type` de la solicitud de verificación, pero NO cambia su estado.
 */
const UpdateVolunteerProfileBody = RegisterVolunteerBody
  .partial()
  .omit({ password: true, acceptedTerms: true })
  .refine(
    (data) => Object.keys(data).length > 0,
    { message: "Debe enviar al menos un campo para actualizar" },
  )
  .openapi({
    description: [
      "Payload para corregir los datos de un voluntario ya registrado.",
      "Reutiliza exactamente las mismas reglas de validación del formulario de",
      "registro (RegisterVolunteerBody), con todos los campos opcionales.",
      "No permite cambiar password ni acceptedTerms.",
      "Editar estos datos NO modifica el estado de verificación del registro.",
    ].join(" "),
    example: {
      fullName: "Carlos Pérez",
      profession: "Médico cirujano",
      address: "Av. Principal 123",
      interestAreaIds: [23, 25],
    },
  });

// ---------------------------------------------------------------------------
// POST /api/users/:id/approve — Sin body (solo path param)
// ---------------------------------------------------------------------------

const ApproveUserParams = z.object({
  id: z.string().uuid("id debe ser un UUID válido"),
}).openapi({ description: "ID del usuario a aprobar" });

// ---------------------------------------------------------------------------
// POST /api/users/:id/reject — Sin body (solo path param)
// ---------------------------------------------------------------------------

const RejectUserParams = z.object({
  id: z.string().uuid("id debe ser un UUID válido"),
}).openapi({ description: "ID del usuario a rechazar" });

// ---------------------------------------------------------------------------
// GET /api/users/:id — Path param
// ---------------------------------------------------------------------------

const GetUserParams = z.object({
  id: z.string().uuid("id debe ser un UUID válido"),
}).openapi({ description: "ID del usuario a consultar" });

// ---------------------------------------------------------------------------
// Schemas de respuesta (para documentación OpenAPI)
// ---------------------------------------------------------------------------

/** Envoltura estándar de error: { errors: [...] } */
const ErrorResponse = z.object({
  errors: z.array(z.string()).openapi({ example: ["email es requerido"] }),
}).openapi({ description: "Respuesta de error con lista de mensajes" });

/** Usuario sin passwordHash (perfil público). */
const UserProfile = z.object({
  id: z.string().uuid().openapi({ example: "550e8400-e29b-41d4-a716-446655440000" }),
  fullName: z.string().openapi({ example: "María González" }),
  email: z.string().email().openapi({ example: "maria@email.com" }),
  phone: z.string().openapi({ example: "+584241234567" }),
  role: z.enum(ROLES).openapi({ example: "citizen" }),
  status: z.string().openapi({ example: "approved" }),
  location: LocationSchema.nullable().optional(),
  zone: z.string().nullable().optional().openapi({ example: "Caracas - Zona 1" }),
  phoneVerified: z.boolean().openapi({ example: false }),
  emailVerified: z.boolean().openapi({ example: false }),
  createdAt: z.string().datetime().openapi({ example: "2024-01-15T10:30:00.000Z" }),
  updatedAt: z.string().datetime().openapi({ example: "2024-01-15T10:30:00.000Z" }),
}).openapi({ description: "Perfil de usuario sin datos sensibles" });

/** Perfil de discapacidad de un ciudadano (citizen_profiles). */
const CitizenProfile = z.object({
  userId: z.string().uuid().openapi({ example: "550e8400-e29b-41d4-a716-446655440000" }),
  disabilityType: z.enum(CITIZEN_DISABILITY_TYPES).nullable()
    .openapi({ example: "visual" }),
  disabilitySubcategory: z.enum(CITIZEN_DISABILITY_SUBCATEGORIES).nullable()
    .openapi({ example: "guia_voz" }),
  communicationMode: z.enum(CITIZEN_COMMUNICATION_MODES).nullable()
    .openapi({ example: null }),
  createdAt: z.string().datetime().openapi({ example: "2024-01-15T10:30:00.000Z" }),
  updatedAt: z.string().datetime().openapi({ example: "2024-01-15T10:30:00.000Z" }),
}).openapi({ description: "Perfil de discapacidad de un ciudadano" });

/** Respuesta paginada de listado de usuarios. */
const ListUsersResponse = z.object({
  data: z.object({
    users: z.array(UserProfile).openapi({ description: "Lista de usuarios" }),
    total: z.number().int().openapi({ example: 150, description: "Total de usuarios que coinciden con los filtros" }),
    limit: z.number().int().openapi({ example: 50, description: "Límite aplicado" }),
    offset: z.number().int().openapi({ example: 0, description: "Offset aplicado" }),
  }),
}).openapi({ description: "Respuesta paginada de listado de usuarios" });

/** Conteo de usuarios de un rol, desglosado por estado. */
const UserStatsByRole = z.object({
  total: z.number().int().openapi({ example: 12 }),
  pending: z.number().int().openapi({ example: 3 }),
  approved: z.number().int().openapi({ example: 8 }),
  rejected: z.number().int().openapi({ example: 1 }),
  suspended: z.number().int().openapi({ example: 0 }),
}).openapi({ description: "Conteo de usuarios de un rol, desglosado por estado" });

/** Respuesta de estadísticas agregadas por rol y estado. */
const UserStatsResponse = z.object({
  data: z.object({
    citizen: UserStatsByRole,
    volunteer: UserStatsByRole,
    organization: UserStatsByRole,
    admin: UserStatsByRole,
  }),
}).openapi({ description: "Conteo de usuarios agrupado por rol y estado" });

module.exports = {
  ROLES,
  STATUSES,
  CITIZEN_DISABILITY_TYPES,
  CITIZEN_COMMUNICATION_MODES,
  CITIZEN_DISABILITY_SUBCATEGORIES,
  LocationSchema,
  ListUsersQuery,
  UpdateUserBody,
  UpdateOrganizationProfileBody,
  UpdateVolunteerProfileBody,
  ApproveUserParams,
  RejectUserParams,
  GetUserParams,
  ErrorResponse,
  UserProfile,
  CitizenProfile,
  ListUsersResponse,
  UserStatsByRole,
  UserStatsResponse,
};
