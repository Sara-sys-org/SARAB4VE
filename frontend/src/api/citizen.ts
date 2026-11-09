import { API, getAuthHeaders } from "./client";
import type { ApiUser } from "@/types";

/**
 * Payload para POST /api/auth/register/citizen
 *
 * El ciudadano es el rol más simple: se aprueba automáticamente
 * (status = "approved") y no requiere verificación adicional.
 * Mantiene los campos comunes del registro (fullName, email, phone,
 * password, location, zone) definidos en auth.schema.js#CommonFields.
 *
 * El mapper del frontend puede enriquecer el payload con metadata local
 * (e.g. acceptTerms), pero el contrato del backend no requiere un flag
 * explícito de aceptación de términos para el caso ciudadano.
 */
export type CitizenPayload = {
  fullName: string;
  email: string;
  phone: string;
  password: string;
  location?: { lat: number; lng: number } | null;
  zone?: string | null;
  country?: string;
  /** Indicador local de aceptación; no se envía al backend. */
  acceptedTerms?: boolean;
};

export type CitizenRegisterResponse = {
  token: string;
  user: ApiUser;
};

/**
 * Envía el formulario de registro de ciudadano al backend.
 * Devuelve el token JWT y los datos del usuario recién creado.
 *
 * Errores esperados:
 *   - 400: validación (campos requeridos, formato de email, etc.)
 *   - 409: email o teléfono ya registrados
 */
export async function sendCitizen(
  payload: CitizenPayload
): Promise<CitizenRegisterResponse> {
  const { acceptedTerms: _acceptedTerms, ...bodyToSend } = payload;

  const res = await fetch(`${API}/api/auth/register/citizen`, {
    method: "POST",
    headers: getAuthHeaders(),
    body: JSON.stringify(bodyToSend),
  });

  if (!res.ok) {
    const body = await res.json().catch(() => null);
    const message = body?.errors?.join(", ") ?? `HTTP ${res.status}`;

    if (res.status === 400) throw new Error("Error en la validación de los datos.");
    if (res.status === 409) throw new Error("El correo electrónico o el teléfono ya se encuentran registrados.");
    throw new Error(message);
  }

  const rawData = await res.json();
  return rawData.data as CitizenRegisterResponse;
}
