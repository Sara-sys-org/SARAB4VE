export type AccessibilityTag = "rampas" | "banio" | "lengua_senas" | "animales";
export type ServiceTag = "wifi" | "salud" | "comida";

// ── Tipos del mapa (unificado) ──────────────────────────────────────────────

export type MapItemKind = "emergency" | "help_request" | "shelter";

export type UrgencyLevel = "low" | "medium" | "high" | "critical";
export type EmergencyStatus = "received" | "assigned" | "resolved";
export type HelpRequestStatus = "open" | "assigned" | "resolved";
export type DisabilityType = "visual" | "auditiva" | "neuro" | "motriz";

/** Interfaz común para cualquier elemento pintable en el mapa. */
export interface MapItem {
    kind: MapItemKind;
    id: string;
    // Sin coordenadas cuando la solicitud se envió sin geolocalización —
    // igual se debe poder listar/consultar, solo no se pinta en el mapa.
    lat: number | null;
    lng: number | null;
    urgency: UrgencyLevel;
    status: string;
    createdAt: string;
    // Emergencia
    requesterName?: string;
    // Emergencia: union fija (visual/auditiva/neuro/motriz). Help request:
    // catálogo de 11 tipos en español (Visual, Física, Otras, ...). Se
    // amplía a `string` para admitir ambos dominios sin duplicar el campo.
    disabilityType?: DisabilityType | string;
    disabilityOtherNote?: string;
    disabilitySubcategory?: string;
    communicationMode?: string | null;
    needType?: string;
    description?: string;
    isInjured?: boolean;
    cannotMove?: boolean;
    extraInfo?: string;
    voiceNoteUrl?: string | null;
    voiceNoteDurationSec?: number | null;
    // Help Request
    contactMethod?: string;
    contactValue?: string;
    gender?: string;
    age?: number;
    volunteerName?: string;
    volunteerContactMethod?: string | null;
    volunteerContactValue?: string | null;
    // Timestamps
    assignedAt?: string | null;
    resolvedAt?: string | null;
    updatedAt?: string | null;
    // Refugio (heredado)
    name?: string;
    address?: string;
    country?: string;
    sector?: string;
    tags?: AccessibilityTag[];
    services?: ServiceTag[];
    distance?: string;
    distanceKm?: number;
    imagen?: string;
}

/** MapItem con coordenadas garantizadas — lo que efectivamente puede pintarse como marcador. */
export type MapItemWithCoords = MapItem & { lat: number; lng: number };

// ── LeafletMap ──────────────────────────────────────────────────────────────

export interface LeafletMapProps {
    shelters?: iRefugio[];
    selectedId: string | null;
    onSelect: (id: string | null) => void;
    mapItems?: MapItemWithCoords[];
    /** Centro inicial del mapa [lat, lng]. Si no se provee, usa Caracas por defecto. */
    initialCenter?: [number, number] | null;
}

// ── Refugio ────────────────────────────────────────────────────────────────

export interface iRefugio {
    id: string;
    name: string;
    address: string;
    sector: string;
    status: "activo" | "lleno" | "cerrado";
    tags: AccessibilityTag[];
    services: ServiceTag[];
    lat: number;
    lng: number;
    distance: string;
    imagen?: string;
}

// -------- Base Person Register ---------------------

interface BaseUserForm {
    fullName: string;
    email: string;
    phone: string;
    password: string;
    location: { lat: number; lng: number } | null;
    zone: string;
}

// ----------- Volunteer ------------------------

export const SKILLS = [
    { value: 'primeros_auxilios', label: 'Primeros Auxilios' },
    { value: 'logistica', label: 'Logística' },
    { value: 'transporte', label: 'Transporte' },
    { value: 'psicología', label: 'Psicología' },
    { value: 'idiomas', label: 'Idiomas' },
    { value: 'rescate', label: 'Rescate' },
    { value: 'comunicaciones', label: 'Comunicaciones' }
];

export const DAYS_WEEKEND = [
    { value: 'lunes', label: 'Lunes' },
    { value: 'martes', label: 'Martes' },
    { value: 'miércoles', label: 'Miércoles' },
    { value: 'jueves', label: 'Jueves' },
    { value: 'viernes', label: 'Viernes' },
    { value: 'sábado', label: 'Sábado' },
    { value: 'domingo', label: 'Domingo' }
]

