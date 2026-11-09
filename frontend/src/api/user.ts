import { normalizeUser } from "@/lib/normalizeUser";
import { ApiUser, DisabilityType, ListUsersParams, ListUsersResponse, OrganizationProfileResponse, UpdateOrganizationProfilePayload, UpdateVolunteerProfilePayload, VolunteerProfileResponse, UserStats } from "@/types";
import { API, getAuthHeaders } from "./client";

export async function listUsers(params: ListUsersParams = {}): Promise<ListUsersResponse> {
    const searchParams = new URLSearchParams();

    if (params.role) searchParams.set("role", params.role);
    if (params.roles?.length) searchParams.set("roles", params.roles.join(","));
    if (params.status) searchParams.set("status", params.status);
    if (params.search) searchParams.set("search", params.search);
    searchParams.set("limit", String(params.limit ?? 50));
    searchParams.set("offset", String(params.offset ?? 0));

    const res = await fetch(`${API}/api/users?${searchParams.toString()}`, {
        headers: getAuthHeaders(),
    });

    if (!res.ok) {
        const body = await res.json().catch(() => null);
        const message = body?.errors?.join(", ") ?? `HTTP ${res.status}`;

        if (res.status === 401) throw new Error("Sesión expirada. Inicia sesión nuevamente.");
        if (res.status === 403) throw new Error("No tienes permisos de administrador para ver esta sección.");
        throw new Error(message);
    }

    const rawData = await res.json();

    return {
        data: {
            users: rawData.data.users.map(normalizeUser),
            total: rawData.data.total,
            limit: rawData.data.limit,
            offset: rawData.data.offset,
        },
    };
}

export async function getUserStats(): Promise<UserStats> {
    const res = await fetch(`${API}/api/users/stats`, {
        headers: getAuthHeaders(),
    });

    if (!res.ok) {
        const body = await res.json().catch(() => null);
        const message = body?.errors?.join(", ") ?? `HTTP ${res.status}`;

        if (res.status === 401) throw new Error("Sesión expirada. Inicia sesión nuevamente.");
        if (res.status === 403) throw new Error("No tienes permisos de administrador para ver esta sección.");
        throw new Error(message);
    }

    const rawData = await res.json();
    return rawData.data;
}

export async function getUserById(id: string): Promise<ApiUser> {

    const res = await fetch(`${API}/api/users/${id}`, {
        headers: getAuthHeaders(),
    });
    console.log(res)

    if (!res.ok) {
        const body = await res.json().catch(() => null);
        const message = body?.errors?.join(", ") ?? `HTTP ${res.status}`;

        if (res.status === 401) throw new Error("Sesión expirada. Inicia sesión nuevamente.");
        if (res.status === 403) throw new Error("No tienes permisos para ver este usuario.");
        if (res.status === 404) throw new Error("Usuario no encontrado.");
        throw new Error(message);
    }

    try {
        const rawData = await res.json();
        return normalizeUser(rawData.data);
    } catch (error) {
        throw new Error(`Error al procesar los datos del usuario del servidor. ${error}`);
    }
}

export type UpdateUserPayload = {
    fullName?: string;
    email?: string;
    phone?: string;
    zone?: string | null;
    location?: { lat: number; lng: number } | null;
    password?: string;
    disabilityType?: DisabilityType | null;
    disabilitySubcategory?: string | null;
    communicationMode?: string | null;
    country?: string;
};

/**
 * PATCH /api/users/:id — actualiza los datos básicos del perfil y, para
 * ciudadanos, su información de discapacidad. El backend valida permisos
 * (dueño o admin) y devuelve el usuario con su `citizenProfile`.
 */
