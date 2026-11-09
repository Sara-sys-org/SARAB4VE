import { API, getAuthHeaders } from "./client";

// ── Tipos ───────────────────────────────────────────────────────────────────

export type HelpRequestPayload = {
  requesterName: string;
  contactMethod: string;
  contactValue: string;
  needType: string;
  description?: string;
  latitude?: number | null;
  longitude?: number | null;
  urgency?: string;
  address?: string;
  country?: string;
  gender?: string;
  age?: number | null;
  disabilityType?: string;
  disabilityOtherNote?: string;
  /** Carnet de discapacidad adjunto (imagen o PDF), opcional. */
  disabilityCardFile?: File | null;
  /** Nota de voz grabada en el formulario, opcional. */
  voiceNoteBlob?: Blob | null;
};

export interface HelpRequestListItem {
  id: string;
  userId?: string | null;
  requesterName: string;
  contactMethod: string;
  contactValue: string;
  needType: string;
  description: string;
  latitude: number | null;
  longitude: number | null;
  urgency: "low" | "medium" | "high" | "critical";
  status: string;
  address?: string | null;
  country?: string | null;
  gender?: string | null;
  age?: number | null;
  disabilityType?: string | null;
  disabilityOtherNote?: string | null;
  disabilityCardKey?: string | null;
  voiceNoteUrl?: string | null;
  volunteerName?: string;
  volunteerContactMethod?: string | null;
  volunteerContactValue?: string | null;
  assignedAt?: string | null;
  resolvedAt?: string | null;
  createdAt: string;
  updatedAt?: string | null;
  distanceKm?: number;
}

interface ListHelpRequestsParams {
  status?: string[];
  latitude?: number;
  longitude?: number;
  radiusKm?: number;
  /** Orden por fecha de creación — "desc" (más recientes primero, default) o "asc". */
  sortOrder?: "asc" | "desc";
}

// ── GET — listar ────────────────────────────────────────────────────────────

export async function listHelpRequests(
  params: ListHelpRequestsParams = {},
): Promise<HelpRequestListItem[]> {
  const searchParams = new URLSearchParams();

  if (params.status && params.status.length > 0) {
    searchParams.set("status", params.status.join(","));
  }
  if (params.sortOrder) searchParams.set("sortOrder", params.sortOrder);
  if (params.latitude !== undefined) searchParams.set("latitude", String(params.latitude));
  if (params.longitude !== undefined) searchParams.set("longitude", String(params.longitude));
  if (params.radiusKm !== undefined) searchParams.set("radiusKm", String(params.radiusKm));

  const qs = searchParams.toString();
  const url = `${API}/api/help-requests${qs ? `?${qs}` : ""}`;

  const res = await fetch(url, { headers: getAuthHeaders() });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(text || res.statusText || `HTTP ${res.status}`);
  }

  const json = await res.json();
  return json.data ?? [];
}

// ── GET — estadísticas (conteo por estado) ────────────────────────────────

export interface HelpRequestStats {
  total: number;
  open: number;
  assigned: number;
  resolved: number;
}

export async function getHelpRequestStats(): Promise<HelpRequestStats> {
  const res = await fetch(`${API}/api/help-requests/stats`, { headers: getAuthHeaders() });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(text || res.statusText || `HTTP ${res.status}`);
  }

  const json = await res.json();
  return json.data;
}