export interface iVolunteerForm extends BaseUserForm {
    skills: string[];
    availableHours: number;
    availableDays: string[];
    acceptedTerms: boolean;

    // Datos personales adicionales
    documentNumber: string;
    birthDate: string;
    address: string;
    country: string;

    // Tipo de perfil
    volunteerType: "professional" | "non_professional" | "";

    // Perfil profesional
    profession: string;
    languages: string[];
    experienceCategories: string[];

    // Disponibilidad (compartido entre ambos perfiles)
    scheduleHours: number[];
    modalityPresential: boolean;
    modalityOnline: boolean;

    // Áreas de interés (compartido, opciones varían según perfil)
    interestAreas: string[];

    // Perfil no profesional
    hasPriorExperience: boolean | null;
}


export interface iInfoVolunteer extends Omit<iVolunteerForm, "password"> {
    id: string;
    status: STATUS_USERS;
}


// ---------- Organitations ---------------------


export interface iOrganizationForm extends BaseUserForm {
    organizationName: string;
    legalDocument: string;
    workArea: string[];
    acceptedTerms: boolean;

    // Identificación fiscal
    countryFiscal: string;
    fiscalIdType: string;
    fiscalNumber: string;

    // Tipo de entidad
    entityType: string;
    otherEntityType: string;

    // Datos legales
    registrationNumber: number;
    constitutionDate: string;
    legalAddress: string;
    legalCountry: string;
    province: string;
    city: string;

    // Representante legal
    legalRepresentativeName: string;
    legalRepresentativePosition: string;
    legalRepresentativePhone: string;
    legalRepresentativeEmail: string;

    // Información institucional
    website: string;
    socialMedia: string;
    mission: string;
    vision: string;
    scope: string;
    collectiveServed: string;

    // Discapacidades y servicios
    disabilityTypes: string[];
    services: string;

    // Documentos
    documents: {
        cif: string;
        estatutos: string;
        inscripcion: string;
        id_representante: string;
        certificado_fiscal: string;
        seguro_responsabilidad: string;
        politica_proteccion_datos: string;
        codigo_etico: string;
        politica_accesibilidad: string;
    };
}



export const WORK_AREAS = [
    { value: "alimentacion", label: "Alimentación" },
    { value: "salud", label: "Salud" },
    { value: "refugio", label: "Refugio" },
    { value: "logistica", label: "Logística" },
    { value: "rescate", label: "Rescate" },
    { value: "psicosocial", label: "Apoyo psicosocial" },
];

export interface iInfoOrganization extends Omit<iOrganizationForm, "password"> {
    id: string;
    status: STATUS_USERS;
}

// -------- Login Usuario -----------------

export interface UserLogin {
    email: string;
    password: string;
}

export type ROLES_USER = 'admin' | 'organization' | 'volunteer' | 'citizen';


// ----------- Panel Usuarios ---------------

export type STATUS_USERS = 'pending' | 'approved' | 'rejected' | 'suspended';


export interface ApiUser {
    id: string;
    fullName: string;
    email: string;
    phone: string;
    role: ROLES_USER;
    status: STATUS_USERS;
    location: { lat: number; lng: number } | null;
    zone: string | null;
    phoneVerified: boolean;
    emailVerified: boolean;
    createdAt: string;
    updatedAt: string;
    /** Perfil de discapacidad — solo presente para ciudadanos (GET /api/users/:id). */
    citizenProfile?: CitizenProfile | null;
    /** Nombre real de la organización (user_details.organization_name) — solo presente para organizaciones; `fullName` guarda al representante legal, no el nombre de la organización. */
    organizationName?: string | null;
    /** País — de organization_profiles.country o volunteer_profiles.country según el rol; no existe para citizen/admin. */
    country?: string | null;
}

/** Perfil de discapacidad persistente de un ciudadano (citizen_profiles). */
export interface CitizenProfile {
    userId: string;
    disabilityType: DisabilityType | null;
    disabilitySubcategory: string | null;
    communicationMode: string | null;
    country: string | null;
    createdAt: string;
    updatedAt: string;
}

export interface ListUsersResponse {
    data: {
        users: ApiUser[];
        total: number;
        limit: number;
        offset: number;
    };
}

export interface UserStatsByRole {
    total: number;
    pending: number;
    approved: number;
    rejected: number;
    suspended: number;
}

