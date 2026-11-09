/**
 * Traduce nuestro formData (iVolunteerForm) al payload extendido que
 * POST /api/auth/register/volunteer acepta (auth.schema.js#RegisterVolunteerBody).
 *
 * Los IDs de catálogo están hardcodeados a partir del orden exacto del seed SQL
 * (backend/sql/verification_schema.sql). No hay forma de reemplazar esto por una
 * llamada a getCatalog() porque ese endpoint requiere estar autenticado y estos
 * IDs se necesitan antes del paso 1 (todavía no hay token). Si el seed cambia de
 * orden entre entornos, este mapeo hay que actualizarlo a mano.
 */
import type { VolunteerFormData } from "./schema";
import type { VolunteerPayload } from "@/api/volunteer";

// IDs 23-33 — deben coincidir textualmente con INTEREST_AREAS_PROFESSIONAL en constants.ts
// IDs 34-35 — deben coincidir textualmente con INTEREST_AREAS_NON_PROFESSIONAL en constants.ts
export const INTEREST_AREA_CATALOG_IDS: Record<string, number> = {
    "Acompañamiento": 23,
    "Accesibilidad": 24,
    "Tecnología": 25,
    "Apoyo emocional": 26,
    "Gestión administrativa": 27,
    "Comunicación": 28,
    "Traducción": 29,
    "Lengua de signos": 30,
    "Braille": 31,
    "Guía acompañante": 32,
    "Mentoría": 33,
    "Medio de transporte": 34,
    "Logística": 35,
};

// IDs 36-42 — deben coincidir textualmente con EXPERIENCE_CATEGORIES en constants.ts
export const EXPERIENCE_CATEGORY_CATALOG_IDS: Record<string, number> = {
    "Voluntariado": 36,
    "Atención social": 37,
    "Discapacidad": 38,
    "Sanidad": 39,
    "Educación": 40,
    "Tecnología": 41,
    "Psicología": 42,
};

function deriveAvailabilityMode(
    presential: boolean,
    online: boolean
): "presential" | "online" | "both" | undefined {
    if (presential && online) return "both";
    if (presential) return "presential";
    if (online) return "online";
    return undefined;
}

/**
 * Construye el payload para POST /api/auth/register/volunteer a partir
 * del formData ya validado por volunteerSchema (VolunteerFormData).
 */
export function buildVolunteerRegisterPayload(
    formData: VolunteerFormData
): VolunteerPayload {
    const interestAreaIds = formData.interestAreas
        .map((area) => INTEREST_AREA_CATALOG_IDS[area])
        .filter((id): id is number => typeof id === "number");

    const experienceCategoryIds = (formData.experienceCategories || [])
        .map((category) => EXPERIENCE_CATEGORY_CATALOG_IDS[category])
        .filter((id): id is number => typeof id === "number");

    return {
        fullName: formData.fullName,
        email: formData.email,
        phone: formData.phone,
        password: formData.password,
        location: formData.location,
        zone: formData.zone,
        skills: formData.skills,
        availableHours: formData.availableHours,
        availableDays: formData.availableDays,
        acceptedTerms: true as const,

        volunteerType: formData.volunteerType === "professional" ? "professional" : "non_professional",
        documentType: "cedula",
        documentNumber: formData.documentNumber,
        birthDate: formData.birthDate,
        address: formData.address || undefined,
        country: formData.country || undefined,
        profession: formData.profession || undefined,
        languages: formData.languages && formData.languages.length > 0 ? formData.languages : undefined,
        availabilityMode: deriveAvailabilityMode(formData.modalityPresential, formData.modalityOnline),
        hasPriorExperience: formData.hasPriorExperience ?? undefined,
        interestAreaIds: interestAreaIds.length > 0 ? interestAreaIds : undefined,
        experienceCategoryIds: experienceCategoryIds.length > 0 ? experienceCategoryIds : undefined,
    };
}
