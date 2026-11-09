"use client";

import { useRef, useState } from "react";
import ConfirmDialog from "@/components/ui/ConfirmDialog";
import { alertService } from "@/services/alertService";
import {
    uploadDocumentFile,
    deleteDocumentFile,
    DocumentFileError,
    type DocumentFileResult,
} from "@/api/verification";
import type { VerificationDocument } from "@/types/index";

const ALLOWED_EXTENSIONS = ["pdf", "jpg", "jpeg", "png", "doc", "docx"];
const ACCEPT_ATTRIBUTE = ".pdf,.jpg,.jpeg,.png,.doc,.docx";
const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10 MB

const GONE_STATUSES = [404, 409];

type Props = {
    doc: VerificationDocument;
    onChange: (changes: Partial<VerificationDocument>) => void;
};
const ICON_BUTTON =
    "inline-flex items-center justify-center h-9 w-9 rounded-lg transition-colors disabled:opacity-40 disabled:cursor-not-allowed";
type DeleteStep = "confirm" | "final" | null;

export default function DocumentFileActions({ doc, onChange }: Props) {
    const inputRef = useRef<HTMLInputElement>(null);

    const [progress, setProgress] = useState<number | null>(null);
    const [isDeleting, setIsDeleting] = useState(false);
    const [deleteStep, setDeleteStep] = useState<DeleteStep>(null);

    const name = doc.documentTypeName;
    const isUploading = progress !== null;
    const isBusy = isUploading || isDeleting;
    const noFileTitle = "No hay archivo cargado";

    const showResult = (result: DocumentFileResult) => {
        onChange(result.document);
        if (result.notice) alertService.warning(result.notice);
        else if (result.message) alertService.success(result.message);
    };

    const showError = (error: unknown) => {
        const message = error instanceof Error ? error.message : "No se pudo completar la acción. Inténtalo de nuevo.";
        if (error instanceof DocumentFileError && GONE_STATUSES.includes(error.status)) {
            // El archivo ya no estaba: la fila se mantiene, pero queda sin archivo
            onChange({ hasFile: false, storageKey: null });
            alertService.warning(message);
            return;
        }
        alertService.error(message);
    };

    /* ----------------------------- Subir ------------------------------ */

    const handleFileSelected = async (event: React.ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        event.target.value = ""; // permite volver a elegir el mismo archivo
        if (!file) return;

        const ext = file.name.split(".").pop()?.toLowerCase() ?? "";
        if (!ALLOWED_EXTENSIONS.includes(ext)) {
            alertService.error("Formato no permitido. Usa PDF, JPG, PNG o Word.");
            return;
        }
        if (file.size > MAX_FILE_SIZE) {
            alertService.error("El archivo es muy grande. El máximo es 10 MB.");
            return;
        }

        setProgress(0);
        try {
            showResult(await uploadDocumentFile(doc.id, file, setProgress));
        } catch (error) {
            showError(error);
        } finally {
            setProgress(null);
        }
    };

    const handleDelete = async () => {
        setIsDeleting(true);
        try {
            showResult(await deleteDocumentFile(doc.id));
        } catch (error) {
            showError(error);
        } finally {
            setIsDeleting(false);
            setDeleteStep(null);
        }
    };

    if (isUploading) {
        return (
            <div className="flex w-36 flex-col gap-1" aria-live="polite">
                <span className="text-xs text-on-surface-variant">Subiendo… {progress}%</span>
                <div
                    role="progressbar"
                    aria-label={`Subiendo ${name}`}
                    aria-valuemin={0}
                    aria-valuemax={100}
                    aria-valuenow={progress}
                    className="h-1.5 w-full overflow-hidden rounded-full bg-surface-container-high"
                >
                    <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${progress}%` }} />
                </div>
            </div>
        );
    }

    return (
        <>
            <input
                ref={inputRef}
                type="file"
                accept={ACCEPT_ATTRIBUTE}
                className="hidden"
                onChange={handleFileSelected}
                tabIndex={-1}
                aria-hidden="true"
            />

            {/* Reemplazar */}
            <button
                type="button"
                onClick={() => inputRef.current?.click()}
                disabled={!doc.hasFile || isBusy}
                aria-disabled={!doc.hasFile || isBusy}
                title={doc.hasFile ? "Reemplazar documento" : noFileTitle}
                aria-label={doc.hasFile ? `Reemplazar ${name}` : `Reemplazar ${name}: ${noFileTitle.toLowerCase()}`}
                className={`${ICON_BUTTON} text-on-surface-variant hover:bg-surface-container hover:text-primary`}
            >
                <span className="material-symbols-rounded text-lg" aria-hidden="true">sync</span>
            </button>

            {/* Eliminar */}
            <button
                type="button"
                onClick={() => setDeleteStep("confirm")}
                disabled={!doc.hasFile || isBusy}
                aria-disabled={!doc.hasFile || isBusy}
                title={doc.hasFile ? "Eliminar archivo" : noFileTitle}
                aria-label={doc.hasFile ? `Eliminar archivo de ${name}` : `Eliminar ${name}: ${noFileTitle.toLowerCase()}`}
                className={`${ICON_BUTTON} text-error hover:bg-error-container`}
            >
                <span className="material-symbols-rounded text-lg" aria-hidden="true">
                    {isDeleting ? "hourglass_top" : "delete"}
                </span>
            </button>

            {!doc.hasFile && (
                <button
                    type="button"
                    onClick={() => inputRef.current?.click()}
                    disabled={isBusy}
                    title="Agregar documento"
                    aria-label={`Agregar archivo de ${name}`}
                    className="inline-flex items-center gap-1 h-9 rounded-lg px-2.5 text-xs font-semibold text-primary hover:bg-primary/10 transition-colors disabled:opacity-40"
                >
                    <span className="material-symbols-rounded text-lg" aria-hidden="true">add</span>
                    Agregar
                </button>
            )}

            <ConfirmDialog
                open={deleteStep === "confirm"}
                title="¿Eliminar archivo?"
                icon="delete"
                tone="danger"
                confirmLabel="Eliminar"
                onConfirm={() => setDeleteStep("final")}
                onCancel={() => setDeleteStep(null)}
            >
                Vas a eliminar el archivo de <span className="font-semibold text-on-surface">&ldquo;{name}&rdquo;</span>.
                El documento seguirá en la lista y podrás agregar uno nuevo más adelante.
            </ConfirmDialog>

            <ConfirmDialog
                open={deleteStep === "final"}
                title="¿Estás seguro?"
                icon="warning"
                tone="danger"
                confirmLabel="Sí, eliminar"
                isLoading={isDeleting}
                loadingLabel="Eliminando…"
                onConfirm={handleDelete}
                onCancel={() => setDeleteStep(null)}
            >
                El archivo de <span className="font-semibold text-on-surface">&ldquo;{name}&rdquo;</span> se
                borrará y no se podrá recuperar.
            </ConfirmDialog>
        </>
    );
}