export type UserStats = Record<ROLES_USER, UserStatsByRole>;

export interface ListUsersParams {
    role?: ROLES_USER;
    roles?: ROLES_USER[];
    status?: STATUS_USERS;
    search?: string;
    limit?: number;
    offset?: number;
}

export interface IdParam {
    id: string;
}

// ── Perfil completo de organización (GET /api/users/:id/organization-profile) ─────────────

/** Ítem del catálogo unificado (disability_types, services, etc.). */
export interface CatalogItem {
    id: number;
    name: string;
    type: string;
}

/** Representante legal de una organización. */
export interface LegalRepresentative {
    id: number;
    fullName: string;
    position: string;
    phone: string;
    email: string;
    createdAt: string;
}

/** Perfil extendido de organización (organization_profiles). */
export interface OrganizationProfile {
    userId: string;
    organizationTypeId: number;
    organizationTypeName: string | null;
    taxId: string | null;
    taxIdType: string | null;
    otherEntityType: string | null;
    registryNumber: string | null;
    foundedAt: string | null;
    country: string | null;
    province: string | null;
    city: string | null;
    address: string | null;
    website: string | null;
    socialLinks: Record<string, string> | null;
    mission: string | null;
    vision: string | null;
    scope: string | null;
    servedGroups: string | null;
    createdAt: string;
    updatedAt: string;
}

/** Estados de una solicitud de verificación. */
export type VerificationStatus = "entregada" | "en_estudio" | "rechazada" | "aceptada";

/** Estados de un documento de verificación. */
export type DocumentStatus = "pending" | "approved" | "rejected";

/** Solicitud de verificación de una organización. */
export interface VerificationRequest {
    id: number;
    ownerId: string;
    entityType: string;
    status: VerificationStatus;
    rejectionReason: string | null;
    submittedAt: string;
    reviewedBy: string | null;
    reviewedAt: string | null;
}

/** Documento cargado en el proceso de verificación. */
export interface VerificationDocument {
    id: number;
    documentTypeId: number;
    /** null si un administrador eliminó el archivo (el documento se conserva). */
    storageKey: string | null;
    /** true solo si el documento tiene un archivo guardado y accesible. */
    hasFile: boolean;
    status: DocumentStatus;
    rejectionReason: string | null;
    uploadedAt: string;
    reviewedBy: string | null;
    reviewedAt: string | null;
    documentTypeCode: string;
    documentTypeName: string;
}

/** Respuesta completa del endpoint de perfil de organización. */
export interface OrganizationProfileResponse {
    user: ApiUser;
    organizationProfile: OrganizationProfile | null;
    legalRepresentatives: LegalRepresentative[];
    disabilityTypes: CatalogItem[];
    services: CatalogItem[];
    verification: VerificationRequest | null;
    documents: VerificationDocument[];
}

/** Representante legal enviado en escritura — sin id/createdAt (los genera el backend). */
export interface LegalRepresentativeInput {
    fullName: string;
    position?: string;
    phone?: string;
    email?: string;
}

/**
 * Payload de `PATCH /api/users/:id/organization-profile` (solo admin).
 * Todos los campos son opcionales; el backend aplica las mismas reglas del
 * formulario de registro. Editar NO cambia el estado de verificación.
 */
export interface UpdateOrganizationProfilePayload {
    fullName?: string;
    email?: string;
    phone?: string;
    zone?: string;
    location?: { lat: number; lng: number } | null;
    organizationName?: string;
    legalDocument?: string;
    workArea?: string[];
    organizationTypeId?: number;
    taxId?: string;
    taxIdType?: string;
    otherEntityType?: string;
    registryNumber?: string;
    foundedAt?: string;
    country?: string;
    province?: string;
    city?: string;
    address?: string;
    website?: string;
    socialLinks?: Record<string, string>;
    mission?: string;
    vision?: string;
    scope?: string;
    servedGroups?: string;
    legalRepresentatives?: LegalRepresentativeInput[];
    disabilityTypeIds?: number[];
    serviceIds?: number[];
}

// ── Perfil completo de voluntario (GET /api/users/:id/volunteer-profile) ─────────────

export type VolunteerType = "professional" | "non_professional";
export type AvailabilityMode = "presential" | "online" | "both";

