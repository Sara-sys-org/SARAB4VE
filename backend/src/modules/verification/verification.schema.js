/**
 * Esquema — schemas Zod + normalización para el dominio de verificación.
 *
 * Cada DTO se define una sola vez como schema Zod. El mismo schema:
 *   1. Valida el request body en el controller (safeParse)
 *   2. Genera la documentación OpenAPI automáticamente (.openapi())
 *
 * Los normalizadores se conservan para que el servicio los use antes de
 * insertar en la base de datos.
 */
const { z } = require("zod");
const { extendZodWithOpenApi } = require("@asteasolutions/zod-to-openapi");

extendZodWithOpenApi(z);

// ---------------------------------------------------------------------------
// Constantes
// ---------------------------------------------------------------------------

/** Estados del flujo de verificación. */
const VERIFICATION_STATUSES = ["entregada", "en_estudio", "rechazada", "aceptada"];

/** Estados de documentos individuales. */
const DOCUMENT_STATUSES = ["pending", "approved", "rejected"];

/** Formatos permitidos para documentos de verificación (mismos que el formulario de registro). */
const ALLOWED_DOCUMENT_EXTENSIONS = ["pdf", "jpg", "jpeg", "png", "doc", "docx"];
const ALLOWED_DOCUMENT_MIME_TYPES = [
  "application/pdf",
  "image/jpeg",
  "image/png",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
];
/** Sin Office instalado, algunos navegadores envían los Word como tipo genérico. */
const WORD_EXTENSIONS = ["doc", "docx"];
const GENERIC_MIME_TYPE = "application/octet-stream";
const DOCUMENT_FORMAT_ERROR = "Formato no permitido. Usa PDF, JPG, PNG o Word.";
const DOCUMENT_SIZE_ERROR = "El archivo es muy grande. El máximo es 10 MB.";

/**
 * Indica si un archivo tiene extensión y MIME permitidos (se exigen ambos).
 * @param {string} fileName
 * @param {string} mimeType
 * @returns {boolean}
 */
function isAllowedDocumentFile(fileName, mimeType) {
  const ext = String(fileName || "").split(".").pop().toLowerCase();
  const mime = String(mimeType || "").toLowerCase();
  if (!ALLOWED_DOCUMENT_EXTENSIONS.includes(ext)) return false;
  return ALLOWED_DOCUMENT_MIME_TYPES.includes(mime)
    || (WORD_EXTENSIONS.includes(ext) && mime === GENERIC_MIME_TYPE);
}

/** Tipos de voluntario. */
const VOLUNTEER_TYPES = ["professional", "non_professional"];

/** Modos de disponibilidad. */
const AVAILABILITY_MODES = ["presential", "online", "both"];

/** Tipos de entidad para verification_requests. */
const ENTITY_TYPES = ["organization", "volunteer_professional", "volunteer_non_professional"];

/** Tipos del catálogo unificado. */
const CATALOG_TYPES = [
  "organization_type",
  "disability_type",
  "service",
  "interest_area",
  "experience_category",
];

/**
 * Mapa de transiciones válidas de la máquina de estados.
 * Única fuente de verdad — el servicio valida contra este mapa.
 */
const ALLOWED_TRANSITIONS = {
  entregada: ["en_estudio"],
  en_estudio: ["aceptada", "rechazada"],
  rechazada: ["entregada"],
  aceptada: [], // estado final
};

// ---------------------------------------------------------------------------
// Sub-schemas reutilizables
// ---------------------------------------------------------------------------

const LegalRepresentativeSchema = z.object({
  fullName: z.string().min(1, "fullName del representante legal es requerido"),
  position: z.string().optional(),
  phone: z.string().optional(),
  email: z.string().email("email del representante legal no es válido").optional(),
}).openapi({ description: "Representante legal de la organización" });

const SocialLinksSchema = z.record(z.string()).optional().openapi({
  description: "Enlaces a redes sociales (instagram, facebook, etc.)",
  example: { instagram: "@cruzroja.ve", facebook: "cruzroja.venezolana" },
});

// ---------------------------------------------------------------------------
// POST /api/organizations/register
// ---------------------------------------------------------------------------

