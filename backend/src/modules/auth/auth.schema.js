/**
 * Esquema — schemas Zod + normalización para el dominio de auth.
 *
 * Cada DTO se define una sola vez como schema Zod. El mismo schema:
 *   1. Valida el request body en el controller (safeParse)
 *   2. Genera la documentación OpenAPI automáticamente (.openapi())
 *
 * Las funciones normalize* se conservan porque el servicio las necesita
 * para agregar campos derivados (role, status) antes del INSERT.
 */
const { z } = require("zod");
const { extendZodWithOpenApi } = require("@asteasolutions/zod-to-openapi");

// Extender Zod con el método .openapi() — requerido por zod-to-openapi v8+
extendZodWithOpenApi(z);

// ---------------------------------------------------------------------------
// Constantes (sin cambios)
// ---------------------------------------------------------------------------

/** Roles válidos en el sistema. */
const ROLES = ["citizen", "volunteer", "organization", "admin"];

/** Días de la semana aceptados para available_days. */
const VALID_DAYS = [
  "lunes",
  "martes",
  "miercoles",
  "miércoles",
  "jueves",
  "viernes",
  "sabado",
  "sábado",
  "domingo",
];

const VALID_DAYS_SET = new Set(VALID_DAYS);

/** Antigüedad máxima aceptada para la fecha de nacimiento de un voluntario. */
const MAX_VOLUNTEER_AGE_YEARS = 80;

/** Estados iniciales según el rol. */
const INITIAL_STATUS = {
  citizen: "approved",
  volunteer: "pending",
  organization: "pending",
  admin: "approved",
};

// ---------------------------------------------------------------------------
// Schemas reutilizables (sub-schemas compartidos entre DTOs)
// ---------------------------------------------------------------------------

/**
 * Coordenadas geográficas { lat, lng }.
 * Se usa como sub-schema en todos los DTOs de registro.
 */
const LocationSchema = z.object({
  lat: z.number()
    .min(-90, "location.lat debe ser una coordenada válida (-90 a 90)")
    .max(90, "location.lat debe ser una coordenada válida (-90 a 90)"),
  lng: z.number()
    .min(-180, "location.lng debe ser una coordenada válida (-180 a 180)")
    .max(180, "location.lng debe ser una coordenada válida (-180 a 180)"),
}).openapi({ description: "Coordenadas geográficas del usuario" });

/**
 * Campos comunes a todos los registros (fullName, email, phone, password,
 * location, zone). Se extiende con .extend() en cada DTO.
 */
const CommonFields = z.object({
  fullName: z.string()
    .min(1, "fullName es requerido")
    .openapi({ example: "María González", description: "Nombre completo" }),

  email: z.string()
    .min(1, "email es requerido")
    .email("email no tiene un formato válido")
    .openapi({ example: "maria@email.com", description: "Correo electrónico" }),

  phone: z.string()
    .min(1, "phone es requerido")
    .refine(
      (val) => /^\+?[0-9]{7,15}$/.test(val.replace(/[\s-]/g, "")),
      "phone no tiene un formato válido (mínimo 7 dígitos)",
    )
    .openapi({ example: "+584241234567", description: "Teléfono (formato internacional o local)" }),

  password: z.string()
    .min(8, "password debe tener al menos 8 caracteres")
    .openapi({ example: "unaClaveSegura2024!", description: "Contraseña (mín. 8 caracteres)" }),

  location: LocationSchema.nullable().optional()
    .openapi({ description: "Ubicación geográfica (opcional)" }),

  zone: z.string().optional()
    .openapi({ example: "Caracas - Zona 1", description: "Zona o sector (opcional)" }),
});

// ---------------------------------------------------------------------------
// POST /api/auth/register/citizen
// ---------------------------------------------------------------------------

