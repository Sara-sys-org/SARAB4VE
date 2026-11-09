"use client";

import Link from "next/link";
import { useRef, useState, type ChangeEvent, type FocusEvent, type FormEvent } from "react";

export type SOSFormValues = {
  requester_name: string;
  last_name: string;
  contact_method: string;
  contact_value: string;
  need_type: string;
  description: string;
  urgency: string;
  address: string;
  country: string;
  people: number;
  gender: string;
  age: string;
  disability_type: string;
  disability_other_note: string;
};

/** Nota de voz grabada en el navegador, lista para adjuntar al envío. */
export type VoiceNote = { blob: Blob; url: string; durationSec: number };

// Mismo catálogo de 11 tipos que usan los formularios de registro de
// voluntario/organización (backend/sql/verification_schema.sql).
const DISABILITY_TYPES = [
  "Visual",
  "Auditiva",
  "Física",
  "Intelectual",
  "Psicosocial",
  "TEA",
  "Daño cerebral",
  "Discapacidad orgánica/visceral",
  "Enfermedades raras",
  "Multidiscapacidad",
  "Otras",
];

type Props = {
  form: SOSFormValues;
  onChange: (e: ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => void;
  onSubmit: (e: FormEvent) => Promise<void> | void;
  loading: boolean;
  onBack?: () => void;
  disabilityCardFile: File | null;
  onDisabilityCardFileChange: (file: File | null) => void;
  voiceNote: VoiceNote | null;
  onVoiceNoteChange: (note: VoiceNote | null) => void;
  /**
   * Notifica al padre cuando cualquier elemento focusable dentro del
   * formulario recibe o pierde el foco. Los eventos se delegan desde
   * el `<form>` (onFocus/onOnBlur), por eso el target es `HTMLFormElement`.
   * Permite al FAB minimizarse mientras el usuario escribe (vía
   * `FabVisibilityProvider`).
   */
  onFormFocus?: (e: FocusEvent<HTMLFormElement>) => void;
  onFormBlur?: (e: FocusEvent<HTMLFormElement>) => void;
};

export default function ClientForm({
  form,
  onChange,
  onSubmit,
  loading,
  onBack,
  disabilityCardFile,
  onDisabilityCardFileChange,
  voiceNote,
  onVoiceNoteChange,
  onFormFocus,
  onFormBlur,
}: Props) {
  const [recording, setRecording] = useState(false);
  const [recordingSec, setRecordingSec] = useState(0);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream, {
        mimeType: MediaRecorder.isTypeSupported("audio/webm") ? "audio/webm" : "audio/mp4",
      });
      chunksRef.current = [];
      mediaRecorderRef.current = recorder;

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };

      recorder.onstop = () => {
        stream.getTracks().forEach((t) => t.stop());
        const blob = new Blob(chunksRef.current, { type: recorder.mimeType });
        const url = URL.createObjectURL(blob);
        onVoiceNoteChange({ blob, url, durationSec: recordingSec });
        setRecording(false);
        if (timerRef.current) clearInterval(timerRef.current);
      };

      setRecordingSec(0);
      timerRef.current = setInterval(() => {
        setRecordingSec((prev) => prev + 1);
      }, 1000);

      recorder.start();
      setRecording(true);
    } catch {
      // Permiso denegado o no soportado — simplemente no se graba
    }
  };

  const stopRecording = () => {
    mediaRecorderRef.current?.stop();
    if (timerRef.current) clearInterval(timerRef.current);
  };

  const discardVoiceNote = () => {
    if (voiceNote) URL.revokeObjectURL(voiceNote.url);
    onVoiceNoteChange(null);
  };

  const handleCardFileChange = (e: ChangeEvent<HTMLInputElement>) => {
    onDisabilityCardFileChange(e.target.files?.[0] ?? null);
  };

  return (
    <form
      onSubmit={onSubmit}
      // Padding inferior para que el botón "Enviar" nunca quede
      // oculto por el FAB flotante. El FAB vive a `bottom-24` (96px)
      // y mide hasta ~64px de alto en su versión expandida; 128px de
      // margen asegura visibilidad incluso con teclado virtual abierto.
      className="flex flex-col gap-5 pb-32"
      onFocus={onFormFocus}
      onBlur={onFormBlur}
    >
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <label className="text-sm font-semibold text-on-surface mb-1">Nombre</label>
          <input name="requester_name" value={form.requester_name} onChange={onChange} className="w-full rounded-xl border border-outline-variant bg-surface-container-low px-4 py-3.5" placeholder="Tu nombre" required />
        </div>
        <div>
          <label className="text-sm font-semibold text-on-surface mb-1">Apellidos</label>
          <input name="last_name" value={form.last_name} onChange={onChange} className="w-full rounded-xl border border-outline-variant bg-surface-container-low px-4 py-3.5" placeholder="Tus apellidos" required />
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <label className="text-sm font-semibold text-on-surface mb-1">Género</label>
          <select name="gender" value={form.gender} onChange={onChange} className="w-full rounded-xl border border-outline-variant bg-surface-container-low px-4 py-3.5">
            <option value="">Prefiero no decir</option>
            <option value="femenino">Femenino</option>
            <option value="masculino">Masculino</option>
            <option value="otro">Otro</option>
          </select>
        </div>
        <div>
          <label className="text-sm font-semibold text-on-surface mb-1">Edad</label>
          <input name="age" value={form.age} onChange={onChange} type="number" min={0} max={120} className="w-full rounded-xl border border-outline-variant bg-surface-container-low px-4 py-3.5" placeholder="Ej. 34" />
        </div>
      </div>

      <div>
        <label className="text-sm font-semibold text-on-surface mb-1">Tipo de discapacidad</label>
        <select name="disability_type" value={form.disability_type} onChange={onChange} className="w-full rounded-xl border border-outline-variant bg-surface-container-low px-4 py-3.5">
          <option value="">Seleccionar</option>
          {DISABILITY_TYPES.map((type) => (
            <option key={type} value={type}>{type}</option>
          ))}
        </select>
        {form.disability_type === "Otras" && (
          <textarea
            name="disability_other_note"
            value={form.disability_other_note}
            onChange={onChange}
            rows={2}
            placeholder="Cuéntanos brevemente de qué tipo de discapacidad se trata"
            className="w-full mt-2 rounded-xl border border-outline-variant bg-surface-container-low px-4 py-3.5 resize-none"
          />
        )}
      </div>

      <div>
        <label className="text-sm font-semibold text-on-surface mb-1">
          Carnet de discapacidad <span className="text-on-surface-variant font-normal">(opcional)</span>
        </label>
        {disabilityCardFile ? (
          <div className="flex items-center justify-between gap-3 rounded-xl border border-outline-variant bg-surface-container-low px-4 py-3">
            <div className="flex items-center gap-2 min-w-0">
              <span className="material-symbols-rounded text-primary" aria-hidden="true">description</span>
              <span className="text-sm text-on-surface truncate">{disabilityCardFile.name}</span>
            </div>
            <button
              type="button"
              onClick={() => onDisabilityCardFileChange(null)}
              className="flex h-8 w-8 items-center justify-center rounded-lg text-on-surface-variant hover:bg-surface-container transition-colors shrink-0"
              aria-label="Quitar archivo"
            >
              <span className="material-symbols-rounded text-lg" aria-hidden="true">close</span>
            </button>
          </div>
        ) : (
          <label className="flex items-center justify-center gap-2 rounded-xl border-2 border-dashed border-outline-variant py-3.5 text-sm font-semibold text-on-surface-variant hover:border-primary/40 hover:text-primary hover:bg-primary/5 transition-all cursor-pointer">
            <span className="material-symbols-rounded text-xl" aria-hidden="true">upload_file</span>
            Adjuntar carnet (imagen o PDF)
            <input type="file" accept="image/*,.pdf" onChange={handleCardFileChange} className="hidden" />
          </label>
        )}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <label className="text-sm font-semibold text-on-surface mb-1">Método de contacto</label>
          <select name="contact_method" value={form.contact_method} onChange={onChange} className="w-full rounded-xl border border-outline-variant bg-surface-container-low px-4 py-3.5" required>
            <option value="">Seleccionar</option>
            <option value="phone">Teléfono</option>
            <option value="email">Correo electrónico</option>
            <option value="whatsapp">WhatsApp</option>
            <option value="other">Otro</option>
          </select>
        </div>
        <div>
          <label className="text-sm font-semibold text-on-surface mb-1">Contacto</label>
          <input name="contact_value" value={form.contact_value} onChange={onChange} className="w-full rounded-xl border border-outline-variant bg-surface-container-low px-4 py-3.5" placeholder="Número o email" required />
        </div>
      </div>

      <div>
        <label className="text-sm font-semibold text-on-surface mb-1">Dirección o referencia</label>
        <div className="relative">
          <span className="material-symbols-rounded absolute left-4 top-1/2 -translate-y-1/2 text-on-surface-variant pointer-events-none" aria-hidden="true">location_on</span>
          <input name="address" value={form.address} onChange={onChange} type="text" autoComplete="street-address" placeholder="Ej: Av. Francisco de Miranda, frente a la plaza" className="w-full rounded-xl border border-outline-variant bg-surface-container-low pl-12 pr-4 py-3.5" />
        </div>
      </div>

      <div>
        <label className="text-sm font-semibold text-on-surface mb-1">País</label>
        <div className="relative">
          <span className="material-symbols-rounded absolute left-4 top-1/2 -translate-y-1/2 text-on-surface-variant pointer-events-none" aria-hidden="true">public</span>
          <input name="country" value={form.country} onChange={onChange} type="text" autoComplete="country-name" placeholder="Ej: Venezuela" className="w-full rounded-xl border border-outline-variant bg-surface-container-low pl-12 pr-4 py-3.5" />
        </div>
      </div>

      <div>
        <label className="text-sm font-semibold text-on-surface mb-1">Nivel de urgencia</label>
        <select name="urgency" value={form.urgency} onChange={onChange} className="w-full rounded-xl border border-outline-variant bg-surface-container-low px-4 py-3.5">
          <option value="high">Alta — Peligro inmediato</option>
          <option value="medium">Media — Necesidad urgente sin peligro inmediato</option>
          <option value="low">Baja — Necesidad estable</option>
        </select>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <label className="text-sm font-semibold text-on-surface mb-1">Número de personas</label>
          <input name="people" value={String(form.people)} onChange={onChange} type="number" min={1} className="w-full rounded-xl border border-outline-variant bg-surface-container-low px-4 py-3.5" />
        </div>
        <div>
          <label
            htmlFor="description"
            className="text-sm font-semibold text-on-surface mb-1"
          >
            Descripción
          </label>
          <textarea
            id="description"
            name="description"
            value={form.description}
            onChange={onChange}
            rows={4}
            placeholder="Describe la situación con mayor detalle"
            className="w-full rounded-xl border border-outline-variant bg-surface-container-low px-4 py-3.5 resize-none"
          />
        </div>
      </div>

      <div className="rounded-2xl border-2 border-outline p-3 sm:p-4">
        <p className="text-sm font-semibold text-on-surface mb-2 sm:mb-3 text-center">
          Nota de voz <span className="text-on-surface-variant font-normal">(opcional)</span>
        </p>

        {voiceNote ? (
          <div className="flex items-center justify-between gap-3 rounded-xl bg-primary/5 border border-primary/20 px-3 py-2.5">
            <div className="flex items-center gap-2 min-w-0">
              <span className="material-symbols-rounded text-2xl text-primary shrink-0" aria-hidden="true">mic</span>
              <div className="min-w-0">
                <p className="text-xs sm:text-sm font-bold text-on-surface truncate">Nota de voz grabada</p>
                <p className="text-[11px] text-on-surface-variant">{voiceNote.durationSec}s de audio</p>
              </div>
            </div>
            <div className="flex items-center gap-1.5 shrink-0">
              <button
                type="button"
                onClick={() => {
                  const audio = new Audio(voiceNote.url);
                  audio.play();
                }}
                className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary text-on-primary hover:opacity-80 transition-opacity"
                aria-label="Reproducir nota de voz"
              >
                <span className="material-symbols-rounded text-sm">play_arrow</span>
              </button>
              <button
                type="button"
                onClick={discardVoiceNote}
                className="flex h-8 w-8 items-center justify-center rounded-lg border border-outline text-on-surface-variant hover:bg-surface-container transition-colors"
                aria-label="Descartar nota de voz"
              >
                <span className="material-symbols-rounded text-sm">delete</span>
              </button>
            </div>
          </div>
        ) : recording ? (
          <div className="flex items-center justify-between gap-3 rounded-xl bg-error/5 border border-error/30 px-3 py-2.5">
            <div className="flex items-center gap-2">
              <span className="relative flex h-8 w-8 items-center justify-center">
                <span className="absolute inset-0 rounded-full bg-error animate-ping opacity-30"></span>
                <span className="material-symbols-rounded text-2xl text-error">mic</span>
              </span>
              <div>
                <p className="text-xs sm:text-sm font-bold text-error">Grabando…</p>
                <p className="text-[11px] text-on-surface-variant">{recordingSec}s</p>
              </div>
            </div>
            <button
              type="button"
              onClick={stopRecording}
              className="min-h-9 rounded-xl bg-error px-4 py-1.5 text-xs font-bold text-on-error hover:opacity-90 active:scale-95 transition-all"
            >
              Detener
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={startRecording}
            className="w-full flex items-center justify-center gap-2 rounded-xl border-2 border-dashed border-outline-variant py-3 text-sm font-semibold text-on-surface-variant hover:border-primary/40 hover:text-primary hover:bg-primary/5 active:scale-[0.98] transition-all"
          >
            <span className="material-symbols-rounded text-xl">mic</span>
            Toca para grabar un mensaje de voz
          </button>
        )}
      </div>

      <div className="flex flex-col sm:flex-row gap-3 mt-2">
        {onBack ? (
          <button type="button" onClick={onBack} className="flex-1 flex items-center justify-center gap-2 border border-outline text-on-surface px-6 py-4 rounded-full font-semibold text-base hover:bg-surface-container">
            <span className="material-symbols-rounded text-lg" aria-hidden="true">arrow_back</span>
            Volver
          </button>
        ) : (
          <Link href="/sos" className="flex-1 flex items-center justify-center gap-2 border border-outline text-on-surface px-6 py-4 rounded-full font-semibold text-base hover:bg-surface-container">
            <span className="material-symbols-rounded text-lg" aria-hidden="true">arrow_back</span>
            Volver
          </Link>
        )}
        <button disabled={loading} type="submit" className={`flex-1 flex items-center justify-center gap-2 bg-secondary-container text-on-secondary px-6 py-4 rounded-full font-bold text-base hover:opacity-90 transition-opacity ${loading ? 'opacity-60 cursor-wait' : ''}`}>
          <span className="material-symbols-rounded" aria-hidden="true">send</span>
          {loading ? 'Enviando...' : 'Enviar Solicitud'}
        </button>
      </div>
    </form>
  );
}