const OrganizationRegisterBody = z.object({
  organizationTypeId: z.number()
    .int("organizationTypeId debe ser un entero")
    .positive("organizationTypeId debe ser positivo")
    .openapi({ example: 1, description: "ID del catálogo (type = 'organization_type')" }),

  taxId: z.string().max(30).optional()
    .openapi({ example: "J-12345678-9", description: "CIF/NIF de la organización" }),

  registryNumber: z.string().max(50).optional()
    .openapi({ example: "RN-2024-00123", description: "Número de registro" }),

  foundedAt: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "foundedAt debe tener formato YYYY-MM-DD").optional()
    .openapi({ example: "1990-05-15", description: "Fecha de fundación (YYYY-MM-DD)" }),

  country: z.string().max(60).optional()
    .openapi({ example: "Venezuela", description: "País" }),

  province: z.string().max(60).optional()
    .openapi({ example: "Distrito Capital", description: "Provincia / Estado" }),

  city: z.string().max(60).optional()
    .openapi({ example: "Caracas", description: "Ciudad" }),

  address: z.string().optional()
    .openapi({ example: "Av. Principal, Edif. Cruz Roja, piso 3", description: "Dirección" }),

  website: z.string().url("website debe ser una URL válida").max(200).optional()
    .or(z.literal(""))
    .openapi({ example: "https://cruzroja.org.ve", description: "Sitio web" }),

  socialLinks: SocialLinksSchema,

  mission: z.string().optional()
    .openapi({ example: "Aliviar el sufrimiento humano...", description: "Misión" }),

  vision: z.string().optional()
    .openapi({ example: "Una sociedad más resiliente...", description: "Visión" }),

  scope: z.string().optional()
    .openapi({ example: "Nacional", description: "Ámbito de actuación" }),

  servedGroups: z.string().optional()
    .openapi({ example: "Personas con discapacidad, adultos mayores", description: "Colectivos atendidos" }),

  legalRepresentatives: z.array(LegalRepresentativeSchema).optional()
    .openapi({ description: "Representantes legales de la organización" }),

  disabilityTypeIds: z.array(
    z.number().int().positive()
  ).optional().openapi({
    example: [12, 14], description: "IDs del catálogo (type = 'disability_type'). Ej: 12=Visual, 14=Física",
  }),

  serviceIds: z.array(
    z.number().int().positive()
  ).optional().openapi({
    example: [43, 44, 47], description: "IDs del catálogo (type = 'service'). Ej: 43=Acompañamiento, 44=Transporte",
  }),
}).openapi({
  description: "Payload para registrar una organización en el flujo de verificación",
  example: {
    organizationTypeId: 1,
    taxId: "J-12345678-9",
    country: "Venezuela",
    province: "Distrito Capital",
    city: "Caracas",
    address: "Av. Principal, Edif. Cruz Roja",
    website: "https://cruzroja.org.ve",
    mission: "Aliviar el sufrimiento humano",
    legalRepresentatives: [{ fullName: "Juan Pérez", position: "Presidente", phone: "+584241112233", email: "juan@cruzroja.org" }],
    disabilityTypeIds: [12, 13],
    serviceIds: [43, 45],
  },
});

// ---------------------------------------------------------------------------
// POST /api/volunteers/register
// ---------------------------------------------------------------------------

