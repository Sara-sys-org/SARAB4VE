import { z } from "zod";
import type { UpdateOrganizationProfilePayload } from "@/types";
import { COUNTRIES } from "@/lib/countries";

// Validación espejo del formulario de registro (mismas reglas del backend),
// pero todos los campos opcionales: editar no debe bloquear si un campo viene
// vacío. Solo se valida el formato cuando el valor está presente.

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHONE_RE = /^\+?[0-9]{7,15}$/;

/** Fila de representante legal en el estado del formulario. */
export interface LegalRepresentativeFormRow {
  fullName: string;
  position: string;
  phone: string;
  email: string;
}

/** Fila clave/valor para redes sociales. */
export interface SocialLinkFormRow {
  key: string;
  value: string;
}

/** Estado editable del formulario — todo como string salvo arrays y location. */
export interface OrganizationEditFormState {
  fullName: string;
  email: string;
  phone: string;
  zone: string;
  location: { lat: number; lng: number } | null;
  organizationName: string;
  organizationTypeId: string;
  taxId: string;
  taxIdType: string;
  otherEntityType: string;
  registryNumber: string;
  foundedAt: string;
  country: string;
  province: string;
  city: string;
  address: string;
  website: string;
  socialLinks: SocialLinkFormRow[];
  mission: string;
  vision: string;
  scope: string;
  servedGroups: string;
  legalRepresentatives: LegalRepresentativeFormRow[];
  disabilityTypeIds: number[];
  serviceIds: number[];
}

/** String opcional con tope de longitud (vacío permitido). */
function optionalText(max: number, message: string) {
  return z.string().trim().max(max, message).optional();
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

const optionalWebsite = z
  .string()
  .trim()
  .max(200, "El sitio web no puede exceder 200 caracteres")
  .optional()
  .refine((value) => !value || z.string().url().safeParse(value).success, {
    message: "Ingresa una URL válida (debe iniciar con http:// o https://)",
  });

const optionalDate = z
  .string()
  .trim()
  .optional()
  .refine((value) => !value || (/^\d{4}-\d{2}-\d{2}$/.test(value) && !isNaN(Date.parse(value))), {
    message: "Ingresa una fecha válida (AAAA-MM-DD)",
  });

export const organizationEditSchema = z.object({
  fullName: optionalText(100, "El nombre es demasiado largo"),
  email: optionalEmail,
  phone: optionalPhone,
  zone: optionalText(120, "La zona es demasiado larga"),
  location: z.object({ lat: z.number(), lng: z.number() }).nullable().optional(),
  organizationName: optionalText(150, "El nombre de la organización es demasiado largo"),
  organizationTypeId: z.string().trim().optional(),
  taxId: optionalText(30, "El ID fiscal no puede exceder 30 caracteres"),
  taxIdType: optionalText(30, "El tipo de ID fiscal no puede exceder 30 caracteres"),
  otherEntityType: optionalText(100, "El tipo de entidad no puede exceder 100 caracteres"),
  registryNumber: optionalText(50, "El número de registro no puede exceder 50 caracteres"),
  foundedAt: optionalDate,
  country: z.enum(["", ...COUNTRIES], "Selecciona un país válido").optional(),
  province: optionalText(60, "La provincia no puede exceder 60 caracteres"),
  city: optionalText(60, "La ciudad no puede exceder 60 caracteres"),
  address: z.string().trim().optional(),
  website: optionalWebsite,
  socialLinks: z
    .array(z.object({ key: z.string().trim(), value: z.string().trim() }))
    .optional()
    .refine(
      (rows) => !rows || rows.every((row) => (row.key === "") === (row.value === "")),
      { message: "Cada red social necesita clave y enlace, o elimina la fila vacía" },
    ),
  mission: z.string().trim().optional(),
  vision: z.string().trim().optional(),
  scope: z.string().trim().optional(),
  servedGroups: z.string().trim().optional(),
  legalRepresentatives: z
    .array(
      z.object({
        fullName: z.string().trim().min(1, "El nombre del representante es requerido"),
        position: z.string().trim().optional(),
        phone: optionalPhone,
        email: optionalEmail,
      }),
    )
    .optional(),
  disabilityTypeIds: z.array(z.number().int().positive()).optional(),
  serviceIds: z.array(z.number().int().positive()).optional(),
});

export type EditFieldErrors = Partial<Record<keyof OrganizationEditFormState, string>>;

/** Igual que `getFieldErrors` de registro: primer mensaje por campo raíz. */
export function getEditFieldErrors(data: unknown): EditFieldErrors {
  const result = organizationEditSchema.safeParse(data);
  if (result.success) return {};

  const errors: EditFieldErrors = {};
  for (const issue of result.error.issues) {
    const field = issue.path[0] as keyof OrganizationEditFormState;
    if (!errors[field]) {
      errors[field] = issue.message;
    }
  }
  return errors;
}

/** Campos de identidad a nivel de usuario: requeridos/únicos, nunca se vacían. */
type IdentityStringPayloadKey = "fullName" | "email" | "phone" | "zone" | "organizationName";

/** Campos nullable de organization_profiles: un string vacío los borra (null). */
type ProfileStringPayloadKey =
  | "taxId"
  | "taxIdType"
  | "otherEntityType"
  | "registryNumber"
  | "country"
  | "province"
  | "city"
  | "address"
  | "website"
  | "mission"
  | "vision"
  | "scope"
  | "servedGroups";

/**
 * Mapea el estado del formulario al payload del PATCH. Los campos de
 * organization_profiles se envían SIEMPRE con su valor recortado, incluido ""
 * cuando el admin los limpia: el backend convierte "" en null, así que un campo
 * vacío borra el dato. Los campos de identidad a nivel de usuario (fullName,
 * email, phone, zone, organizationName) se omiten si vienen vacíos porque son
 * requeridos/únicos y un "" los corrompería o provocaría un 400. Arrays y
 * objetos se envían completos para que las eliminaciones surtan efecto.
 */
export function buildUpdatePayload(form: OrganizationEditFormState): UpdateOrganizationProfilePayload {
  const payload: UpdateOrganizationProfilePayload = {};

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
  setIdentity("organizationName", form.organizationName);
  setProfile("taxId", form.taxId);
  setProfile("taxIdType", form.taxIdType);
  setProfile("otherEntityType", form.otherEntityType);
  setProfile("registryNumber", form.registryNumber);
  setProfile("country", form.country);
  setProfile("province", form.province);
  setProfile("city", form.city);
  setProfile("address", form.address);
  setProfile("website", form.website);
  setProfile("mission", form.mission);
  setProfile("vision", form.vision);
  setProfile("scope", form.scope);
  setProfile("servedGroups", form.servedGroups);

  payload.foundedAt = form.foundedAt.trim();
  if (form.location) payload.location = form.location;
  if (form.organizationTypeId.trim()) payload.organizationTypeId = Number(form.organizationTypeId);

  const socialLinks: Record<string, string> = {};
  for (const row of form.socialLinks) {
    const key = row.key.trim();
    const value = row.value.trim();
    if (key && value) socialLinks[key] = value;
  }
  payload.socialLinks = socialLinks;

  payload.legalRepresentatives = form.legalRepresentatives.map((row) => ({
    fullName: row.fullName.trim(),
    position: row.position.trim() || undefined,
    phone: row.phone.trim() || undefined,
    email: row.email.trim() || undefined,
  }));

  payload.disabilityTypeIds = form.disabilityTypeIds;
  payload.serviceIds = form.serviceIds;

  return payload;
}
