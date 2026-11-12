"use client";

import { useState, useEffect, type ChangeEvent, type FormEvent } from "react";
import Link from "next/link";
import CategoryCard from "@/components/ui/CategoryCard";
import ApplicantForm, { type SOSFormValues, type VoiceNote } from "./components/ApplicantForm";
import { alertService } from "@/services/alertService";
import { sendHelpRequest } from "@/api/helpRequests";
import { getUserById } from "@/api/user";
import { useFabVisibility } from "@/providers/FabVisibilityProvider";
import { useAuth } from "@/providers/AuthProvider";

/**
 * El perfil guarda la discapacidad con el catálogo de emergencias
 * (visual/auditiva/neuro/motriz), pero el formulario de solicitud usa el
 * catálogo de 11 tipos. Traducimos lo mejor posible; el campo queda
 * editable por si la persona quiere precisarlo.
 */
const PROFILE_DISABILITY_TO_REQUEST: Record<string, string> = {
  visual: "Visual",
  auditiva: "Auditiva",
  motriz: "Física",
  neuro: "TEA",
};

/** Separa el nombre completo del perfil en nombre + apellidos. */
function splitFullName(fullName: string | undefined): { first: string; last: string } {
  const parts = (fullName ?? "").trim().split(/\s+/).filter(Boolean);
  if (parts.length <= 1) return { first: parts[0] ?? "", last: "" };
  return { first: parts[0], last: parts.slice(1).join(" ") };
}

const categories = [
  {
    id: "equipment",
    icon: "accessible",
    title: "Equipamiento",
    description: "Sillas de ruedas, muletas, bastones, audífonos, etc.",
  },
  {
    id: "medication",
    icon: "medical_services",
    title: "Medicación",
    description: "Medicamentos recetados o de emergencia.",
  },
  {
    id: "transport",
    icon: "directions_car",
    title: "Transporte",
    description: "Traslado accesible a centros de salud, refugios u otros destinos.",
  },
  {
    id: "companionship",
    icon: "groups",
    title: "Acompañamiento",
    description: "Apoyo presencial o remoto para personas con discapacidad.",
  },
  {
    id: "interpreter",
    icon: "translate",
    title: "Intérpretes",
    description: "Interpretación en lengua de señas u otros idiomas.",
  },
  {
    id: "accessible_information",
    icon: "info",
    title: "Información Accesible",
    description: "Material en braille, lectura fácil, audio, lengua de señas.",
  },
  {
    id: "neurodivergent_support",
    icon: "psychiatry",
    title: "Apoyo para Personas Neurodivergentes",
    description: "Entornos tranquilos, comunicación clara y ajustes sensoriales.",
  },
];

