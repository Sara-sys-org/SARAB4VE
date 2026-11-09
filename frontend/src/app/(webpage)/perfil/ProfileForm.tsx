"use client";

import { useEffect, useState } from "react";
import dynamic from "next/dynamic";
import "react-phone-number-input/style.css";
import { isValidPhoneNumber } from "libphonenumber-js";

import Label from "@/components/ui/Label";
import Button from "@/components/ui/Button";
import PhoneField from "@/components/ui/PhoneField";
import { alertService } from "@/services/alertService";
import { useAuth } from "@/providers/AuthProvider";
import { getUserById, updateUser } from "@/api/user";

import { COUNTRIES } from "@/lib/countries";
import StepDisabilityType from "../sos/components/StepDisabilityType";
import type {
  CommunicationMode,
  DisabilityType,
  VisualSubcategory,
  NeuroSubcategory,
  MotrizSubcategory,
} from "../sos/components/types";

const Location = dynamic(() => import("@/components/ui/Location"), {
  ssr: false,
  loading: () => (
    <div className="h-[300px] md:h-[360px] rounded-xl bg-surface-container animate-pulse" />
  ),
});

type ProfileFormState = {
  fullName: string;
  phone: string;
  zone: string;
  country: string;
  location: { lat: number; lng: number } | null;
  disabilityType: DisabilityType | null;
  communicationMode: CommunicationMode | null;
  visualSubcategory: VisualSubcategory | null;
  neuroSubcategory: NeuroSubcategory | null;
  motrizSubcategory: MotrizSubcategory | null;
};

type FieldErrors = Partial<Record<"fullName" | "phone" | "disability", string>>;

const fieldClass =
  "w-full rounded-xl border border-outline-variant bg-background px-4 py-3 " +
  "focus-visible:outline-2 focus-visible:outline-primary focus-visible:outline-offset-1 " +
  "focus:border-primary transition-colors";

const errorClass = "text-error text-sm mt-1";

/** Subcategoría efectiva según el tipo de discapacidad seleccionado. */
function resolveSubcategory(form: ProfileFormState): string | null {
  switch (form.disabilityType) {
    case "visual":
      return form.visualSubcategory;
    case "neuro":
      return form.neuroSubcategory;
    case "motriz":
      return form.motrizSubcategory;
    default:
      return null;
  }
}

/** Valida la sección de discapacidad replicando las reglas del formulario SOS. */
function validateDisability(form: ProfileFormState): string | null {
  if (!form.disabilityType) return null;
  if (form.disabilityType === "auditiva" && !form.communicationMode) {
    return "Selecciona cómo te comunicas (subcategoría de comunicación).";
  }
  if (form.disabilityType === "visual" && !form.visualSubcategory) {
    return "Selecciona tu tipo de asistencia visual.";
  }
  if (form.disabilityType === "neuro" && !form.neuroSubcategory) {
    return "Selecciona tu tipo de apoyo neurodivergente.";
  }
  if (form.disabilityType === "motriz" && !form.motrizSubcategory) {
    return "Selecciona tu tipo de asistencia motriz.";
  }
  return null;
}

