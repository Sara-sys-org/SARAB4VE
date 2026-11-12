import type { ApiUser, CitizenProfile, ROLES_USER, STATUS_USERS } from "@/types/index";


type RawUser = {
  id: string;
  fullName?: string;
  full_name?: string;
  email: string;
  phone: string;
  role: ROLES_USER;
  status: STATUS_USERS;
  location: { lat: number; lng: number } | { type?: string; coordinates: [number, number] } | null;
  zone: string | null;
  phoneVerified?: boolean;
  phone_verified?: boolean;
  emailVerified?: boolean;
  email_verified?: boolean;
  createdAt?: string;
  created_at?: string;
  updatedAt?: string;
  updated_at?: string;
  citizenProfile?: CitizenProfile | null;
  organizationName?: string | null;
  country?: string | null;
};

function normalizeLocation(
  raw: unknown
): { lat: number; lng: number } | null {
  if (!raw || typeof raw !== "object") return null;

  // Caso 1: formato GeoJSON — { type: "Point", coordinates: [lng, lat] }
  if ("coordinates" in raw && Array.isArray((raw as any).coordinates)) {
    const [lng, lat] = (raw as any).coordinates;
    if (typeof lat === "number" && typeof lng === "number") {
      return { lat, lng };
    }
    return null;
  }

  // Caso 2: ya viene como { lat, lng } directo
  if ("lat" in raw && "lng" in raw) {
    const { lat, lng } = raw as { lat: unknown; lng: unknown };
    if (typeof lat === "number" && typeof lng === "number") {
      return { lat, lng };
    }
  }

  return null;
}

/**
 * Normaliza un usuario venido del backend a un formato único (camelCase),
 * sin importar si el backend respondió en camelCase o snake_case.
 */
export function normalizeUser(raw: RawUser): ApiUser {
  return {
    id: raw.id,
    fullName: raw.fullName ?? raw.full_name ?? "",
    email: raw.email,
    phone: raw.phone,
    role: raw.role,
    status: raw.status,
    location: normalizeLocation(raw.location),
    zone: raw.zone,
    phoneVerified: raw.phoneVerified ?? raw.phone_verified ?? false,
    emailVerified: raw.emailVerified ?? raw.email_verified ?? false,
    createdAt: raw.createdAt ?? raw.created_at ?? "",
    updatedAt: raw.updatedAt ?? raw.updated_at ?? "",
    citizenProfile: raw.citizenProfile ?? null,
    organizationName: raw.organizationName ?? null,
    country: raw.country ?? null,
  };
}