const RegisterCitizenBody = CommonFields.extend({
  country: z.string().max(60, "country no puede exceder 60 caracteres").optional()
    .openapi({ example: "Venezuela", description: "País" }),
}).openapi({
  description: "Payload para registrar un ciudadano (aprobación automática)",
  example: {
    fullName: "María González",
    email: "maria@email.com",
    phone: "+584241234567",
    password: "unaClaveSegura2024!",
    location: { lat: 10.4806, lng: -66.9036 },
    zone: "Caracas - Zona 1",
    country: "Venezuela",
  },
});

// ---------------------------------------------------------------------------
// POST /api/auth/register/volunteer
// ---------------------------------------------------------------------------

const RegisterVolunteerBody = CommonFields.extend({
  skills: z.array(z.string().min(1, "skills contiene valores vacíos"))
    .min(1, "skills es requerido y debe contener al menos una habilidad")
    .openapi({
      example: ["primeros_auxilios", "logistica", "traduccion_lsen"],
      description: "Habilidades del voluntario",
    }),

  availableHours: z.number()
    .int("availableHours debe ser un número entero")
    .min(1, "availableHours debe ser al menos 1")
    .max(168, "availableHours no puede exceder 168 (horas en una semana)")
    .openapi({ example: 20, description: "Horas disponibles por semana (1-168)" }),

  availableDays: z.array(
    z.string().refine((d) => VALID_DAYS_SET.has(d?.toLowerCase?.() ?? ""), {
      message: "availableDays contiene valores inválidos. Válidos: " + VALID_DAYS.join(", "),
    }),
  )
    .min(1, "availableDays es requerido y debe contener al menos un día")
    .openapi({
      example: ["lunes", "miercoles", "sabado"],
      description: "Días de la semana disponibles",
    }),

  acceptedTerms: z.literal(true, {
    errorMap: () => ({ message: "acceptedTerms debe ser true para registrarse como voluntario" }),
  }).openapi({ example: true, description: "Debe ser true" }),

  // Campos extendidos del perfil de voluntario (volunteer_profiles)
  volunteerType: z.enum(["professional", "non_professional"])
    .optional()
    .openapi({ example: "professional", description: "Tipo de voluntario" }),

  documentType: z.string().max(20).optional()
    .openapi({ example: "cedula", description: "Tipo de documento (cédula, pasaporte)" }),

  documentNumber: z.string().max(30).optional()
    .openapi({ example: "V12345678", description: "Número de documento" }),

  birthDate: z.string()
    .refine((date) => !isNaN(Date.parse(date)), "birthDate no es una fecha válida")
    .refine((date) => new Date(date) <= new Date(), "birthDate no puede ser posterior a hoy")
    .refine((date) => {
      const minDate = new Date();
      minDate.setFullYear(minDate.getFullYear() - MAX_VOLUNTEER_AGE_YEARS);
      return new Date(date) >= minDate;
    }, `birthDate no puede ser mayor a ${MAX_VOLUNTEER_AGE_YEARS} años atrás`)
    .optional()
    .openapi({ example: "1985-03-20", description: "Fecha de nacimiento (YYYY-MM-DD)" }),

  address: z.string().optional()
    .openapi({ example: "Av. Principal 123", description: "Dirección de residencia" }),

  country: z.string().max(60, "country no puede exceder 60 caracteres").optional()
    .openapi({ example: "Venezuela", description: "País" }),

  profession: z.string().max(100).optional()
    .openapi({ example: "Médico cirujano", description: "Profesión" }),

  languages: z.array(z.string().min(1)).optional()
    .openapi({ example: ["español", "lengua de señas venezolana"], description: "Idiomas" }),

  availabilityMode: z.enum(["presential", "online", "both"])
    .optional()
    .openapi({ example: "both", description: "Modalidad de disponibilidad" }),

  hasPriorExperience: z.boolean().optional()
    .openapi({ example: true, description: "¿Tiene experiencia previa como voluntario?" }),

  transportAvailable: z.boolean().optional()
    .openapi({ example: false, description: "¿Dispone de medio de transporte propio?" }),

  interestAreaIds: z.array(z.number().int().positive())
    .optional()
    .openapi({ example: [23, 25], description: "IDs del catálogo (type = 'interest_area')" }),

  experienceCategoryIds: z.array(z.number().int().positive())
    .optional()
    .openapi({ example: [36], description: "IDs del catálogo (type = 'experience_category')" }),
}).openapi({
  description: "Payload para registrar un voluntario (requiere aprobación)",
  example: {
    fullName: "Carlos Pérez",
    email: "voluntario@sara.org",
    phone: "+584241112233",
    password: "claveSegura2024!",
    location: { lat: 10.4806, lng: -66.9036 },
    zone: "Caracas - Zona 1",
    skills: ["primeros_auxilios", "logistica"],
    availableHours: 20,
    availableDays: ["lunes", "miercoles", "sabado"],
    acceptedTerms: true,
    volunteerType: "professional",
    documentType: "cedula",
    documentNumber: "V12345678",
    birthDate: "1985-03-20",
    profession: "Médico cirujano",
    languages: ["español"],
    availabilityMode: "both",
    hasPriorExperience: true,
    interestAreaIds: [23, 25],
    experienceCategoryIds: [36],
  },
});

