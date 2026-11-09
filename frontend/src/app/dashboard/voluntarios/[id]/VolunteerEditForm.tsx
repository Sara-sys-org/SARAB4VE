"use client";

import { useEffect, useState } from "react";
import dynamic from "next/dynamic";
import Label from "@/components/ui/Label";
import Button from "@/components/ui/Button";
import PhoneField from "@/components/ui/PhoneField";
import { alertService } from "@/services/alertService";
import { updateVolunteerProfile } from "@/api/user";
import { getCatalog } from "@/api/verification";
import { DAYS_WEEKEND, SKILLS } from "@/types";
import { COUNTRIES } from "@/lib/countries";
import type {
    AvailabilityMode,
    CatalogItem,
    VolunteerProfileResponse,
    VolunteerType,
} from "@/types/index";
import {
    getEditFieldErrors,
    buildUpdatePayload,
    normalizeDay,
    toVolunteerFormState,
    type EditFieldErrors,
    type VolunteerEditFormState,
} from "./editSchema";

const Location = dynamic(() => import("@/components/ui/Location"), {
    ssr: false,
    loading: () => <div className="h-[220px] rounded-xl bg-surface-container animate-pulse" />,
});

const fieldClass =
    "w-full rounded-xl border border-outline-variant bg-background px-4 py-3 " +
    "focus-visible:outline-2 focus-visible:outline-primary focus-visible:outline-offset-1 " +
    "focus:border-primary transition-colors";

const errorClass = "text-error text-sm mt-1";

const MESSAGE = "Revisa los campos marcados en rojo.";

interface Choice {
    value: string;
    label: string;
}

const VOLUNTEER_TYPE_OPTIONS: Choice[] = [
    { value: "professional", label: "Profesional" },
    { value: "non_professional", label: "No profesional" },
];

const DOCUMENT_TYPE_OPTIONS: Choice[] = [
    { value: "cedula", label: "Cédula" },
    { value: "pasaporte", label: "Pasaporte" },
    { value: "otro", label: "Otro" },
];

const AVAILABILITY_MODE_OPTIONS: Choice[] = [
    { value: "", label: "Sin especificar" },
    { value: "presential", label: "Presencial" },
    { value: "online", label: "En línea" },
    { value: "both", label: "Presencial y en línea" },
];

const YES_NO_OPTIONS: Choice[] = [
    { value: "", label: "Sin especificar" },
    { value: "true", label: "Sí" },
    { value: "false", label: "No" },
];

const COUNTRY_OPTIONS: Choice[] = [
    { value: "", label: "Sin especificar" },
    ...COUNTRIES.map((c) => ({ value: c, label: c })),
];

/** Añade al catálogo los valores legados del perfil para no perderlos ni ocultarlos. */
function mergeChoices(base: readonly Choice[], current: readonly string[]): Choice[] {
    const known = new Set(base.map((item) => item.value));
    const extras = current
        .filter((value) => Boolean(value) && !known.has(value))
        .filter((value, index, list) => list.indexOf(value) === index)
        .map((value) => ({ value, label: value }));
    return [...base, ...extras];
}

function toVolunteerType(value: string): VolunteerType | "" {
    return value === "professional" || value === "non_professional" ? value : "";
}

function toAvailabilityMode(value: string): AvailabilityMode | "" {
    return value === "presential" || value === "online" || value === "both" ? value : "";
}

function toTriState(value: string): "" | "true" | "false" {
    return value === "true" || value === "false" ? value : "";
}

function toggleValue(values: string[], value: string): string[] {
    return values.includes(value) ? values.filter((item) => item !== value) : [...values, value];
}

function toggleId(ids: number[], id: number): number[] {
    return ids.includes(id) ? ids.filter((value) => value !== id) : [...ids, id];
}

function FieldError({ id, message }: { id: string; message?: string }) {
    if (!message) return null;
    return <p id={id} className={errorClass}>{message}</p>;
}