/** Perfil extendido de voluntario (volunteer_profiles). */
export interface VolunteerProfile {
    userId: string;
    volunteerType: VolunteerType;
    documentType: string | null;
    documentNumber: string | null;
    birthDate: string | null;
    address: string | null;
    country: string | null;
    profession: string | null;
    languages: string[] | null;
    availabilityMode: AvailabilityMode | null;
    hasPriorExperience: boolean | null;
    transportAvailable: boolean | null;
    createdAt: string;
    updatedAt: string;
}

/** Disponibilidad y habilidades de un voluntario (user_details). */
export interface VolunteerDetails {
    userId: string;
    skills: string[] | null;
    availableHours: number | null;
    availableDays: string[] | null;
    acceptedTerms: boolean | null;
    termsAcceptedAt: string | null;
}

/** Respuesta completa del endpoint de perfil de voluntario. */
export interface VolunteerProfileResponse {
    user: ApiUser;
    details: VolunteerDetails | null;
    volunteerProfile: VolunteerProfile | null;
    interestAreas: CatalogItem[];
    experience: CatalogItem[];
    verification: VerificationRequest | null;
    documents: VerificationDocument[];
}

/**
 * Payload de `PATCH /api/users/:id/volunteer-profile` (solo admin).
 * Todos los campos son opcionales; el backend aplica las mismas reglas del
 * formulario de registro. Editar NO cambia el estado de verificación.
 */
export interface UpdateVolunteerProfilePayload {
    fullName?: string;
    email?: string;
    phone?: string;
    zone?: string;
    location?: { lat: number; lng: number } | null;
    skills?: string[];
    availableHours?: number;
    availableDays?: string[];
    volunteerType?: VolunteerType;
    documentType?: string;
    documentNumber?: string;
    birthDate?: string;
    address?: string;
    country?: string;
    profession?: string;
    languages?: string[];
    availabilityMode?: AvailabilityMode;
    hasPriorExperience?: boolean;
    transportAvailable?: boolean;
    interestAreaIds?: number[];
    experienceCategoryIds?: number[];
}

// -------- Perfil administrador - Registro ----------------------

export interface iAdmin extends BaseUserForm {
    adminSecret: string;
}

export const USE_MOCK=false;

// ── Procesamiento asíncrono de emergencias por voz ──────────────────────────

export type ProcessingStatus = "recibida" | "procesando" | "completa" | "pendiente_revision" | "error";

export type ProcessingStep = 
  | "audio_uploaded" 
  | "transcribing" 
  | "transcribed" 
  | "extracting" 
  | "data_extracted" 
  | "completed"
  | "error";

export interface EmergencyProcessingUpdate {
  emergencyId: string;
  processingStatus: ProcessingStatus;
  step?: ProcessingStep;
  message?: string;
  audioUrl?: string;
  transcript?: string;
  transcriptMethod?: string;
  infoEmergencia?: EmergencyExtractedInfo | null;
  processingError?: string;
  timestamp: string;
}

export interface EmergencyExtractedInfo {
  tipo: string | null;
  severidad: "baja" | "media" | "alta" | null;
  personasAfectadas: number | null;
  resumen: string;
  palabrasClaveDetectadas: string[];
  metodoExtraccion: "ia" | "diccionario";
  isInjured: boolean;
  cannotMove: boolean;
  disabilityType?: string | null;
  communicationMode?: string | null;
  disabilitySubcategory?: string | null;
  name?: string | null;
}

export interface WebSocketMessage {
  type: "subscribed" | "emergency_update";
  emergencyId?: string;
  data?: EmergencyProcessingUpdate;
  timestamp: string;
}

// ── Módulo de Chat (Conversations + Messages) ───────────────────────────────

export type ConversationStatus = "open" | "closed";

export interface Conversation {
  id: string;
  emergencyId: string | null;
  helpRequestId: string | null;
  attendedBy: string;
  status: ConversationStatus;
  createdAt: string;
  updatedAt: string;
}

export interface Message {
  id: string;
  conversationId: string;
  senderUserId: string | null; // null = ciudadano anónimo
  body: string;
  createdAt: string;
  readAt: string | null;
}

/** Estado de envío del mensaje en el cliente */
export type MessageSendStatus = "sending" | "sent" | "failed";

export interface MessageWithStatus extends Message {
  sendStatus: MessageSendStatus;
}

export interface WebSocketChatMessage {
  type: "new_message" | "message_read";
  conversationId: string;
  message: Message;
}