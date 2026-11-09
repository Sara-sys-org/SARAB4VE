"use client";

import { useEffect, useRef } from "react";

type ConfirmDialogProps = {
    open: boolean;
    title: string;
    /** Nombre del ícono de Material Symbols. */
    icon: string;
    /** "danger" para acciones destructivas (rojo), "primary" para confirmaciones normales. */
    tone?: "danger" | "primary";
    /** Mensaje del cuerpo del diálogo. */
    children: React.ReactNode;
    confirmLabel: string;
    cancelLabel?: string;
    /** Mientras es true, los botones se deshabilitan y no se puede cerrar con Escape. */
    isLoading?: boolean;
    loadingLabel?: string;
    onConfirm: () => void;
    onCancel: () => void;
};

const TONE_CLASSES = {
    danger: { icon: "text-error", button: "bg-error text-on-error" },
    primary: { icon: "text-primary", button: "bg-primary text-on-primary" },
};

/**
 * Diálogo de confirmación accesible basado en <dialog> nativo (foco atrapado,
 * cierre con Escape). Se controla con la prop `open`.
 */
export default function ConfirmDialog({
    open,
    title,
    icon,
    tone = "primary",
    children,
    confirmLabel,
    cancelLabel = "Cancelar",
    isLoading = false,
    loadingLabel = "Procesando…",
    onConfirm,
    onCancel,
}: ConfirmDialogProps) {
    const dialogRef = useRef<HTMLDialogElement>(null);
    const colors = TONE_CLASSES[tone];

    useEffect(() => {
        const dialog = dialogRef.current;
        if (!dialog) return;
        if (open && !dialog.open) dialog.showModal();
        if (!open && dialog.open) dialog.close();
    }, [open]);

    return (
        <dialog
            ref={dialogRef}
            style={{ margin: "auto" }}
            className="rounded-2xl border border-outline-variant bg-surface-container-low p-0 shadow-lg backdrop:bg-black/80 max-w-md w-full"
            onCancel={(event) => {
                event.preventDefault(); // el estado `open` decide si se cierra
                if (!isLoading) onCancel();
            }}
            aria-label={title}
        >
            <div className="p-6 text-left">
                <div className="flex items-center gap-3 mb-4">
                    <span className={`material-symbols-rounded text-2xl ${colors.icon}`} aria-hidden="true">{icon}</span>
                    <h3 className="text-base font-bold text-on-surface">{title}</h3>
                </div>
                <div className="text-sm text-on-surface-variant mb-6">{children}</div>
                <div className="flex gap-3">
                    <button
                        type="button"
                        disabled={isLoading}
                        onClick={onCancel}
                        className="flex-1 rounded-xl border border-outline px-4 py-2.5 text-sm font-semibold text-on-surface hover:bg-surface-container transition-colors disabled:opacity-50"
                    >
                        {cancelLabel}
                    </button>
                    <button
                        type="button"
                        disabled={isLoading}
                        onClick={onConfirm}
                        className={`flex-1 rounded-xl px-4 py-2.5 text-sm font-semibold hover:opacity-90 transition-opacity disabled:opacity-50 ${colors.button}`}
                    >
                        {isLoading ? loadingLabel : confirmLabel}
                    </button>
                </div>
            </div>
        </dialog>
    );
}