interface TextFieldProps {
    id: string;
    label: string;
    value: string;
    onChange: (value: string) => void;
    error?: string;
    placeholder?: string;
    type?: string;
    maxLength?: number;
    min?: number;
    max?: number;
    textarea?: boolean;
    rows?: number;
}

function TextField({
    id,
    label,
    value,
    onChange,
    error,
    placeholder,
    type = "text",
    maxLength,
    min,
    max,
    textarea = false,
    rows = 3,
}: TextFieldProps) {
    const className = `${fieldClass} mt-2 ${error ? "border-error" : ""}`;
    const describedBy = error ? `${id}-err` : undefined;

    return (
        <div>
            <Label htmlFor={id} name={label} />
            {textarea ? (
                <textarea
                    id={id}
                    rows={rows}
                    className={className}
                    placeholder={placeholder}
                    value={value}
                    onChange={(e) => onChange(e.target.value)}
                    aria-invalid={!!error}
                    aria-describedby={describedBy}
                />
            ) : (
                <input
                    id={id}
                    type={type}
                    min={min}
                    max={max}
                    maxLength={maxLength}
                    className={className}
                    placeholder={placeholder}
                    value={value}
                    onChange={(e) => onChange(e.target.value)}
                    aria-invalid={!!error}
                    aria-describedby={describedBy}
                />
            )}
            <FieldError id={`${id}-err`} message={error} />
        </div>
    );
}

interface SelectFieldProps {
    id: string;
    label: string;
    value: string;
    options: readonly Choice[];
    onChange: (value: string) => void;
    error?: string;
}

function SelectField({ id, label, value, options, onChange, error }: SelectFieldProps) {
    return (
        <div>
            <Label htmlFor={id} name={label} />
            <select
                id={id}
                className={`${fieldClass} mt-2 ${error ? "border-error" : ""}`}
                value={value}
                onChange={(e) => onChange(e.target.value)}
                aria-invalid={!!error}
                aria-describedby={error ? `${id}-err` : undefined}
            >
                {options.map((option) => (
                    <option key={option.value} value={option.value}>{option.label}</option>
                ))}
            </select>
            <FieldError id={`${id}-err`} message={error} />
        </div>
    );
}

interface CheckboxGroupProps {
    id: string;
    legend: string;
    options: readonly Choice[];
    isChecked: (value: string) => boolean;
    onToggle: (value: string) => void;
    emptyMessage?: string;
    error?: string;
}

function CheckboxGroup({
    id,
    legend,
    options,
    isChecked,
    onToggle,
    emptyMessage,
    error,
}: CheckboxGroupProps) {
    return (
        <fieldset>
            <legend className="text-sm font-semibold text-primary uppercase tracking-wide mb-2">
                {legend}
            </legend>
            {options.length === 0 ? (
                <p className="text-sm text-on-surface-variant">{emptyMessage ?? "Sin opciones disponibles."}</p>
            ) : (
                <div
                    id={id}
                    role="group"
                    aria-label={legend}
                    aria-describedby={error ? `${id}-err` : undefined}
                    className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2"
                >
                    {options.map((option) => {
                        const checked = isChecked(option.value);
                        return (
                            <label
                                key={option.value}
                                className={[
                                    "flex items-center gap-2 rounded-xl border bg-background px-3 py-2.5 text-sm cursor-pointer transition-colors",
                                    checked ? "border-primary bg-primary-fixed" : "border-outline-variant hover:border-primary/60",
                                ].join(" ")}
                            >
                                <input
                                    type="checkbox"
                                    checked={checked}
                                    onChange={() => onToggle(option.value)}
                                    className="accent-primary shrink-0"
                                />
                                <span className="leading-tight">{option.label}</span>
                            </label>
                        );
                    })}
                </div>
            )}
            <FieldError id={`${id}-err`} message={error} />
        </fieldset>
    );
}

