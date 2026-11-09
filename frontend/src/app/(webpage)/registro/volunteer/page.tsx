"use client";

import Label from "@/components/ui/Label";
import Button from "@/components/ui/Button";
import { useId, useState } from 'react'
import { iVolunteerForm, SKILLS, DAYS_WEEKEND } from "@/types/index";
import {
    EXPERIENCE_CATEGORIES,
    INTEREST_AREAS_PROFESSIONAL,
    INTEREST_AREAS_NON_PROFESSIONAL,
    TIME_BLOCKS,
    ALL_HOURS,
    REQUIRED_DOCUMENTS_PROFESSIONAL,
    REQUIRED_DOCUMENTS_NON_PROFESSIONAL,
} from "./constants";
import { sendVolunteer } from "@/api/volunteer";
import { getDocumentChecklist, uploadVerificationDocument } from "@/api/verification";
import { buildVolunteerRegisterPayload } from "./mapper";
import { volunteerSchema, getFieldErrors, type VolunteerFormData } from "./schema";
import { alertService } from "@/services/alertService";
import { COUNTRIES } from "@/lib/countries";
import dynamic from "next/dynamic";
import "react-phone-number-input/style.css"
import PhoneField from "@/components/ui/PhoneField";

const Location = dynamic(() => import("@/components/ui/Location"), {
    ssr: false,
    loading: () => <div className="h-[300px] md:h-[360px] rounded-xl bg-surface-container animate-pulse" />,
});

const InitVolunteerForm: iVolunteerForm = {
    fullName: "",
    email: "",
    phone: "",
    password: "",
    location: null,
    zone: "",
    skills: [],
    availableHours: 0,
    availableDays: [],
    acceptedTerms: false,

    documentNumber: "",
    birthDate: "",
    address: "",
    country: "",
    volunteerType: "non_professional",
    profession: "",
    languages: [],
    experienceCategories: [],
    scheduleHours: [],
    modalityPresential: false,
    modalityOnline: false,
    interestAreas: [],
    hasPriorExperience: null,
}

/** Aplica máscara DD/MM/AAAA mientras el usuario escribe, solo dígitos, máx. 8. */
function formatBirthDateInput(raw: string): string {
    const digits = raw.replace(/\D/g, "").slice(0, 8);
    const day = digits.slice(0, 2);
    const month = digits.slice(2, 4);
    const year = digits.slice(4, 8);
    if (digits.length <= 2) return day;
    if (digits.length <= 4) return `${day}/${month}`;
    return `${day}/${month}/${year}`;
}

const ALL_DOCUMENT_IDS = Array.from(
    new Set([
        ...REQUIRED_DOCUMENTS_PROFESSIONAL.map((d) => d.id),
        ...REQUIRED_DOCUMENTS_NON_PROFESSIONAL.map((d) => d.id),
    ])
);


const fieldClass =
    "w-full rounded-xl border border-outline-variant bg-background px-4 py-3 " +
    "focus-visible:outline-2 focus-visible:outline-primary focus-visible:outline-offset-1 " +
    "focus:border-primary transition-colors";

const errorClass = "text-error text-sm mt-1";

