"use client";

import { useEffect, useState, useRef } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import StatusBadge from "@/components/layout/dashboard/StatusBadge";
import DocumentFileActions from "@/components/layout/dashboard/DocumentFileActions";
import { alertService } from "@/services/alertService";
import { approveUser, rejectUser, getVolunteerProfile } from "@/api/user";
import {
    getDocumentDownloadUrl,
    reviewVerificationDocument,
} from "@/api/verification";
import VolunteerEditForm from "./VolunteerEditForm";
import dynamic from "next/dynamic";
import type {
    VolunteerProfileResponse,
    VerificationStatus,
    DocumentStatus,
    VolunteerType,
    AvailabilityMode,
    VerificationDocument,
} from "@/types/index";

const Location = dynamic(() => import("@/components/ui/Location"), {
    ssr: false,
    loading: () => <div className="h-[220px] rounded-xl bg-surface-container animate-pulse" />,
});

/* ------------------------------------------------------------------ */
/* Helpers de presentación                                            */
/* ------------------------------------------------------------------ */

const VERIFICATION_LABELS: Record<VerificationStatus, string> = {
    entregada: "Entregada",
    en_estudio: "En estudio",
    rechazada: "Rechazada",
    aceptada: "Aceptada",
};

const VERIFICATION_CLASSES: Record<VerificationStatus, string> = {
    entregada: "bg-[color:var(--color-warning-container)] text-[color:var(--color-on-warning-container)]",
    en_estudio: "bg-[color:var(--color-tertiary-container)] text-[color:var(--color-on-tertiary-container)]",
    rechazada: "bg-error-container text-on-error-container",
    aceptada: "bg-[color:var(--color-success-container)] text-[color:var(--color-on-success-container)]",
};

const DOC_STATUS_LABELS: Record<DocumentStatus, string> = {
    pending: "Pendiente",
    approved: "Aprobado",
    rejected: "Rechazado",
};

const DOC_STATUS_CLASSES: Record<DocumentStatus, string> = {
    pending: "bg-[color:var(--color-warning-container)] text-[color:var(--color-on-warning-container)]",
    approved: "bg-[color:var(--color-success-container)] text-[color:var(--color-on-success-container)]",
    rejected: "bg-error-container text-on-error-container",
};

const VOLUNTEER_TYPE_LABELS: Record<VolunteerType, string> = {
    professional: "Profesional",
    non_professional: "No profesional",
};

const AVAILABILITY_MODE_LABELS: Record<AvailabilityMode, string> = {
    presential: "Presencial",
    online: "En línea",
    both: "Presencial y en línea",
};

/** Formatear fecha ISO → "8 de agosto de 2026" */
function fmtDate(iso: string | null | undefined): string {
    if (!iso) return "—";
    return new Date(iso).toLocaleDateString("es", {
        day: "numeric",
        month: "long",
        year: "numeric",
    });
}

/** Formatear un booleano nullable como "Sí" / "No" / "—". */
function fmtBoolean(value: boolean | null | undefined): string {
    if (value === null || value === undefined) return "—";
    return value ? "Sí" : "No";
}

/* ------------------------------------------------------------------ */
/* Sub-componentes                                                    */
/* ------------------------------------------------------------------ */

/** Tarjeta genérica con icono, etiqueta y contenido libre. */
function InfoCard({
    icon,
    label,
    children,
    span = false,
}: {
    icon: string;
    label: string;
    children: React.ReactNode;
    span?: boolean;
}) {
    return (
        <div className={`rounded-xl border border-outline-variant bg-background p-4 ${span ? "sm:col-span-2" : ""}`}>
            <div className="flex items-center gap-2 text-on-surface-variant">
                <span className="material-symbols-rounded text-lg" aria-hidden="true">{icon}</span>
                <span className="text-xs font-medium uppercase tracking-wide">{label}</span>
            </div>
            <div className="mt-1.5">{children}</div>
        </div>
    );
}