// ---------------------------------------------------------------------------
// POST /api/auth/register/organization
// ---------------------------------------------------------------------------

const RegisterOrganizationBody = CommonFields.extend({
  // Campos básicos (legacy - para compatibilidad)
  organizationName: z.string()
    .min(1, "organizationName es requerido para organizaciones")
    .openapi({ example: "Cruz Roja Venezolana", description: "Nombre de la organización" }),

  legalDocument: z.string()
    // .min(1, "legalDocument es requerido para organizaciones")
    .openapi({ example: "RIF-J-12345678-9", description: "Documento legal (RIF, cédula jurídica)" }),

  workArea: z.array(z.string().min(1, "workArea contiene valores vacíos"))
    .optional()
    .openapi({
      example: ["salud", "logistica", "alimentos"],
      description: "Áreas de trabajo (opcional)",
    }),

  acceptedTerms: z.literal(true, {
    errorMap: () => ({ message: "acceptedTerms debe ser true para registrarse como organización" }),
  }).openapi({ example: true, description: "Debe ser true" }),

  // Campos extendidos del perfil de organización
  organizationTypeId: z.number()
    .int("organizationTypeId debe ser un número entero")
    .positive("organizationTypeId debe ser positivo")
    .optional()
    .openapi({ example: 1, description: "ID del tipo de organización (catálogo)" }),

  taxId: z.string()
    .max(30, "taxId no puede exceder 30 caracteres")
    .optional()
    .openapi({ example: "J123456789", description: "Identificación fiscal (RIF, CIF, NIF)" }),

  taxIdType: z.string()
    .max(30, "taxIdType no puede exceder 30 caracteres")
    .optional()
    .openapi({ example: "RIF", description: "Tipo de identificador fiscal (RIF, NIT, RUC, o 'Documento de identidad' para organizaciones en trámite)" }),

  otherEntityType: z.string()
    .max(100, "otherEntityType no puede exceder 100 caracteres")
    .optional()
    .openapi({ example: "Cooperativa", description: "Especificación del tipo de entidad cuando es 'Otra'" }),

  registryNumber: z.string()
    .max(50, "registryNumber no puede exceder 50 caracteres")
    .optional()
    .openapi({ example: "123", description: "Número de registro" }),

  foundedAt: z.string()
    .optional()
    .openapi({ example: "2020-01-01", description: "Fecha de constitución (YYYY-MM-DD)" }),

  country: z.string()
    .max(60, "country no puede exceder 60 caracteres")
    .optional()
    .openapi({ example: "Venezuela", description: "País" }),

  province: z.string()
    .max(60, "province no puede exceder 60 caracteres")
    .optional()
    .openapi({ example: "Distrito Capital", description: "Provincia/Estado" }),

  city: z.string()
    .max(60, "city no puede exceder 60 caracteres")
    .optional()
    .openapi({ example: "Caracas", description: "Ciudad" }),

  address: z.string()
    .optional()
    .openapi({ example: "Av. Principal 123", description: "Dirección completa" }),

  website: z.string()
    .max(200, "website no puede exceder 200 caracteres")
    .optional()
    .openapi({ example: "https://sara.org", description: "Sitio web" }),

  socialLinks: z.record(z.string())
    .optional()
    .openapi({
      example: { instagram: "@sara", facebook: "saraorg" },
      description: "Redes sociales (objeto clave-valor)",
    }),

  mission: z.string()
    .optional()
    .openapi({ example: "Ayudar a personas con discapacidad", description: "Misión de la organización" }),

  vision: z.string()
    .optional()
    .openapi({ example: "Ser la principal organización de apoyo", description: "Visión de la organización" }),

  scope: z.string()
    .optional()
    .openapi({ example: "Nacional", description: "Ámbito de actuación" }),

  servedGroups: z.string()
    .optional()
    .openapi({ example: "Personas con discapacidad física", description: "Colectivos atendidos" }),

  legalRepresentatives: z.array(z.object({
    fullName: z.string().min(1, "fullName es requerido"),
    position: z.string().optional(),
    phone: z.string().optional(),
    email: z.string().email("email no válido").optional(),
  })).optional()
    .openapi({
      example: [{ fullName: "Juan Pérez", position: "Director", email: "juan@sara.org" }],
      description: "Representantes legales",
    }),

  disabilityTypeIds: z.array(z.number().int().positive())
    .optional()
    .openapi({ example: [12, 14], description: "IDs de tipos de discapacidad (catálogo)" }),

  serviceIds: z.array(z.number().int().positive())
    .optional()
    .openapi({ example: [43, 44], description: "IDs de servicios ofrecidos (catálogo)" }),
}).openapi({
  description: "Payload para registrar una organización con perfil completo (requiere aprobación)",
  example: {
    fullName: "Ana Rodríguez",
    email: "contacto@cruzroja.org.ve",
    phone: "+582121234567",
    password: "claveOrg2024!",
    location: { lat: 10.4806, lng: -66.9036 },
    zone: "Caracas - Centro",
    organizationName: "Cruz Roja Venezolana",
    legalDocument: "RIF-J-12345678-9",
    acceptedTerms: true,
    organizationTypeId: 1,
    taxId: "J123456789",
    registryNumber: "123",
    foundedAt: "2020-01-01",
    country: "Venezuela",
    province: "Distrito Capital",
    city: "Caracas",
    address: "Av. Principal 123",
    website: "https://cruzroja.org.ve",
    mission: "Ayudar a personas con discapacidad",
    vision: "Ser la principal organización de apoyo",
    scope: "Nacional",
    servedGroups: "Personas con discapacidad física",
    legalRepresentatives: [{ fullName: "Juan Pérez", position: "Director" }],
    disabilityTypeIds: [12, 14],
    serviceIds: [43, 44],
  },
});

