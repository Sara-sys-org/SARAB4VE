import { z } from "zod";
import { isValidPhoneNumber } from "libphonenumber-js";
import { COUNTRIES } from "@/lib/countries";

const MAX_VOLUNTEER_AGE_YEARS = 80;

export const volunteerSchema = z.object({
  fullName: z
    .string()
    .trim()
    .min(3, "El nombre debe tener al menos 3 caracteres")
    .max(100, "El nombre es demasiado largo"),

  email: z
    .string()
    .trim()
    .email("Correo electrónico inválido"),

  phone: z
    .string()
    .trim()
    .refine((val) => isValidPhoneNumber(val), {
      message: "Ingresa un número de teléfono válido para el país seleccionado",
    }),

  password: z
    .string()
    .min(8, "La contraseña debe tener al menos 8 caracteres"),

  location: z
    .object({
      lat: z.number(),
      lng: z.number(),
    })
    .nullable()
    .refine((val) => val !== null, "Selecciona tu ubicación en el mapa"),

  zone: z
    .string()
    .trim()
    .min(2, "Ingresa una zona válida"),

  skills: z
    .array(z.string())
    .min(1, "Selecciona al menos una habilidad"),

  availableHours: z
    .number()
    .min(1, "Ingresa al menos 1 hora disponible")
    .max(168, "No puede superar las 168 horas semanales"),

  availableDays: z
    .array(z.string())
    .min(1, "Selecciona al menos un día disponible"),

  // ── Datos personales adicionales ──
  documentNumber: z
    .string()
    .trim()
    .min(5, "Ingresa un número de documento de identidad válido"),

  birthDate: z
    .string()
    .refine((date) => !isNaN(Date.parse(date)), "Ingresa una fecha de nacimiento válida")
    .refine((date) => new Date(date) <= new Date(), "La fecha de nacimiento no puede ser posterior a hoy")
    .refine((date) => {
      const minDate = new Date();
      minDate.setFullYear(minDate.getFullYear() - MAX_VOLUNTEER_AGE_YEARS);
      return new Date(date) >= minDate;
    }, `La fecha de nacimiento no puede ser mayor a ${MAX_VOLUNTEER_AGE_YEARS} años atrás`),

  address: z
    .string()
    .trim()
    .min(5, "Ingresa una dirección válida"),

  country: z
    .enum(COUNTRIES, "Selecciona un país válido"),

  // ── Tipo de perfil ──
  volunteerType: z
    .string()
    .refine((val) => val === "professional" || val === "non_professional", {
      message: "Selecciona si eres voluntario profesional o no profesional",
    }),

  // ── Perfil profesional (validado condicionalmente en superRefine) ──
  profession: z.string().trim().optional(),
  languages: z.array(z.string()).optional(),
  experienceCategories: z.array(z.string()).optional(),

  // ── Disponibilidad (compartido) ──
  scheduleHours: z
    .array(z.number())
    .min(1, "Selecciona al menos un horario disponible"),

  modalityPresential: z.boolean(),
  modalityOnline: z.boolean(),

  // ── Áreas de interés (compartido) ──
  interestAreas: z
    .array(z.string())
    .min(1, "Selecciona al menos un área de interés"),

  // ── Perfil no profesional (validado condicionalmente en superRefine) ──
  hasPriorExperience: z.boolean().nullable(),

  acceptedTerms: z
    .literal(true, {
      error: () => ({ message: "Debes aceptar los términos y el código de conducta" }),
    }),
}).superRefine((data, ctx) => {
  if (data.volunteerType === "professional") {
    if (!data.profession || data.profession.trim().length < 2) {
      ctx.addIssue({ code: "custom", path: ["profession"], message: "Ingresa tu profesión o formación" });
    }
    if (!data.languages || data.languages.length === 0) {
      ctx.addIssue({ code: "custom", path: ["languages"], message: "Ingresa al menos un idioma" });
    }
    if (!data.experienceCategories || data.experienceCategories.length === 0) {
      ctx.addIssue({ code: "custom", path: ["experienceCategories"], message: "Selecciona al menos una categoría de experiencia" });
    }
  }

  if (data.volunteerType === "non_professional") {
    if (data.hasPriorExperience === null || data.hasPriorExperience === undefined) {
      ctx.addIssue({ code: "custom", path: ["hasPriorExperience"], message: "Indica si tienes experiencia previa en voluntariado" });
    }
  }

  if (!data.modalityPresential && !data.modalityOnline) {
    ctx.addIssue({ code: "custom", path: ["modalityPresential"], message: "Selecciona al menos una modalidad (presencial u online)" });
  }
});

export type VolunteerFormData = z.infer<typeof volunteerSchema>;

export function getFieldErrors(data: unknown): Partial<Record<keyof VolunteerFormData, string>> {
  const result = volunteerSchema.safeParse(data);
  if (result.success) return {};

  const errors: Partial<Record<keyof VolunteerFormData, string>> = {};
  for (const issue of result.error.issues) {
    const field = issue.path[0] as keyof VolunteerFormData;
    if (!errors[field]) {
      errors[field] = issue.message;
    }
  }
  return errors;
}