export async function updateUser(
    id: string,
    payload: UpdateUserPayload
): Promise<ApiUser> {
    const res = await fetch(`${API}/api/users/${id}`, {
        method: "PATCH",
        headers: getAuthHeaders(),
        body: JSON.stringify(payload),
    });

    if (!res.ok) {
        const body = await res.json().catch(() => null);
        const message = body?.errors?.join(", ") ?? `HTTP ${res.status}`;

        if (res.status === 401) throw new Error("Sesión expirada. Inicia sesión nuevamente.");
        if (res.status === 403) throw new Error("No tienes permisos para actualizar este perfil.");
        if (res.status === 404) throw new Error("Usuario no encontrado.");
        if (res.status === 409) throw new Error("El correo o el teléfono ya están en uso por otro usuario.");
        throw new Error(message);
    }

    const rawData = await res.json();
    return normalizeUser(rawData.data);
}

export async function approveUser(id: string): Promise<ApiUser> {
    const res = await fetch(`${API}/api/users/${id}/approve`, {
        method: "POST",
        headers: getAuthHeaders(),
    });

    if (!res.ok) {
        const body = await res.json().catch(() => null);
        const message = body?.errors?.join(", ") ?? `HTTP ${res.status}`;

        if (res.status === 401) throw new Error("Sesión expirada. Inicia sesión nuevamente.");
        if (res.status === 403) throw new Error("No tienes permisos para ver este usuario.");
        if (res.status === 404) throw new Error("Usuario no encontrado.");
        if (res.status === 409) throw new Error("Usuario no se encuentra con el estado Pendiente.");
        throw new Error(message);
    }

    try {
        const rawData = await res.json();
        return normalizeUser(rawData.data);
    } catch(error) {
        throw new Error(`Error al procesar los datos del usuario del servidor. ${error}`);
    }
}

export async function rejectUser(id: string): Promise<ApiUser> {
    const res = await fetch(`${API}/api/users/${id}/reject`, {
        method: "POST",
        headers: getAuthHeaders(),
    });

    if (!res.ok) {
        const body = await res.json().catch(() => null);
        const message = body?.errors?.join(", ") ?? `HTTP ${res.status}`;

        if (res.status === 401) throw new Error("Sesión expirada. Inicia sesión nuevamente.");
        if (res.status === 403) throw new Error("No tienes permisos para ver este usuario.");
        if (res.status === 404) throw new Error("Usuario no encontrado.");
        if (res.status === 409) throw new Error("Usuario no se encuentra con el estado Pendiente.");
        throw new Error(message);
    }

    try {
        const rawData = await res.json();
        return normalizeUser(rawData.data);
    } catch {
        throw new Error("Error al procesar los datos del usuario del servidor.");
    }


}

/**
 * Normaliza el cuerpo `{ data: ... }` que devuelven tanto
 * GET /api/users/:id/organization-profile como su PATCH — comparten forma.
 */
function parseOrganizationProfileResponse(rawData: { data: OrganizationProfileResponse }): OrganizationProfileResponse {
    try {
        const data = rawData.data;

        return {
            user: normalizeUser(data.user),
            organizationProfile: data.organizationProfile ?? null,
            legalRepresentatives: data.legalRepresentatives ?? [],
            disabilityTypes: data.disabilityTypes ?? [],
            services: data.services ?? [],
            verification: data.verification ?? null,
            documents: data.documents ?? [],
        };
    } catch (error) {
        throw new Error(`Error al procesar el perfil de la organización. ${error}`);
    }
}

export async function getOrganizationProfile(id: string): Promise<OrganizationProfileResponse> {
    const res = await fetch(`${API}/api/users/${id}/organization-profile`, {
        headers: getAuthHeaders(),
    });

    if (!res.ok) {
        const body = await res.json().catch(() => null);
        const message = body?.errors?.join(", ") ?? `HTTP ${res.status}`;

        if (res.status === 401) throw new Error("Sesión expirada. Inicia sesión nuevamente.");
        if (res.status === 403) throw new Error("No tienes permisos para ver este perfil.");
        if (res.status === 404) throw new Error("Usuario no encontrado.");
        throw new Error(message);
    }

    const rawData = await res.json();
    return parseOrganizationProfileResponse(rawData);
}