export default function ProfileForm() {
  const { user, updateUser: updateAuthUser } = useAuth();
  const userId = user?.id;

  const [form, setForm] = useState<ProfileFormState>({
    fullName: user?.fullName ?? "",
    phone: user?.phone ?? "",
    zone: user?.zone ?? "",
    country: "",
    location: user?.location ?? null,
    disabilityType: null,
    communicationMode: null,
    visualSubcategory: null,
    neuroSubcategory: null,
    motrizSubcategory: null,
  });
  const [errors, setErrors] = useState<FieldErrors>({});
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Carga el perfil completo (incluye `citizenProfile`) para no depender de
  // los datos cacheados en localStorage, que no traen la discapacidad.
  useEffect(() => {
    if (!userId) return;
    let cancelled = false;

    getUserById(userId)
      .then((data) => {
        if (cancelled) return;
        const profile = data.citizenProfile;
        setForm((prev) => ({
          ...prev,
          fullName: data.fullName ?? prev.fullName,
          phone: data.phone ?? prev.phone,
          zone: data.zone ?? "",
          country: profile?.country ?? "",
          location: data.location ?? null,
          disabilityType: (profile?.disabilityType as DisabilityType) ?? null,
          communicationMode: (profile?.communicationMode as CommunicationMode) ?? null,
          visualSubcategory:
            profile?.disabilityType === "visual"
              ? (profile.disabilitySubcategory as VisualSubcategory)
              : null,
          neuroSubcategory:
            profile?.disabilityType === "neuro"
              ? (profile.disabilitySubcategory as NeuroSubcategory)
              : null,
          motrizSubcategory:
            profile?.disabilityType === "motriz"
              ? (profile.disabilitySubcategory as MotrizSubcategory)
              : null,
        }));
      })
      .catch((err) => {
        if (!cancelled) {
          alertService.error(
            err instanceof Error ? err.message : "No se pudo cargar tu perfil."
          );
        }
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [userId]);

  // Al cambiar el tipo de discapacidad, limpiamos subcategorías de tipos previos.
  function handleDisabilityTypeChange(value: DisabilityType) {
    setForm((prev) => ({
      ...prev,
      disabilityType: value,
      communicationMode: null,
      visualSubcategory: null,
      neuroSubcategory: null,
      motrizSubcategory: null,
    }));
    setErrors((prev) => ({ ...prev, disability: undefined }));
  }

  function validate(): FieldErrors {
    const next: FieldErrors = {};
    if (form.fullName.trim().length < 3) {
      next.fullName = "El nombre debe tener al menos 3 caracteres";
    }
    if (!form.phone || !isValidPhoneNumber(form.phone)) {
      next.phone = "Ingresa un número de teléfono válido para el país seleccionado";
    }
    const disabilityError = validateDisability(form);
    if (disabilityError) next.disability = disabilityError;
    return next;
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!user?.id) return;

    const validation = validate();
    if (Object.keys(validation).length > 0) {
      setErrors(validation);
      alertService.warning("Revisa los campos marcados en rojo.");
      return;
    }

    setErrors({});
    setIsSubmitting(true);

    try {
      const updated = await updateUser(user.id, {
        fullName: form.fullName.trim(),
        phone: form.phone,
        zone: form.zone.trim() || null,
        country: form.country,
        location: form.location,
        disabilityType: form.disabilityType,
        communicationMode:
          form.disabilityType === "auditiva" ? form.communicationMode : null,
        disabilitySubcategory: resolveSubcategory(form),
      });

      updateAuthUser({
        fullName: updated.fullName,
        phone: updated.phone,
        zone: updated.zone,
        location: updated.location,
        citizenProfile: updated.citizenProfile ?? null,
      });

      alertService.success("Tu perfil se actualizó correctamente.");
    } catch (error) {
      alertService.error(
        error instanceof Error ? error.message : "No se pudo actualizar tu perfil."
      );
    } finally {
      setIsSubmitting(false);
    }
  }

  if (isLoading) {
    return (
      <div className="rounded-2xl border border-outline-variant bg-surface-container-low p-6 space-y-3">
        <div className="h-12 rounded-xl bg-surface-container animate-pulse" />
        <div className="h-12 rounded-xl bg-surface-container animate-pulse" />
        <div className="h-40 rounded-xl bg-surface-container animate-pulse" />
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} noValidate className="space-y-6">
      {/* DATOS BÁSICOS */}
      <div className="rounded-2xl border border-outline-variant bg-surface-container-low p-5 sm:p-6 space-y-5">
        <h2 className="text-xl font-bold text-on-surface">Datos básicos</h2>

        <div>
          <Label htmlFor="profile-fullName" name="Nombre completo" required />
          <input
            id="profile-fullName"
            className={`${fieldClass} mt-2 ${errors.fullName ? "border-error" : ""}`}
            value={form.fullName}
            onChange={(e) => setForm({ ...form, fullName: e.target.value })}
            aria-invalid={!!errors.fullName}
          />
          {errors.fullName && <p className={errorClass}>{errors.fullName}</p>}
        </div>

        <div>
          <Label name="Correo electrónico" />
          <input
            className={`${fieldClass} mt-2 opacity-60 cursor-not-allowed`}
            value={user?.email ?? ""}
            disabled
            aria-describedby="profile-email-help"
          />
          <p id="profile-email-help" className="text-xs text-on-surface-variant mt-1">
            El correo electrónico no se puede modificar por ahora.
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <Label htmlFor="profile-phone" name="Teléfono" required />
            <div id="profile-phone" className="mt-2">
              <PhoneField
                value={form.phone}
                onChange={(phone) => setForm({ ...form, phone })}
              />
            </div>
            {errors.phone && <p className={errorClass}>{errors.phone}</p>}
          </div>

          <div>
            <Label htmlFor="profile-zone" name="Zona o sector" />
            <input
              id="profile-zone"
              className={`${fieldClass} mt-2`}
              placeholder="Ej. Caracas — Zona 1"
              value={form.zone}
              onChange={(e) => setForm({ ...form, zone: e.target.value })}
            />
          </div>

          <div>
            <Label htmlFor="profile-country" name="País" />
            <select
              id="profile-country"
              className={`${fieldClass} mt-2`}
              value={form.country}
              onChange={(e) => setForm({ ...form, country: e.target.value })}
            >
              <option value="">Selecciona un país</option>
              {COUNTRIES.map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
          </div>
        </div>

        <div>
          <Label name="Ubicación en el mapa" />
          <div className="mt-2">
            <Location
              value={form.location}
              onChange={(loc) => setForm({ ...form, location: loc })}
            />
          </div>
        </div>
      </div>

      {/* DISCAPACIDAD */}
      <div className="rounded-2xl border border-outline-variant bg-surface-container-low p-5 sm:p-6">
        <div className="mb-4">
          <h2 className="text-xl font-bold text-on-surface">Mi discapacidad</h2>
          <p className="text-sm text-on-surface-variant mt-1">
            Esta información se usa para adaptar la asistencia cuando reportes una
            emergencia.
          </p>
        </div>

        <StepDisabilityType
          disabilityType={form.disabilityType}
          communicationMode={form.communicationMode}
          visualSubcategory={form.visualSubcategory}
          neuroSubcategory={form.neuroSubcategory}
          motrizSubcategory={form.motrizSubcategory}
          onDisabilityTypeChange={handleDisabilityTypeChange}
          onCommunicationModeChange={(v) =>
            setForm((prev) => ({ ...prev, communicationMode: v }))
          }
          onVisualSubcategoryChange={(v) =>
            setForm((prev) => ({ ...prev, visualSubcategory: v }))
          }
          onNeuroSubcategoryChange={(v) =>
            setForm((prev) => ({ ...prev, neuroSubcategory: v }))
          }
          onMotrizSubcategoryChange={(v) =>
            setForm((prev) => ({ ...prev, motrizSubcategory: v }))
          }
        />

        {errors.disability && <p className={`${errorClass} mt-3`}>{errors.disability}</p>}
      </div>

      <div className="flex justify-end">
        <Button
          type="submit"
          variant="filled"
          size="lg"
          icon="save"
          disabled={isSubmitting}
        >
          {isSubmitting ? "Guardando..." : "Guardar cambios"}
        </Button>
      </div>
    </form>
  );
}