interface VolunteerEditFormProps {
    perfil: VolunteerProfileResponse;
    onCancel: () => void;
    onSaved: (updated: VolunteerProfileResponse) => void;
}

export default function VolunteerEditForm({ perfil, onCancel, onSaved }: VolunteerEditFormProps) {
    const [formData, setFormData] = useState<VolunteerEditFormState>(() => toVolunteerFormState(perfil));
    const [errors, setErrors] = useState<EditFieldErrors>({});
    const [isSaving, setIsSaving] = useState(false);
    const [interestOptions, setInterestOptions] = useState<CatalogItem[]>([]);
    const [experienceOptions, setExperienceOptions] = useState<CatalogItem[]>([]);

    useEffect(() => {
        let active = true;
        async function loadCatalogs() {
            try {
                const [areas, categories] = await Promise.all([
                    getCatalog("interest_area"),
                    getCatalog("experience_category"),
                ]);
                if (!active) return;
                setInterestOptions(areas);
                setExperienceOptions(categories);
            } catch (error) {
                if (!active) return;
                const message = error instanceof Error ? error.message : "No se pudieron cargar los catálogos.";
                alertService.error(message);
            }
        }
        loadCatalogs();
        return () => {
            active = false;
        };
    }, []);

    // Fallback a los catálogos ya presentes en el perfil si la carga falla,
    // para no perder las selecciones actuales.
    const interestChoices = interestOptions.length > 0 ? interestOptions : perfil.interestAreas;
    const experienceChoices = experienceOptions.length > 0 ? experienceOptions : perfil.experience;

    // Los valores legados se conservan como opción extra para que el admin
    // pueda verlos y desmarcarlos, en vez de perderlos silenciosamente.
    const skillChoices = mergeChoices(SKILLS, perfil.details?.skills ?? []);
    const dayChoices = mergeChoices(
        DAYS_WEEKEND,
        (perfil.details?.availableDays ?? []).map(normalizeDay),
    );

    const documentTypeChoices: Choice[] = [
        { value: "", label: "Sin especificar" },
        ...DOCUMENT_TYPE_OPTIONS,
    ];
    const documentTypeOption =
        formData.documentType && !documentTypeChoices.some((option) => option.value === formData.documentType)
            ? [...documentTypeChoices, { value: formData.documentType, label: formData.documentType }]
            : documentTypeChoices;

    const volunteerTypeChoices: Choice[] = formData.volunteerType
        ? VOLUNTEER_TYPE_OPTIONS
        : [{ value: "", label: "Sin especificar" }, ...VOLUNTEER_TYPE_OPTIONS];

    const clearError = (key: keyof VolunteerEditFormState) => {
        setErrors((prev) => {
            if (!prev[key]) return prev;
            const next = { ...prev };
            delete next[key];
            return next;
        });
    };

    const update = <K extends keyof VolunteerEditFormState>(key: K, value: VolunteerEditFormState[K]) => {
        setFormData((prev) => ({ ...prev, [key]: value }));
        clearError(key);
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();

        const fieldErrors = getEditFieldErrors(formData);
        if (Object.keys(fieldErrors).length > 0) {
            setErrors(fieldErrors);
            alertService.warning(MESSAGE);
            return;
        }

        setErrors({});
        setIsSaving(true);

        try {
            const updated = await updateVolunteerProfile(perfil.user.id, buildUpdatePayload(formData));
            alertService.success("Cambios guardados correctamente.");
            onSaved(updated);
        } catch (error) {
            const message = error instanceof Error ? error.message : "No se pudieron guardar los cambios.";
            alertService.error(message);
        } finally {
            setIsSaving(false);
        }
    };

    return (
        <form
            onSubmit={handleSubmit}
            noValidate
            className="rounded-2xl border border-outline-variant bg-surface-container-low p-6 space-y-6"
        >
            <div className="flex items-center gap-2">
                <span className="material-symbols-rounded text-xl text-primary" aria-hidden="true">edit</span>
                <h2 className="text-lg font-bold text-on-surface">Editar información</h2>
            </div>

            {/* Datos de contacto */}
            <fieldset className="space-y-4">
                <legend className="text-sm font-semibold text-primary uppercase tracking-wide mb-2">
                    Datos de contacto
                </legend>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <TextField
                        id="vol-edit-fullName"
                        label="Nombre completo"
                        value={formData.fullName}
                        onChange={(v) => update("fullName", v)}
                        error={errors.fullName}
                        placeholder="Ej. Carlos Pérez"
                        maxLength={100}
                    />
                    <TextField
                        id="vol-edit-email"
                        label="Correo electrónico"
                        type="email"
                        value={formData.email}
                        onChange={(v) => update("email", v)}
                        error={errors.email}
                        placeholder="voluntario@correo.com"
                    />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                        <Label htmlFor="vol-edit-phone" name="Teléfono" />
                        <div id="vol-edit-phone" className="mt-2">
                            <PhoneField value={formData.phone} onChange={(phone) => update("phone", phone)} />
                        </div>
                        <FieldError id="vol-edit-phone-err" message={errors.phone} />
                    </div>
                    <TextField
                        id="vol-edit-zone"
                        label="Zona"
                        value={formData.zone}
                        onChange={(v) => update("zone", v)}
                        error={errors.zone}
                        placeholder="Ej. Caracas - Zona 1"
                        maxLength={120}
                    />
                </div>

                <div>
                    <Label htmlFor="vol-edit-location" name="Ubicación" />
                    <div id="vol-edit-location" className="mt-2">
                        <Location value={formData.location} onChange={(loc) => update("location", loc)} />
                    </div>
                    <FieldError id="vol-edit-location-err" message={errors.location} />
                </div>
            </fieldset>

            {/* Perfil de voluntariado */}
            <fieldset className="space-y-4">
                <legend className="text-sm font-semibold text-primary uppercase tracking-wide mb-2">
                    Perfil de voluntariado
                </legend>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <SelectField
                        id="vol-edit-volunteerType"
                        label="Tipo de voluntario"
                        value={formData.volunteerType}
                        options={volunteerTypeChoices}
                        onChange={(v) => update("volunteerType", toVolunteerType(v))}
                        error={errors.volunteerType}
                    />
                    <SelectField
                        id="vol-edit-documentType"
                        label="Tipo de documento"
                        value={formData.documentType}
                        options={documentTypeOption}
                        onChange={(v) => update("documentType", v)}
                        error={errors.documentType}
                    />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <TextField
                        id="vol-edit-documentNumber"
                        label="Número de documento"
                        value={formData.documentNumber}
                        onChange={(v) => update("documentNumber", v)}
                        error={errors.documentNumber}
                        placeholder="Ej. V12345678"
                        maxLength={30}
                    />
                    <TextField
                        id="vol-edit-birthDate"
                        label="Fecha de nacimiento"
                        type="date"
                        value={formData.birthDate}
                        onChange={(v) => update("birthDate", v)}
                        error={errors.birthDate}
                    />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <TextField
                        id="vol-edit-address"
                        label="Dirección"
                        value={formData.address}
                        onChange={(v) => update("address", v)}
                        error={errors.address}
                        placeholder="Ej. Av. Principal 123"
                    />
                    <SelectField
                        id="vol-edit-country"
                        label="País"
                        value={formData.country}
                        options={COUNTRY_OPTIONS}
                        onChange={(v) => update("country", v)}
                        error={errors.country}
                    />
                    <TextField
                        id="vol-edit-profession"
                        label="Profesión"
                        value={formData.profession}
                        onChange={(v) => update("profession", v)}
                        error={errors.profession}
                        placeholder="Ej. Médico cirujano"
                        maxLength={100}
                    />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <TextField
                        id="vol-edit-languages"
                        label="Idiomas (separados por comas)"
                        value={formData.languages}
                        onChange={(v) => update("languages", v)}
                        error={errors.languages}
                        placeholder="Ej. Español, Lengua de señas venezolana"
                    />
                    <SelectField
                        id="vol-edit-availabilityMode"
                        label="Modalidad de disponibilidad"
                        value={formData.availabilityMode}
                        options={AVAILABILITY_MODE_OPTIONS}
                        onChange={(v) => update("availabilityMode", toAvailabilityMode(v))}
                        error={errors.availabilityMode}
                    />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <SelectField
                        id="vol-edit-hasPriorExperience"
                        label="Experiencia previa en voluntariado"
                        value={formData.hasPriorExperience}
                        options={YES_NO_OPTIONS}
                        onChange={(v) => update("hasPriorExperience", toTriState(v))}
                        error={errors.hasPriorExperience}
                    />
                    <SelectField
                        id="vol-edit-transportAvailable"
                        label="Medio de transporte propio"
                        value={formData.transportAvailable}
                        options={YES_NO_OPTIONS}
                        onChange={(v) => update("transportAvailable", toTriState(v))}
                        error={errors.transportAvailable}
                    />
                </div>
            </fieldset>

            {/* Disponibilidad y habilidades */}
            <fieldset className="space-y-4">
                <legend className="text-sm font-semibold text-primary uppercase tracking-wide mb-2">
                    Disponibilidad y habilidades
                </legend>

                <CheckboxGroup
                    id="vol-edit-skills"
                    legend="Habilidades"
                    options={skillChoices}
                    isChecked={(value) => formData.skills.includes(value)}
                    onToggle={(value) => update("skills", toggleValue(formData.skills, value))}
                    error={errors.skills}
                />

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <TextField
                        id="vol-edit-availableHours"
                        label="Horas disponibles por semana"
                        type="number"
                        min={1}
                        max={168}
                        value={formData.availableHours}
                        onChange={(v) => update("availableHours", v)}
                        error={errors.availableHours}
                        placeholder="Ej. 20"
                    />
                </div>

                <CheckboxGroup
                    id="vol-edit-availableDays"
                    legend="Días disponibles"
                    options={dayChoices}
                    isChecked={(value) => formData.availableDays.includes(value)}
                    onToggle={(value) => update("availableDays", toggleValue(formData.availableDays, value))}
                    error={errors.availableDays}
                />
            </fieldset>

            {/* Áreas de interés */}
            <CheckboxGroup
                id="vol-edit-interestAreaIds"
                legend="Áreas de interés"
                options={interestChoices.map((item) => ({ value: String(item.id), label: item.name }))}
                isChecked={(value) => formData.interestAreaIds.includes(Number(value))}
                onToggle={(value) => update("interestAreaIds", toggleId(formData.interestAreaIds, Number(value)))}
                emptyMessage="No hay áreas de interés en el catálogo."
                error={errors.interestAreaIds}
            />

            {/* Categorías de experiencia */}
            <CheckboxGroup
                id="vol-edit-experienceCategoryIds"
                legend="Categorías de experiencia"
                options={experienceChoices.map((item) => ({ value: String(item.id), label: item.name }))}
                isChecked={(value) => formData.experienceCategoryIds.includes(Number(value))}
                onToggle={(value) => update("experienceCategoryIds", toggleId(formData.experienceCategoryIds, Number(value)))}
                emptyMessage="No hay categorías de experiencia en el catálogo."
                error={errors.experienceCategoryIds}
            />

            <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-3 pt-2 border-t border-outline-variant">
                <Button type="button" variant="outlined" onClick={onCancel} disabled={isSaving}>
                    Cancelar
                </Button>
                <Button type="submit" variant="filled" icon="save" disabled={isSaving}>
                    {isSaving ? "Guardando…" : "Guardar cambios"}
                </Button>
            </div>
        </form>
    );
}
