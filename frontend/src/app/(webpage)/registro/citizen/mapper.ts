/**
 * Construye el payload para POST /api/auth/register/citizen a partir
 * del formData ya validado por citizenSchema.
 *
 * El ciudadano es el registro más simple: solo lleva los campos comunes
 * (CommonFields en backend/src/modules/auth/auth.schema.js). El flag
 * `acceptedTerms` se descarta porque el backend no lo exige para este
 * endpoint — la aceptación es un acuerdo local del formulario.
 */
import type { CitizenFormData } from "./schema";
import type { CitizenPayload } from "@/api/citizen";

export function buildCitizenRegisterPayload(
  formData: CitizenFormData
): CitizenPayload {
  return {
    fullName: formData.fullName,
    email: formData.email,
    phone: formData.phone,
    password: formData.password,
    location: formData.location,
    zone: formData.zone,
    country: formData.country,
  };
}
