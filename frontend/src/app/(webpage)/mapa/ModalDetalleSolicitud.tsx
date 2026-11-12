"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { MapItem, UrgencyLevel } from "@/types";
import {
  getEmergencyById,
  EmergencyDetail,
  attendEmergency,
  listEmergencyAttendees,
  Attendee,
} from "@/api/emergencies";
import {
  getHelpRequestById,
  HelpRequestDetail,
  attendHelpRequest,
  listHelpRequestAttendees,
  HelpRequestAttendee,
} from "@/api/helpRequests";
import { alertService } from "@/services/alertService";

// ── Labels ──────────────────────────────────────────────────────────────────

const URGENCY_LABELS: Record<string, string> = {
  low: "Baja",
  medium: "Media",
  high: "Alta",
  critical: "Crítica",
};

const URGENCY_COLORS: Record<string, string> = {
  low: "bg-blue-100 text-blue-800 border-blue-300",
  medium: "bg-yellow-100 text-yellow-800 border-yellow-300",
  high: "bg-orange-100 text-orange-800 border-orange-300",
  critical: "bg-red-100 text-red-800 border-red-300",
};

const DISABILITY_LABELS: Record<string, string> = {
  visual: "Visual",
  auditiva: "Auditiva",
  neuro: "Neurodivergente",
  motriz: "Motriz",
};

const DISABILITY_SUBCATEGORY_LABELS: Record<string, string> = {
  traslado_asistido: "Traslado asistido",
  silla_ruedas: "Silla de ruedas",
  movilidad_reducida: "Movilidad reducida",
  ceguera_total: "Ceguera total",
  baja_vision: "Baja visión",
  sordera_total: "Sordera total",
  hipoacusia: "Hipoacusia",
  audifono: "Audífono",
  autismo: "Autismo",
  tdah: "TDAH",
  dislexia: "Dislexia",
};

const NEED_TYPE_LABELS: Record<string, string> = {
  equipment: "Equipamiento",
  medication: "Medicación",
  transport: "Transporte",
  companionship: "Acompañamiento",
  interpreter: "Intérprete",
  accessible_information: "Información accesible",
  neurodivergent_support: "Apoyo neurodivergente",
  psychosocial_support: "Apoyo psicosocial",
  motor_traslado_asistido: "Motor — Traslado asistido",
};

const STATUS_LABELS: Record<string, string> = {
  received: "Recibida",
  assigned: "Asignada",
  resolved: "Resuelta",
  open: "Abierta",
};

const CONTACT_METHOD_LABELS: Record<string, string> = {
  phone: "Teléfono",
  whatsapp: "WhatsApp",
  email: "Correo electrónico",
  onsite: "En el lugar",
  signal: "Signal",
  telegram: "Telegram",
  other: "Otro",
};

const GENDER_LABELS: Record<string, string> = {
  femenino: "Femenino",
  masculino: "Masculino",
  otro: "Otro",
};

// ── Mapeo API → MapItem ─────────────────────────────────────────────────────

function emergencyDetailToMapItem(d: EmergencyDetail): MapItem {
  return {
    kind: "emergency",
    id: d.id,
    lat: d.latitude,
    lng: d.longitude,
    urgency: d.urgency,
    status: d.status,
    createdAt: d.createdAt,
    requesterName: d.requesterName ?? undefined,
    disabilityType: d.disabilityType as MapItem["disabilityType"],
    disabilitySubcategory: d.disabilitySubcategory ?? undefined,
    communicationMode: d.communicationMode,
    needType: d.needType,
    description: d.description,
    isInjured: d.isInjured,
    cannotMove: d.cannotMove,
    extraInfo: d.extraInfo ?? undefined,
    voiceNoteUrl: d.voiceNoteUrl,
    voiceNoteDurationSec: d.voiceNoteDurationSec,
    assignedAt: d.assignedAt,
    resolvedAt: d.resolvedAt,
    updatedAt: d.updatedAt,
  };
}