// ---------------------------------------------------------------------------
// POST /api/auth/register/admin
// ---------------------------------------------------------------------------

const RegisterAdminBody = CommonFields.extend({
  adminSecret: z.string()
    .min(1, "adminSecret es requerido para registrar un administrador")
    .openapi({
      example: "******",
      description: "Secreto de administrador configurado en el servidor",
    }),
}).openapi({
  description: "Payload para registrar un administrador (protegido por ADMIN_SECRET)",
  example: {
    fullName: "Admin Principal",
    email: "admin@sara.org",
    phone: "+584249990000",
    password: "adminClaveSegura2024!",
    location: { lat: 10.4806, lng: -66.9036 },
    zone: "Caracas - Oficina Central",
    adminSecret: "******",
  },
});

// ---------------------------------------------------------------------------
// POST /api/auth/login
// ---------------------------------------------------------------------------

const LoginBody = z.object({
  email: z.string()
    .min(1, "email es requerido")
    .email("email no tiene un formato válido")
    .openapi({ example: "maria@email.com", description: "Correo electrónico registrado" }),

  password: z.string()
    .min(1, "password es requerido")
    .openapi({ example: "unaClaveSegura2024!", description: "Contraseña" }),
}).openapi({
  description: "Credenciales de inicio de sesión",
  example: {
    email: "maria@email.com",
    password: "unaClaveSegura2024!",
  },
});

