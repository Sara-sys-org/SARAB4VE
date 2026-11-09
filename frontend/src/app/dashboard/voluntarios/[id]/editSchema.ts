import { z } from "zod";
import type { AvailabilityMode, UpdateVolunteerProfilePayload, VolunteerProfileResponse, VolunteerType } from "@/types";

// Validación espejo del formulario de registro (mismas reglas del backend),
// pero todos los campos opcionales: editar no debe bloquear si un campo viene
// vacío. Solo se valida el formato cuando el valor está presente.

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHONE_RE = /^\+?[0-9]{7,15}$/;
const MAX_VOLUNTEER_AGE_YEARS = 80;

/** Días aceptados por el backend (tolera con y sin tilde). */
const DAY_CANONICAL: Record<string, string> = {
    lunes: "lunes",
    martes: "martes",
    miercoles: "miércoles",
    miércoles: "miércoles",
    jueves: "jueves",
    viernes: "viernes",
    sabado: "sábado",
    sábado: "sábado",
    domingo: "domingo",
};

/** Día legado (`miercoles`, `sabado`) → valor canónico usado por la UI. */
export function normalizeDay(value: string): string {
    const key = value.trim().toLowerCase();
    return DAY_CANONICAL[key] ?? key;
}

/** Estado editable del formulario — todo como string salvo arrays y location. */
export interface VolunteerEditFormState {
    fullName: string;
    email: string;
    phone: string;
    zone: string;
    location: { lat: number; lng: number } | null;
    volunteerType: VolunteerType | "";
    documentType: string;
    documentNumber: string;
    birthDate: string;
    address: string;
    country: string;
    profession: string;
    /** Idiomas separados por comas — se convierten a array al guardar. */
    languages: string;
    availabilityMode: AvailabilityMode | "";
    hasPriorExperience: "" | "true" | "false";
    transportAvailable: "" | "true" | "false";
    skills: string[];
    availableHours: string;
    availableDays: string[];
    interestAreaIds: number[];
    experienceCategoryIds: number[];
}

/** String opcional con tope de longitud (vacío permitido). */
function optionalText(max: number, message: string) {
    return z.string().trim().max(max, message).optional();
}

/** String opcional con longitud mínima solo cuando hay valor. */
function optionalMinText(min: number, max: number, minMessage: string, maxMessage: string) {
    return z
        .string()
        .trim()
        .max(max, maxMessage)
        .optional()
        .refine((value) => !value || value.length >= min, { message: minMessage });
}

const optionalEmail = z
    .string()
    .trim()
    .optional()
    .refine((value) => !value || EMAIL_RE.test(value), { message: "Correo electrónico inválido" });

// Misma regla que el backend (database allowed values), más permisiva que
// libphonenumber-js para no bloquear la edición de teléfonos legados sin '+'.
const optionalPhone = z
    .string()
    .trim()
    .optional()
    .refine((value) => !value || PHONE_RE.test(value), {
        message: "Ingresa un número de teléfono válido para el país seleccionado",
    });

const optionalBirthDate = z
    .string()
    .trim()
    .optional()
    .refine((value) => !value || (/^\d{4}-\d{2}-\d{2}$/.test(value) && !isNaN(Date.parse(value))), {
        message: "Ingresa una fecha válida (AAAA-MM-DD)",
    })
    .refine((value) => !value || new Date(value) <= new Date(), {
        message: "La fecha de nacimiento no puede ser posterior a hoy",
    })
    .refine((value) => {
        if (!value) return true;
        const minDate = new Date();
        minDate.setFullYear(minDate.getFullYear() - MAX_VOLUNTEER_AGE_YEARS);
        return new Date(value) >= minDate;
    }, { message: `La fecha de nacimiento no puede ser mayor a ${MAX_VOLUNTEER_AGE_YEARS} años atrás` });

const optionalAvailableHours = z
    .string()
    .trim()
    .optional()
    .refine(
        (value) => !value || (/^\d+$/.test(value) && Number(value) >= 1 && Number(value) <= 168),
        { message: "Ingresa entre 1 y 168 horas semanales" },
    );