const VolunteerRegisterBody = z.object({
  volunteerType: z.enum(VOLUNTEER_TYPES, {
    errorMap: () => ({ message: `volunteerType debe ser: ${VOLUNTEER_TYPES.join(" | ")}` }),
  }).openapi({ example: "professional", description: "Tipo de voluntario" }),

  documentType: z.string().max(20).optional()
    .openapi({ example: "cedula", description: "Tipo de documento (cédula, pasaporte)" }),

  documentNumber: z.string().max(30).optional()
    .openapi({ example: "V12345678", description: "Número de documento" }),

  birthDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "birthDate debe tener formato YYYY-MM-DD").optional()
    .openapi({ example: "1985-03-20", description: "Fecha de nacimiento (YYYY-MM-DD)" }),

  profession: z.string().max(100).optional()
    .openapi({ example: "Médico cirujano", description: "Profesión" }),

  languages: z.array(z.string().min(1)).optional()
    .openapi({ example: ["español", "lengua de señas venezolana"], description: "Idiomas" }),

  availabilityMode: z.enum(AVAILABILITY_MODES, {
    errorMap: () => ({ message: `availabilityMode debe ser: ${AVAILABILITY_MODES.join(" | ")}` }),
  }).optional().openapi({ example: "both", description: "Modalidad de disponibilidad" }),

  hasPriorExperience: z.boolean().optional()
    .openapi({ example: true, description: "¿Tiene experiencia previa como voluntario?" }),

  transportAvailable: z.boolean().optional()
    .openapi({ example: false, description: "¿Dispone de medio de transporte propio?" }),

  interestAreaIds: z.array(
    z.number().int().positive()
  ).optional().openapi({
    example: [23, 25], description: "IDs del catálogo (type = 'interest_area'). Ej: 23=Acompañamiento, 25=Tecnología",
  }),

  experienceCategoryIds: z.array(
    z.number().int().positive()
  ).optional().openapi({
    example: [36], description: "IDs del catálogo (type = 'experience_category'). Ej: 36=Voluntariado",
  }),
}).openapi({
  description: "Payload para registrar un voluntario (profesional o no profesional)",
  example: {
    volunteerType: "professional",
    documentType: "cedula",
    documentNumber: "V12345678",
    birthDate: "1985-03-20",
    profession: "Médico cirujano",
    languages: ["español", "lengua de señas venezolana"],
    availabilityMode: "both",
    hasPriorExperience: true,
    transportAvailable: false,
    interestAreaIds: [23, 24],
    experienceCategoryIds: [36],
  },
});

// ---------------------------------------------------------------------------
// POST /api/verification-documents
// ---------------------------------------------------------------------------

const DocumentUploadBody = z.object({
  documentTypeId: z.number()
    .int("documentTypeId debe ser un entero")
    .positive("documentTypeId debe ser positivo")
    .openapi({ example: 1, description: "ID del tipo de documento (document_types)" }),

  fileName: z.string()
    .min(1, "fileName es requerido")
    .max(255, "fileName máximo 255 caracteres")
    .openapi({ example: "estatutos.pdf", description: "Nombre original del archivo" }),

  mimeType: z.string()
    .min(1, "mimeType es requerido")
    .max(100)
    .openapi({ example: "application/pdf", description: "MIME type del archivo" }),
}).refine((data) => isAllowedDocumentFile(data.fileName, data.mimeType), {
  message: DOCUMENT_FORMAT_ERROR,
  path: ["file"],
}).openapi({
  description: "Payload para solicitar URL prefirmada de subida de documento",
  example: {
    documentTypeId: 1,
    fileName: "estatutos.pdf",
    mimeType: "application/pdf",
  },
});

// ---------------------------------------------------------------------------
// PUT /api/verification-documents/:id/file (admin)
// ---------------------------------------------------------------------------

const DocumentFileBody = z.object({
  fileName: z.string()
    .min(1, "El archivo es requerido.")
    .max(255, "El nombre del archivo es muy largo (máximo 255 caracteres)."),
  mimeType: z.string()
    .min(1, DOCUMENT_FORMAT_ERROR)
    .max(100),
}).refine((data) => isAllowedDocumentFile(data.fileName, data.mimeType), {
  message: DOCUMENT_FORMAT_ERROR,
  path: ["file"],
});

// ---------------------------------------------------------------------------
// PATCH /api/admin/verifications/:id/transition
// ---------------------------------------------------------------------------

const TransitionRequestBody = z.object({
  toStatus: z.enum(VERIFICATION_STATUSES, {
    errorMap: () => ({ message: `toStatus debe ser: ${VERIFICATION_STATUSES.join(" | ")}` }),
  }).openapi({ example: "aceptada", description: "Nuevo estado de la verificación" }),

  reason: z.string().optional()
    .openapi({ example: "Documentación verificada correctamente", description: "Motivo del cambio de estado" }),
}).openapi({
  description: "Payload para transicionar una solicitud de verificación",
  example: {
    toStatus: "aceptada",
    reason: "Documentación verificada correctamente",
  },
});