function helpRequestDetailToMapItem(d: HelpRequestDetail): MapItem {
  return {
    kind: "help_request",
    id: d.id,
    lat: d.latitude,
    lng: d.longitude,
    urgency: d.urgency,
    status: d.status,
    createdAt: d.createdAt,
    requesterName: d.requesterName,
    needType: d.needType,
    description: d.description,
    contactMethod: d.contactMethod,
    contactValue: d.contactValue,
    address: d.address ?? undefined,
    country: d.country ?? undefined,
    gender: d.gender ?? undefined,
    age: d.age ?? undefined,
    disabilityType: d.disabilityType ?? undefined,
    disabilityOtherNote: d.disabilityOtherNote ?? undefined,
    voiceNoteUrl: d.voiceNoteUrl,
    volunteerName: d.volunteerName ?? undefined,
    volunteerContactMethod: d.volunteerContactMethod,
    volunteerContactValue: d.volunteerContactValue,
    assignedAt: d.assignedAt,
    resolvedAt: d.resolvedAt,
  };
}

// ── Helpers ─────────────────────────────────────────────────────────────────

function formatDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  try {
    const d = new Date(iso);
    return d.toLocaleDateString("es-VE", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

function siNo(val: boolean | null | undefined): string {
  if (val === true) return "Sí";
  if (val === false) return "No";
  return "—";
}

// ── Componente ──────────────────────────────────────────────────────────────

interface Props {
  id: string | null;
  kind: "emergency" | "help_request" | null;
  open: boolean;
  onClose: () => void;
  onAttendSuccess?: () => void;
}

export function ModalDetalleSolicitud({ id, kind, open, onClose, onAttendSuccess }: Props) {
  const overlayRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  const [item, setItem] = useState<MapItem | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // ── Attendees ──
  const [attendLoading, setAttendLoading] = useState(false);
  const [attendees, setAttendees] = useState<Attendee[]>([]);
  const [showAttendeesModal, setShowAttendeesModal] = useState(false);
  const [showConfirmAttend, setShowConfirmAttend] = useState(false);

  // ── Resetear estado al abrir/cerrar ──
  useEffect(() => {
    if (!open) {
      setAttendees([]);
      setShowAttendeesModal(false);
      setShowConfirmAttend(false);
      setAttendLoading(false);
    }
  }, [open]);

  // ── Atender ──
  const handleAttend = useCallback(async () => {
    if (!id || !kind) return;
    setShowConfirmAttend(false);
    setAttendLoading(true);
    try {
      if (kind === "emergency") {
        await attendEmergency(id);
      } else {
        await attendHelpRequest(id);
      }
      alertService.success(
        `Te has vinculado como atendiendo ${kind === "emergency" ? "esta emergencia" : "esta solicitud"}.`,
      );
      // Refrescar los datos del item para que se refleje el cambio
      if (kind === "emergency") {
        const detail = await getEmergencyById(id);
        setItem(emergencyDetailToMapItem(detail));
      } else {
        const detail = await getHelpRequestById(id);
        setItem(helpRequestDetailToMapItem(detail));
      }
      // Notificar al padre para recargar el listado del mapa
      onAttendSuccess?.();
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Error al vincularse";
      if (msg.includes("409") || msg.includes("already exists")) {
        alertService.warning("Ya estás vinculado a esta solicitud.");
      } else {
        alertService.error(msg);
      }
    } finally {
      setAttendLoading(false);
    }
  }, [id, kind, onAttendSuccess]);
  const handleShowAttendees = useCallback(async () => {
    if (!id || !kind) return;
    setShowAttendeesModal(true);
    setAttendLoading(true);
    try {
      if (kind === "emergency") {
        const list = await listEmergencyAttendees(id);
        setAttendees(list);
      } else {
        const list = await listHelpRequestAttendees(id);
        setAttendees(list);
      }
    } catch (err) {
      setAttendees([]);
    } finally {
      setAttendLoading(false);
    }
  }, [id, kind]);

  // ── Fetch cuando abre o cambia el id ──
  useEffect(() => {
    if (!open || !id || !kind) {
      setItem(null);
      setError(null);
      return;
    }

    let cancelled = false;

    async function fetchDetail() {
      setLoading(true);
      setError(null);
      setItem(null);

      try {
        if (kind === "emergency") {
          const detail = await getEmergencyById(id!);
          if (!cancelled) setItem(emergencyDetailToMapItem(detail));
        } else {
          const detail = await getHelpRequestById(id!);
          if (!cancelled) setItem(helpRequestDetailToMapItem(detail));
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Error al cargar los detalles");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    fetchDetail();

    return () => {
      cancelled = true;
    };
  }, [open, id, kind]);

  // ── Cerrar con Escape ──
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  // ── Bloquear scroll del body ──
  useEffect(() => {
    if (open) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => {
      document.body.style.overflow = "";
    };
  }, [open]);

  if (!open) return null;

  const isEmergency = kind === "emergency";
  const urgency = (item?.urgency ?? "medium") as UrgencyLevel;
  const hasCoords = item != null && item.lat != null && item.lng != null;

  return (
    <div
      ref={overlayRef}
      className="fixed inset-0 z-[1000] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4"
      onClick={(e) => {
        if (e.target === overlayRef.current) onClose();
      }}
      role="dialog"
      aria-modal="true"
      aria-label={`Detalles de ${isEmergency ? "emergencia" : "solicitud de ayuda"}`}
    >
      <div
        ref={panelRef}
        className="bg-surface rounded-2xl shadow-2xl w-full max-w-lg min-w-[40vw] max-h-[85vh] overflow-hidden flex flex-col animate-fade-up"
      >
        {/* ── Cabecera ── */}
        <div
          className={`flex items-center justify-between px-5 py-4 border-b border-outline-variant shrink-0 ${
            isEmergency ? "bg-red-50/40" : "bg-blue-50/40"
          }`}
        >
          <div className="flex items-center gap-3">
            <div
              className={`w-10 h-10 rounded-xl flex items-center justify-center ${
                isEmergency ? "bg-red-600" : "bg-[#0040a1]"
              }`}
            >
              <span className="material-symbols-rounded text-white text-xl">
                {isEmergency ? "emergency" : "handshake"}
              </span>
            </div>
            <div>
              <h2 className="text-base font-bold text-on-surface leading-tight">
                {isEmergency ? "Emergencia" : "Solicitud de ayuda"}
              </h2>
              <p className="text-xs text-on-surface-variant">
                {item?.requesterName ?? (isEmergency ? "Persona en emergencia" : "Solicitante anónimo")}
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-surface-container transition-colors"
            aria-label="Cerrar"
          >
            <span className="material-symbols-rounded text-on-surface-variant">close</span>
          </button>
        </div>

        {/* ── Contenido ── */}
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
          {/* Loading */}
          {loading && (
            <div className="flex items-center justify-center py-12">
              <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
            </div>
          )}

          {/* Error */}
          {error && !loading && (
            <div className="flex flex-col items-center gap-2 py-8 text-center">
              <span className="material-symbols-rounded text-3xl text-red-500">
                {error.startsWith("Inicia sesión") ? "lock" : "error"}
              </span>
              <p className="text-sm text-red-600">{error}</p>
              {error.startsWith("Inicia sesión") && (
                <Link
                  href="/login"
                  className="text-xs font-semibold text-primary hover:underline"
                >
                  Iniciar sesión
                </Link>
              )}
              <button
                onClick={onClose}
                className="text-xs font-semibold text-primary hover:underline mt-1"
              >
                Cerrar
              </button>
            </div>
          )}

          {/* Contenido con datos */}
          {item && !loading && !error && (
            <>
              {/* Urgencia y Estado */}
              <div className="flex items-center gap-2 flex-wrap">
                <span className={`text-xs font-bold px-2.5 py-1 rounded-full border ${URGENCY_COLORS[urgency]}`}>
                  Urgencia {URGENCY_LABELS[urgency] ?? urgency}
                </span>
                <span
                  className={`text-xs font-bold px-2.5 py-1 rounded-full border ${
                    item.status === "received" || item.status === "open"
                      ? "bg-blue-100 text-blue-700 border-blue-300"
                      : item.status === "assigned"
                        ? "bg-yellow-100 text-yellow-700 border-yellow-300"
                        : "bg-green-100 text-green-700 border-green-300"
                  }`}
                >
                  {STATUS_LABELS[item.status] ?? item.status}
                </span>
              </div>

              {/* Necesidad */}
              {item.needType && (
                <FieldRow
                  icon="category"
                  label="Tipo de necesidad"
                  value={NEED_TYPE_LABELS[item.needType] ?? item.needType}
                />
              )}

              {/* Emergencia — datos específicos */}
              {isEmergency && (
                <>
                  {(item.isInjured !== undefined || item.cannotMove !== undefined) && (
                    <div className="bg-surface-container rounded-xl p-3 space-y-2">
                      <h3 className="text-xs font-bold text-on-surface uppercase tracking-wide">
                        Condición física
                      </h3>
                      <div className="grid grid-cols-2 gap-2">
                        <MiniBadge
                          icon="personal_injury"
                          label="Herido"
                          value={siNo(item.isInjured)}
                          active={item.isInjured}
                        />
                        <MiniBadge
                          icon="wheelchair_pickup"
                          label="No puede moverse"
                          value={siNo(item.cannotMove)}
                          active={item.cannotMove}
                        />
                      </div>
                    </div>
                  )}

                  {item.disabilityType && (
                    <FieldRow
                      icon="accessibility_new"
                      label="Tipo de discapacidad"
                      value={DISABILITY_LABELS[item.disabilityType] ?? item.disabilityType}
                    />
                  )}

                  {item.disabilitySubcategory && (
                    <FieldRow
                      icon="more"
                      label="Subcategoría"
                      value={DISABILITY_SUBCATEGORY_LABELS[item.disabilitySubcategory] ?? item.disabilitySubcategory}
                    />
                  )}

                  {item.communicationMode && (
                    <FieldRow
                      icon="communication"
                      label="Modo de comunicación"
                      value={item.communicationMode}
                    />
                  )}
                </>
              )}

              {/* Solicitud de ayuda — datos específicos */}
              {!isEmergency && (
                <>
                  {item.contactValue && (
                    <FieldRow
                      icon="contact_page"
                      label="Método de contacto"
                      value={`${CONTACT_METHOD_LABELS[item.contactMethod ?? ""] ?? item.contactMethod}: ${item.contactValue}`}
                    />
                  )}

                  {item.address && (
                    <FieldRow icon="location_on" label="Dirección o referencia" value={item.address} />
                  )}

                  {item.country && (
                    <FieldRow icon="public" label="País" value={item.country} />
                  )}

                  {(item.gender || item.age != null) && (
                    <div className="grid grid-cols-2 gap-2">
                      {item.gender && (
                        <FieldRow icon="wc" label="Género" value={GENDER_LABELS[item.gender] ?? item.gender} />
                      )}
                      {item.age != null && (
                        <FieldRow icon="cake" label="Edad" value={String(item.age)} />
                      )}
                    </div>
                  )}

                  {item.disabilityType && (
                    <FieldRow
                      icon="accessibility_new"
                      label="Tipo de discapacidad"
                      value={
                        item.disabilityType === "Otras" && item.disabilityOtherNote
                          ? `Otras — ${item.disabilityOtherNote}`
                          : item.disabilityType
                      }
                    />
                  )}

                  {item.volunteerName && (
                    <div className="bg-green-50 rounded-xl p-3 space-y-2 border border-green-200">
                      <h3 className="text-xs font-bold text-green-800 uppercase tracking-wide">
                        Voluntario asignado
                      </h3>
                      <div className="flex items-center gap-2">
                        <span className="material-symbols-rounded text-green-600">volunteer_activism</span>
                        <span className="text-sm font-semibold text-green-800">{item.volunteerName}</span>
                      </div>
                      {item.volunteerContactMethod && item.volunteerContactValue && (
                        <p className="text-xs text-green-700">
                          {CONTACT_METHOD_LABELS[item.volunteerContactMethod] ?? item.volunteerContactMethod}:{" "}
                          {item.volunteerContactValue}
                        </p>
                      )}
                    </div>
                  )}
                </>
              )}

              {/* Descripción */}
              {item.description && (
                <div className="bg-surface-container rounded-xl p-3 space-y-1.5">
                  <h3 className="text-xs font-bold text-on-surface uppercase tracking-wide flex items-center gap-1.5">
                    <span className="material-symbols-rounded text-sm">description</span>
                    Descripción
                  </h3>
                  <p className="text-sm text-on-surface leading-relaxed">{item.description}</p>
                </div>
              )}

              {/* Información adicional */}
              {item.extraInfo && (
                <div className="bg-surface-container rounded-xl p-3 space-y-1.5">
                  <h3 className="text-xs font-bold text-on-surface uppercase tracking-wide flex items-center gap-1.5">
                    <span className="material-symbols-rounded text-sm">info</span>
                    Información adicional
                  </h3>
                  <p className="text-sm text-on-surface leading-relaxed">{item.extraInfo}</p>
                </div>
              )}

              {/* Nota de voz */}
              {item.voiceNoteUrl && (
                <div className="bg-surface-container rounded-xl p-3 space-y-2">
                  <h3 className="text-xs font-bold text-on-surface uppercase tracking-wide flex items-center gap-1.5">
                    <span className="material-symbols-rounded text-sm">mic</span>
                    Nota de voz
                  </h3>
                  <audio controls className="w-full" src={item.voiceNoteUrl}>
                    Tu navegador no soporta el elemento de audio.
                  </audio>
                  {item.voiceNoteDurationSec != null && (
                    <p className="text-xs text-on-surface-variant">
                      Duración: {item.voiceNoteDurationSec} segundos
                    </p>
                  )}
                </div>
              )}

              {/* Ubicación */}
              <div className="bg-surface-container rounded-xl p-3 space-y-2">
                <h3 className="text-xs font-bold text-on-surface uppercase tracking-wide flex items-center gap-1.5">
                  <span className="material-symbols-rounded text-sm">location_on</span>
                  Ubicación
                </h3>
                {hasCoords ? (
                  <>
                    <div className="grid grid-cols-2 gap-2 text-xs">
                      <div>
                        <span className="text-on-surface-variant">Latitud:</span>{" "}
                        <span className="font-mono font-semibold text-on-surface">{item.lat}</span>
                      </div>
                      <div>
                        <span className="text-on-surface-variant">Longitud:</span>{" "}
                        <span className="font-mono font-semibold text-on-surface">{item.lng}</span>
                      </div>
                    </div>
                    {item.distanceKm != null && (
                      <p className="text-xs text-on-surface-variant">
                        Distancia: <span className="font-semibold text-on-surface">{item.distanceKm} km</span>
                      </p>
                    )}
                  </>
                ) : (
                  <p className="text-xs text-on-surface-variant">Sin coordenadas registradas</p>
                )}
              </div>

              {/* Fechas */}
              <div className="bg-surface-container rounded-xl p-3 space-y-2">
                <h3 className="text-xs font-bold text-on-surface uppercase tracking-wide flex items-center gap-1.5">
                  <span className="material-symbols-rounded text-sm">schedule</span>
                  Fechas
                </h3>
                <div className="space-y-1.5 text-xs">
                  <div className="flex justify-between">
                    <span className="text-on-surface-variant">Creado:</span>
                    <span className="font-semibold text-on-surface">{formatDate(item.createdAt)}</span>
                  </div>
                  {item.assignedAt && (
                    <div className="flex justify-between">
                      <span className="text-on-surface-variant">Asignado:</span>
                      <span className="font-semibold text-on-surface">{formatDate(item.assignedAt)}</span>
                    </div>
                  )}
                  {item.resolvedAt && (
                    <div className="flex justify-between">
                      <span className="text-on-surface-variant">Resuelto:</span>
                      <span className="font-semibold text-on-surface">{formatDate(item.resolvedAt)}</span>
                    </div>
                  )}
                  {item.updatedAt && (
                    <div className="flex justify-between">
                      <span className="text-on-surface-variant">Actualizado:</span>
                      <span className="font-semibold text-on-surface">{formatDate(item.updatedAt)}</span>
                    </div>
                  )}
                </div>
              </div>

              {/* ID */}
              <p className="text-[10px] text-on-surface-variant/60 text-right pt-1">
                ID: {item.id}
              </p>
            </>
          )}
        </div>

        {/* ── Footer ── */}
        {item && !loading && !error && (
          <div className="px-5 py-3 border-t border-outline-variant shrink-0 grid grid-cols-2 gap-2">
            {hasCoords && (
              <a
                href={`https://www.openstreetmap.org/directions?from=&to=${item.lat},${item.lng}`}
                target="_blank"
                rel="noopener noreferrer"
                className={`flex items-center justify-center gap-1 rounded-xl py-2.5 text-sm font-bold shadow-sm transition-colors ${
                  isEmergency
                    ? "bg-red-600 hover:bg-red-700 text-white"
                    : "bg-[#0040a1] hover:bg-[#0056d2] text-white"
                }`}
              >
                <span className="material-symbols-rounded text-lg">directions</span>
                Cómo llegar
              </a>
            )}
            <button
              onClick={() => setShowConfirmAttend(true)}
              disabled={attendLoading}
              className={`flex items-center justify-center gap-1 rounded-xl py-2.5 text-sm font-bold transition-colors ${
                isEmergency
                  ? "bg-red-100 text-red-700 hover:bg-red-200 border border-red-300"
                  : "bg-blue-100 text-blue-700 hover:bg-blue-200 border border-blue-300"
              } disabled:opacity-50`}
            >
              <span className="material-symbols-rounded text-lg">
                {attendLoading ? "hourglass_top" : "volunteer_activism"}
              </span>
              {attendLoading ? "Vinculando…" : "Atender"}
            </button>
            <button
              onClick={handleShowAttendees}
              disabled={attendLoading}
              className="flex items-center justify-center gap-1 rounded-xl py-2.5 text-sm font-bold bg-surface-container text-on-surface hover:bg-surface-container-high border border-outline-variant transition-colors disabled:opacity-50"
            >
              <span className="material-symbols-rounded text-lg">groups</span>
              Ver quiénes atienden
            </button>
            <button
              onClick={onClose}
              className="flex items-center justify-center gap-1 rounded-xl py-2.5 text-sm font-bold border border-outline-variant text-on-surface hover:bg-surface-container transition-colors"
            >
              Cerrar
            </button>
          </div>
        )}
      </div>

      {/* ── Modal de confirmación "Atender" ── */}
      {showConfirmAttend && item && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/40 z-10 rounded-2xl">
          <div className="bg-surface rounded-xl shadow-xl p-5 mx-4 max-w-xs w-full text-center">
            <span className="material-symbols-rounded text-4xl text-amber-500 mb-2">warning</span>
            <p className="text-sm font-semibold text-on-surface mb-1">
              ¿Confirmar atención?
            </p>
            <p className="text-xs text-on-surface-variant mb-4">
              Te registrarás como persona que atiende{" "}
              {isEmergency ? "esta emergencia" : "esta solicitud de ayuda"}.
            </p>
            <div className="flex gap-2">
              <button
                onClick={() => setShowConfirmAttend(false)}
                className="flex-1 rounded-xl py-2 text-sm font-bold border border-outline-variant text-on-surface hover:bg-surface-container transition-colors"
              >
                Cancelar
              </button>
              <button
                onClick={handleAttend}
                className={`flex-1 rounded-xl py-2 text-sm font-bold text-white transition-colors ${
                  isEmergency ? "bg-red-600 hover:bg-red-700" : "bg-[#0040a1] hover:bg-[#0056d2]"
                }`}
              >
                Confirmar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Modal de lista de attendees ── */}
      {showAttendeesModal && (
        <div
          className="absolute inset-0 flex items-center justify-center bg-black/40 z-10 rounded-2xl"
          onClick={(e) => {
            if (e.target === e.currentTarget) setShowAttendeesModal(false);
          }}
        >
          <div className="bg-surface rounded-xl shadow-xl p-5 mx-4 max-w-sm w-full max-h-[60vh] flex flex-col">
            <div className="flex items-center justify-between mb-3 shrink-0">
              <h3 className="text-sm font-bold text-on-surface flex items-center gap-2">
                <span className="material-symbols-rounded text-lg">groups</span>
                Quiénes atienden
              </h3>
              <button
                onClick={() => setShowAttendeesModal(false)}
                className="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-surface-container transition-colors"
                aria-label="Cerrar"
              >
                <span className="material-symbols-rounded text-sm text-on-surface-variant">close</span>
              </button>
            </div>

            <div className="flex-1 overflow-y-auto">
              {attendLoading ? (
                <div className="flex items-center justify-center py-8">
                  <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
                </div>
              ) : attendees.length === 0 ? (
                <p className="text-xs text-on-surface-variant text-center py-6">
                  Nadie se ha vinculado aún para atender{" "}
                  {isEmergency ? "esta emergencia" : "esta solicitud"}.
                </p>
              ) : (
                <ul className="space-y-2">
                  {attendees.map((a) => (
                    <li
                      key={a.id}
                      className="flex items-center gap-3 bg-surface-container rounded-xl p-3"
                    >
                      <div className="w-9 h-9 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                        <span className="material-symbols-rounded text-primary text-lg">person</span>
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-on-surface truncate">
                          {a.userName ?? "Usuario"}
                        </p>
                        <p className="text-xs text-on-surface-variant truncate">
                          {a.userRole ? `${a.userRole}` : ""}
                        </p>
                        <p className="text-[10px] text-on-surface-variant/60">
                          {formatDate(a.attendedAt)}
                        </p>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Animación */}
      <style jsx>{`
        @keyframes fade-up {
          from {
            opacity: 0;
            transform: translateY(16px) scale(0.97);
          }
          to {
            opacity: 1;
            transform: translateY(0) scale(1);
          }
        }
        .animate-fade-up {
          animation: fade-up 0.2s cubic-bezier(0.16, 1, 0.3, 1) forwards;
        }
      `}</style>
    </div>
  );
}

// ── Subcomponentes ──────────────────────────────────────────────────────────

function FieldRow({
  icon,
  label,
  value,
}: {
  icon: string;
  label: string;
  value: string;
}) {
  return (
    <div className="flex items-start gap-3">
      <span className="material-symbols-rounded text-on-surface-variant mt-0.5 text-lg">
        {icon}
      </span>
      <div className="min-w-0">
        <p className="text-xs text-on-surface-variant">{label}</p>
        <p className="text-sm font-semibold text-on-surface">{value}</p>
      </div>
    </div>
  );
}

function MiniBadge({
  icon,
  label,
  value,
  active,
}: {
  icon: string;
  label: string;
  value: string;
  active?: boolean;
}) {
  return (
    <div
      className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs ${
        active
          ? "bg-red-100 text-red-700 border border-red-200"
          : "bg-surface-container-high text-on-surface-variant border border-outline-variant"
      }`}
    >
      <span className="material-symbols-rounded text-sm">{icon}</span>
      <span>
        {label}: <strong>{value}</strong>
      </span>
    </div>
  );
}