// ---------------------------------------------------------------------------
// GET /api/auth/validate-completion-token
// ---------------------------------------------------------------------------

const ValidateCompletionTokenQuery = z.object({
  token: z.string()
    .uuid("token no tiene un formato válido")
    .openapi({ example: "550e8400-e29b-41d4-a716-446655440000", description: "Token de completar registro" }),
}).openapi({ description: "Query param para validar un token de completar registro" });

// ---------------------------------------------------------------------------
// POST /api/auth/complete-registration
// ---------------------------------------------------------------------------

const CompleteRegistrationBody = z.object({
  token: z.string()
    .uuid("token no tiene un formato válido")
    .openapi({ example: "550e8400-e29b-41d4-a716-446655440000", description: "Token de completar registro" }),

  password: z.string()
    .min(8, "La contraseña debe tener al menos 8 caracteres.")
    .openapi({ example: "unaClaveSegura2024!", description: "Nueva contraseña (mín. 8 caracteres)" }),
}).openapi({
  description: "Payload para completar el registro tras la aprobación",
  example: { token: "550e8400-e29b-41d4-a716-446655440000", password: "unaClaveSegura2024!" },
});

// ---------------------------------------------------------------------------
// Schemas de respuesta (para documentación OpenAPI)
// ---------------------------------------------------------------------------

/** Envoltura estándar de error: { errors: [...] } */
const ErrorResponse = z.object({
  errors: z.array(z.string()).openapi({ example: ["email es requerido"] }),
}).openapi({ description: "Respuesta de error con lista de mensajes" });

/** Usuario sin password_hash (respuesta de registro y GET /me) */
const UserProfile = z.object({
  id: z.string().uuid().openapi({ example: "550e8400-e29b-41d4-a716-446655440000" }),
  full_name: z.string().openapi({ example: "María González" }),
  email: z.string().email().openapi({ example: "maria@email.com" }),
  phone: z.string().openapi({ example: "+584241234567" }),
  role: z.enum(ROLES).openapi({ example: "citizen" }),
  status: z.string().openapi({ example: "approved" }),
  location: LocationSchema.nullable().optional(),
  zone: z.string().nullable().optional().openapi({ example: "Caracas - Zona 1" }),
  phone_verified: z.boolean().openapi({ example: false }),
  email_verified: z.boolean().openapi({ example: false }),
  created_at: z.string().datetime().openapi({ example: "2024-01-15T10:30:00.000Z" }),
  updated_at: z.string().datetime().openapi({ example: "2024-01-15T10:30:00.000Z" }),
}).openapi({ description: "Perfil de usuario sin datos sensibles" });

/** Respuesta de login: { token, user } */
const LoginResponse = z.object({
  data: z.object({
    token: z.string().openapi({
      example: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
      description: "JWT para usar en Authorization: Bearer <token>",
    }),
    user: UserProfile,
  }),
}).openapi({ description: "Token JWT + perfil del usuario" });

/** Respuesta de validate-completion-token: { data: { valid, status? } } */
const ValidateCompletionTokenResponse = z.object({
  data: z.object({
    valid: z.boolean().openapi({ example: true }),
    status: z.string().optional().openapi({ example: "aceptada" }),
  }),
}).openapi({ description: "Resultado de validar un token de completar registro" });

/** Respuesta de complete-registration: { data: { completed: true } } */
const CompleteRegistrationResponse = z.object({
  data: z.object({
    completed: z.literal(true),
  }),
}).openapi({ description: "Confirmación de registro completado" });

// ---------------------------------------------------------------------------
// Normalizadores (SIN cambios — los servicios dependen de ellos)
// ---------------------------------------------------------------------------

/**
 * Normaliza el payload de registro de ciudadano para inserción en DB.
 * @param {Object} payload — ya validado por Zod
 * @returns {{ user: Object }}
 */
