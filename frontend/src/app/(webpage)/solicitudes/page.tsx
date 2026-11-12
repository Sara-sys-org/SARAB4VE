"use client";

import { useEffect, useState } from "react";
import RequireAuth from "@/components/layout/dashboard/RequireAuth";
import { listHelpRequests, type HelpRequestListItem } from "@/api/helpRequests";
import { ModalDetalleSolicitud } from "@/app/(webpage)/mapa/ModalDetalleSolicitud";

const STATUS_LABELS: Record<string, string> = {
  open: "Abierta",
  assigned: "Asignada",
  resolved: "Resuelta",
};

const STATUS_CLASSES: Record<string, string> = {
  open: "bg-blue-100 text-blue-700",
  assigned: "bg-purple-100 text-purple-700",
  resolved: "bg-green-100 text-green-700",
};

const URGENCY_LABELS: Record<string, string> = {
  low: "Baja",
  medium: "Media",
  high: "Alta",
  critical: "Crítica",
};

const CONTACT_METHOD_LABELS: Record<string, string> = {
  phone: "Teléfono",
  email: "Correo",
  whatsapp: "WhatsApp",
  other: "Otro",
};

const GENDER_LABELS: Record<string, string> = {
  femenino: "Femenino",
  masculino: "Masculino",
  otro: "Otro",
};

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("es", { day: "2-digit", month: "short", year: "numeric" });
}

