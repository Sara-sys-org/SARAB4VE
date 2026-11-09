/**
 * Esquema — constantes, validación y normalización para el dominio de help-requests.
 */
const { isBlank, isFiniteNumber, isUuid, toNumber } = require("../../lib/validation");

// ---------------------------------------------------------------------------
// Constantes
// ---------------------------------------------------------------------------

const NEED_TYPES = [
  "equipment",
  "medication",
  "transport",
  "companionship",
  "interpreter",
  "accessible_information",
  "neurodivergent_support",
  "psychosocial_support",
];

const URGENCY_LEVELS = ["low", "medium", "high", "critical"];
const REQUEST_STATUSES = ["open", "assigned", "resolved"];
const DEFAULT_RADIUS_KM = 10;
const MAX_RADIUS_KM = 100;

// Mismo catálogo de 11 tipos que usan los formularios de registro de
// voluntario/organización (backend/sql/verification_schema.sql), como
// texto libre (sin FK al catálogo, que está pensado para roles
// autenticados) — "Otras" habilita disabilityOtherNote.
const DISABILITY_TYPES = [
  "Visual",
  "Auditiva",
  "Física",
  "Intelectual",
  "Psicosocial",
  "TEA",
  "Daño cerebral",
  "Discapacidad orgánica/visceral",
  "Enfermedades raras",
  "Multidiscapacidad",
  "Otras",
];

const MIN_AGE = 0;
const MAX_AGE = 120;

const NEED_TYPE_SET = new Set(NEED_TYPES);
const URGENCY_LEVEL_SET = new Set(URGENCY_LEVELS);
const REQUEST_STATUS_SET = new Set(REQUEST_STATUSES);
const DISABILITY_TYPE_SET = new Set(DISABILITY_TYPES);

// ---------------------------------------------------------------------------
// Normalización — creación
// ---------------------------------------------------------------------------

/**
 * @param {Object} payload
 * @param {string|null} [userId] — id del usuario autenticado (opcional)
 * @returns {Object}
 */
function normalizeCreateHelpRequest(payload, userId) {
  const hasLat = payload.latitude != null && payload.latitude !== "";
  const hasLng = payload.longitude != null && payload.longitude !== "";
  const hasAge = payload.age != null && payload.age !== "";
  const disabilityType = payload.disabilityType ? payload.disabilityType.trim() : null;

  return {
    userId: userId || null,
    requesterName: payload.requesterName.trim(),
    contactMethod: payload.contactMethod.trim(),
    contactValue: payload.contactValue.trim(),
    needType: payload.needType,
    description: payload.description.trim(),
    latitude: hasLat && hasLng ? Number(payload.latitude) : null,
    longitude: hasLat && hasLng ? Number(payload.longitude) : null,
    urgency: payload.urgency || "medium",
    address: payload.address ? payload.address.trim() : null,
    country: payload.country ? payload.country.trim() : null,
    gender: payload.gender ? payload.gender.trim() : null,
    age: hasAge ? Number(payload.age) : null,
    disabilityType,
    disabilityOtherNote:
      disabilityType === "Otras" && payload.disabilityOtherNote
        ? payload.disabilityOtherNote.trim()
        : null,
  };
}

// ---------------------------------------------------------------------------
// Validación — creación
// ---------------------------------------------------------------------------

/**
 * @param {Object} payload
 * @returns {{ isValid: boolean, errors: string[] }}
 */
function validateCreateHelpRequest(payload) {
  const errors = [];

  if (isBlank(payload.requesterName)) {
    errors.push("requesterName is required");
  }

  if (isBlank(payload.contactMethod)) {
    errors.push("contactMethod is required");
  }

  if (isBlank(payload.contactValue)) {
    errors.push("contactValue is required");
  }

  if (!NEED_TYPE_SET.has(payload.needType)) {
    errors.push("needType is invalid");
  }

  if (isBlank(payload.description)) {
    errors.push("description is required");
  }

  // latitude — opcional (acepta string numérico, ej: "10.03")
  const hasLat = payload.latitude != null && payload.latitude !== "";
  const hasLng = payload.longitude != null && payload.longitude !== "";

  if (hasLat) {
    const lat = toNumber(payload.latitude);
    if (!Number.isFinite(lat) || lat < -90 || lat > 90) {
      errors.push("latitude must be a valid coordinate");
    }
  }

  // longitude — opcional (acepta string numérico, ej: "-70.41")
  if (hasLng) {
    const lng = toNumber(payload.longitude);
    if (!Number.isFinite(lng) || lng < -180 || lng > 180) {
      errors.push("longitude must be a valid coordinate");
    }
  }

  // Si se proporciona una coordenada, la otra también debe venir
  if (hasLat !== hasLng) {
    errors.push("latitude and longitude must be provided together");
  }

  if (payload.urgency && !URGENCY_LEVEL_SET.has(payload.urgency)) {
    errors.push("urgency is invalid");
  }

  // age — opcional (acepta string numérico desde multipart/form-data)
  const hasAge = payload.age != null && payload.age !== "";
  if (hasAge) {
    const age = toNumber(payload.age);
    if (!Number.isFinite(age) || !Number.isInteger(age) || age < MIN_AGE || age > MAX_AGE) {
      errors.push(`age must be an integer between ${MIN_AGE} and ${MAX_AGE}`);
    }
  }

  if (payload.disabilityType && !DISABILITY_TYPE_SET.has(payload.disabilityType)) {
    errors.push("disabilityType is invalid");
  }

  return {
    isValid: errors.length === 0,
    errors,
  };
}