export default function VolunteerRegister() {
    const [formData, setFormData] = useState<iVolunteerForm>(InitVolunteerForm);
    const [errors, setErrors] = useState<Partial<Record<keyof VolunteerFormData, string>>>({});
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [birthDateInput, setBirthDateInput] = useState("");

    function handleBirthDateChange(raw: string) {
        const formatted = formatBirthDateInput(raw);
        setBirthDateInput(formatted);

        const match = formatted.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
        setFormData({
            ...formData,
            birthDate: match ? `${match[3]}-${match[2]}-${match[1]}` : "",
        });
    }

    const ids = {
        fullName: useId(),
        email: useId(),
        phone: useId(),
        password: useId(),
        location: useId(),
        zone: useId(),
        skills: useId(),
        availableHours: useId(),
        availableDays: useId(),

        documentNumber: useId(),
        birthDate: useId(),
        address: useId(),
        country: useId(),
        volunteerType: useId(),
        profession: useId(),
        languages: useId(),
        experienceCategories: useId(),
        scheduleHours: useId(),
        modalityPresential: useId(),
        modalityOnline: useId(),
        interestAreas: useId(),
        hasPriorExperience: useId(),
    } as const;

    const [documentFiles, setDocumentFiles] = useState<Record<string, File | null>>(
        Object.fromEntries(ALL_DOCUMENT_IDS.map((id) => [id, null]))
    );
    const [documentErrors, setDocumentErrors] = useState<Record<string, string>>({});

    const handleDocumentChange = (docId: string, file: File | null) => {
        setDocumentFiles((prev) => ({ ...prev, [docId]: file }));
    };

    function toggleArray<T>(array: T[], value: T): T[] {
        return array.includes(value)
            ? array.filter((v) => v !== value)
            : [...array, value];
    }

    const toggleSkill = (skill: string) => {
        setFormData(prev => ({
            ...prev,
            skills: toggleArray(prev.skills, skill),
        }));
    };

    const toggleAvailableDay = (day: string) => {
        setFormData(prev => ({
            ...prev,
            availableDays: toggleArray(prev.availableDays, day),
        }));
    };
    const toggleExperienceCategory = (category: string) => {
        setFormData(prev => ({
            ...prev,
            experienceCategories: toggleArray(prev.experienceCategories, category),
        }));
    };

    const toggleInterestArea = (area: string) => {
        setFormData(prev => ({
            ...prev,
            interestAreas: toggleArray(prev.interestAreas, area),
        }));
    };

    const toggleScheduleHour = (hour: number) => {
        setFormData(prev => ({
            ...prev,
            scheduleHours: toggleArray(prev.scheduleHours, hour),
        }));
    };

    const toggleTimeBlock = (hours: readonly number[]) => {
        setFormData(prev => {
            const allSelected = hours.every((h) => prev.scheduleHours.includes(h));
            const scheduleHours = allSelected
                ? prev.scheduleHours.filter((h) => !hours.includes(h))
                : Array.from(new Set([...prev.scheduleHours, ...hours]));
            return { ...prev, scheduleHours };
        });
    };

    const handleLanguagesChange = (value: string) => {
        const languages = value
            .split(",")
            .map((lang) => lang.trim())
            .filter((lang) => lang.length > 0);
        setFormData(prev => ({ ...prev, languages }));
    };


    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();

        // acceptedTerms no se pide como checkbox aparte (mismo criterio que
        // el formulario de organización: al enviar la solicitud se asume la
        // aceptación de términos).
        const dataToValidate = { ...formData, acceptedTerms: true as const };

        const result = volunteerSchema.safeParse(dataToValidate);

        if (!result.success) {
            setErrors(getFieldErrors(dataToValidate));
            alertService.warning("Revisa los campos marcados en rojo.");
            return;
        }

        setErrors({});

        const requiredDocs = formData.volunteerType === "professional"
            ? REQUIRED_DOCUMENTS_PROFESSIONAL
            : REQUIRED_DOCUMENTS_NON_PROFESSIONAL;

        const missingDocs: Record<string, string> = {};
        requiredDocs.forEach((doc) => {
            const isConditional = "requiredIfInterestArea" in doc;
            const isApplicable = !isConditional || formData.interestAreas.includes(doc.requiredIfInterestArea);
            if (doc.required && isApplicable && !documentFiles[doc.id]) {
                missingDocs[doc.id] = "Este documento es obligatorio";
            }
        });

        if (Object.keys(missingDocs).length > 0) {
            setDocumentErrors(missingDocs);
            alertService.warning("Adjunta todos los documentos obligatorios.");
            return;
        }

        setDocumentErrors({});
        setIsSubmitting(true);

        try {
            // Paso 1: registrar al voluntario (perfil extendido en una sola transacción)
            const payload = buildVolunteerRegisterPayload(result.data);
            const { token, user } = await sendVolunteer(payload);

            // Paso 2: subir los documentos adjuntos, emparejando por "code" contra
            // el checklist real que el backend generó para este voluntario
            // (evita hardcodear IDs de document_types en el frontend).
            const checklist = await getDocumentChecklist(user.id, token);
            const uploadPromises = Object.entries(documentFiles)
                .filter((entry): entry is [string, File] => entry[1] !== null)
                .map(async ([docId, file]) => {
                    const match = checklist.find((item) => item.documentType.code === docId);
                    if (!match) {
                        console.warn(`No se encontró un document_type para "${docId}" en el checklist del backend`);
                        return null;
                    }
                    return uploadVerificationDocument(file, match.documentType.id, token);
                });

            await Promise.all(uploadPromises);

            alertService.success("Tu solicitud fue enviada. Te contactaremos pronto.");
            setFormData(InitVolunteerForm);
            setDocumentFiles(Object.fromEntries(ALL_DOCUMENT_IDS.map((id) => [id, null])));
            setDocumentErrors({});

        } catch (error) {
            const message = error instanceof Error ? error.message : "No se pudo enviar tu solicitud.";
            alertService.error(message);
        } finally {
            setIsSubmitting(false);
        }
    };


    // Padding inferior extra (pb-28) para que el botón de envío quede por
    // encima del FAB de SOS flotante (fixed bottom-24) y no se superpongan
    // en viewports móviles.
    return (
        <section className="px-5 lg:px-10 pt-8 pb-28 lg:py-12">
            <div className="max-w-3xl mx-auto">
                <header className="mb-8">
                    <h1 className="text-3xl lg:text-4xl font-bold text-on-surface">
                        Registro de Voluntario
                    </h1>
                    <p className="text-on-surface-variant mt-2 text-base">
                        Formulario inicial para unirte a la red SARA.
                    </p>
                </header>

                <form
                    onSubmit={handleSubmit}
                    noValidate
                    className="rounded-2xl border border-outline-variant bg-surface-container-low p-5 sm:p-6 lg:p-8 space-y-8"
                >
                    {/* DATOS PERSONALES */}
                    <fieldset className="space-y-4">
                        <legend className="text-sm font-semibold text-primary uppercase tracking-wide mb-2">
                            Datos personales
                        </legend>

                        <div>
                            <Label htmlFor={ids.fullName} name="Nombre completo" required />
                            <input
                                id={ids.fullName}
                                className={`${fieldClass} mt-2 ${errors.fullName ? "border-error" : ""}`}
                                placeholder="Ej. María González"
                                value={formData.fullName}
                                onChange={(e) => setFormData({ ...formData, fullName: e.target.value })}
                                aria-invalid={!!errors.fullName}
                                aria-describedby={errors.fullName ? `${ids.fullName}-err` : undefined}
                            />
                            {errors.fullName && (
                                <p id={`${ids.fullName}-err`} className={errorClass}>{errors.fullName}</p>
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
                                    onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                                    aria-invalid={!!errors.email}
                                    aria-describedby={errors.email ? `${ids.email}-err` : undefined}
                                />
                                {errors.email && (
                                    <p id={`${ids.email}-err`} className={errorClass}>{errors.email}</p>
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
                                {errors.phone && (
                                    <p className={errorClass}>{errors.phone}</p>
                                )}
                            </div>
                        </div>

                        <div>
                            <Label htmlFor={ids.password} name="Contraseña para tu cuenta" required />
                            <input
                                id={ids.password}
                                type="password"
                                className={`${fieldClass} mt-2 ${errors.password ? "border-error" : ""}`}
                                placeholder="Mínimo 8 caracteres"
                                value={formData.password}
                                onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                                aria-invalid={!!errors.password}
                                aria-describedby={errors.password ? `${ids.password}-err` : undefined}
                            />
                            {errors.password && (
                                <p id={`${ids.password}-err`} className={errorClass}>{errors.password}</p>
                            )}
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                            <div>
                                <Label htmlFor={ids.documentNumber} name="Documento de identidad" required />
                                <input
                                    id={ids.documentNumber}
                                    className={`${fieldClass} mt-2 ${errors.documentNumber ? "border-error" : ""}`}
                                    placeholder="Ej. V-12345678"
                                    value={formData.documentNumber}
                                    onChange={(e) => setFormData({ ...formData, documentNumber: e.target.value })}
                                    aria-invalid={!!errors.documentNumber}
                                    aria-describedby={errors.documentNumber ? `${ids.documentNumber}-err` : undefined}
                                />
                                {errors.documentNumber && (
                                    <p id={`${ids.documentNumber}-err`} className={errorClass}>{errors.documentNumber}</p>
                                )}
                            </div>

                            <div>
                                <Label htmlFor={ids.birthDate} name="Fecha de nacimiento" required />
                                <input
                                    id={ids.birthDate}
                                    inputMode="numeric"
                                    autoComplete="bday"
                                    className={`${fieldClass} mt-2 ${errors.birthDate ? "border-error" : ""}`}
                                    placeholder="DD/MM/AAAA"
                                    value={birthDateInput}
                                    onChange={(e) => handleBirthDateChange(e.target.value)}
                                    aria-invalid={!!errors.birthDate}
                                    aria-describedby={errors.birthDate ? `${ids.birthDate}-err` : undefined}
                                />
                                {errors.birthDate && (
                                    <p id={`${ids.birthDate}-err`} className={errorClass}>{errors.birthDate}</p>
                                )}
                            </div>
                        </div>

                        <div>
                            <Label htmlFor={ids.address} name="Dirección" required />
                            <input
                                id={ids.address}
                                className={`${fieldClass} mt-2 ${errors.address ? "border-error" : ""}`}
                                placeholder="Ej. Av. Principal, Edificio X, Piso 2"
                                value={formData.address}
                                onChange={(e) => setFormData({ ...formData, address: e.target.value })}
                                aria-invalid={!!errors.address}
                                aria-describedby={errors.address ? `${ids.address}-err` : undefined}
                            />
                            {errors.address && (
                                <p id={`${ids.address}-err`} className={errorClass}>{errors.address}</p>
                            )}
                        </div>

                        <div>
                            <Label htmlFor={ids.country} name="País" required />
                            <select
                                id={ids.country}
                                className={`${fieldClass} mt-2 ${errors.country ? "border-error" : ""}`}
                                value={formData.country}
                                onChange={(e) => setFormData({ ...formData, country: e.target.value })}
                                aria-invalid={!!errors.country}
                                aria-describedby={errors.country ? `${ids.country}-err` : undefined}
                            >
                                <option value="">Selecciona un país</option>
                                {COUNTRIES.map((c) => (
                                    <option key={c} value={c}>{c}</option>
                                ))}
                            </select>
                            {errors.country && (
                                <p id={`${ids.country}-err`} className={errorClass}>{errors.country}</p>
                            )}
                        </div>
                    </fieldset>

                    {/* COBERTURA */}
                    <fieldset className="space-y-4">
                        <legend className="text-sm font-semibold text-primary uppercase tracking-wide mb-2">
                            Cobertura
                        </legend>

                        <div>
                            <Label htmlFor={ids.zone} name="Zona donde puede operar" required />
                            <input
                                id={ids.zone}
                                className={`${fieldClass} mt-2 ${errors.zone ? "border-error" : ""}`}
                                placeholder="Ej. Chacao, Caracas"
                                value={formData.zone}
                                onChange={(e) => setFormData({ ...formData, zone: e.target.value })}
                                aria-invalid={!!errors.zone}
                                aria-describedby={errors.zone ? `${ids.zone}-err` : undefined}
                            />
                            {errors.zone && (
                                <p id={`${ids.zone}-err`} className={errorClass}>{errors.zone}</p>
                            )}
                        </div>
                    </fieldset>

                    {/* UBICACIÓN */}
                    <fieldset>
                        <legend className="text-sm font-semibold text-primary uppercase tracking-wide mb-2">
                            Ubicación
                        </legend>
                        <Label htmlFor={ids.location} name="Marca en el mapa la zona donde puedes operar" required />
                        <div id={ids.location} className="mt-2">
                            <Location
                                value={formData.location}
                                onChange={(loc) => setFormData({ ...formData, location: loc })}
                            />
                        </div>
                        {errors.location && (
                            <p className={errorClass}>{errors.location}</p>
                        )}
                    </fieldset>

                    {/* HABILIDADES Y DISPONIBILIDAD */}
                    <fieldset className="space-y-6">
                        <legend className="text-sm font-semibold text-primary uppercase tracking-wide mb-2">
                            Habilidades y disponibilidad
                        </legend>

                        <div>
                            <Label htmlFor={ids.skills} name="Habilidades" required />
                            <div
                                id={ids.skills}
                                role="group"
                                aria-labelledby={ids.skills}
                                className="mt-2 grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2"
                            >
                                {SKILLS.map((skill) => {
                                    const checked = formData.skills.includes(skill.value);
                                    return (
                                        <label
                                            key={skill.value}
                                            className={[
                                                "flex items-center gap-2 rounded-xl border bg-background px-3 py-2.5 text-sm cursor-pointer transition-colors",
                                                checked
                                                    ? "border-primary bg-primary-fixed"
                                                    : "border-outline-variant hover:border-primary/60",
                                            ].join(" ")}
                                        >
                                            <input
                                                type="checkbox"
                                                checked={checked}
                                                onChange={() => toggleSkill(skill.value)}
                                                className="accent-primary shrink-0"
                                            />
                                            <span className="leading-tight">{skill.label}</span>
                                        </label>
                                    );
                                })}
                            </div>
                            {errors.skills && (
                                <p className={errorClass}>{errors.skills}</p>
                            )}
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                            <div>
                                <Label htmlFor={ids.availableHours} name="Horas / semana" required />
                                <input
                                    id={ids.availableHours}
                                    type="number"
                                    min={0}
                                    max={168}
                                    className={`${fieldClass} mt-2 ${errors.availableHours ? "border-error" : ""}`}
                                    placeholder="Ej. 10"
                                    value={formData.availableHours || ""}
                                    onChange={(e) =>
                                        setFormData({ ...formData, availableHours: parseInt(e.target.value) || 0 })
                                    }
                                    aria-invalid={!!errors.availableHours}
                                    aria-describedby={errors.availableHours ? `${ids.availableHours}-err` : undefined}
                                />
                                {errors.availableHours && (
                                    <p id={`${ids.availableHours}-err`} className={errorClass}>{errors.availableHours}</p>
                                )}
                            </div>

                            <div className="sm:col-span-2">
                                <Label htmlFor={ids.availableDays} name="Días disponibles" required />
                                <div
                                    id={ids.availableDays}
                                    role="group"
                                    aria-labelledby={ids.availableDays}
                                    className="mt-2 flex flex-wrap gap-2"
                                >
                                    {DAYS_WEEKEND.map((dia) => {
                                        const checked = formData.availableDays.includes(dia.value);
                                        return (
                                            <label
                                                key={dia.value}
                                                className={[
                                                    "flex items-center gap-2 rounded-full border bg-background px-3 py-2 text-sm cursor-pointer transition-colors",
                                                    checked
                                                        ? "border-primary bg-primary-fixed"
                                                        : "border-outline-variant hover:border-primary/60",
                                                ].join(" ")}
                                            >
                                                <input
                                                    type="checkbox"
                                                    checked={checked}
                                                    onChange={() => toggleAvailableDay(dia.value)}
                                                    className="accent-primary shrink-0"
                                                />
                                                {dia.label}
                                            </label>
                                        );
                                    })}
                                </div>
                                {errors.availableDays && (
                                    <p className={errorClass}>{errors.availableDays}</p>
                                )}
                            </div>
                        </div>
                    </fieldset>

                    {/* TIPO DE PERFIL */}
                    <fieldset>
                        <legend className="text-sm font-semibold text-primary uppercase tracking-wide mb-2">
                            Tipo de perfil
                        </legend>
                        <div className="flex items-center justify-between gap-4 rounded-xl border border-outline-variant bg-background px-4 py-3">
                            <div>
                                <p className="text-sm font-semibold text-on-surface">
                                    {formData.volunteerType === "professional" ? "Voluntario profesional" : formData.volunteerType === "non_professional" ? "Voluntario no profesional" : "Selecciona tu perfil"}
                                </p>
                                <p className="text-xs text-on-surface-variant">
                                    Activa el switch si cuentas con formación o profesión relacionada
                                </p>
                            </div>
                            <button
                                type="button"
                                role="switch"
                                aria-checked={formData.volunteerType === "professional"}
                                aria-label={`Perfil: ${formData.volunteerType === "professional" ? "profesional" : "no profesional"}`}
                                id={ids.volunteerType}
                                onClick={() =>
                                    setFormData({
                                        ...formData,
                                        volunteerType: formData.volunteerType === "professional" ? "non_professional" : "professional",
                                    })
                                }
                                className={`relative inline-flex h-7 w-12 shrink-0 items-center rounded-full transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 ${formData.volunteerType === "professional" ? "bg-primary" : "bg-surface-container-highest border border-outline"
                                    }`}
                            >
                                <span
                                    className={`inline-block h-5 w-5 rounded-full bg-white shadow-sm transition-transform ${formData.volunteerType === "professional" ? "translate-x-6" : "translate-x-1"
                                        }`}
                                />
                            </button>
                        </div>
                        {errors.volunteerType && (
                            <p className={errorClass}>{errors.volunteerType}</p>
                        )}
                    </fieldset>

                    {/* PERFIL PROFESIONAL */}
                    {formData.volunteerType === "professional" && (
                        <fieldset className="space-y-4">
                            <legend className="text-sm font-semibold text-primary uppercase tracking-wide mb-2">
                                Perfil profesional
                            </legend>

                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                <div>
                                    <Label htmlFor={ids.profession} name="Profesión / Formación" required />
                                    <input
                                        id={ids.profession}
                                        className={`${fieldClass} mt-2 ${errors.profession ? "border-error" : ""}`}
                                        placeholder="Ej. Fisioterapeuta"
                                        value={formData.profession}
                                        onChange={(e) => setFormData({ ...formData, profession: e.target.value })}
                                        aria-invalid={!!errors.profession}
                                        aria-describedby={errors.profession ? `${ids.profession}-err` : undefined}
                                    />
                                    {errors.profession && (
                                        <p id={`${ids.profession}-err`} className={errorClass}>{errors.profession}</p>
                                    )}
                                </div>

                                <div>
                                    <Label htmlFor={ids.languages} name="Idiomas (separados por coma)" required />
                                    <input
                                        id={ids.languages}
                                        className={`${fieldClass} mt-2 ${errors.languages ? "border-error" : ""}`}
                                        placeholder="Ej. Español, Inglés, Lengua de señas"
                                        defaultValue={formData.languages.join(", ")}
                                        onBlur={(e) => handleLanguagesChange(e.target.value)}
                                        aria-invalid={!!errors.languages}
                                        aria-describedby={errors.languages ? `${ids.languages}-err` : undefined}
                                    />
                                    {errors.languages && (
                                        <p id={`${ids.languages}-err`} className={errorClass}>{errors.languages}</p>
                                    )}
                                </div>
                            </div>

                            <div>
                                <Label htmlFor={ids.experienceCategories} name="Experiencia" required />
                                <div
                                    id={ids.experienceCategories}
                                    role="group"
                                    aria-labelledby={ids.experienceCategories}
                                    className="mt-2 grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2"
                                >
                                    {EXPERIENCE_CATEGORIES.map((category) => {
                                        const checked = formData.experienceCategories.includes(category);
                                        return (
                                            <label
                                                key={category}
                                                className={[
                                                    "flex items-center gap-2 rounded-xl border bg-background px-3 py-2.5 text-sm cursor-pointer transition-colors",
                                                    checked ? "border-primary bg-primary-fixed" : "border-outline-variant hover:border-primary/60",
                                                ].join(" ")}
                                            >
                                                <input
                                                    type="checkbox"
                                                    checked={checked}
                                                    onChange={() => toggleExperienceCategory(category)}
                                                    className="accent-primary shrink-0"
                                                />
                                                <span className="leading-tight">{category}</span>
                                            </label>
                                        );
                                    })}
                                </div>
                                {errors.experienceCategories && (
                                    <p className={errorClass}>{errors.experienceCategories}</p>
                                )}
                            </div>
                        </fieldset>
                    )}

                    {/* PERFIL NO PROFESIONAL */}
                    {formData.volunteerType === "non_professional" && (
                        <fieldset>
                            <legend className="text-sm font-semibold text-primary uppercase tracking-wide mb-2">
                                Experiencia en voluntariado
                            </legend>
                            <div
                                role="group"
                                aria-labelledby={ids.hasPriorExperience}
                                className="flex gap-3"
                            >
                                {[{ label: "Sí", value: true }, { label: "No", value: false }].map((opt) => {
                                    const checked = formData.hasPriorExperience === opt.value;
                                    return (
                                        <label
                                            key={opt.label}
                                            className={[
                                                "flex items-center gap-2 rounded-xl border bg-background px-4 py-2.5 text-sm cursor-pointer transition-colors",
                                                checked ? "border-primary bg-primary-fixed" : "border-outline-variant hover:border-primary/60",
                                            ].join(" ")}
                                        >
                                            <input
                                                type="radio"
                                                name={ids.hasPriorExperience}
                                                checked={checked}
                                                onChange={() => setFormData({ ...formData, hasPriorExperience: opt.value })}
                                                className="accent-primary shrink-0"
                                            />
                                            {opt.label}
                                        </label>
                                    );
                                })}
                            </div>
                            {errors.hasPriorExperience && (
                                <p className={errorClass}>{errors.hasPriorExperience}</p>
                            )}
                        </fieldset>
                    )}

                    {/* DISPONIBILIDAD (compartido) */}
                    {formData.volunteerType !== "" && (
                        <fieldset className="space-y-4">
                            <legend className="text-sm font-semibold text-primary uppercase tracking-wide mb-2">
                                Disponibilidad
                            </legend>

                            <div>
                                <Label htmlFor={ids.scheduleHours} name="Horarios disponibles" required />
                                <div className="mt-2 flex flex-wrap gap-2">
                                    {TIME_BLOCKS.map((block) => {
                                        const allSelected = block.hours.every((h) => formData.scheduleHours.includes(h));
                                        return (
                                            <button
                                                key={block.label}
                                                type="button"
                                                onClick={() => toggleTimeBlock(block.hours)}
                                                className={[
                                                    "rounded-full border px-4 py-2 text-sm font-semibold transition-colors",
                                                    allSelected ? "border-primary bg-primary-fixed text-primary" : "border-outline-variant hover:border-primary/60",
                                                ].join(" ")}
                                            >
                                                {block.label}
                                            </button>
                                        );
                                    })}
                                </div>
                                <div
                                    id={ids.scheduleHours}
                                    role="group"
                                    aria-labelledby={ids.scheduleHours}
                                    className="mt-3 grid grid-cols-4 sm:grid-cols-6 gap-2"
                                >
                                    {ALL_HOURS.map((hour) => {
                                        const checked = formData.scheduleHours.includes(hour);
                                        return (
                                            <label
                                                key={hour}
                                                className={[
                                                    "flex items-center justify-center gap-1 rounded-lg border bg-background px-2 py-2 text-xs cursor-pointer transition-colors",
                                                    checked ? "border-primary bg-primary-fixed" : "border-outline-variant hover:border-primary/60",
                                                ].join(" ")}
                                            >
                                                <input
                                                    type="checkbox"
                                                    checked={checked}
                                                    onChange={() => toggleScheduleHour(hour)}
                                                    className="accent-primary shrink-0"
                                                />
                                                {String(hour).padStart(2, "0")}:00
                                            </label>
                                        );
                                    })}
                                </div>
                                {errors.scheduleHours && (
                                    <p className={errorClass}>{errors.scheduleHours}</p>
                                )}
                            </div>

                            <div>
                                <Label htmlFor={ids.modalityPresential} name="Modalidad" required />
                                <div className="mt-2 flex flex-wrap gap-2">
                                    <label className={[
                                        "flex items-center gap-2 rounded-xl border bg-background px-3 py-2.5 text-sm cursor-pointer transition-colors",
                                        formData.modalityPresential ? "border-primary bg-primary-fixed" : "border-outline-variant hover:border-primary/60",
                                    ].join(" ")}>
                                        <input
                                            id={ids.modalityPresential}
                                            type="checkbox"
                                            checked={formData.modalityPresential}
                                            onChange={() => setFormData({ ...formData, modalityPresential: !formData.modalityPresential })}
                                            className="accent-primary shrink-0"
                                        />
                                        Presencial
                                    </label>
                                    <label className={[
                                        "flex items-center gap-2 rounded-xl border bg-background px-3 py-2.5 text-sm cursor-pointer transition-colors",
                                        formData.modalityOnline ? "border-primary bg-primary-fixed" : "border-outline-variant hover:border-primary/60",
                                    ].join(" ")}>
                                        <input
                                            id={ids.modalityOnline}
                                            type="checkbox"
                                            checked={formData.modalityOnline}
                                            onChange={() => setFormData({ ...formData, modalityOnline: !formData.modalityOnline })}
                                            className="accent-primary shrink-0"
                                        />
                                        Online
                                    </label>
                                </div>
                                {errors.modalityPresential && (
                                    <p className={errorClass}>{errors.modalityPresential}</p>
                                )}
                            </div>
                        </fieldset>
                    )}

                    {/* ÁREAS DE INTERÉS (compartido, opciones según perfil) */}
                    {formData.volunteerType !== "" && (
                        <fieldset>
                            <legend className="text-sm font-semibold text-primary uppercase tracking-wide mb-2">
                                Áreas de interés
                            </legend>
                            <div
                                id={ids.interestAreas}
                                role="group"
                                aria-labelledby={ids.interestAreas}
                                className="mt-2 grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2"
                            >
                                {(formData.volunteerType === "professional" ? INTEREST_AREAS_PROFESSIONAL : INTEREST_AREAS_NON_PROFESSIONAL).map((area) => {
                                    const checked = formData.interestAreas.includes(area);
                                    return (
                                        <label
                                            key={area}
                                            className={[
                                                "flex items-center gap-2 rounded-xl border bg-background px-3 py-2.5 text-sm cursor-pointer transition-colors",
                                                checked ? "border-primary bg-primary-fixed" : "border-outline-variant hover:border-primary/60",
                                            ].join(" ")}
                                        >
                                            <input
                                                type="checkbox"
                                                checked={checked}
                                                onChange={() => toggleInterestArea(area)}
                                                className="accent-primary shrink-0"
                                            />
                                            <span className="leading-tight">{area}</span>
                                        </label>
                                    );
                                })}
                            </div>
                            {errors.interestAreas && (
                                <p className={errorClass}>{errors.interestAreas}</p>
                            )}
                        </fieldset>
                    )}

                    {/* DOCUMENTACIÓN DEL VOLUNTARIADO */}
                    {formData.volunteerType !== "" && (
                        <fieldset className="space-y-3">
                            <legend className="text-sm font-semibold text-primary uppercase tracking-wide mb-2">
                                Documentación del voluntariado
                            </legend>

                            {(formData.volunteerType === "professional" ? REQUIRED_DOCUMENTS_PROFESSIONAL : REQUIRED_DOCUMENTS_NON_PROFESSIONAL)
                                .filter((doc) => {
                                    // Documentos condicionales del perfil no profesional: solo se muestran
                                    // si el área de interés relacionada fue seleccionada.
                                    if (!("requiredIfInterestArea" in doc)) return true;
                                    return formData.interestAreas.includes(doc.requiredIfInterestArea);
                                })
                                .map((doc) => {
                                    const fileId = `doc-${doc.id}`;
                                    const selectedFile = documentFiles[doc.id];
                                    return (
                                        <div
                                            key={doc.id}
                                            className="rounded-xl border border-outline-variant bg-background px-4 py-3"
                                        >
                                            <Label htmlFor={fileId} name={`${doc.name}${doc.required ? " *" : ""}`} />
                                            <input
                                                id={fileId}
                                                type="file"
                                                accept=".pdf,.jpg,.jpeg,.png"
                                                className="mt-2 w-full text-sm text-on-surface-variant file:mr-3 file:rounded-lg file:border-0 file:bg-primary-fixed file:px-3 file:py-2 file:text-sm file:font-semibold file:text-primary hover:file:opacity-90"
                                                onChange={(e) => handleDocumentChange(doc.id, e.target.files?.[0] ?? null)}
                                            />
                                            {selectedFile && (
                                                <p className="mt-1 text-xs text-on-surface-variant">
                                                    Archivo seleccionado: {selectedFile.name}
                                                </p>
                                            )}
                                            {documentErrors[doc.id] && (
                                                <p className={errorClass}>{documentErrors[doc.id]}</p>
                                            )}
                                        </div>
                                    );
                                })}
                        </fieldset>
                    )}

                    <div className="pt-2 flex justify-end">
                        <Button type="submit" variant="filled" size="lg" icon="send" disabled={isSubmitting}>
                            {isSubmitting ? "Enviando..." : "Enviar solicitud"}
                        </Button>
                    </div>
                </form>
            </div>
        </section>
    );
}