function SolicitudesContent() {
  const [requests, setRequests] = useState<HelpRequestListItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<"open" | "assigned" | "resolved" | "all">("all");
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("desc");
  const [selectedId, setSelectedId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setIsLoading(true);

    listHelpRequests({
      status: statusFilter === "all" ? undefined : [statusFilter],
      sortOrder,
    })
      .then((data) => {
        if (!cancelled) setRequests(data);
      })
      .catch((err) => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "No se pudieron cargar las solicitudes.");
        }
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [statusFilter, sortOrder]);

  return (
    <section className="px-5 lg:px-10 py-8 lg:py-12">
      <div className="max-w-6xl mx-auto space-y-6">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-2xl lg:text-3xl font-bold text-on-surface">Solicitudes de apoyo</h1>
            <p className="text-on-surface-variant text-sm mt-1">
              Todas las solicitudes enviadas por ciudadanos, con sus datos completos.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as typeof statusFilter)}
              className="rounded-xl border border-outline-variant bg-surface-container-low px-3 py-2 text-sm font-semibold text-on-surface"
              aria-label="Filtrar por estado"
            >
              <option value="all">Todas</option>
              <option value="open">Abiertas</option>
              <option value="assigned">Asignadas</option>
              <option value="resolved">Resueltas</option>
            </select>
            <button
              type="button"
              onClick={() => setSortOrder((s) => (s === "desc" ? "asc" : "desc"))}
              className="flex items-center gap-1.5 rounded-xl border border-outline-variant bg-surface-container-low px-3 py-2 text-sm font-semibold text-on-surface hover:bg-surface-container transition-colors"
              aria-label="Cambiar orden por fecha"
            >
              <span className="material-symbols-rounded text-lg" aria-hidden="true">
                {sortOrder === "desc" ? "arrow_downward" : "arrow_upward"}
              </span>
              Fecha {sortOrder === "desc" ? "(recientes primero)" : "(antiguas primero)"}
            </button>
          </div>
        </div>

        <div className="rounded-2xl border border-outline-variant bg-surface-container-low p-6">
          {isLoading && (
            <div className="space-y-3">
              <div className="h-10 rounded-xl bg-surface-container animate-pulse" />
              <div className="h-10 rounded-xl bg-surface-container animate-pulse" />
              <div className="h-10 rounded-xl bg-surface-container animate-pulse" />
            </div>
          )}

          {!isLoading && error && <p className="text-sm text-error">{error}</p>}

          {!isLoading && !error && requests.length === 0 && (
            <p className="text-sm text-on-surface-variant">No hay solicitudes para este filtro.</p>
          )}

          {!isLoading && !error && requests.length > 0 && (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-outline-variant text-left text-xs font-medium uppercase tracking-wide text-on-surface-variant">
                    <th className="pb-2 pr-4">Nombre</th>
                    <th className="pb-2 pr-4">Género</th>
                    <th className="pb-2 pr-4">Edad</th>
                    <th className="pb-2 pr-4">Tipo de discapacidad</th>
                    <th className="pb-2 pr-4">Dirección o referencia</th>
                    <th className="pb-2 pr-4">País</th>
                    <th className="pb-2 pr-4">Contacto</th>
                    <th className="pb-2 pr-4">Nota</th>
                    <th className="pb-2 pr-4">Urgencia</th>
                    <th className="pb-2 pr-4">Estado</th>
                    <th className="pb-2 pr-4">Creada</th>
                    <th className="pb-2 text-right">Detalle</th>
                  </tr>
                </thead>
                <tbody>
                  {requests.map((req) => (
                    <tr key={req.id} className="border-b border-outline-variant/50 last:border-0 align-top">
                      <td className="py-2.5 pr-4 font-medium text-on-surface whitespace-nowrap">
                        {req.requesterName}
                      </td>
                      <td className="py-2.5 pr-4 text-on-surface-variant whitespace-nowrap">
                        {req.gender ? GENDER_LABELS[req.gender] ?? req.gender : "—"}
                      </td>
                      <td className="py-2.5 pr-4 text-on-surface-variant whitespace-nowrap">
                        {req.age ?? "—"}
                      </td>
                      <td className="py-2.5 pr-4 text-on-surface-variant">
                        {req.disabilityType
                          ? req.disabilityType === "Otras" && req.disabilityOtherNote
                            ? `Otras — ${req.disabilityOtherNote}`
                            : req.disabilityType
                          : "—"}
                      </td>
                      <td className="py-2.5 pr-4 text-on-surface-variant">{req.address || "—"}</td>
                      <td className="py-2.5 pr-4 text-on-surface-variant whitespace-nowrap">{req.country || "—"}</td>
                      <td className="py-2.5 pr-4 text-on-surface-variant whitespace-nowrap">
                        {CONTACT_METHOD_LABELS[req.contactMethod] ?? req.contactMethod}: {req.contactValue}
                      </td>
                      <td className="py-2.5 pr-4 text-on-surface-variant max-w-xs">
                        <div className="flex items-center gap-1.5">
                          {req.voiceNoteUrl && (
                            <span className="material-symbols-rounded text-sm text-primary shrink-0" title="Tiene nota de voz">
                              mic
                            </span>
                          )}
                          <span className="line-clamp-2">{req.description || "—"}</span>
                        </div>
                      </td>
                      <td className="py-2.5 pr-4 whitespace-nowrap">
                        {URGENCY_LABELS[req.urgency] ?? req.urgency}
                      </td>
                      <td className="py-2.5 pr-4 whitespace-nowrap">
                        <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${STATUS_CLASSES[req.status] ?? "bg-surface-container-high text-on-surface"}`}>
                          {STATUS_LABELS[req.status] ?? req.status}
                        </span>
                      </td>
                      <td className="py-2.5 pr-4 text-on-surface-variant whitespace-nowrap">
                        {formatDate(req.createdAt)}
                      </td>
                      <td className="py-2.5 text-right">
                        <button
                          type="button"
                          onClick={() => setSelectedId(req.id)}
                          className="text-primary font-semibold hover:underline whitespace-nowrap"
                        >
                          Ver
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      <ModalDetalleSolicitud
        id={selectedId}
        kind="help_request"
        open={selectedId !== null}
        onClose={() => setSelectedId(null)}
      />
    </section>
  );
}

export default function SolicitudesPage() {
  return (
    <RequireAuth roles={["admin", "organization", "volunteer"]}>
      <SolicitudesContent />
    </RequireAuth>
  );
}