function normalizeRegisterCitizen(payload) {
  return {
    user: {
      fullName: payload.fullName.trim(),
      email: payload.email.trim().toLowerCase(),
      phone: payload.phone.trim().replace(/[\s-]/g, ""),
      password: payload.password, // Se hashea en el servicio
      role: "citizen",
      status: "approved",
      location: payload.location || null,
      zone: payload.zone?.trim() || null,
    },
    profile: {
      country: payload.country?.trim() || null,
    },
  };
}

/**
 * Normaliza el payload de registro de voluntario para inserción en DB.
 * @param {Object} payload — ya validado por Zod
 * @returns {{ user: Object, details: Object }}
 */
function normalizeRegisterVolunteer(payload) {
  return {
    user: {
      fullName: payload.fullName.trim(),
      email: payload.email.trim().toLowerCase(),
      phone: payload.phone.trim().replace(/[\s-]/g, ""),
      password: payload.password,
      role: "volunteer",
      status: "pending",
      location: payload.location || null,
      zone: payload.zone?.trim() || null,
    },
    details: {
      skills: payload.skills.map((s) => s.trim()),
      availableHours: Number(payload.availableHours),
      availableDays: payload.availableDays.map((d) => d.toLowerCase().trim()),
      acceptedTerms: true,
    },
  };
}

/**
 * Normaliza el payload extendido de voluntario para inserción completa.
 * Separa campos de users/user_details vs volunteer_profiles.
 * @param {Object} payload — ya validado por Zod
 * @returns {{ user: Object, details: Object, profile: Object, entityType: string, interestAreaIds: number[], experienceCategoryIds: number[] }}
 */
function normalizeRegisterVolunteerExtended(payload) {
  const user = {
    fullName: payload.fullName.trim(),
    email: payload.email.trim().toLowerCase(),
    phone: payload.phone.trim().replace(/[\s-]/g, ""),
    password: payload.password,
    role: "volunteer",
    status: "pending",
    location: payload.location || null,
    zone: payload.zone?.trim() || null,
  };

  const details = {
    skills: payload.skills.map((s) => s.trim()),
    availableHours: Number(payload.availableHours),
    availableDays: payload.availableDays.map((d) => d.toLowerCase().trim()),
    acceptedTerms: true,
  };

  const profile = {
    volunteerType: payload.volunteerType,
    documentType: payload.documentType?.trim() || null,
    documentNumber: payload.documentNumber?.trim() || null,
    birthDate: payload.birthDate || null,
    address: payload.address?.trim() || null,
    country: payload.country?.trim() || null,
    profession: payload.profession?.trim() || null,
    languages: payload.languages?.map((l) => l.trim()) || null,
    availabilityMode: payload.availabilityMode || null,
    hasPriorExperience: payload.hasPriorExperience ?? null,
    transportAvailable: payload.transportAvailable ?? null,
  };

  const entityType = payload.volunteerType === "professional"
    ? "volunteer_professional"
    : "volunteer_non_professional";

  return {
    user,
    details,
    profile,
    entityType,
    interestAreaIds: payload.interestAreaIds || [],
    experienceCategoryIds: payload.experienceCategoryIds || [],
  };
}

/**
 * Normaliza el payload de registro de organización para inserción en DB.
 * Versión básica (legacy) — solo crea user + user_details.
 * @param {Object} payload — ya validado por Zod
 * @returns {{ user: Object, details: Object }}
 */
function normalizeRegisterOrganization(payload) {
  return {
    user: {
      fullName: payload.fullName.trim(),
      email: payload.email.trim().toLowerCase(),
      phone: payload.phone.trim().replace(/[\s-]/g, ""),
      password: payload.password,
      role: "organization",
      status: "pending",
      location: payload.location || null,
      zone: payload.zone?.trim() || null,
    },
    details: {
      organizationName: payload.organizationName.trim(),
      legalDocument: payload.legalDocument.trim(),
      workArea: payload.workArea?.map((a) => a.trim()) || null,
      acceptedTerms: true,
    },
  };
}

