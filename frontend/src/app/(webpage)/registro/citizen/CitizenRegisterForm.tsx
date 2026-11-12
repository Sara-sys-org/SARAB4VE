"use client";

import { useId, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import dynamic from "next/dynamic";
import "react-phone-number-input/style.css";

import Label from "@/components/ui/Label";
import Button from "@/components/ui/Button";
import PhoneField from "@/components/ui/PhoneField";

import { sendCitizen } from "@/api/citizen";
import { linkHelpRequestToAccount } from "@/api/helpRequests";
import { alertService } from "@/services/alertService";

import { citizenSchema, getFieldErrors, type CitizenFormData } from "./schema";
import { buildCitizenRegisterPayload } from "./mapper";
import { CITIZEN_INTRO_TEXT } from "./constants";
import { COUNTRIES } from "@/lib/countries";

const Location = dynamic(() => import("@/components/ui/Location"), {
  ssr: false,
  loading: () => (
    <div className="h-[300px] md:h-[360px] rounded-xl bg-surface-container animate-pulse" />
  ),
});

/** Estado inicial del formulario: vacío, sin ubicación seleccionada. */
const InitForm: CitizenFormData = {
  fullName: "",
  email: "",
  phone: "",
  password: "",
  location: null,
  zone: "",
  country: "",
  acceptedTerms: true,
};

const fieldClass =
  "w-full rounded-xl border border-outline-variant bg-background px-4 py-3 " +
  "focus-visible:outline-2 focus-visible:outline-primary focus-visible:outline-offset-1 " +
  "focus:border-primary transition-colors";

const errorClass = "text-error text-sm mt-1";

export default function CitizenRegisterForm() {
  const router = useRouter();
  const searchParams = useSearchParams();

  // Prellenado opcional: cuando se llega desde la confirmación de una
  // solicitud de apoyo (/request), esta pantalla recibe fullName/phone
  // (o email) por query string para que el usuario no vuelva a
  // escribir lo que ya dio.
  const [formData, setFormData] = useState<CitizenFormData>(() => ({
    ...InitForm,
    fullName: searchParams.get("fullName") ?? InitForm.fullName,
    phone: searchParams.get("phone") ?? InitForm.phone,
    email: searchParams.get("email") ?? InitForm.email,
  }));
  const [errors, setErrors] = useState<
    Partial<Record<keyof CitizenFormData, string>>
  >({});
  const [isSubmitting, setIsSubmitting] = useState(false);

  // useId genera identificadores únicos por instancia del componente;
  // se mantienen agrupados para reutilizar el patrón de los formularios
  // de voluntario y organización y vincular <Label> ↔ <input> vía htmlFor.
  const ids = {
    fullName: useId(),
    email: useId(),
    phone: useId(),
    password: useId(),
    location: useId(),
    zone: useId(),
    country: useId(),
  } as const;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    const result = citizenSchema.safeParse(formData);
    if (!result.success) {
      setErrors(getFieldErrors(formData));
      alertService.warning("Revisa los campos marcados en rojo.");
      return;
    }

    setErrors({});
    setIsSubmitting(true);

    try {
      const payload = buildCitizenRegisterPayload(result.data);
      const response = await sendCitizen(payload);

      // Persistimos el token igual que en los otros registros (auth.ts y
      // organization/volunteer lo hacen desde sus respectivos mappers o
      // servicios). Aquí lo centralizamos en el handler porque es un
      // registro breve y no requiere flujo de verificación posterior.
      if (typeof window !== "undefined" && response.token) {
        localStorage.setItem("token", response.token);
      }

      // Si llegamos desde la confirmación de una solicitud de apoyo
      // (/request), vinculamos esa solicitud —creada sin login— con la
      // cuenta que se acaba de crear. Best-effort: si falla, la cuenta
      // igual queda creada; no interrumpimos el flujo por esto.
      const helpRequestId = searchParams.get("helpRequestId");
      if (helpRequestId) {
        try {
          await linkHelpRequestToAccount(helpRequestId);
        } catch (linkError) {
          console.warn("No se pudo vincular la solicitud a la cuenta:", linkError);
        }
      }

      alertService.success(
        "¡Listo! Tu cuenta de ciudadano fue creada y aprobada."
      );

      // Tras registrar un ciudadano aprobado, lo enviamos al inicio
      // para que pueda empezar a pedir ayuda o explorar el mapa.
      router.push("/login");
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "No se pudo crear tu cuenta.";
      alertService.error(message);
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <section className="px-5 lg:px-10 pt-8 pb-28 lg:py-12">
      <div className="max-w-3xl mx-auto">
        <header className="mb-8">
          <h1 className="text-3xl lg:text-4xl font-bold text-on-surface">
            {CITIZEN_INTRO_TEXT.title}
          </h1>
          <p className="text-on-surface-variant mt-2 text-base">
            {CITIZEN_INTRO_TEXT.description}
          </p>
        </header>

        {/* Bloque informativo — qué datos se almacenan y por qué
            pedimos la ubicación. Coincide con el tono del resto de
            formularios de SARA (transparencia en la recolección). */}
        <aside
          aria-label="Información sobre los datos solicitados"
          className="mb-8 rounded-2xl border border-outline-variant bg-surface-container-low p-5 sm:p-6 space-y-3 text-sm text-on-surface-variant"
        >
          <p className="font-semibold text-on-surface">
            {CITIZEN_INTRO_TEXT.whatWeStore}
          </p>
          <ul role="list" className="list-disc pl-5 space-y-1">
            {CITIZEN_INTRO_TEXT.dataPoints.map((point) => (
              <li key={point}>{point}</li>
            ))}
          </ul>
          <p className="font-semibold text-on-surface pt-2">
            {CITIZEN_INTRO_TEXT.whyMattersTitle}
          </p>
          <p>{CITIZEN_INTRO_TEXT.whyMattersBody}</p>
        </aside>

        <form
          onSubmit={handleSubmit}
          noValidate
          className="rounded-2xl border border-outline-variant bg-surface-container-low p-5 sm:p-6 lg:p-8 space-y-6"
        >
          {/* DATOS PERSONALES */}
          <fieldset className="space-y-4">
            <legend className="text-sm font-semibold text-primary uppercase tracking-wide">
              Datos personales
            </legend>

            <div>
              <Label htmlFor={ids.fullName} name="Nombre completo" required />
              <input
                id={ids.fullName}
                className={`${fieldClass} mt-2 ${errors.fullName ? "border-error" : ""}`}
                placeholder="Ej. Maria Gimenez"
                value={formData.fullName}
                onChange={(e) =>
                  setFormData({ ...formData, fullName: e.target.value })
                }
                aria-invalid={!!errors.fullName}
                aria-describedby={
                  errors.fullName ? `${ids.fullName}-err` : undefined
                }
              />
              {errors.fullName && (
                <p id={`${ids.fullName}-err`} className={errorClass}>
                  {errors.fullName}
                </p>
              )}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <Label htmlFor={ids.email} name="Correo electrónico" required />
                <input
                  id={ids.email}
                  type="email"
                  className={`${fieldClass} mt-2 ${errors.email ? "border-error" : ""}`}
                  placeholder="correo@ejemplo.com"
                  value={formData.email}
                  onChange={(e) =>
                    setFormData({ ...formData, email: e.target.value })
                  }
                  aria-invalid={!!errors.email}
                  aria-describedby={
                    errors.email ? `${ids.email}-err` : undefined
                  }
                />
                {errors.email && (
                  <p id={`${ids.email}-err`} className={errorClass}>
                    {errors.email}
                  </p>
                )}
              </div>

              <div>
                <Label htmlFor={ids.phone} name="Teléfono" required />
                <div id={ids.phone} className="mt-2">
                  <PhoneField
                    value={formData.phone}
                    onChange={(phone) => setFormData({ ...formData, phone })}
                  />
                </div>
                {errors.phone && <p className={errorClass}>{errors.phone}</p>}
              </div>
            </div>

            <div>
              <Label htmlFor={ids.password} name="Contraseña" required />
              <input
                id={ids.password}
                type="password"
                className={`${fieldClass} mt-2 ${errors.password ? "border-error" : ""}`}
                placeholder="Mínimo 8 caracteres"
                value={formData.password}
                onChange={(e) =>
                  setFormData({ ...formData, password: e.target.value })
                }
                aria-invalid={!!errors.password}
                aria-describedby={
                  errors.password ? `${ids.password}-err` : undefined
                }
              />
              {errors.password && (
                <p id={`${ids.password}-err`} className={errorClass}>
                  {errors.password}
                </p>
              )}
            </div>
          </fieldset>

          {/* UBICACIÓN */}
          <fieldset className="space-y-4">
            <legend className="text-sm font-semibold text-primary uppercase tracking-wide">
              Ubicación
            </legend>

            <div>
              <Label htmlFor={ids.location} name="Ubicación en el mapa" required />
              <div id={ids.location} className="mt-2">
                <Location
                  value={formData.location ?? null}
                  onChange={(loc) => setFormData({ ...formData, location: loc })}
                />
              </div>
              {errors.location && (
                <p className={errorClass}>{errors.location}</p>
              )}
            </div>

            <div>
              <Label htmlFor={ids.zone} name="Zona o sector" required />
              <input
                id={ids.zone}
                className={`${fieldClass} mt-2 ${errors.zone ? "border-error" : ""}`}
                placeholder="Ej. Caracas — Zona 1"
                value={formData.zone}
                onChange={(e) =>
                  setFormData({ ...formData, zone: e.target.value })
                }
                aria-invalid={!!errors.zone}
                aria-describedby={
                  errors.zone ? `${ids.zone}-err` : undefined
                }
              />
              {errors.zone && (
                <p id={`${ids.zone}-err`} className={errorClass}>
                  {errors.zone}
                </p>
              )}
            </div>

            <div>
              <Label htmlFor={ids.country} name="País" required />
              <select
                id={ids.country}
                className={`${fieldClass} mt-2 ${errors.country ? "border-error" : ""}`}
                value={formData.country}
                onChange={(e) =>
                  setFormData({ ...formData, country: e.target.value })
                }
                aria-invalid={!!errors.country}
                aria-describedby={
                  errors.country ? `${ids.country}-err` : undefined
                }
              >
                <option value="">Selecciona un país</option>
                {COUNTRIES.map((c) => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
              {errors.country && (
                <p id={`${ids.country}-err`} className={errorClass}>
                  {errors.country}
                </p>
              )}
            </div>
          </fieldset>

          <p className="text-xs text-on-surface-variant">
            {CITIZEN_INTRO_TEXT.termsReminder}
          </p>

          <div className="pt-2 flex justify-end">
            <Button
              type="submit"
              variant="filled"
              size="lg"
              icon="send"
              disabled={isSubmitting}
            >
              {isSubmitting ? "Enviando..." : "Crear mi cuenta"}
            </Button>
          </div>
        </form>
      </div>
    </section>
  );
}