/**
 * PATCH /api/users/:id/organization-profile — corrige los datos de una
 * organización (solo admin). Devuelve el perfil completo actualizado.
 */
export async function updateOrganizationProfile(
    id: string,
    payload: UpdateOrganizationProfilePayload,
): Promise<OrganizationProfileResponse> {
    const res = await fetch(`${API}/api/users/${id}/organization-profile`, {
        method: "PATCH",
        headers: getAuthHeaders(),
        body: JSON.stringify(payload),
    });

    if (!res.ok) {
        const body = await res.json().catch(() => null);
        const message = body?.errors?.join(", ") ?? `HTTP ${res.status}`;

        if (res.status === 401) throw new Error("Sesión expirada. Inicia sesión nuevamente.");
        if (res.status === 403) throw new Error("No tienes permisos para editar este perfil.");
        if (res.status === 404) throw new Error("Usuario no encontrado.");
        if (res.status === 409) throw new Error("El correo o el teléfono ya están en uso por otro usuario.");
        // 400 y el resto: mostrar el detalle de validación del backend.
        throw new Error(message);
    }

    const rawData = await res.json();
    return parseOrganizationProfileResponse(rawData);
}

/**
 * Normaliza el cuerpo `{ data: ... }` que devuelven tanto
 * GET /api/users/:id/volunteer-profile como su PATCH — comparten forma.
 */
function parseVolunteerProfileResponse(rawData: { data: VolunteerProfileResponse }): VolunteerProfileResponse {
    try {
        const data = rawData.data;

        return {
            user: normalizeUser(data.user),
            details: data.details ?? null,
            volunteerProfile: data.volunteerProfile ?? null,
            interestAreas: data.interestAreas ?? [],
            experience: data.experience ?? [],
            verification: data.verification ?? null,
            documents: data.documents ?? [],
        };
    } catch (error) {
        throw new Error(`Error al procesar el perfil del voluntario. ${error}`);
    }
}

export async function getVolunteerProfile(id: string): Promise<VolunteerProfileResponse> {
    const res = await fetch(`${API}/api/users/${id}/volunteer-profile`, {
        headers: getAuthHeaders(),
    });

    if (!res.ok) {
        const body = await res.json().catch(() => null);
        const message = body?.errors?.join(", ") ?? `HTTP ${res.status}`;

        if (res.status === 401) throw new Error("Sesión expirada. Inicia sesión nuevamente.");
        if (res.status === 403) throw new Error("No tienes permisos para ver este perfil.");
        if (res.status === 404) throw new Error("Usuario no encontrado.");
        throw new Error(message);
    }

    const rawData = await res.json();
    return parseVolunteerProfileResponse(rawData);
}

/**
 * PATCH /api/users/:id/volunteer-profile — corrige los datos de un voluntario
 * (solo admin). Devuelve el perfil completo actualizado.
 */
export async function updateVolunteerProfile(
    id: string,
    payload: UpdateVolunteerProfilePayload,
): Promise<VolunteerProfileResponse> {
    const res = await fetch(`${API}/api/users/${id}/volunteer-profile`, {
        method: "PATCH",
        headers: getAuthHeaders(),
        body: JSON.stringify(payload),
    });

    if (!res.ok) {
        const body = await res.json().catch(() => null);
        const message = body?.errors?.join(", ") ?? `HTTP ${res.status}`;

        if (res.status === 401) throw new Error("Sesión expirada. Inicia sesión nuevamente.");
        if (res.status === 403) throw new Error("No tienes permisos para editar este perfil.");
        if (res.status === 404) throw new Error("Usuario no encontrado.");
        if (res.status === 409) throw new Error("El correo o el teléfono ya están en uso por otro usuario.");
        // 400 y el resto: mostrar el detalle de validación del backend.
        throw new Error(message);
    }

    const rawData = await res.json();
    return parseVolunteerProfileResponse(rawData);
}