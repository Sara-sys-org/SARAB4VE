"use client";

import { useEffect, useState } from "react";
import dynamic from "next/dynamic";
import Label from "@/components/ui/Label";
import Button from "@/components/ui/Button";
import PhoneField from "@/components/ui/PhoneField";
import { alertService } from "@/services/alertService";
import { updateOrganizationProfile } from "@/api/user";
import { getCatalog } from "@/api/verification";
import type { CatalogItem, OrganizationProfileResponse } from "@/types/index";
import { COUNTRIES } from "@/lib/countries";
import {
    getEditFieldErrors,
    buildUpdatePayload,
    type EditFieldErrors,
    type LegalRepresentativeFormRow,
    type OrganizationEditFormState,
    type SocialLinkFormRow,
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

function toFormState(perfil: OrganizationProfileResponse): OrganizationEditFormState {
    const { user, organizationProfile, legalRepresentatives, disabilityTypes, services } = perfil;
    return {
        fullName: user.fullName ?? "",
        email: user.email ?? "",
        phone: user.phone ?? "",
        zone: user.zone ?? "",
        location: user.location ?? null,
        organizationName: user.organizationName ?? "",
        organizationTypeId: organizationProfile?.organizationTypeId
            ? String(organizationProfile.organizationTypeId)
            : "",
        taxId: organizationProfile?.taxId ?? "",
        taxIdType: organizationProfile?.taxIdType ?? "",
        otherEntityType: organizationProfile?.otherEntityType ?? "",
        registryNumber: organizationProfile?.registryNumber ?? "",
        foundedAt: organizationProfile?.foundedAt ? organizationProfile.foundedAt.slice(0, 10) : "",
        country: organizationProfile?.country ?? "",
        province: organizationProfile?.province ?? "",
        city: organizationProfile?.city ?? "",
        address: organizationProfile?.address ?? "",
        website: organizationProfile?.website ?? "",
        socialLinks: organizationProfile?.socialLinks
            ? Object.entries(organizationProfile.socialLinks).map(([key, value]) => ({ key, value }))
            : [],
        mission: organizationProfile?.mission ?? "",
        vision: organizationProfile?.vision ?? "",
        scope: organizationProfile?.scope ?? "",
        servedGroups: organizationProfile?.servedGroups ?? "",
        legalRepresentatives: legalRepresentatives.map((rep) => ({
            fullName: rep.fullName ?? "",
            position: rep.position ?? "",
            phone: rep.phone ?? "",
            email: rep.email ?? "",
        })),
        disabilityTypeIds: disabilityTypes.map((item) => item.id),
        serviceIds: services.map((item) => item.id),
    };
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

interface OrganizationEditFormProps {
    perfil: OrganizationProfileResponse;
    onCancel: () => void;
    onSaved: (updated: OrganizationProfileResponse) => void;
}

export default function OrganizationEditForm({ perfil, onCancel, onSaved }: OrganizationEditFormProps) {
    const [formData, setFormData] = useState<OrganizationEditFormState>(() => toFormState(perfil));
    const [errors, setErrors] = useState<EditFieldErrors>({});
    const [isSaving, setIsSaving] = useState(false);
    const [organizationTypes, setOrganizationTypes] = useState<CatalogItem[]>([]);
    const [disabilityOptions, setDisabilityOptions] = useState<CatalogItem[]>([]);
    const [serviceOptions, setServiceOptions] = useState<CatalogItem[]>([]);

    useEffect(() => {
        let active = true;
        async function loadCatalogs() {
            try {
                const [orgTypes, disabilities, svcs] = await Promise.all([
                    getCatalog("organization_type"),
                    getCatalog("disability_type"),
                    getCatalog("service"),
                ]);
                if (!active) return;
                setOrganizationTypes(orgTypes);
                setDisabilityOptions(disabilities);
                setServiceOptions(svcs);
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
    const orgTypeOptions =
        organizationTypes.length > 0
            ? organizationTypes
            : perfil.organizationProfile?.organizationTypeId
                ? [{
                    id: perfil.organizationProfile.organizationTypeId,
                    name: perfil.organizationProfile.organizationTypeName ?? "Tipo actual",
                    type: "organization_type",
                }]
                : [];
    const disabilityChoices = disabilityOptions.length > 0 ? disabilityOptions : perfil.disabilityTypes;
    const serviceChoices = serviceOptions.length > 0 ? serviceOptions : perfil.services;

    const clearError = (key: keyof OrganizationEditFormState) => {
        setErrors((prev) => {
            if (!prev[key]) return prev;
            const next = { ...prev };
            delete next[key];
            return next;
        });
    };

    const update = <K extends keyof OrganizationEditFormState>(key: K, value: OrganizationEditFormState[K]) => {
        setFormData((prev) => ({ ...prev, [key]: value }));
        clearError(key);
    };

    const updateRep = (index: number, key: keyof LegalRepresentativeFormRow, value: string) => {
        setFormData((prev) => ({
            ...prev,
            legalRepresentatives: prev.legalRepresentatives.map((row, i) =>
                i === index ? { ...row, [key]: value } : row,
            ),
        }));
        clearError("legalRepresentatives");
    };

    const addRep = () =>
        setFormData((prev) => ({
            ...prev,
            legalRepresentatives: [...prev.legalRepresentatives, { fullName: "", position: "", phone: "", email: "" }],
        }));

    const removeRep = (index: number) => {
        setFormData((prev) => ({
            ...prev,
            legalRepresentatives: prev.legalRepresentatives.filter((_, i) => i !== index),
        }));
        clearError("legalRepresentatives");
    };

    const updateSocial = (index: number, key: keyof SocialLinkFormRow, value: string) => {
        setFormData((prev) => ({
            ...prev,
            socialLinks: prev.socialLinks.map((row, i) => (i === index ? { ...row, [key]: value } : row)),
        }));
        clearError("socialLinks");
    };

    const addSocial = () =>
        setFormData((prev) => ({ ...prev, socialLinks: [...prev.socialLinks, { key: "", value: "" }] }));

    const removeSocial = (index: number) => {
        setFormData((prev) => ({ ...prev, socialLinks: prev.socialLinks.filter((_, i) => i !== index) }));
        clearError("socialLinks");
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
            const updated = await updateOrganizationProfile(perfil.user.id, buildUpdatePayload(formData));
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
                        id="org-edit-fullName"
                        label="Nombre del representante"
                        value={formData.fullName}
                        onChange={(v) => update("fullName", v)}
                        error={errors.fullName}
                        placeholder="Ej. María Fernández"
                        maxLength={100}
                    />
                    <TextField
                        id="org-edit-email"
                        label="Correo electrónico"
                        type="email"
                        value={formData.email}
                        onChange={(v) => update("email", v)}
                        error={errors.email}
                        placeholder="contacto@organizacion.org"
                    />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                        <Label htmlFor="org-edit-phone" name="Teléfono" />
                        <div id="org-edit-phone" className="mt-2">
                            <PhoneField value={formData.phone} onChange={(phone) => update("phone", phone)} />
                        </div>
                        <FieldError id="org-edit-phone-err" message={errors.phone} />
                    </div>
                    <TextField
                        id="org-edit-zone"
                        label="Zona de cobertura"
                        value={formData.zone}
                        onChange={(v) => update("zone", v)}
                        error={errors.zone}
                        placeholder="Ej. Área metropolitana de Caracas"
                        maxLength={120}
                    />
                </div>

                <div>
                    <Label htmlFor="org-edit-location" name="Ubicación" />
                    <div id="org-edit-location" className="mt-2">
                        <Location value={formData.location} onChange={(loc) => update("location", loc)} />
                    </div>
                    <FieldError id="org-edit-location-err" message={errors.location} />
                </div>
            </fieldset>

            {/* Perfil institucional */}
            <fieldset className="space-y-4">
                <legend className="text-sm font-semibold text-primary uppercase tracking-wide mb-2">
                    Perfil institucional
                </legend>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <TextField
                        id="org-edit-organizationName"
                        label="Nombre de la organización"
                        value={formData.organizationName}
                        onChange={(v) => update("organizationName", v)}
                        error={errors.organizationName}
                        maxLength={150}
                    />
                    <div>
                        <Label htmlFor="org-edit-organizationTypeId" name="Tipo de entidad" />
                        <select
                            id="org-edit-organizationTypeId"
                            className={`${fieldClass} mt-2 ${errors.organizationTypeId ? "border-error" : ""}`}
                            value={formData.organizationTypeId}
                            onChange={(e) => update("organizationTypeId", e.target.value)}
                            aria-invalid={!!errors.organizationTypeId}
                            aria-describedby={errors.organizationTypeId ? "org-edit-organizationTypeId-err" : undefined}
                        >
                            {!formData.organizationTypeId && <option value="">Sin especificar</option>}
                            {orgTypeOptions.map((option) => (
                                <option key={option.id} value={String(option.id)}>{option.name}</option>
                            ))}
                        </select>
                        <FieldError id="org-edit-organizationTypeId-err" message={errors.organizationTypeId} />
                    </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <TextField
                        id="org-edit-taxId"
                        label="ID fiscal (CIF/NIF/RIF)"
                        value={formData.taxId}
                        onChange={(v) => update("taxId", v)}
                        error={errors.taxId}
                        maxLength={30}
                    />
                    <TextField
                        id="org-edit-taxIdType"
                        label="Tipo de ID fiscal"
                        value={formData.taxIdType}
                        onChange={(v) => update("taxIdType", v)}
                        error={errors.taxIdType}
                        maxLength={30}
                    />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <TextField
                        id="org-edit-registryNumber"
                        label="N.º de registro"
                        value={formData.registryNumber}
                        onChange={(v) => update("registryNumber", v)}
                        error={errors.registryNumber}
                        maxLength={50}
                    />
                    <TextField
                        id="org-edit-foundedAt"
                        label="Fecha de constitución"
                        type="date"
                        value={formData.foundedAt}
                        onChange={(v) => update("foundedAt", v)}
                        error={errors.foundedAt}
                    />
                </div>

                <TextField
                    id="org-edit-otherEntityType"
                    label="Especifica el tipo de entidad (si es «Otra»)"
                    value={formData.otherEntityType}
                    onChange={(v) => update("otherEntityType", v)}
                    error={errors.otherEntityType}
                    maxLength={100}
                />

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                    <div>
                        <Label htmlFor="org-edit-country" name="País" />
                        <select
                            id="org-edit-country"
                            className={`${fieldClass} mt-2 ${errors.country ? "border-error" : ""}`}
                            value={formData.country}
                            onChange={(e) => update("country", e.target.value)}
                            aria-invalid={!!errors.country}
                            aria-describedby={errors.country ? "org-edit-country-err" : undefined}
                        >
                            <option value="">Sin especificar</option>
                            {COUNTRIES.map((c) => (
                                <option key={c} value={c}>{c}</option>
                            ))}
                        </select>
                        <FieldError id="org-edit-country-err" message={errors.country} />
                    </div>
                    <TextField
                        id="org-edit-province"
                        label="Provincia"
                        value={formData.province}
                        onChange={(v) => update("province", v)}
                        error={errors.province}
                        maxLength={60}
                    />
                    <TextField
                        id="org-edit-city"
                        label="Ciudad"
                        value={formData.city}
                        onChange={(v) => update("city", v)}
                        error={errors.city}
                        maxLength={60}
                    />
                </div>

                <TextField
                    id="org-edit-address"
                    label="Dirección"
                    value={formData.address}
                    onChange={(v) => update("address", v)}
                    error={errors.address}
                />

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <TextField
                        id="org-edit-website"
                        label="Sitio web"
                        value={formData.website}
                        onChange={(v) => update("website", v)}
                        error={errors.website}
                        placeholder="https://www.organizacion.org"
                        maxLength={200}
                    />
                    <TextField
                        id="org-edit-scope"
                        label="Ámbito de actuación"
                        value={formData.scope}
                        onChange={(v) => update("scope", v)}
                        error={errors.scope}
                        placeholder="Local, Regional, Nacional, Internacional"
                    />
                </div>

                <TextField
                    id="org-edit-mission"
                    label="Misión"
                    textarea
                    value={formData.mission}
                    onChange={(v) => update("mission", v)}
                    error={errors.mission}
                />
                <TextField
                    id="org-edit-vision"
                    label="Visión"
                    textarea
                    value={formData.vision}
                    onChange={(v) => update("vision", v)}
                    error={errors.vision}
                />
                <TextField
                    id="org-edit-servedGroups"
                    label="Colectivos atendidos"
                    textarea
                    rows={2}
                    value={formData.servedGroups}
                    onChange={(v) => update("servedGroups", v)}
                    error={errors.servedGroups}
                />
            </fieldset>

            {/* Redes sociales */}
            <fieldset className="space-y-3">
                <legend className="text-sm font-semibold text-primary uppercase tracking-wide mb-2">
                    Redes sociales
                </legend>

                {formData.socialLinks.length === 0 && (
                    <p className="text-sm text-on-surface-variant">Sin redes sociales registradas.</p>
                )}

                {formData.socialLinks.map((row, index) => (
                    <div key={index} className="flex items-start gap-2">
                        <div className="flex-1">
                            <TextField
                                id={`org-edit-social-${index}-key`}
                                label="Red"
                                value={row.key}
                                onChange={(v) => updateSocial(index, "key", v)}
                                placeholder="Instagram"
                            />
                        </div>
                        <div className="flex-[2]">
                            <TextField
                                id={`org-edit-social-${index}-value`}
                                label="Enlace"
                                value={row.value}
                                onChange={(v) => updateSocial(index, "value", v)}
                                placeholder="https://instagram.com/organizacion"
                            />
                        </div>
                        <button
                            type="button"
                            onClick={() => removeSocial(index)}
                            aria-label={`Eliminar red social ${index + 1}`}
                            className="mt-8 inline-flex items-center justify-center h-9 w-9 rounded-lg text-error hover:bg-error-container transition-colors"
                        >
                            <span className="material-symbols-rounded text-lg" aria-hidden="true">delete</span>
                        </button>
                    </div>
                ))}
                <FieldError id="org-edit-socialLinks-err" message={errors.socialLinks} />
                <Button type="button" variant="text" size="sm" icon="add" onClick={addSocial}>
                    Añadir red social
                </Button>
            </fieldset>

            {/* Representantes legales */}
            <fieldset className="space-y-3">
                <legend className="text-sm font-semibold text-primary uppercase tracking-wide mb-2">
                    Representantes legales
                </legend>

                {formData.legalRepresentatives.length === 0 && (
                    <p className="text-sm text-on-surface-variant">No hay representantes registrados.</p>
                )}

                {formData.legalRepresentatives.map((rep, index) => (
                    <div key={index} className="rounded-xl border border-outline-variant bg-background p-4 space-y-3">
                        <div className="flex items-center justify-between">
                            <span className="text-sm font-semibold text-on-surface">Representante {index + 1}</span>
                            <button
                                type="button"
                                onClick={() => removeRep(index)}
                                aria-label={`Eliminar representante ${index + 1}`}
                                className="inline-flex items-center justify-center h-9 w-9 rounded-lg text-error hover:bg-error-container transition-colors"
                            >
                                <span className="material-symbols-rounded text-lg" aria-hidden="true">delete</span>
                            </button>
                        </div>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                            <TextField
                                id={`org-edit-rep-${index}-fullName`}
                                label="Nombre"
                                value={rep.fullName}
                                onChange={(v) => updateRep(index, "fullName", v)}
                                placeholder="Ej. María Fernández"
                            />
                            <TextField
                                id={`org-edit-rep-${index}-position`}
                                label="Cargo"
                                value={rep.position}
                                onChange={(v) => updateRep(index, "position", v)}
                                placeholder="Ej. Directora Ejecutiva"
                            />
                            <TextField
                                id={`org-edit-rep-${index}-phone`}
                                label="Teléfono"
                                type="tel"
                                value={rep.phone}
                                onChange={(v) => updateRep(index, "phone", v)}
                                placeholder="+584141234567"
                            />
                            <TextField
                                id={`org-edit-rep-${index}-email`}
                                label="Correo"
                                type="email"
                                value={rep.email}
                                onChange={(v) => updateRep(index, "email", v)}
                                placeholder="representante@organizacion.org"
                            />
                        </div>
                    </div>
                ))}
                <FieldError id="org-edit-legalRepresentatives-err" message={errors.legalRepresentatives} />
                <Button type="button" variant="text" size="sm" icon="add" onClick={addRep}>
                    Añadir representante
                </Button>
            </fieldset>

            {/* Discapacidades atendidas */}
            <fieldset>
                <legend className="text-sm font-semibold text-primary uppercase tracking-wide mb-2">
                    Discapacidades atendidas
                </legend>
                <div
                    role="group"
                    aria-label="Discapacidades atendidas"
                    className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2"
                >
                    {disabilityChoices.map((item) => {
                        const checked = formData.disabilityTypeIds.includes(item.id);
                        return (
                            <label
                                key={item.id}
                                className={[
                                    "flex items-center gap-2 rounded-xl border bg-background px-3 py-2.5 text-sm cursor-pointer transition-colors",
                                    checked ? "border-primary bg-primary-fixed" : "border-outline-variant hover:border-primary/60",
                                ].join(" ")}
                            >
                                <input
                                    type="checkbox"
                                    checked={checked}
                                    onChange={() => update("disabilityTypeIds", toggleId(formData.disabilityTypeIds, item.id))}
                                    className="accent-primary shrink-0"
                                />
                                <span className="leading-tight">{item.name}</span>
                            </label>
                        );
                    })}
                </div>
                <FieldError id="org-edit-disabilityTypeIds-err" message={errors.disabilityTypeIds} />
            </fieldset>

            {/* Servicios ofrecidos */}
            <fieldset>
                <legend className="text-sm font-semibold text-primary uppercase tracking-wide mb-2">
                    Servicios ofrecidos
                </legend>
                <div
                    role="group"
                    aria-label="Servicios ofrecidos"
                    className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2"
                >
                    {serviceChoices.map((item) => {
                        const checked = formData.serviceIds.includes(item.id);
                        return (
                            <label
                                key={item.id}
                                className={[
                                    "flex items-center gap-2 rounded-xl border bg-background px-3 py-2.5 text-sm cursor-pointer transition-colors",
                                    checked ? "border-primary bg-primary-fixed" : "border-outline-variant hover:border-primary/60",
                                ].join(" ")}
                            >
                                <input
                                    type="checkbox"
                                    checked={checked}
                                    onChange={() => update("serviceIds", toggleId(formData.serviceIds, item.id))}
                                    className="accent-primary shrink-0"
                                />
                                <span className="leading-tight">{item.name}</span>
                            </label>
                        );
                    })}
                </div>
                <FieldError id="org-edit-serviceIds-err" message={errors.serviceIds} />
            </fieldset>

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