export const volunteerEditSchema = z.object({
    fullName: optionalMinText(3, 100, "El nombre debe tener al menos 3 caracteres", "El nombre es demasiado largo"),
    email: optionalEmail,
    phone: optionalPhone,
    zone: optionalMinText(2, 120, "Ingresa una zona válida", "La zona es demasiado larga"),
    location: z.object({ lat: z.number(), lng: z.number() }).nullable().optional(),
    volunteerType: z
        .string()
        .optional()
        .refine((value) => !value || value === "professional" || value === "non_professional", {
            message: "Selecciona si es voluntario profesional o no profesional",
        }),
    documentType: optionalText(20, "El tipo de documento no puede exceder 20 caracteres"),
    documentNumber: optionalMinText(
        5,
        30,
        "Ingresa un número de documento de identidad válido",
        "El número de documento no puede exceder 30 caracteres",
    ),
    birthDate: optionalBirthDate,
    address: optionalMinText(5, 300, "Ingresa una dirección válida", "La dirección es demasiado larga"),
    country: optionalText(60, "El país no puede exceder 60 caracteres"),
    profession: optionalText(100, "La profesión no puede exceder 100 caracteres"),
    languages: z.string().trim().optional(),
    availabilityMode: z
        .string()
        .optional()
        .refine((value) => !value || value === "presential" || value === "online" || value === "both", {
            message: "Selecciona una modalidad de disponibilidad válida",
        }),
    hasPriorExperience: z.enum(["", "true", "false"]).optional(),
    transportAvailable: z.enum(["", "true", "false"]).optional(),
    skills: z.array(z.string().trim().min(1, "Las habilidades no pueden estar vacías")).optional(),
    availableHours: optionalAvailableHours,
    availableDays: z
        .array(
            z.string().refine((day) => DAY_CANONICAL[day.trim().toLowerCase()] !== undefined, {
                message: "Selecciona días de la semana válidos",
            }),
        )
        .optional(),
    interestAreaIds: z.array(z.number().int().positive()).optional(),
    experienceCategoryIds: z.array(z.number().int().positive()).optional(),
});

export type EditFieldErrors = Partial<Record<keyof VolunteerEditFormState, string>>;

/** Igual que `getFieldErrors` de registro: primer mensaje por campo raíz. */
export function getEditFieldErrors(data: unknown): EditFieldErrors {
    const result = volunteerEditSchema.safeParse(data);
    if (result.success) return {};

    const errors: EditFieldErrors = {};
    for (const issue of result.error.issues) {
        const field = issue.path[0] as keyof VolunteerEditFormState;
        if (!errors[field]) {
            errors[field] = issue.message;
        }
    }
    return errors;
}

function toBooleanString(value: boolean | null | undefined): "" | "true" | "false" {
    if (value === true) return "true";
    if (value === false) return "false";
    return "";
}

/** Estado inicial del formulario a partir del perfil que devuelve el GET. */
export function toVolunteerFormState(perfil: VolunteerProfileResponse): VolunteerEditFormState {
    const { user, details, volunteerProfile } = perfil;

    return {
        fullName: user.fullName ?? "",
        email: user.email ?? "",
        phone: user.phone ?? "",
        zone: user.zone ?? "",
        location: user.location ?? null,
        volunteerType: volunteerProfile?.volunteerType ?? "",
        documentType: volunteerProfile?.documentType ?? "",
        documentNumber: volunteerProfile?.documentNumber ?? "",
        // El backend puede devolver un timestamp completo; el input date espera YYYY-MM-DD.
        birthDate: volunteerProfile?.birthDate ? volunteerProfile.birthDate.slice(0, 10) : "",
        address: volunteerProfile?.address ?? "",
        country: volunteerProfile?.country ?? "",
        profession: volunteerProfile?.profession ?? "",
        languages: (volunteerProfile?.languages ?? []).join(", "),
        availabilityMode: volunteerProfile?.availabilityMode ?? "",
        hasPriorExperience: toBooleanString(volunteerProfile?.hasPriorExperience),
        transportAvailable: toBooleanString(volunteerProfile?.transportAvailable),
        skills: (details?.skills ?? []).filter((skill) => Boolean(skill)),
        availableHours: details?.availableHours != null ? String(details.availableHours) : "",
        availableDays: (details?.availableDays ?? []).filter((day) => Boolean(day)).map(normalizeDay),
        interestAreaIds: perfil.interestAreas.map((item) => item.id),
        experienceCategoryIds: perfil.experience.map((item) => item.id),
    };
}

