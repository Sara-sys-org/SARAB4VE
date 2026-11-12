import { API, getAuthHeaders } from "./client";
import type { ApiUser } from "@/types";

export type VolunteerPayload = {
  fullName?: string;
  email?: string;
  phone?: string | null;
  password: string;
  location?: { lat: number; lng: number } | null;
  zone?: string | null;
  skills?: string[] | null;
  availableHours?: number | null;
  availableDays?: string[] | null;
  acceptedTerms: boolean;

  // Perfil extendido (volunteer_profiles)
  volunteerType?: "professional" | "non_professional";
  documentType?: string;
  documentNumber?: string;
  birthDate?: string;
  address?: string;
  country?: string;
  profession?: string;
  languages?: string[];
  availabilityMode?: "presential" | "online" | "both";
  hasPriorExperience?: boolean;
  interestAreaIds?: number[];
  experienceCategoryIds?: number[];
};

export type VolunteerRegisterResponse = {
  token: string;
  user: ApiUser;
};

export async function sendVolunteer(payload: VolunteerPayload): Promise<VolunteerRegisterResponse> {
  const res = await fetch(`${API}/api/auth/register/volunteer`, {
    method: "POST",
    headers: getAuthHeaders(),
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    const body = await res.json().catch(() => null);
    const message = body?.errors?.join(", ") ?? `HTTP ${res.status}`;

    if (res.status === 400) throw new Error("Error en la validación.");
    if (res.status === 409) throw new Error("El correo electrónico o el teléfono ya se encuentran registrados.");
    throw new Error(message);
  }

  const rawData = await res.json();
  return rawData.data as VolunteerRegisterResponse;
}