/**
 * Normaliza el payload extendido de organización para inserción completa.
 * Separa campos de users vs organization_profiles.
 * @param {Object} payload — ya validado por Zod
 * @returns {{ user: Object, details: Object, profile: Object, legalRepresentatives: Object[], disabilityTypeIds: number[], serviceIds: number[] }}
 */
function normalizeRegisterOrganizationExtended(payload) {
  // Campos de usuario (users + user_details)
  const user = {
    fullName: payload.fullName.trim(),
    email: payload.email.trim().toLowerCase(),
    phone: payload.phone.trim().replace(/[\s-]/g, ""),
    password: payload.password,
    role: "organization",
    status: "pending",
    location: payload.location || null,
    zone: payload.zone?.trim() || null,
  };

  const details = {
    organizationName: payload.organizationName.trim(),
    legalDocument: payload.legalDocument.trim(),
    workArea: payload.workArea?.map((a) => a.trim()) || null,
    acceptedTerms: true,
  };

  // Campos de perfil de organización (organization_profiles)
  const profile = {
    organizationTypeId: payload.organizationTypeId || null,
    taxId: payload.taxId?.trim() || null,
    taxIdType: payload.taxIdType?.trim() || null,
    otherEntityType: payload.otherEntityType?.trim() || null,
    registryNumber: payload.registryNumber?.trim() || null,
    foundedAt: payload.foundedAt || null,
    country: payload.country?.trim() || null,
    province: payload.province?.trim() || null,
    city: payload.city?.trim() || null,
    address: payload.address?.trim() || null,
    website: payload.website?.trim() || null,
    socialLinks: payload.socialLinks || null,
    mission: payload.mission?.trim() || null,
    vision: payload.vision?.trim() || null,
    scope: payload.scope?.trim() || null,
    servedGroups: payload.servedGroups?.trim() || null,
  };

  // Representantes legales
  const legalRepresentatives = payload.legalRepresentatives?.map((rep) => ({
    fullName: rep.fullName.trim(),
    position: rep.position?.trim() || null,
    phone: rep.phone?.trim() || null,
    email: rep.email?.trim() || null,
  })) || [];

  // Relaciones many-to-many
  const disabilityTypeIds = payload.disabilityTypeIds || [];
  const serviceIds = payload.serviceIds || [];

  return {
    user,
    details,
    profile,
    legalRepresentatives,
    disabilityTypeIds,
    serviceIds,
  };
}

/**
 * Normaliza el payload de registro de administrador para inserción en DB.
 * No se crea fila en user_details (igual que citizen).
 * @param {Object} payload — ya validado por Zod
 * @returns {{ user: Object }}
 */
function normalizeRegisterAdmin(payload) {
  return {
    user: {
      fullName: payload.fullName.trim(),
      email: payload.email.trim().toLowerCase(),
      phone: payload.phone.trim().replace(/[\s-]/g, ""),
      password: payload.password,
      role: "admin",
      status: "approved",
      location: payload.location || null,
      zone: payload.zone?.trim() || null,
    },
  };
}

// ---------------------------------------------------------------------------
// Exports
// ---------------------------------------------------------------------------

module.exports = {
  // Constantes
  ROLES,
  VALID_DAYS,
  VALID_DAYS_SET,
  INITIAL_STATUS,

  // Schemas Zod para validación 
  RegisterCitizenBody,
  RegisterVolunteerBody,
  RegisterOrganizationBody,
  RegisterAdminBody,
  LoginBody,
  ValidateCompletionTokenQuery,
  CompleteRegistrationBody,

  // Schemas de respuesta para OpenAPI
  UserProfile,
  LoginResponse,
  ErrorResponse,
  LocationSchema,
  ValidateCompletionTokenResponse,
  CompleteRegistrationResponse,

  // Normalizadores
  normalizeRegisterCitizen,
  normalizeRegisterVolunteer,
  normalizeRegisterVolunteerExtended,
  normalizeRegisterOrganization,
  normalizeRegisterOrganizationExtended,
  normalizeRegisterAdmin,
};