export default function SOSPage() {
  const { user } = useAuth();
  const userId = user?.id;
  const { setFormFocused } = useFabVisibility();
  const [selected, setSelected] = useState<string | null>(null);
  const [step, setStep] = useState<number>(1);
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const [createdRequestId, setCreatedRequestId] = useState<string | null>(null);
  const [form, setForm] = useState<SOSFormValues>({
    requester_name: "",
    last_name: "",
    contact_method: "phone",
    contact_value: "",
    need_type: "",
    description: "",
    urgency: "medium",
    address: "",
    country: "",
    people: 1,
    gender: "",
    age: "",
    disability_type: "",
    disability_other_note: "",
  });
  const [disabilityCardFile, setDisabilityCardFile] = useState<File | null>(null);
  const [voiceNote, setVoiceNote] = useState<VoiceNote | null>(null);
  const [profileLocation, setProfileLocation] = useState<{ lat: number; lng: number } | null>(null);
  // País guardado en la cuenta del ciudadano (citizen_profiles.country) —
  // si existe, prevalece sobre lo que haya en el campo "país" del
  // formulario al enviar, aunque este también tenga un valor (ver payload
  // más abajo). Se guarda aparte de `form.country` porque ese sí se puede
  // editar libremente en pantalla sin perder la prioridad de la cuenta.
  const [accountCountry, setAccountCountry] = useState<string | null>(null);

  // Si hay sesión iniciada, precarga los datos del perfil en la solicitud.
  // Solo rellena los campos que la persona aún no haya tocado.
  useEffect(() => {
    if (!userId) return;
    let cancelled = false;

    getUserById(userId)
      .then((profile) => {
        if (cancelled) return;
        setProfileLocation(profile.location ?? null);
        setAccountCountry(profile.citizenProfile?.country ?? null);
        setForm((current) => {
          const { first, last } = splitFullName(profile.fullName);
          const next = { ...current };

          if (!current.requester_name && first) next.requester_name = first;
          if (!current.last_name && last) next.last_name = last;

          if (!current.contact_value) {
            if (profile.phone) {
              next.contact_method = "phone";
              next.contact_value = profile.phone;
            } else if (profile.email) {
              next.contact_method = "email";
              next.contact_value = profile.email;
            }
          }

          if (!current.address && profile.zone) next.address = profile.zone;

          if (!current.country && profile.citizenProfile?.country) {
            next.country = profile.citizenProfile.country;
          }

          if (!current.disability_type && profile.citizenProfile?.disabilityType) {
            next.disability_type =
              PROFILE_DISABILITY_TO_REQUEST[profile.citizenProfile.disabilityType] ?? "";
          }

          return next;
        });
      })
      .catch(() => {
        // Silencioso: si falla, la persona puede llenar la solicitud a mano.
      });

    return () => {
      cancelled = true;
    };
  }, [userId]);

  // Step 1 only selects category; Step 2 (`/sos/ubicacion`) will collect details.

  // Esta ruta es de solicitudes de ayuda/insumos, no de emergencias,
  // por lo que el FAB de voz (emergencias) debe permanecer visible.
  // Aun así, lo minimizamos mientras el usuario está escribiendo
  // en el formulario para que no tape campos ni el botón "Enviar".
  // Al desmontar restauramos el estado por defecto.
  useEffect(() => {
    setFormFocused(true);
    return () => {
      setFormFocused(false);
    };
  }, [setFormFocused]);

  const handleFormChange = (e: ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    setForm((current) => ({ ...current, [name]: name === "people" ? Number(value) : value }));
  };

  // Propaga focus/blur desde cualquier elemento focusable del
  // formulario al provider. El FAB (cuando está visible en otras
  // rutas) reacciona minimizándose mientras el usuario escribe.
  const handleFormFocus = () => {
    setFormFocused(true);
  };

  const handleFormBlur = () => {
    // Solo marcamos no-focus si el foco realmente salió del formulario
    // (relatedTarget == null cuando el foco va a un elemento no
    // focusable, p. ej. al hacer click fuera). En la práctica
    // `setFormFocused(false)` es seguro: el siguiente focus volverá
    // a ponerlo en true.
    setFormFocused(false);
  };

  const getCurrentPosition = () => {
    return new Promise<{ latitude: number; longitude: number }>((resolve, reject) => {
      if (!navigator?.geolocation) return reject(new Error("Geolocation no disponible"));
      navigator.geolocation.getCurrentPosition(
        (pos) => resolve({ latitude: pos.coords.latitude, longitude: pos.coords.longitude }),
        (err) => reject(err),
        { enableHighAccuracy: true, timeout: 5000 }
      );
    });
  };

  const getErrorMessage = (error: unknown) => {
    if (error instanceof Error) return error.message;
    return "Por favor intenta de nuevo.";
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setLoading(true);

    if (!form.requester_name || !form.last_name || !form.contact_method || !form.contact_value || !form.need_type) {
      alertService.warning("Por favor completa los campos requeridos.");
      setLoading(false);
      return;
    }

    let latitude: number | null = null;
    let longitude: number | null = null;
    try {
      const pos = await getCurrentPosition();
      latitude = pos.latitude;
      longitude = pos.longitude;
    } catch (error) {
      console.warn("No se pudo obtener geolocalización:", error);
      // Fallback: usa la ubicación guardada en el perfil, si existe.
      if (profileLocation) {
        latitude = profileLocation.lat;
        longitude = profileLocation.lng;
      } else {
        alertService.info("No pudimos obtener tu ubicación exacta. La solicitud se enviará con la dirección que escribiste.");
      }
    }

    const payload = {
      requesterName: `${form.requester_name} ${form.last_name}`.trim(),
      contactMethod: form.contact_method,
      contactValue: form.contact_value,
      needType: form.need_type,
      description: form.description,
      latitude,
      longitude,
      urgency: form.urgency,
      address: form.address,
      // Si la cuenta del ciudadano ya tiene país guardado, prevalece sobre
      // lo que haya quedado en el campo del formulario (ver accountCountry).
      country: accountCountry || form.country,
      gender: form.gender,
      age: form.age ? Number(form.age) : null,
      disabilityType: form.disability_type,
      disabilityOtherNote: form.disability_other_note,
      disabilityCardFile,
      voiceNoteBlob: voiceNote?.blob ?? null,
    };

    try {
      const response = await sendHelpRequest(payload);
      setCreatedRequestId(response?.data?.id ?? null);
      alertService.success("Solicitud enviada. Gracias.");
      // Si algún adjunto opcional no se pudo guardar, la solicitud igual se creó.
      if (response?.data?.warnings?.length) {
        alertService.warning(response.data.warnings.join(" "));
      }
      setSent(true);
    } catch (error) {
      alertService.error(`Error al enviar la solicitud: ${getErrorMessage(error)}`);
    } finally {
      setLoading(false);
    }
  };

  // Prellenamos el registro de ciudadano con lo que la persona ya
  // escribió en esta solicitud, para que no lo vuelva a tipear.
  const citizenSignupHref = (() => {
    const params = new URLSearchParams();
    if (form.requester_name) params.set("fullName", form.requester_name);
    if (form.contact_method === "phone" && form.contact_value) {
      params.set("phone", form.contact_value);
    } else if (form.contact_method === "email" && form.contact_value) {
      params.set("email", form.contact_value);
    }
    if (createdRequestId) params.set("helpRequestId", createdRequestId);
    const qs = params.toString();
    return `/registro/citizen${qs ? `?${qs}` : ""}`;
  })();

  if (sent) {
    // Si ya hay sesión iniciada, la solicitud quedó vinculada a la cuenta
    // desde que se creó (optionalAuthenticate en el backend) — no tiene
    // sentido ofrecer crear una cuenta que ya existe.
    return (
      <div className="max-w-3xl mx-auto px-5 lg:px-10 py-8 lg:py-12">
        <div className="rounded-3xl border border-outline-variant bg-orange-50 p-5 sm:p-6 lg:p-8">
          <div className="inline-flex items-center gap-2 rounded-full bg-orange-500/10 px-3 py-1 text-sm font-semibold text-orange-600">
            <span className="material-symbols-rounded text-base" aria-hidden="true">check_circle</span>
            Solicitud enviada
          </div>
          <h1 className="mt-4 text-2xl lg:text-3xl font-bold text-on-surface leading-tight">
            Gracias, ya recibimos tu solicitud
          </h1>
          <p className="mt-3 text-on-surface-variant leading-relaxed">
            {user
              ? "Un voluntario cercano se pondrá en contacto contigo. Ya quedó vinculada a tu cuenta, puedes seguir su estado cuando quieras."
              : "Un voluntario cercano se pondrá en contacto contigo. Crea tu perfil de ciudadano para poder seguir el estado de tu solicitud y comunicarte directamente cuando alguien la tome."}
          </p>

          <div className="mt-7 grid gap-3 sm:grid-cols-2">
            {user ? (
              <Link
                href="/mis-solicitudes"
                className="min-h-14 inline-flex items-center justify-center gap-2 rounded-2xl bg-orange-500 px-5 py-3 font-bold text-white text-base hover:bg-orange-600 transition-colors"
              >
                <span className="material-symbols-rounded" aria-hidden="true">handshake</span>
                Ver mis solicitudes
              </Link>
            ) : (
              <Link
                href={citizenSignupHref}
                className="min-h-14 inline-flex items-center justify-center gap-2 rounded-2xl bg-orange-500 px-5 py-3 font-bold text-white text-base hover:bg-orange-600 transition-colors"
              >
                <span className="material-symbols-rounded" aria-hidden="true">person_add</span>
                Crear mi perfil para seguir la solicitud
              </Link>
            )}
            <Link
              href="/"
              className="min-h-14 inline-flex items-center justify-center gap-2 rounded-2xl border border-outline px-5 py-3 font-semibold text-on-surface text-base hover:bg-surface-container transition-colors"
            >
              <span className="material-symbols-rounded" aria-hidden="true">home</span>
              {user ? "Volver al inicio" : "Ahora no"}
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto px-5 lg:px-10 py-8 lg:py-12">
      {/* Breadcrumb */}
      <div className="flex items-center gap-2 text-sm text-on-surface-variant mb-8">
        <Link href="/" className="hover:text-primary transition-colors">Inicio</Link>
        <span className="material-symbols-rounded text-base" aria-hidden="true">chevron_right</span>
        <span className="text-on-surface font-medium">Solicitud de Ayuda</span>
      </div>

      {/* Step indicator */}
      <div className="flex items-center gap-2 mb-6">
        <div className={`flex items-center justify-center w-7 h-7 rounded-full text-xs font-bold ${step === 1 ? 'bg-primary text-on-primary' : 'bg-surface-container-high text-on-surface-variant'}`}>1</div>
        <div className="flex-1 h-1 rounded-full bg-outline-variant">
          <div className={`h-full rounded-full ${step > 1 ? 'w-full bg-primary' : 'w-0'}`} />
        </div>
        <div className={`flex items-center justify-center w-7 h-7 rounded-full text-xs font-bold ${step === 2 ? 'bg-primary text-on-primary' : 'bg-surface-container-high text-on-surface-variant'}`}>2</div>
      </div>

      {/* Header */}
      <div className="mb-8">
        <div className="flex items-center gap-3 mb-3">
          <div className="w-10 h-10 rounded-full bg-secondary-container flex items-center justify-center">
            <span className="material-symbols-rounded text-on-secondary text-xl" aria-hidden="true">emergency_home</span>
          </div>
          <div>
            <p className="text-xs font-semibold text-on-surface-variant uppercase tracking-wide">Paso {step} de 2</p>
            <h1 className="text-2xl font-bold text-on-surface">{step === 1 ? '¿Qué necesitas ahora mismo?' : 'Ubicación y detalles'}</h1>
          </div>
        </div>
        <p className="text-on-surface-variant">
          {step === 1
            ? 'Selecciona el tipo de apoyo que requieres. Esto nos ayudará a conectar con el recurso adecuado de forma urgente.'
            : 'Proporciona la ubicación y detalles de la solicitud para que podamos enviar ayuda lo antes posible.'}
        </p>
      </div>

      {step === 1 && (
        <>
          {/* Categories */}
          <div className="flex flex-col gap-3">
            {categories.map((cat) => (
              <CategoryCard
                key={cat.id}
                icon={cat.icon}
                title={cat.title}
                description={cat.description}
                selected={selected === cat.id}
                onClick={() => setSelected(cat.id)}
              />
            ))}
          </div>

          {/* Actions: pasar a paso 2 (Ubicación y Detalles) */}
          <div className="mt-8 flex flex-col sm:flex-row gap-3">
            <Link
              href="/"
              className="flex-1 flex items-center justify-center gap-2 border border-outline text-on-surface px-6 py-4 rounded-full font-semibold text-base hover:bg-surface-container transition-colors focus-visible:outline-3 focus-visible:outline-primary"
            >
              <span className="material-symbols-rounded text-lg" aria-hidden="true">close</span>
              Cancelar Solicitud
            </Link>
            <button
              onClick={() => {
                if (!selected) {
                  alertService.warning("Selecciona primero un tipo de necesidad.");
                  return;
                }
                setForm((current) => ({ ...current, need_type: selected }));
                setStep(2);
              }}
              className="flex-1 flex items-center justify-center gap-2 bg-secondary-container text-on-secondary px-6 py-4 rounded-full font-bold text-base hover:opacity-90 transition-opacity focus-visible:outline-3 focus-visible:outline-primary"
            >
              Continuar
              <span className="material-symbols-rounded" aria-hidden="true">arrow_forward</span>
            </button>
          </div>
        </>
      )}

      {step === 2 && (
        <div className="mt-4">
          <ApplicantForm
            form={form}
            onChange={handleFormChange}
            onSubmit={handleSubmit}
            loading={loading}
            onBack={() => setStep(1)}
            disabilityCardFile={disabilityCardFile}
            onDisabilityCardFileChange={setDisabilityCardFile}
            voiceNote={voiceNote}
            onVoiceNoteChange={setVoiceNote}
            onFormFocus={handleFormFocus}
            onFormBlur={handleFormBlur}
          />
        </div>
      )}

      {/* Nearby banner */}
      <div className="mt-8 rounded-2xl bg-primary-fixed border border-outline-variant p-4 flex items-start gap-3">
        <span className="material-symbols-rounded text-primary text-2xl mt-0.5" aria-hidden="true">map</span>
        <div>
          <h2 className="font-semibold text-on-surface text-sm">Cerca de ti</h2>
          <p className="text-sm text-on-surface-variant mt-0.5">
            <span className="material-symbols-rounded text-xs align-middle mr-1" aria-hidden="true">location_on</span>
            Hay <strong>3 puntos de auxilio accesibles</strong> identificados en tu zona actual.
          </p>
        </div>
      </div>
    </div>
  );
}