// ---------------------------------------------------------------------------
// PATCH /api/verification-documents/:id/review
// ---------------------------------------------------------------------------

const DocumentReviewBody = z.object({
  status: z.enum(["approved", "rejected"], {
    errorMap: () => ({ message: "status debe ser approved o rejected" }),
  }).openapi({ example: "approved", description: "Nuevo estado del documento" }),

  reason: z.string().optional()
    .openapi({ example: "Documento legible y vigente", description: "Motivo de la decisión" }),
}).openapi({
  description: "Payload para revisar un documento (solo admin)",
  example: { status: "approved", reason: "Documento válido y actualizado" },
});

// ---------------------------------------------------------------------------
// Query params
// ---------------------------------------------------------------------------

/** GET /api/catalog?type=service */
const CatalogQuery = z.object({
  type: z.enum(CATALOG_TYPES, {
    errorMap: () => ({ message: `type debe ser: ${CATALOG_TYPES.join(" | ")}` }),
  }).openapi({ example: "service", description: "Tipo de catálogo a listar" }),
});

/** GET /api/admin/verifications?status=en_estudio */
const AdminVerificationsQuery = z.object({
  status: z.enum(VERIFICATION_STATUSES).optional()
    .openapi({ example: "en_estudio", description: "Filtrar por estado de verificación" }),
  entityType: z.enum(ENTITY_TYPES).optional()
    .openapi({ example: "organization", description: "Filtrar por tipo de entidad" }),
});

/** GET /api/admin/verifications/paginated */
const AdminVerificationsPagedQuery = z.object({
  status: z.enum(VERIFICATION_STATUSES).optional()
    .openapi({ example: "en_estudio", description: "Filtrar por estado de verificación" }),
  entityType: z.enum(ENTITY_TYPES).optional()
    .openapi({ example: "organization", description: "Filtrar por tipo de entidad" }),
  search: z.string().optional()
    .openapi({ example: "María", description: "Búsqueda por ownerName u ownerEmail" }),
  limit: z.coerce.number().int().min(1).max(200).default(50)
    .openapi({ example: 50, description: "Máximo de resultados (1-200)" }),
  offset: z.coerce.number().int().min(0).default(0)
    .openapi({ example: 0, description: "Offset para paginación" }),
});

// ---------------------------------------------------------------------------
// Schemas de respuesta
// ---------------------------------------------------------------------------

const CatalogItemResponse = z.object({
  id: z.number().int().openapi({ example: 43 }),
  type: z.string().openapi({ example: "service" }),
  name: z.string().openapi({ example: "Acompañamiento personal" }),
}).openapi({ description: "Entrada del catálogo unificado" });

const DocumentTypeResponse = z.object({
  id: z.number().int().openapi({ example: 1 }),
  code: z.string().openapi({ example: "estatutos" }),
  name: z.string().openapi({ example: "Estatutos de la organización" }),
  entityType: z.string().openapi({ example: "organization" }),
  isRequired: z.boolean().openapi({ example: true }),
}).openapi({ description: "Tipo de documento requerido por tipo de entidad" });

const VerificationRequestResponse = z.object({
  id: z.number().int().openapi({ example: 1 }),
  ownerId: z.string().uuid().openapi({ example: "550e8400-e29b-41d4-a716-446655440000" }),
  entityType: z.string().openapi({ example: "organization" }),
  status: z.string().openapi({ example: "entregada" }),
  rejectionReason: z.string().nullable().optional(),
  submittedAt: z.string().datetime(),
  reviewedBy: z.string().uuid().nullable().optional(),
  reviewedAt: z.string().datetime().nullable().optional(),
}).openapi({ description: "Solicitud de verificación" });

const AdminVerificationsResponse = z.object({
  items: z.array(VerificationRequestResponse.extend({
    ownerName: z.string(),
    ownerEmail: z.string().email(),
  })),
  total: z.number().int().openapi({ example: 150, description: "Total de solicitudes que coinciden con los filtros" }),
  limit: z.number().int().openapi({ example: 50, description: "Límite aplicado" }),
  offset: z.number().int().openapi({ example: 0, description: "Offset aplicado" }),
}).openapi({ description: "Respuesta paginada para la lista de solicitudes de verificación" });