/** GET — solicitudes propias del ciudadano autenticado */
export async function listMyHelpRequests(): Promise<HelpRequestListItem[]> {
  const res = await fetch(`${API}/api/help-requests/mine`, {
    headers: getAuthHeaders(),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(text || res.statusText || `HTTP ${res.status}`);
  }

  const json = await res.json();
  return json.data ?? [];
}

// ── POST — crear ────────────────────────────────────────────────────────────

/** Respuesta de POST /api/help-requests. `warnings` aparece si algún adjunto opcional no se pudo guardar. */
export interface CreateHelpRequestResponse {
  data: HelpRequestListItem & { warnings?: string[] };
}

export async function sendHelpRequest(
  payload: HelpRequestPayload,
): Promise<CreateHelpRequestResponse | null> {
  // multipart/form-data — el carnet de discapacidad y la nota de voz son
  // archivos binarios, no representables en JSON.
  const formData = new FormData();
  formData.append("requesterName", payload.requesterName);
  formData.append("contactMethod", payload.contactMethod);
  formData.append("contactValue", payload.contactValue);
  formData.append("needType", payload.needType);
  if (payload.description) formData.append("description", payload.description);
  if (payload.address) formData.append("address", payload.address);
  if (payload.country) formData.append("country", payload.country);
  if (payload.latitude != null) formData.append("latitude", String(payload.latitude));
  if (payload.longitude != null) formData.append("longitude", String(payload.longitude));
  if (payload.urgency) formData.append("urgency", payload.urgency);
  if (payload.gender) formData.append("gender", payload.gender);
  if (payload.age != null) formData.append("age", String(payload.age));
  if (payload.disabilityType) formData.append("disabilityType", payload.disabilityType);
  if (payload.disabilityOtherNote) formData.append("disabilityOtherNote", payload.disabilityOtherNote);
  if (payload.disabilityCardFile) formData.append("carnet", payload.disabilityCardFile);
  if (payload.voiceNoteBlob) formData.append("voiceNote", payload.voiceNoteBlob, "nota-de-voz.webm");

  // getAuthHeaders() fuerza "Content-Type: application/json" — con FormData
  // el navegador debe fijar el Content-Type (con el boundary del multipart)
  // por su cuenta, así que solo reutilizamos el header de Authorization.
  const headers: Record<string, string> = {};
  if (typeof window !== "undefined") {
    const token = localStorage.getItem("token");
    if (token) headers["Authorization"] = `Bearer ${token}`;
  }

  const res = await fetch(`${API}/api/help-requests`, {
    method: "POST",
    headers,
    body: formData,
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(text || res.statusText || `HTTP ${res.status}`);
  }

  // Return parsed JSON when available, otherwise null
  try {
    return await res.json();
  } catch {
    return null;
  }
}

// ── GET — por ID (detalle completo) ──────────────────────────────────────

export interface HelpRequestDetail {
  id: string;
  userId?: string | null;
  requesterName: string;
  contactMethod: string;
  contactValue: string;
  needType: string;
  description: string;
  latitude: number | null;
  longitude: number | null;
  urgency: "low" | "medium" | "high" | "critical";
  status: string;
  address: string | null;
  country: string | null;
  gender: string | null;
  age: number | null;
  disabilityType: string | null;
  disabilityOtherNote: string | null;
  disabilityCardKey: string | null;
  voiceNoteUrl: string | null;
  volunteerName: string | null;
  volunteerContactMethod: string | null;
  volunteerContactValue: string | null;
  assignedAt: string | null;
  resolvedAt: string | null;
  createdAt: string;
}

export async function getHelpRequestById(id: string): Promise<HelpRequestDetail> {
  const res = await fetch(`${API}/api/help-requests/${encodeURIComponent(id)}`, {
    headers: getAuthHeaders(),
  });

  if (!res.ok) {
    if (res.status === 401 || res.status === 403) {
      throw new Error("Inicia sesión como voluntario u organización para ver el detalle completo de esta solicitud.");
    }
    const text = await res.text().catch(() => "");
    throw new Error(text || res.statusText || `HTTP ${res.status}`);
  }

  const json = await res.json();
  return json.data;
}

// ── Attendees ───────────────────────────────────────────────────────────────

export interface HelpRequestAttendee {
  id: string;
  helpRequestId?: string;
  emergencyId?: string;
  attendedBy: string;
  attendedAt: string;
  userName?: string;
  userEmail?: string;
  userRole?: string;
}

/** POST — vincularse como atendiendo una solicitud de ayuda */
export async function attendHelpRequest(helpRequestId: string): Promise<HelpRequestAttendee> {
  const res = await fetch(`${API}/api/help-requests/${encodeURIComponent(helpRequestId)}/attendees`, {
    method: "POST",
    headers: getAuthHeaders(),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(text || res.statusText || `HTTP ${res.status}`);
  }

  const json = await res.json();
  return json.data;
}

/** GET — listar usuarios que atienden una solicitud */
export async function listHelpRequestAttendees(helpRequestId: string): Promise<HelpRequestAttendee[]> {
  const res = await fetch(`${API}/api/help-requests/${encodeURIComponent(helpRequestId)}/attendees`, {
    headers: getAuthHeaders(),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(text || res.statusText || `HTTP ${res.status}`);
  }

  const json = await res.json();
  return json.data ?? [];
}

/**
 * POST — vincula una solicitud enviada sin login con la cuenta de
 * ciudadano recién creada (requiere el token de esa cuenta ya guardado
 * en localStorage, vía getAuthHeaders()).
 */
export async function linkHelpRequestToAccount(helpRequestId: string): Promise<void> {
  const res = await fetch(`${API}/api/help-requests/${encodeURIComponent(helpRequestId)}/link-account`, {
    method: "POST",
    headers: getAuthHeaders(),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(text || res.statusText || `HTTP ${res.status}`);
  }
}