// ---------------------------------------------------------------------------
// Validación — búsqueda
// ---------------------------------------------------------------------------

/**
 * @param {Object} query — req.query sin procesar
 * @returns {{ isValid: boolean, errors: string[], filters: Object }}
 */
function validateSearchHelpRequests(query) {
  const errors = [];
  const hasLatitude = query.latitude !== undefined;
  const hasLongitude = query.longitude !== undefined;
  const hasRadius = query.radiusKm !== undefined;
  const hasGeoFilter = hasLatitude || hasLongitude || hasRadius;

  // Parse status as comma-separated array
  let statuses = null;
  if (query.status) {
    const statusArray = query.status.split(",").map(s => s.trim()).filter(Boolean);
    const invalid = statusArray.find(s => !REQUEST_STATUS_SET.has(s));
    if (invalid) {
      errors.push(`status "${invalid}" is invalid`);
    } else {
      statuses = statusArray;
    }
  }

  // Orden por fecha de creación — "desc" (más recientes primero, default) o "asc"
  let sortOrder = "desc";
  if (query.sortOrder !== undefined) {
    if (query.sortOrder !== "asc" && query.sortOrder !== "desc") {
      errors.push("sortOrder must be 'asc' or 'desc'");
    } else {
      sortOrder = query.sortOrder;
    }
  }

  if (!hasGeoFilter) {
    return {
      isValid: errors.length === 0,
      errors,
      filters: {
        hasGeoFilter: false,
        latitude: null,
        longitude: null,
        radiusKm: null,
        statuses,
        sortOrder,
      },
    };
  }

  if (!hasLatitude || !hasLongitude) {
    errors.push("latitude and longitude are required together");
  }

  const latitude = hasLatitude ? toNumber(query.latitude) : null;
  const longitude = hasLongitude ? toNumber(query.longitude) : null;
  const radiusKm = hasRadius ? toNumber(query.radiusKm) : DEFAULT_RADIUS_KM;

  if (hasLatitude && (!Number.isFinite(latitude) || latitude < -90 || latitude > 90)) {
    errors.push("latitude must be a valid coordinate");
  }

  if (hasLongitude && (!Number.isFinite(longitude) || longitude < -180 || longitude > 180)) {
    errors.push("longitude must be a valid coordinate");
  }

  if (!Number.isFinite(radiusKm) || radiusKm <= 0 || radiusKm > MAX_RADIUS_KM) {
    errors.push(`radiusKm must be between 0 and ${MAX_RADIUS_KM}`);
  }

  return {
    isValid: errors.length === 0,
    errors,
    filters: {
      hasGeoFilter: true,
      latitude,
      longitude,
      radiusKm,
      statuses,
      sortOrder,
    },
  };
}

// ---------------------------------------------------------------------------
// Normalización — aceptación
// ---------------------------------------------------------------------------

/**
 * @param {Object} payload
 * @returns {Object}
 */
function normalizeAcceptHelpRequest(payload) {
  return {
    volunteerName: payload.volunteerName.trim(),
    volunteerContactMethod: payload.volunteerContactMethod.trim(),
    volunteerContactValue: payload.volunteerContactValue.trim(),
  };
}

// ---------------------------------------------------------------------------
// Validación — aceptación
// ---------------------------------------------------------------------------

/**
 * @param {Object} payload
 * @returns {{ isValid: boolean, errors: string[] }}
 */
function validateAcceptHelpRequest(payload) {
  const errors = [];

  if (isBlank(payload.volunteerName)) {
    errors.push("volunteerName is required");
  }

  if (isBlank(payload.volunteerContactMethod)) {
    errors.push("volunteerContactMethod is required");
  }

  if (isBlank(payload.volunteerContactValue)) {
    errors.push("volunteerContactValue is required");
  }

  return {
    isValid: errors.length === 0,
    errors,
  };
}

module.exports = {
  // constantes
  NEED_TYPES,
  URGENCY_LEVELS,
  REQUEST_STATUSES,
  DISABILITY_TYPES,
  DEFAULT_RADIUS_KM,
  MAX_RADIUS_KM,
  MIN_AGE,
  MAX_AGE,
  NEED_TYPE_SET,
  URGENCY_LEVEL_SET,
  REQUEST_STATUS_SET,
  DISABILITY_TYPE_SET,
  // utilidades re-exportadas
  isBlank,
  isFiniteNumber,
  isUuid,
  toNumber,
  // normalización
  normalizeCreateHelpRequest,
  normalizeAcceptHelpRequest,
  // validación
  validateCreateHelpRequest,
  validateSearchHelpRequests,
  validateAcceptHelpRequest,
};