const VerificationDocumentResponse = z.object({
  id: z.number().int().openapi({ example: 1 }),
  ownerId: z.string().uuid().openapi({ example: "550e8400-e29b-41d4-a716-446655440000" }),
  documentTypeId: z.number().int(),
  storageKey: z.string().nullable().openapi({
    example: "documents_verifications/uuid/17385980149240-abc123.pdf",
    description: "null si el administrador eliminó el archivo",
  }),
  status: z.string().openapi({ example: "pending" }),
  rejectionReason: z.string().nullable().optional(),
  uploadedAt: z.string().datetime(),
}).openapi({ description: "Documento de verificación" });

// ---------------------------------------------------------------------------
// Normalizadores
// ---------------------------------------------------------------------------

/**
 * Normaliza el payload de registro de organización.
 * @param {import("./verification.types").OrganizationRegisterInput} payload
 * @returns {Object}
 */
function normalizeOrganizationRegister(payload, userId) {
  return {
    profile: {
      userId,
      organizationTypeId: payload.organizationTypeId,
      taxId: payload.taxId?.trim() || null,
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
    },
    legalRepresentatives: (payload.legalRepresentatives || []).map((r) => ({
      fullName: r.fullName.trim(),
      position: r.position?.trim() || null,
      phone: r.phone?.trim() || null,
      email: r.email?.trim().toLowerCase() || null,
    })),
    disabilityTypeIds: payload.disabilityTypeIds || [],
    serviceIds: payload.serviceIds || [],
  };
}

/**
 * Normaliza el payload de registro de voluntario.
 * @param {import("./verification.types").VolunteerRegisterInput} payload
 * @returns {Object}
 */
function normalizeVolunteerRegister(payload, userId) {
  const entityType = payload.volunteerType === "professional"
    ? "volunteer_professional"
    : "volunteer_non_professional";

  return {
    entityType,
    profile: {
      userId,
      volunteerType: payload.volunteerType,
      documentType: payload.documentType?.trim() || null,
      documentNumber: payload.documentNumber?.trim() || null,
      birthDate: payload.birthDate || null,
      profession: payload.profession?.trim() || null,
      languages: payload.languages?.map((l) => l.trim()) || null,
      availabilityMode: payload.availabilityMode || null,
      hasPriorExperience: payload.hasPriorExperience ?? null,
      transportAvailable: payload.transportAvailable ?? null,
    },
    interestAreaIds: payload.interestAreaIds || [],
    experienceCategoryIds: payload.experienceCategoryIds || [],
  };
}

// ---------------------------------------------------------------------------
// Exports
// ---------------------------------------------------------------------------

module.exports = {
  // Constantes
  VERIFICATION_STATUSES,
  DOCUMENT_STATUSES,
  VOLUNTEER_TYPES,
  AVAILABILITY_MODES,
  ENTITY_TYPES,
  CATALOG_TYPES,
  ALLOWED_TRANSITIONS,
  ALLOWED_DOCUMENT_EXTENSIONS,
  ALLOWED_DOCUMENT_MIME_TYPES,
  DOCUMENT_FORMAT_ERROR,
  DOCUMENT_SIZE_ERROR,
  isAllowedDocumentFile,

  // Schemas Zod — request bodies
  OrganizationRegisterBody,
  VolunteerRegisterBody,
  DocumentUploadBody,
  DocumentFileBody,
  TransitionRequestBody,
  DocumentReviewBody,

  // Schemas Zod — query params
  CatalogQuery,
  AdminVerificationsQuery,
  AdminVerificationsPagedQuery,
  AdminVerificationsResponse,

  // Schemas Zod — respuestas
  CatalogItemResponse,
  DocumentTypeResponse,
  VerificationRequestResponse,
  VerificationDocumentResponse,

  // Normalizadores
  normalizeOrganizationRegister,
  normalizeVolunteerRegister,
};