/** Campos de identidad a nivel de usuario: requeridos/únicos, nunca se vacían. */
type IdentityStringPayloadKey = "fullName" | "email" | "phone" | "zone";

/** Campos nullable de volunteer_profiles: un string vacío los borra (null). */
type ProfileStringPayloadKey = "documentType" | "documentNumber" | "address" | "country" | "profession";

function parseLanguages(value: string): string[] {
    return value
        .split(",")
        .map((part) => part.trim())
        .filter(Boolean);
}

/**
 * Mapea el estado del formulario al payload del PATCH. Los campos de
 * volunteer_profiles (documentType, documentNumber, address, profession) se
 * envían SIEMPRE con su valor recortado, incluido "" cuando el admin los
 * limpia: el backend convierte "" en null, así que un campo vacío borra el
 * dato. Los campos de identidad a nivel de usuario (fullName, email, phone,
 * zone) se omiten si vienen vacíos porque son requeridos/únicos y un "" los
 * corrompería o provocaría un 400.
 */
export function buildUpdatePayload(form: VolunteerEditFormState): UpdateVolunteerProfilePayload {
    const payload: UpdateVolunteerProfilePayload = {};

    const setIdentity = (key: IdentityStringPayloadKey, value: string) => {
        const trimmed = value.trim();
        if (trimmed) payload[key] = trimmed;
    };

    const setProfile = (key: ProfileStringPayloadKey, value: string) => {
        payload[key] = value.trim();
    };

    setIdentity("fullName", form.fullName);
    setIdentity("email", form.email);
    setIdentity("phone", form.phone);
    setIdentity("zone", form.zone);

    setProfile("documentType", form.documentType);
    setProfile("documentNumber", form.documentNumber);
    setProfile("address", form.address);
    setProfile("country", form.country);
    setProfile("profession", form.profession);

    if (form.location) payload.location = form.location;

    // birthDate vacío rompe la validación del backend (Date.parse), se omite.
    const birthDate = form.birthDate.trim();
    if (birthDate) payload.birthDate = birthDate;

    // Los enums no se pueden limpiar a null: "Sin especificar" omite el campo.
    if (form.volunteerType) payload.volunteerType = form.volunteerType;
    if (form.availabilityMode) payload.availabilityMode = form.availabilityMode;
    if (form.hasPriorExperience) payload.hasPriorExperience = form.hasPriorExperience === "true";
    if (form.transportAvailable) payload.transportAvailable = form.transportAvailable === "true";

    const availableHours = form.availableHours.trim();
    if (availableHours) payload.availableHours = Number(availableHours);

    // skills y availableDays son requeridos con min(1) por el schema de
    // registro: enviar [] provocaría un 400, así que se omiten y el backend
    // conserva los valores actuales.
    const skills = form.skills.map((skill) => skill.trim()).filter(Boolean);
    if (skills.length > 0) payload.skills = skills;

    const availableDays = form.availableDays.map(normalizeDay).filter(Boolean);
    if (availableDays.length > 0) payload.availableDays = availableDays;

    payload.languages = parseLanguages(form.languages);

    // Los catálogos se envían completos (incluido []) para que las
    // eliminaciones surtan efecto.
    payload.interestAreaIds = form.interestAreaIds;
    payload.experienceCategoryIds = form.experienceCategoryIds;

    return payload;
}