/** Badge genérico que muestra un texto con color. */
function TagBadge({ label, className }: { label: string; className?: string }) {
    return (
        <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ${className ?? "bg-surface-container-high text-on-surface"}`}>
            {label}
        </span>
    );
}

/** Sección con título e ícono, para agrupar bloques del perfil. */
function SectionTitle({ icon, title }: { icon: string; title: string }) {
    return (
        <div className="flex items-center gap-2 mb-3 pt-2">
            <span className="material-symbols-rounded text-xl text-primary" aria-hidden="true">{icon}</span>
            <h2 className="text-lg font-bold text-on-surface">{title}</h2>
        </div>
    );
}

/** Fila de verificación con ícono. */
function VerifiedIcon({ verified, label }: { verified: boolean; label: string }) {
    return verified ? (
        <span className="material-symbols-rounded text-base text-[color:var(--color-success)] shrink-0" title={label}>verified</span>
    ) : (
        <span className="material-symbols-rounded text-base text-on-surface-variant shrink-0" title={label}>help</span>
    );
}

/* ------------------------------------------------------------------ */
/* Página principal                                                   */
/* ------------------------------------------------------------------ */

export default function VolunteerDetailPage() {
    const params = useParams();
    const router = useRouter();
    const id = params.id as string;

    const [perfil, setPerfil] = useState<VolunteerProfileResponse | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [isEditing, setIsEditing] = useState(false);
    const [actionLoading, setActionLoading] = useState(false);
    const [pendingDecision, setPendingDecision] = useState<"approved" | "rejected" | null>(null);
    const [executingDecision, setExecutingDecision] = useState<"approved" | "rejected" | null>(null);
    const confirmDialogRef = useRef<HTMLDialogElement>(null);

    // Estado para revisión de documentos
    const [docActionLoadingId, setDocActionLoadingId] = useState<number | null>(null);
    const [docRejecting, setDocRejecting] = useState<{ id: number; name: string } | null>(null);
    const [docRejectReason, setDocRejectReason] = useState("");
    const docRejectDialogRef = useRef<HTMLDialogElement>(null);
    const [docApproving, setDocApproving] = useState<{ id: number; name: string } | null>(null);
    const docApproveDialogRef = useRef<HTMLDialogElement>(null);
    const [downloadingDocId, setDownloadingDocId] = useState<number | null>(null);

    useEffect(() => {
        async function load() {
            setIsLoading(true);
            try {
                const data = await getVolunteerProfile(id);
                setPerfil(data);
            } catch (error) {
                const message = error instanceof Error ? error.message : "No se pudo cargar el voluntario";
                alertService.error(message);
                setPerfil(null);
            } finally {
                setIsLoading(false);
            }
        }
        load();
    }, [id]);

    const executeDecision = async (status: "approved" | "rejected") => {
        setActionLoading(true);
        setExecutingDecision(status);
        try {
            if (status === "approved") {
                await approveUser(id);
                alertService.success("Voluntario aprobado.");
            } else {
                await rejectUser(id);
                alertService.warning("Voluntario rechazado.");
            }
            router.push("/dashboard/voluntarios");
        } catch (error) {
            const msg = error instanceof Error ? error.message : "Error desconocido";
            alertService.error(`Error al ${status === "approved" ? "aprobar" : "rechazar"}: ${msg}`);
        } finally {
            setActionLoading(false);
            setExecutingDecision(null);
        }
    };

    const handleConfirmDecision = () => {
        if (!pendingDecision) return;
        // Cerrar el modal antes de ejecutar para evitar re-render con estado null
        closeConfirm();
        executeDecision(pendingDecision);
    };

    const openConfirm = (decision: "approved" | "rejected") => {
        setPendingDecision(decision);
        confirmDialogRef.current?.showModal();
    };

    const closeConfirm = () => {
        setPendingDecision(null);
        confirmDialogRef.current?.close();
    };

    /* --------------------- Acciones de documentos --------------------- */

    const handleDownloadDocument = async (docId: number) => {
        setDownloadingDocId(docId);
        try {
            const { downloadUrl } = await getDocumentDownloadUrl(docId);
            // Abrir URL prefirmada en pestaña nueva
            window.open(downloadUrl, "_blank", "noopener,noreferrer");
        } catch (error) {
            const msg = error instanceof Error ? error.message : "No se pudo obtener el enlace de descarga";
            alertService.error(msg);
        } finally {
            setDownloadingDocId(null);
        }
    };

    const openDocRejectDialog = (docId: number, docName: string) => {
        setDocRejecting({ id: docId, name: docName });
        setDocRejectReason("");
        docRejectDialogRef.current?.showModal();
    };

    const closeDocRejectDialog = () => {
        setDocRejecting(null);
        setDocRejectReason("");
        docRejectDialogRef.current?.close();
    };

    const openDocApproveDialog = (docId: number, docName: string) => {
        setDocApproving({ id: docId, name: docName });
        docApproveDialogRef.current?.showModal();
    };

    const closeDocApproveDialog = () => {
        setDocApproving(null);
        docApproveDialogRef.current?.close();
    };

    const submitDocReview = async (status: "approved" | "rejected", reason?: string) => {
        if (!perfil) return;

        // Determinamos el id del documento a partir del estado correspondiente
        const documentId = status === "rejected" ? docRejecting?.id : docApproving?.id;
        if (!documentId) return;

        setDocActionLoadingId(documentId);
        try {
            await reviewVerificationDocument(documentId, {
                status,
                reason: reason?.trim() || undefined,
            });
            alertService.success(
                status === "approved" ? "Documento aprobado." : "Documento rechazado.",
            );
            // Refrescar el perfil para reflejar el nuevo estado
            const data = await getVolunteerProfile(id);
            setPerfil(data);
            if (status === "rejected") closeDocRejectDialog();
            if (status === "approved") closeDocApproveDialog();
        } catch (error) {
            const msg = error instanceof Error ? error.message : "Error desconocido";
            alertService.error(`Error al ${status === "approved" ? "aprobar" : "rechazar"} el documento: ${msg}`);
        } finally {
            setDocActionLoadingId(null);
        }
    };

    /** Actualiza una fila de documentos sin recargar (tras reemplazar, agregar o eliminar su archivo). */
    const updateDocument = (docId: number, changes: Partial<VerificationDocument>) => {
        setPerfil((prev) => prev && {
            ...prev,
            documents: prev.documents.map((d) => (d.id === docId ? { ...d, ...changes } : d)),
        });
    };

    /* --------------------- Estados de carga / error -------------------- */

    if (isLoading) {
        return (
            <div className="mx-auto mt-6 space-y-4">
                {Array.from({ length: 4 }).map((_, i) => (
                    <div key={i} className="rounded-2xl bg-surface-container-low animate-pulse h-28" />
                ))}
            </div>
        );
    }

    if (!perfil) {
        return (
            <div className="mx-auto mt-6">
                <div className="rounded-2xl border border-outline-variant bg-surface-container-low p-6 text-center">
                    <p className="text-on-surface-variant text-sm">No se encontró este voluntario.</p>
                    <Link href="/dashboard/voluntarios" className="text-primary inline-block font-semibold text-sm mt-4">
                        Volver al listado
                    </Link>
                </div>
            </div>
        );
    }

    const { user, details, volunteerProfile, interestAreas, experience, verification, documents } = perfil;

    /* --------------------- Vista principal ---------------------------- */

    return (
        <div className="mx-auto mt-6 space-y-6">

            {/* ================================================================ */}
            {/* 1. Cabecera + Datos básicos del usuario                           */}
            {/* ================================================================ */}
            <div className="rounded-2xl border border-outline-variant bg-surface-container-low p-6">
                <div className="flex items-start justify-between gap-3">
                    <div className="flex items-center gap-3 flex-wrap min-w-0">
                        <h1 className="text-xl sm:text-2xl font-bold text-on-surface truncate min-w-0" title={user.fullName}>{user.fullName}</h1>
                        <span className="shrink-0">
                            <StatusBadge status={user.status} />
                        </span>
                    </div>
                    {!isEditing && (
                        <button
                            type="button"
                            onClick={() => setIsEditing(true)}
                            className="shrink-0 inline-flex items-center gap-2 rounded-xl border border-outline px-4 py-2 text-sm font-semibold text-primary hover:bg-surface-container transition-colors focus-visible:outline-3 focus-visible:outline-primary focus-visible:outline-offset-2"
                        >
                            <span className="material-symbols-rounded text-lg" aria-hidden="true">edit</span>
                            Editar
                        </button>
                    )}
                </div>

                {!isEditing && (
                <div className="mt-5 grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <InfoCard icon="mail" label="Correo electrónico">
                        <div className="flex items-center gap-1.5">
                            <p className="text-sm font-medium text-on-surface truncate">{user.email}</p>
                            <VerifiedIcon verified={user.emailVerified} label={user.emailVerified ? "Verificado" : "No verificado"} />
                        </div>
                    </InfoCard>

                    <InfoCard icon="call" label="Teléfono">
                        <div className="flex items-center gap-1.5">
                            <p className="text-sm font-medium text-on-surface">{user.phone || "—"}</p>
                            <VerifiedIcon verified={user.phoneVerified} label={user.phoneVerified ? "Verificado" : "No verificado"} />
                        </div>
                    </InfoCard>

                    <InfoCard icon="location_on" label="Zona de cobertura" span>
                        <p className="text-sm font-medium text-on-surface">{user.zone || "—"}</p>
                    </InfoCard>

                    {user.location && (
                        <InfoCard icon="map" label="Ubicación" span>
                            <Location value={user.location} readOnly />
                            <p className="text-xs text-on-surface-variant mt-2">
                                {user.location.lat.toFixed(5)}, {user.location.lng.toFixed(5)}
                            </p>
                        </InfoCard>
                    )}

                    <InfoCard icon="event" label="Fecha de registro">
                        <p className="text-sm font-medium text-on-surface">{fmtDate(user.createdAt)}</p>
                    </InfoCard>

                    <InfoCard icon="update" label="Última actualización">
                        <p className="text-sm font-medium text-on-surface">{fmtDate(user.updatedAt)}</p>
                    </InfoCard>
                </div>
                )}
            </div>

            {/* Modo edición: reemplaza las secciones de solo lectura 1-4. */}
            {isEditing ? (
                <VolunteerEditForm
                    perfil={perfil}
                    onCancel={() => setIsEditing(false)}
                    onSaved={(updated) => {
                        setPerfil(updated);
                        setIsEditing(false);
                    }}
                />
            ) : (
                <>

            {/* ================================================================ */}
            {/* 2. Perfil de voluntariado (volunteer_profiles)                    */}
            {/* ================================================================ */}
            {volunteerProfile && (
                <div className="rounded-2xl border border-outline-variant bg-surface-container-low p-6">
                    <SectionTitle icon="badge" title="Perfil de voluntariado" />

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <InfoCard icon="category" label="Tipo de voluntario">
                            <TagBadge
                                label={VOLUNTEER_TYPE_LABELS[volunteerProfile.volunteerType] ?? volunteerProfile.volunteerType}
                                className="bg-[color:var(--color-primary-container)] text-[color:var(--color-on-primary-container)]"
                            />
                        </InfoCard>

                        {(volunteerProfile.documentType || volunteerProfile.documentNumber) && (
                            <InfoCard icon="badge" label="Documento de identidad">
                                <p className="text-sm font-medium text-on-surface">
                                    {volunteerProfile.documentType ? `${volunteerProfile.documentType}: ` : ""}
                                    {volunteerProfile.documentNumber || "—"}
                                </p>
                            </InfoCard>
                        )}

                        {volunteerProfile.birthDate && (
                            <InfoCard icon="cake" label="Fecha de nacimiento">
                                <p className="text-sm font-medium text-on-surface">{fmtDate(volunteerProfile.birthDate)}</p>
                            </InfoCard>
                        )}

                        {volunteerProfile.address && (
                            <InfoCard icon="home_pin" label="Dirección" span>
                                <p className="text-sm font-medium text-on-surface">{volunteerProfile.address}</p>
                            </InfoCard>
                        )}

                        {volunteerProfile.profession && (
                            <InfoCard icon="work" label="Profesión">
                                <p className="text-sm font-medium text-on-surface">{volunteerProfile.profession}</p>
                            </InfoCard>
                        )}

                        {volunteerProfile.availabilityMode && (
                            <InfoCard icon="schedule" label="Modalidad de disponibilidad">
                                <TagBadge
                                    label={AVAILABILITY_MODE_LABELS[volunteerProfile.availabilityMode] ?? volunteerProfile.availabilityMode}
                                    className="bg-[color:var(--color-tertiary-container)] text-[color:var(--color-on-tertiary-container)]"
                                />
                            </InfoCard>
                        )}

                        <InfoCard icon="history" label="Experiencia previa">
                            <p className="text-sm font-medium text-on-surface">{fmtBoolean(volunteerProfile.hasPriorExperience)}</p>
                        </InfoCard>

                        <InfoCard icon="directions_car" label="Medio de transporte">
                            <p className="text-sm font-medium text-on-surface">{fmtBoolean(volunteerProfile.transportAvailable)}</p>
                        </InfoCard>

                        {volunteerProfile.languages && volunteerProfile.languages.length > 0 && (
                            <InfoCard icon="translate" label="Idiomas" span>
                                <div className="flex flex-wrap gap-2">
                                    {volunteerProfile.languages.map((lang) => (
                                        <TagBadge key={lang} label={lang} />
                                    ))}
                                </div>
                            </InfoCard>
                        )}
                    </div>
                </div>
            )}

            {/* ================================================================ */}
            {/* 2.5. Disponibilidad y habilidades (user_details)                  */}
            {/* ================================================================ */}
            {details && (
                <div className="rounded-2xl border border-outline-variant bg-surface-container-low p-6">
                    <SectionTitle icon="event_available" title="Disponibilidad y habilidades" />

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        {details.availableHours != null && (
                            <InfoCard icon="hourglass_top" label="Horas disponibles por semana">
                                <p className="text-sm font-medium text-on-surface">{details.availableHours}</p>
                            </InfoCard>
                        )}

                        {details.availableDays && details.availableDays.length > 0 && (
                            <InfoCard icon="calendar_month" label="Días disponibles">
                                <div className="flex flex-wrap gap-2">
                                    {details.availableDays.map((day) => (
                                        <TagBadge key={day} label={day} />
                                    ))}
                                </div>
                            </InfoCard>
                        )}

                        {details.skills && details.skills.length > 0 && (
                            <InfoCard icon="construction" label="Habilidades" span>
                                <div className="flex flex-wrap gap-2">
                                    {details.skills.map((skill) => (
                                        <TagBadge key={skill} label={skill} className="bg-[color:var(--color-primary-container)] text-[color:var(--color-on-primary-container)]" />
                                    ))}
                                </div>
                            </InfoCard>
                        )}
                    </div>
                </div>
            )}

            {/* ================================================================ */}
            {/* 3. Áreas de interés + Categorías de experiencia                   */}
            {/* ================================================================ */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                {interestAreas.length > 0 && (
                    <div className="rounded-2xl border border-outline-variant bg-surface-container-low p-6">
                        <SectionTitle icon="favorite" title="Áreas de interés" />
                        <div className="flex flex-wrap gap-2">
                            {interestAreas.map((a) => (
                                <TagBadge key={a.id} label={a.name} className="bg-[color:var(--color-primary-container)] text-[color:var(--color-on-primary-container)]" />
                            ))}
                        </div>
                    </div>
                )}

                {experience.length > 0 && (
                    <div className="rounded-2xl border border-outline-variant bg-surface-container-low p-6">
                        <SectionTitle icon="workspace_premium" title="Categorías de experiencia" />
                        <div className="flex flex-wrap gap-2">
                            {experience.map((e) => (
                                <TagBadge key={e.id} label={e.name} className="bg-[color:var(--color-tertiary-container)] text-[color:var(--color-on-tertiary-container)]" />
                            ))}
                        </div>
                    </div>
                )}
            </div>
            </>
            )}

            {/* ================================================================ */}
            {/* 4. Verificación                                                   */}
            {/* ================================================================ */}
            <div className="rounded-2xl border border-outline-variant bg-surface-container-low p-6">
                <SectionTitle icon="verified_user" title="Verificación" />

                {verification ? (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <InfoCard icon="info" label="Estado de la solicitud">
                            <TagBadge
                                label={VERIFICATION_LABELS[verification.status] ?? verification.status}
                                className={VERIFICATION_CLASSES[verification.status]}
                            />
                        </InfoCard>
                        <InfoCard icon="event" label="Fecha de entrega">
                            <p className="text-sm font-medium text-on-surface">{fmtDate(verification.submittedAt)}</p>
                        </InfoCard>
                        {verification.reviewedAt && (
                            <InfoCard icon="event_available" label="Fecha de revisión">
                                <p className="text-sm font-medium text-on-surface">{fmtDate(verification.reviewedAt)}</p>
                            </InfoCard>
                        )}
                        {verification.rejectionReason && (
                            <InfoCard icon="feedback" label="Motivo de rechazo" span>
                                <p className="text-sm text-on-surface whitespace-pre-line">{verification.rejectionReason}</p>
                            </InfoCard>
                        )}
                    </div>
                ) : (
                    <p className="text-sm text-on-surface-variant">Este voluntario no ha iniciado el proceso de verificación.</p>
                )}
            </div>

            {/* ================================================================ */}
            {/* 5. Documentos                                                     */}
            {/* ================================================================ */}
            <div className="rounded-2xl border border-outline-variant bg-surface-container-low p-6">
                <SectionTitle icon="folder" title="Documentos" />

                {documents.length > 0 ? (
                    <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                            <thead>
                                <tr className="border-b border-outline-variant text-left text-xs font-medium uppercase tracking-wide text-on-surface-variant">
                                    <th className="pb-2 pr-4">Documento</th>
                                    <th className="pb-2 pr-4">Estado</th>
                                    <th className="pb-2 pr-4">Subido</th>
                                    <th className="pb-2 pr-4">Revisado</th>
                                    <th className="pb-2 text-right">Acciones</th>
                                </tr>
                            </thead>
                            <tbody>
                                {documents.map((doc) => {
                                    const isDocLoading = docActionLoadingId === doc.id;
                                    const isDownloading = downloadingDocId === doc.id;
                                    return (
                                        <tr key={doc.id} className="border-b border-outline-variant/50 last:border-0">
                                            <td className="py-2.5 pr-4 font-medium text-on-surface">
                                                <div className="flex flex-col">
                                                    <span>{doc.documentTypeName}</span>
                                                    {doc.rejectionReason && (
                                                        <span className="text-xs text-on-surface-variant mt-0.5">
                                                            Motivo: {doc.rejectionReason}
                                                        </span>
                                                    )}
                                                </div>
                                            </td>
                                            <td className="py-2.5 pr-4">
                                                {doc.hasFile ? (
                                                    <TagBadge
                                                        label={DOC_STATUS_LABELS[doc.status] ?? doc.status}
                                                        className={DOC_STATUS_CLASSES[doc.status]}
                                                    />
                                                ) : (
                                                    <TagBadge label="Sin archivo cargado" />
                                                )}
                                            </td>
                                            <td className="py-2.5 pr-4 text-on-surface-variant text-xs">{doc.hasFile ? fmtDate(doc.uploadedAt) : "—"}</td>
                                            <td className="py-2.5 pr-4 text-on-surface-variant text-xs">{fmtDate(doc.reviewedAt)}</td>
                                            <td className="py-2.5">
                                                <div className="flex items-center justify-end gap-1.5">
                                                    {/* Descargar */}
                                                    <button
                                                        type="button"
                                                        onClick={() => handleDownloadDocument(doc.id)}
                                                        disabled={isDownloading || !doc.hasFile}
                                                        aria-disabled={isDownloading || !doc.hasFile}
                                                        title={doc.hasFile ? "Descargar documento" : "No hay archivo cargado"}
                                                        aria-label={`Descargar ${doc.documentTypeName}`}
                                                        className="inline-flex items-center justify-center h-9 w-9 rounded-lg text-on-surface-variant hover:bg-surface-container hover:text-primary transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                                                    >
                                                        <span className="material-symbols-rounded text-lg" aria-hidden="true">
                                                            {isDownloading ? "hourglass_top" : "download"}
                                                        </span>
                                                    </button>

                                                    {/* Reemplazar / Eliminar / Agregar archivo */}
                                                    <DocumentFileActions
                                                        doc={doc}
                                                        onChange={(changes) => updateDocument(doc.id, changes)}
                                                    />

                                                    {/* Aprobar / Rechazar — solo si está pendiente y tiene archivo */}
                                                    {doc.status === "pending" && doc.hasFile && (
                                                        <>
                                                            <button
                                                                type="button"
                                                                onClick={() => openDocApproveDialog(doc.id, doc.documentTypeName)}
                                                                disabled={isDocLoading}
                                                                title="Aprobar documento"
                                                                aria-label={`Aprobar ${doc.documentTypeName}`}
                                                                className="inline-flex items-center justify-center h-9 w-9 rounded-lg text-[color:var(--color-success)] hover:bg-[color:var(--color-success-container)] transition-colors disabled:opacity-50"
                                                            >
                                                                <span className="material-symbols-rounded text-lg" aria-hidden="true">check</span>
                                                            </button>
                                                            <button
                                                                type="button"
                                                                onClick={() => openDocRejectDialog(doc.id, doc.documentTypeName)}
                                                                disabled={isDocLoading}
                                                                title="Rechazar documento"
                                                                aria-label={`Rechazar ${doc.documentTypeName}`}
                                                                className="inline-flex items-center justify-center h-9 w-9 rounded-lg text-error hover:bg-error-container transition-colors disabled:opacity-50"
                                                            >
                                                                <span className="material-symbols-rounded text-lg" aria-hidden="true">close</span>
                                                            </button>
                                                        </>
                                                    )}
                                                </div>
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                ) : (
                    <p className="text-sm text-on-surface-variant">No se han cargado documentos.</p>
                )}
            </div>

            {/* ================================================================ */}
            {/* 6. Acciones — aprobar / rechazar (solo si está pendiente)         */}
            {/* ================================================================ */}
            {user.status === "pending" && (
                <div className="rounded-2xl border border-outline-variant bg-surface-container-low p-6">
                    <SectionTitle icon="gavel" title="Decisión de revisión" />
                    <p className="text-sm text-on-surface-variant mb-4">
                        Revisa toda la información antes de tomar una decisión. Esta acción cambiará el estado del voluntario.
                    </p>
                    <div className="flex gap-3">
                        <button
                            type="button"
                            disabled={actionLoading}
                            onClick={() => openConfirm("rejected")}
                            className="flex-1 rounded-xl border border-outline px-4 py-2.5 text-sm font-semibold text-on-surface hover:bg-surface-container transition-colors disabled:opacity-50"
                        >
                            <span className="flex items-center justify-center gap-2">
                                <span className="material-symbols-rounded text-lg" aria-hidden="true">close</span>
                                Rechazar
                            </span>
                        </button>
                        <button
                            type="button"
                            disabled={actionLoading}
                            onClick={() => openConfirm("approved")}
                            className="flex-1 rounded-xl bg-primary text-on-primary px-4 py-2.5 text-sm font-semibold hover:opacity-90 transition-opacity disabled:opacity-50"
                        >
                            <span className="flex items-center justify-center gap-2">
                                <span className="material-symbols-rounded text-lg" aria-hidden="true">check</span>
                                Aprobar
                            </span>
                        </button>
                    </div>
                </div>
            )}

            {/* ================================================================ */}
            {/* Diálogo de confirmación                                           */}
            {/* ================================================================ */}
            <dialog
                ref={confirmDialogRef}
                style={{ margin: "auto" }}
                className="rounded-2xl border border-outline-variant bg-surface-container-low p-0 shadow-lg backdrop:bg-black/80 max-w-md w-full"
                onCancel={closeConfirm}
                aria-label="Confirmar decisión"
            >
                <div className="p-6">
                    <div className="flex items-center gap-3 mb-4">
                        <span
                            className={`material-symbols-rounded text-2xl ${(executingDecision ?? pendingDecision) === "approved" ? "text-[color:var(--color-success)]" : "text-error"}`}
                            aria-hidden="true"
                        >
                            {(executingDecision ?? pendingDecision) === "approved" ? "check_circle" : "cancel"}
                        </span>
                        <h3 className="text-base font-bold text-on-surface">
                            {(executingDecision ?? pendingDecision) === "approved" ? "¿Aprobar voluntario?" : "¿Rechazar voluntario?"}
                        </h3>
                    </div>
                    <p className="text-sm text-on-surface-variant mb-6">
                        {(executingDecision ?? pendingDecision) === "approved"
                            ? `Vas a aprobar a "${perfil?.user.fullName}". El voluntario podrá operar en la plataforma.`
                            : `Vas a rechazar a "${perfil?.user.fullName}". El voluntario no podrá operar en la plataforma.`
                        }
                    </p>
                    <div className="flex gap-3">
                        <button
                            type="button"
                            disabled={actionLoading}
                            onClick={closeConfirm}
                            className="flex-1 rounded-xl border border-outline px-4 py-2.5 text-sm font-semibold text-on-surface hover:bg-surface-container transition-colors disabled:opacity-50"
                        >
                            Cancelar
                        </button>
                        <button
                            type="button"
                            disabled={actionLoading}
                            onClick={handleConfirmDecision}
                            className={`flex-1 rounded-xl px-4 py-2.5 text-sm font-semibold transition-opacity disabled:opacity-50 ${
                                (executingDecision ?? pendingDecision) === "approved"
                                    ? "bg-primary text-on-primary hover:opacity-90"
                                    : "bg-error text-on-error hover:opacity-90"
                            }`}
                        >
                            {actionLoading ? "Procesando…" : (executingDecision ?? pendingDecision) === "approved" ? "Sí, aprobar" : "Sí, rechazar"}
                        </button>
                    </div>
                </div>
            </dialog>

            {/* ================================================================ */}
            {/* Diálogo para rechazar documento (motivo opcional)                 */}
            {/* ================================================================ */}
            <dialog
                ref={docRejectDialogRef}
                style={{ margin: "auto" }}
                className="rounded-2xl border border-outline-variant bg-surface-container-low p-0 shadow-lg backdrop:bg-black/80 max-w-md w-full"
                onCancel={closeDocRejectDialog}
                aria-label="Rechazar documento"
            >
                <div className="p-6">
                    <div className="flex items-center gap-3 mb-4">
                        <span className="material-symbols-rounded text-2xl text-error" aria-hidden="true">cancel</span>
                        <h3 className="text-base font-bold text-on-surface">Rechazar documento</h3>
                    </div>
                    <p className="text-sm text-on-surface-variant mb-4">
                        Vas a rechazar <span className="font-semibold text-on-surface">&ldquo;{docRejecting?.name}&rdquo;</span>.
                        Indica opcionalmente un motivo para que el voluntario pueda corregirlo.
                    </p>
                    <label htmlFor="doc-reject-reason" className="block text-xs font-medium text-on-surface-variant mb-1.5 uppercase tracking-wide">
                        Motivo (opcional)
                    </label>
                    <textarea
                        id="doc-reject-reason"
                        value={docRejectReason}
                        onChange={(e) => setDocRejectReason(e.target.value)}
                        rows={3}
                        placeholder="Ej. Documento ilegible, vencido, archivo incorrecto…"
                        className="w-full rounded-xl border border-outline-variant bg-background p-3 text-sm text-on-surface placeholder:text-on-surface-variant focus:outline-none focus:ring-2 focus:ring-primary resize-none"
                    />
                    <div className="flex gap-3 mt-5">
                        <button
                            type="button"
                            disabled={docActionLoadingId !== null}
                            onClick={closeDocRejectDialog}
                            className="flex-1 rounded-xl border border-outline px-4 py-2.5 text-sm font-semibold text-on-surface hover:bg-surface-container transition-colors disabled:opacity-50"
                        >
                            Cancelar
                        </button>
                        <button
                            type="button"
                            disabled={docActionLoadingId !== null}
                            onClick={() => submitDocReview("rejected", docRejectReason)}
                            className="flex-1 rounded-xl bg-error text-on-error px-4 py-2.5 text-sm font-semibold hover:opacity-90 transition-opacity disabled:opacity-50"
                        >
                            {docActionLoadingId !== null ? "Procesando…" : "Sí, rechazar"}
                        </button>
                    </div>
                </div>
            </dialog>

            {/* ================================================================ */}
            {/* Diálogo de confirmación para aprobar documento                    */}
            {/* ================================================================ */}
            <dialog
                ref={docApproveDialogRef}
                style={{ margin: "auto" }}
                className="rounded-2xl border border-outline-variant bg-surface-container-low p-0 shadow-lg backdrop:bg-black/80 max-w-md w-full"
                onCancel={closeDocApproveDialog}
                aria-label="Confirmar aprobación de documento"
            >
                <div className="p-6">
                    <div className="flex items-center gap-3 mb-4">
                        <span className="material-symbols-rounded text-2xl text-[color:var(--color-success)]" aria-hidden="true">check_circle</span>
                        <h3 className="text-base font-bold text-on-surface">¿Aprobar documento?</h3>
                    </div>
                    <p className="text-sm text-on-surface-variant mb-6">
                        Vas a aprobar <span className="font-semibold text-on-surface">&ldquo;{docApproving?.name}&rdquo;</span>.
                        Esta acción no se puede deshacer y el documento quedará marcado como aprobado.
                    </p>
                    <div className="flex gap-3">
                        <button
                            type="button"
                            disabled={docActionLoadingId !== null}
                            onClick={closeDocApproveDialog}
                            className="flex-1 rounded-xl border border-outline px-4 py-2.5 text-sm font-semibold text-on-surface hover:bg-surface-container transition-colors disabled:opacity-50"
                        >
                            Cancelar
                        </button>
                        <button
                            type="button"
                            disabled={docActionLoadingId !== null}
                            onClick={() => submitDocReview("approved")}
                            className="flex-1 rounded-xl bg-primary text-on-primary px-4 py-2.5 text-sm font-semibold hover:opacity-90 transition-opacity disabled:opacity-50"
                        >
                            {docActionLoadingId !== null ? "Procesando…" : "Sí, aprobar"}
                        </button>
                    </div>
                </div>
            </dialog>

        </div>
    );
}
