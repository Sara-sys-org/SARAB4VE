"use client";

import Label from "@/components/ui/Label";
import Button from "@/components/ui/Button";
import { useId, useState } from 'react';
import { iOrganizationForm } from "@/types/index";
import {
    COUNTRIES_FISCAL_ID,
    ENTITY_TYPES,
    SCOPE_OPTIONS,
    DISABILITY_TYPES,
    REQUIRED_DOCUMENTS,
    PARTICIPATION_REFERENCE_DOCS,
} from "./constants";
import { sendOrganization } from "@/api/organization";
import { organizationSchema, getFieldErrors, type OrganizationFormData } from "./schema";
import { alertService } from "@/services/alertService";
import dynamic from "next/dynamic";
import PhoneField from "@/components/ui/PhoneField";
import { buildOrganizationRegisterPayload, DOCUMENT_TYPE_CODES } from "./mapper";
import { getDocumentChecklist, uploadVerificationDocument } from "@/api/verification";


const Location = dynamic(() => import("@/components/ui/Location"), {
    ssr: false,
    loading: () => <div className="h-[300px] md:h-[360px] rounded-xl bg-surface-container animate-pulse" />,
});

const InitOrganizationForm: iOrganizationForm = {
    fullName: "",
    email: "",
    phone: "",
    password: "",
    location: null,
    zone: "",
    organizationName: "",
    legalDocument: "",
    workArea: [],
    acceptedTerms: false,

    countryFiscal: "",
    fiscalIdType: "",
    fiscalNumber: "",
    entityType: "",
    otherEntityType: "",
    registrationNumber: 0,
    constitutionDate: "",
    legalAddress: "",
    legalCountry: "",
    province: "",
    city: "",
    legalRepresentativeName: "",
    legalRepresentativePosition: "",
    legalRepresentativePhone: "",
    legalRepresentativeEmail: "",
    website: "",
    socialMedia: "",
    mission: "",
    vision: "",
    scope: "",
    collectiveServed: "",
    disabilityTypes: [],
    services: "",
    documents: {
        cif: "",
        estatutos: "",
        inscripcion: "",
        id_representante: "",
        certificado_fiscal: "",
        seguro_responsabilidad: "",
        politica_proteccion_datos: "",
        codigo_etico: "",
        politica_accesibilidad: "",
    },
}



const fieldClass =
    "w-full rounded-xl border border-outline-variant bg-background px-4 py-3 " +
    "focus-visible:outline-2 focus-visible:outline-primary focus-visible:outline-offset-1 " +
    "focus:border-primary transition-colors";

const errorClass = "text-error text-sm mt-1";

// Genera una contraseña temporal para cuentas creadas sin el campo de
// credenciales visible en la UI (ver handleSubmit).
function generateTempPassword(): string {
    const bytes = new Uint8Array(12);
    if (typeof window !== "undefined" && window.crypto) {
        window.crypto.getRandomValues(bytes);
    } else {
        for (let i = 0; i < bytes.length; i++) bytes[i] = Math.floor(Math.random() * 256);
    }
    return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

export default function OrganizationRegister() {

    const [formData, setFormData] = useState<iOrganizationForm>(InitOrganizationForm);
    const [errors, setErrors] = useState<Partial<Record<keyof OrganizationFormData, string>>>({});
    const [documentFiles, setDocumentFiles] = useState<Record<string, File | null>>(
        Object.fromEntries(REQUIRED_DOCUMENTS.map((doc) => [doc.id, null]))
    );
    const [documentErrors, setDocumentErrors] = useState<Record<string, string>>({});

    const handleDocumentChange = (docId: string, file: File | null) => {
        setDocumentFiles((prev) => ({ ...prev, [docId]: file }));
    };

    const ids = {
        fullName: useId(),
        email: useId(),
        phone: useId(),
        password: useId(),
        organizationName: useId(),
        legalDocument: useId(),
        location: useId(),
        zone: useId(),
        workArea: useId(),

        countryFiscal: useId(),
        fiscalIdType: useId(),
        fiscalNumber: useId(),
        entityType: useId(),
        otherEntityType: useId(),
        registrationNumber: useId(),
        constitutionDate: useId(),
        legalAddress: useId(),
        legalCountry: useId(),
        province: useId(),
        city: useId(),
        legalRepresentativeName: useId(),
        legalRepresentativePosition: useId(),
        legalRepresentativePhone: useId(),
        legalRepresentativeEmail: useId(),
        website: useId(),
        socialMedia: useId(),
        mission: useId(),
        vision: useId(),
        scope: useId(),
        collectiveServed: useId(),
        disabilityTypes: useId(),
        services: useId(),
    } as const;

    

    function toggleArray<T>(array: T[], value: T): T[] {
        return array.includes(value)
            ? array.filter((v) => v !== value)
            : [...array, value];
    }

    const toggleDisabilityType = (type: string) => {
        setFormData(prev => ({
            ...prev,
            disabilityTypes: toggleArray(prev.disabilityTypes, type),
        }));
    };


    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();

        // fullName/email/phone se toman del representante legal
        // password ahora es visible en el formulario (o se autogenera si está vacío)
        const dataToValidate = {
            ...formData,
            fullName: formData.legalRepresentativeName,
            email: formData.legalRepresentativeEmail,
            phone: formData.legalRepresentativePhone,
            password: formData.password || generateTempPassword(),
            acceptedTerms: true as const,
        };

        const result = organizationSchema.safeParse(dataToValidate);

        if (!result.success) {
            const fieldErrors = getFieldErrors(dataToValidate);
            setErrors(fieldErrors);
            const firstError = result.error.issues[0]?.message ?? "Revisa los campos marcados en rojo.";
            alertService.warning(firstError);
            return;
        }

        setErrors({});
        const missingDocs: Record<string, string> = {};
        REQUIRED_DOCUMENTS.forEach((doc) => {
            if (doc.required && !documentFiles[doc.id]) {
                missingDocs[doc.id] = "Este documento es obligatorio";
            }
        });

        if (Object.keys(missingDocs).length > 0) {
            setDocumentErrors(missingDocs);
            alertService.warning("Adjunta todos los documentos obligatorios.");
            return;
        }

        setDocumentErrors({});

        try {
            // Paso 1: Registrar la organización con todos los campos (básicos + extendidos)
            // El endpoint POST /api/auth/register/organization ya crea:
            // - users + user_details + organization_profiles + legal_representatives
            // - organization_disability_types + organization_services + verification_requests
            const fullPayload = buildOrganizationRegisterPayload(formData);
            const registerResponse = await sendOrganization(fullPayload);

            if (!registerResponse?.token) {
                throw new Error("No se recibió el token de autenticación");
            }

            // Paso 2: Subir todos los documentos de verificación, emparejando por
            // "code" contra el checklist real que el backend generó para esta
            // organización (evita hardcodear IDs de document_types en el frontend
            // — esos IDs son autoincrementales y pueden no coincidir entre
            // entornos, lo que subía cada documento bajo el tipo equivocado).
            const checklist = await getDocumentChecklist(registerResponse.user.id, registerResponse.token);

            const uploadPromises = REQUIRED_DOCUMENTS.map(async (doc) => {
                const file = documentFiles[doc.id];
                if (!file) return null;

                const code = DOCUMENT_TYPE_CODES[doc.id];
                const match = checklist.find((item) => item.documentType.code === code);
                if (!match) {
                    console.warn(`No se encontró un document_type para "${doc.id}" (code "${code}") en el checklist del backend`);
                    return null;
                }

                try {
                    return await uploadVerificationDocument(
                        file,
                        match.documentType.id,
                        registerResponse.token
                    );
                } catch (err) {
                    console.error(`Error subiendo documento ${doc.name}:`, err);
                    throw new Error(`No se pudo subir el documento: ${doc.name}`);
                }
            });

            await Promise.all(uploadPromises);

            alertService.success("Tu solicitud fue enviada. Te contactaremos pronto.");
            setFormData(InitOrganizationForm);
            // Resetear archivos de documentos
            setDocumentFiles(Object.fromEntries(REQUIRED_DOCUMENTS.map((doc) => [doc.id, null])));

        } catch (error) {
            const message = error instanceof Error ? error.message : "No se pudo enviar tu solicitud.";
            alertService.error(message);
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
                        Registro de Organización / ONG
                    </h1>
                    <p className="text-on-surface-variant mt-2 text-base">
                        Formulario inicial para unirte a la red SARA como organización.
                    </p>
                </header>

                <div className="mb-8 rounded-2xl border border-outline-variant bg-surface-container-low p-5 sm:p-6">
                    <p className="text-sm text-on-surface">
                        Antes de completar este formulario, te pedimos revisar cuidadosamente los
                        siguientes documentos para entender qué implica tu participación como
                        organización dentro de la plataforma SARA. Al final del formulario deberás
                        adjuntar el <strong>Acuerdo de Participación firmado</strong>, con el cual
                        confirmas haber leído y aceptado todos los documentos aquí listados.
                    </p>
                    <ul className="mt-4 space-y-2">
                        {PARTICIPATION_REFERENCE_DOCS.map((doc) => (
                            <li key={doc.href}>
                                <a
                                    href={doc.href}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="inline-flex items-center gap-2 text-sm font-medium text-primary underline hover:opacity-80"
                                >
                                    <span className="material-symbols-rounded text-base" aria-hidden="true">description</span>
                                    {doc.name}
                                </a>
                            </li>
                        ))}
                    </ul>
                </div>

                <form
                    onSubmit={handleSubmit}
                    noValidate
                    className="rounded-2xl border border-outline-variant bg-surface-container-low p-5 sm:p-6 lg:p-8 space-y-8"
                >
                    {/* DATOS DE LA ORGANIZACIÓN */}
                    <fieldset className="space-y-4">
                        <legend className="text-sm font-semibold text-primary uppercase tracking-wide mb-2">
                            Datos de la organización
                        </legend>

                        <div>
                            <Label htmlFor={ids.organizationName} name="Nombre de la organización" required />
                            <input
                                id={ids.organizationName}
                                className={`${fieldClass} mt-2 ${errors.organizationName ? "border-error" : ""}`}
                                placeholder="Ej. Fundación Esperanza Activa"
                                value={formData.organizationName}
                                onChange={(e) => setFormData({ ...formData, organizationName: e.target.value })}
                                aria-invalid={!!errors.organizationName}
                                aria-describedby={errors.organizationName ? `${ids.organizationName}-err` : undefined}
                            />
                            {errors.organizationName && (
                                <p id={`${ids.organizationName}-err`} className={errorClass}>{errors.organizationName}</p>
                            )}
                        </div>

                        <div>
                            <Label htmlFor={ids.fiscalIdType} name="Tipo de identificador fiscal" required />
                            <select
                                id={ids.fiscalIdType}
                                className={`${fieldClass} mt-2 ${errors.fiscalIdType ? "border-error" : ""}`}
                                value={formData.countryFiscal ? `${formData.countryFiscal}|${formData.fiscalIdType}` : ""}
                                onChange={(e) => {
                                    const [countryFiscal, fiscalIdType] = e.target.value.split("|");
                                    setFormData({ ...formData, countryFiscal, fiscalIdType });
                                }}
                                aria-invalid={!!errors.fiscalIdType}
                                aria-describedby={errors.fiscalIdType ? `${ids.fiscalIdType}-err` : undefined}
                            >
                                <option value="">Selecciona un tipo de identificador fiscal</option>
                                {COUNTRIES_FISCAL_ID.map((c) => (
                                    <option key={c.code} value={`${c.name}|${c.fiscalId}`}>
                                        {c.fiscalId} ({c.name})
                                    </option>
                                ))}
                                <option value="Otro|Documento de identidad">Otro (DNI / Cédula / documento de identidad)</option>
                            </select>
                            {errors.fiscalIdType && (
                                <p id={`${ids.fiscalIdType}-err`} className={errorClass}>{errors.fiscalIdType}</p>
                            )}
                        </div>

                        <div>
                            <Label
                                htmlFor={ids.fiscalNumber}
                                name={formData.countryFiscal === "Otro" ? "Número de documento de identidad" : "Número de identificación fiscal"}
                                required
                            />
                            <input
                                id={ids.fiscalNumber}
                                className={`${fieldClass} mt-2 ${errors.fiscalNumber ? "border-error" : ""}`}
                                placeholder={formData.countryFiscal === "Otro" ? "Ej. 12345678" : "Ej. J-12345678-9"}
                                value={formData.fiscalNumber}
                                onChange={(e) => setFormData({ ...formData, fiscalNumber: e.target.value })}
                                aria-invalid={!!errors.fiscalNumber}
                                aria-describedby={errors.fiscalNumber ? `${ids.fiscalNumber}-err` : undefined}
                            />
                            {errors.fiscalNumber && (
                                <p id={`${ids.fiscalNumber}-err`} className={errorClass}>{errors.fiscalNumber}</p>
                            )}
                        </div>

                        <div>
                            <Label htmlFor={ids.entityType} name="Tipo de entidad" required />
                            <select
                                id={ids.entityType}
                                className={`${fieldClass} mt-2 ${errors.entityType ? "border-error" : ""}`}
                                value={formData.entityType}
                                onChange={(e) => setFormData({ ...formData, entityType: e.target.value, otherEntityType: e.target.value === "Otra (cual)" ? formData.otherEntityType : "" })}
                                aria-invalid={!!errors.entityType}
                                aria-describedby={errors.entityType ? `${ids.entityType}-err` : undefined}
                            >
                                <option value="">Selecciona un tipo de entidad</option>
                                {ENTITY_TYPES.map((type) => (
                                    <option key={type} value={type}>{type}</option>
                                ))}
                            </select>
                            {errors.entityType && (
                                <p id={`${ids.entityType}-err`} className={errorClass}>{errors.entityType}</p>
                            )}
                        </div>

                        {formData.entityType === "Otra (cual)" && (
                            <div>
                                <Label htmlFor={ids.otherEntityType} name="Especifica el tipo de entidad" />
                                <input
                                    id={ids.otherEntityType}
                                    className={`${fieldClass} mt-2`}
                                    placeholder="Ej. Cooperativa"
                                    value={formData.otherEntityType}
                                    onChange={(e) => setFormData({ ...formData, otherEntityType: e.target.value })}
                                />
                            </div>
                        )}

                    </fieldset>
                    {/* DATOS LEGALES */}
                    <fieldset className="space-y-4">
                        <legend className="text-sm font-semibold text-primary uppercase tracking-wide mb-2">
                            Datos legales
                        </legend>

                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                            <div>
                                <Label htmlFor={ids.registrationNumber} name="Número de registro" required />
                                <input
                                    id={ids.registrationNumber}
                                    type="number"
                                    className={`${fieldClass} mt-2 ${errors.registrationNumber ? "border-error" : ""}`}
                                    placeholder="Ej. 123456"
                                    value={formData.registrationNumber || ""}
                                    onChange={(e) => setFormData({ ...formData, registrationNumber: Number(e.target.value) })}
                                    aria-invalid={!!errors.registrationNumber}
                                    aria-describedby={errors.registrationNumber ? `${ids.registrationNumber}-err` : undefined}
                                />
                                {errors.registrationNumber && (
                                    <p id={`${ids.registrationNumber}-err`} className={errorClass}>{errors.registrationNumber}</p>
                                )}
                            </div>

                            <div>
                                <Label htmlFor={ids.constitutionDate} name="Fecha de constitución" required />
                                <input
                                    id={ids.constitutionDate}
                                    type="date"
                                    className={`${fieldClass} mt-2 ${errors.constitutionDate ? "border-error" : ""}`}
                                    value={formData.constitutionDate}
                                    onChange={(e) => setFormData({ ...formData, constitutionDate: e.target.value })}
                                    aria-invalid={!!errors.constitutionDate}
                                    aria-describedby={errors.constitutionDate ? `${ids.constitutionDate}-err` : undefined}
                                />
                                {errors.constitutionDate && (
                                    <p id={`${ids.constitutionDate}-err`} className={errorClass}>{errors.constitutionDate}</p>
                                )}
                            </div>
                        </div>

                        <div>
                            <Label htmlFor={ids.legalAddress} name="Dirección" required />
                            <input
                                id={ids.legalAddress}
                                className={`${fieldClass} mt-2 ${errors.legalAddress ? "border-error" : ""}`}
                                placeholder="Ej. Av. Principal, Edificio X, Piso 2"
                                value={formData.legalAddress}
                                onChange={(e) => setFormData({ ...formData, legalAddress: e.target.value })}
                                aria-invalid={!!errors.legalAddress}
                                aria-describedby={errors.legalAddress ? `${ids.legalAddress}-err` : undefined}
                            />
                            {errors.legalAddress && (
                                <p id={`${ids.legalAddress}-err`} className={errorClass}>{errors.legalAddress}</p>
                            )}
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                            <div>
                                <Label htmlFor={ids.legalCountry} name="País" required />
                                <select
                                    id={ids.legalCountry}
                                    className={`${fieldClass} mt-2 ${errors.legalCountry ? "border-error" : ""}`}
                                    value={formData.legalCountry}
                                    onChange={(e) => setFormData({ ...formData, legalCountry: e.target.value })}
                                    aria-invalid={!!errors.legalCountry}
                                    aria-describedby={errors.legalCountry ? `${ids.legalCountry}-err` : undefined}
                                >
                                    <option value="">Selecciona un país</option>
                                    {COUNTRIES_FISCAL_ID.map((c) => (
                                        <option key={c.code} value={c.name}>{c.name}</option>
                                    ))}
                                </select>
                                {errors.legalCountry && (
                                    <p id={`${ids.legalCountry}-err`} className={errorClass}>{errors.legalCountry}</p>
                                )}
                            </div>

                            <div>
                                <Label htmlFor={ids.province} name="Provincia" required />
                                <input
                                    id={ids.province}
                                    className={`${fieldClass} mt-2 ${errors.province ? "border-error" : ""}`}
                                    placeholder="Ej. Miranda"
                                    value={formData.province}
                                    onChange={(e) => setFormData({ ...formData, province: e.target.value })}
                                    aria-invalid={!!errors.province}
                                    aria-describedby={errors.province ? `${ids.province}-err` : undefined}
                                />
                                {errors.province && (
                                    <p id={`${ids.province}-err`} className={errorClass}>{errors.province}</p>
                                )}
                            </div>

                            <div>
                                <Label htmlFor={ids.city} name="Ciudad" required />
                                <input
                                    id={ids.city}
                                    className={`${fieldClass} mt-2 ${errors.city ? "border-error" : ""}`}
                                    placeholder="Ej. Caracas"
                                    value={formData.city}
                                    onChange={(e) => setFormData({ ...formData, city: e.target.value })}
                                    aria-invalid={!!errors.city}
                                    aria-describedby={errors.city ? `${ids.city}-err` : undefined}
                                />
                                {errors.city && (
                                    <p id={`${ids.city}-err`} className={errorClass}>{errors.city}</p>
                                )}
                            </div>
                        </div>
                    </fieldset>

                    {/* REPRESENTANTE LEGAL (PERSONA ENCARGADA) */}
                    <fieldset className="space-y-4">
                        <legend className="text-sm font-semibold text-primary uppercase tracking-wide mb-2">
                            Representante legal (persona encargada)
                        </legend>

                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                            <div>
                                <Label htmlFor={ids.legalRepresentativeName} name="Nombre" required />
                                <input
                                    id={ids.legalRepresentativeName}
                                    className={`${fieldClass} mt-2 ${errors.legalRepresentativeName ? "border-error" : ""}`}
                                    placeholder="Ej. María Fernández"
                                    value={formData.legalRepresentativeName}
                                    onChange={(e) => setFormData({ ...formData, legalRepresentativeName: e.target.value })}
                                    aria-invalid={!!errors.legalRepresentativeName}
                                    aria-describedby={errors.legalRepresentativeName ? `${ids.legalRepresentativeName}-err` : undefined}
                                />
                                {errors.legalRepresentativeName && (
                                    <p id={`${ids.legalRepresentativeName}-err`} className={errorClass}>{errors.legalRepresentativeName}</p>
                                )}
                            </div>

                            <div>
                                <Label htmlFor={ids.legalRepresentativePosition} name="Cargo" required />
                                <input
                                    id={ids.legalRepresentativePosition}
                                    className={`${fieldClass} mt-2 ${errors.legalRepresentativePosition ? "border-error" : ""}`}
                                    placeholder="Ej. Directora Ejecutiva"
                                    value={formData.legalRepresentativePosition}
                                    onChange={(e) => setFormData({ ...formData, legalRepresentativePosition: e.target.value })}
                                    aria-invalid={!!errors.legalRepresentativePosition}
                                    aria-describedby={errors.legalRepresentativePosition ? `${ids.legalRepresentativePosition}-err` : undefined}
                                />
                                {errors.legalRepresentativePosition && (
                                    <p id={`${ids.legalRepresentativePosition}-err`} className={errorClass}>{errors.legalRepresentativePosition}</p>
                                )}
                            </div>
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                            <div>
                                <Label htmlFor={ids.legalRepresentativePhone} name="Teléfono" required />
                                <div id={ids.legalRepresentativePhone} className="mt-2">
                                    <PhoneField
                                        value={formData.legalRepresentativePhone}
                                        onChange={(phone) => setFormData({ ...formData, legalRepresentativePhone: phone })}
                                    />
                                </div>
                                {errors.legalRepresentativePhone && (
                                    <p className={errorClass}>{errors.legalRepresentativePhone}</p>
                                )}
                            </div>

                            <div>
                                <Label htmlFor={ids.legalRepresentativeEmail} name="Email" required />
                                <input
                                    id={ids.legalRepresentativeEmail}
                                    type="email"
                                    className={`${fieldClass} mt-2 ${errors.legalRepresentativeEmail ? "border-error" : ""}`}
                                    placeholder="representante@organizacion.org"
                                    value={formData.legalRepresentativeEmail}
                                    onChange={(e) => setFormData({ ...formData, legalRepresentativeEmail: e.target.value })}
                                    aria-invalid={!!errors.legalRepresentativeEmail}
                                    aria-describedby={errors.legalRepresentativeEmail ? `${ids.legalRepresentativeEmail}-err` : undefined}
                                />
                                {errors.legalRepresentativeEmail && (
                                    <p id={`${ids.legalRepresentativeEmail}-err`} className={errorClass}>{errors.legalRepresentativeEmail}</p>
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
                    </fieldset>

                    {/* COBERTURA */}
                    <fieldset className="space-y-4">
                        <legend className="text-sm font-semibold text-primary uppercase tracking-wide mb-2">
                            Cobertura
                        </legend>

                        <div>
                            <Label htmlFor={ids.zone} name="Zona / distrito de cobertura" required />
                            <input
                                id={ids.zone}
                                className={`${fieldClass} mt-2 ${errors.zone ? "border-error" : ""}`}
                                placeholder="Ej. Área metropolitana de Caracas"
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
                        <Label htmlFor={ids.location} name="Marca en el mapa la zona / cobertura geográfica" required />
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

                    {/* INFORMACIÓN INSTITUCIONAL */}
                    <fieldset className="space-y-4">
                        <legend className="text-sm font-semibold text-primary uppercase tracking-wide mb-2">
                            Información institucional
                        </legend>

                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                            <div>
                                <Label htmlFor={ids.website} name="Página web" />
                                <input
                                    id={ids.website}
                                    className={`${fieldClass} mt-2 ${errors.website ? "border-error" : ""}`}
                                    placeholder="https://www.organizacion.org"
                                    value={formData.website}
                                    onChange={(e) => setFormData({ ...formData, website: e.target.value })}
                                    aria-invalid={!!errors.website}
                                    aria-describedby={errors.website ? `${ids.website}-err` : undefined}
                                />
                                {errors.website && (
                                    <p id={`${ids.website}-err`} className={errorClass}>{errors.website}</p>
                                )}
                            </div>

                            <div>
                                <Label htmlFor={ids.socialMedia} name="Redes sociales" />
                                <input
                                    id={ids.socialMedia}
                                    className={`${fieldClass} mt-2 ${errors.socialMedia ? "border-error" : ""}`}
                                    placeholder="Ej. @organizacion (Instagram, Facebook, X)"
                                    value={formData.socialMedia}
                                    onChange={(e) => setFormData({ ...formData, socialMedia: e.target.value })}
                                    aria-invalid={!!errors.socialMedia}
                                    aria-describedby={errors.socialMedia ? `${ids.socialMedia}-err` : undefined}
                                />
                                {errors.socialMedia && (
                                    <p id={`${ids.socialMedia}-err`} className={errorClass}>{errors.socialMedia}</p>
                                )}
                            </div>
                        </div>

                        <div>
                            <Label htmlFor={ids.mission} name="Misión" required />
                            <textarea
                                id={ids.mission}
                                rows={3}
                                className={`${fieldClass} mt-2 ${errors.mission ? "border-error" : ""}`}
                                placeholder="Describe la misión de la organización"
                                value={formData.mission}
                                onChange={(e) => setFormData({ ...formData, mission: e.target.value })}
                                aria-invalid={!!errors.mission}
                                aria-describedby={errors.mission ? `${ids.mission}-err` : undefined}
                            />
                            {errors.mission && (
                                <p id={`${ids.mission}-err`} className={errorClass}>{errors.mission}</p>
                            )}
                        </div>

                        <div>
                            <Label htmlFor={ids.vision} name="Visión" required />
                            <textarea
                                id={ids.vision}
                                rows={3}
                                className={`${fieldClass} mt-2 ${errors.vision ? "border-error" : ""}`}
                                placeholder="Describe la visión de la organización"
                                value={formData.vision}
                                onChange={(e) => setFormData({ ...formData, vision: e.target.value })}
                                aria-invalid={!!errors.vision}
                                aria-describedby={errors.vision ? `${ids.vision}-err` : undefined}
                            />
                            {errors.vision && (
                                <p id={`${ids.vision}-err`} className={errorClass}>{errors.vision}</p>
                            )}
                        </div>

                        <div>
                            <Label htmlFor={ids.scope} name="Ámbito de actuación" required />
                            <select
                                id={ids.scope}
                                className={`${fieldClass} mt-2 ${errors.scope ? "border-error" : ""}`}
                                value={formData.scope}
                                onChange={(e) => setFormData({ ...formData, scope: e.target.value })}
                                aria-invalid={!!errors.scope}
                                aria-describedby={errors.scope ? `${ids.scope}-err` : undefined}
                            >
                                <option value="">Selecciona un ámbito de actuación</option>
                                {SCOPE_OPTIONS.map((option) => (
                                    <option key={option} value={option}>{option}</option>
                                ))}
                            </select>
                            {errors.scope && (
                                <p id={`${ids.scope}-err`} className={errorClass}>{errors.scope}</p>
                            )}
                        </div>

                        <div>
                            <Label htmlFor={ids.collectiveServed} name="Colectivos atendidos" required />
                            <textarea
                                id={ids.collectiveServed}
                                rows={2}
                                className={`${fieldClass} mt-2 ${errors.collectiveServed ? "border-error" : ""}`}
                                placeholder="Ej. Personas con discapacidad visual, adultos mayores..."
                                value={formData.collectiveServed}
                                onChange={(e) => setFormData({ ...formData, collectiveServed: e.target.value })}
                                aria-invalid={!!errors.collectiveServed}
                                aria-describedby={errors.collectiveServed ? `${ids.collectiveServed}-err` : undefined}
                            />
                            {errors.collectiveServed && (
                                <p id={`${ids.collectiveServed}-err`} className={errorClass}>{errors.collectiveServed}</p>
                            )}
                        </div>
                    </fieldset>
                    {/* TIPOS DE DISCAPACIDAD */}
                    <fieldset>
                        <legend className="text-sm font-semibold text-primary uppercase tracking-wide mb-2">
                            Tipos de discapacidad con las que trabaja
                        </legend>
                        <Label htmlFor={ids.disabilityTypes} name="Selecciona todas las que apliquen" required />
                        <div
                            id={ids.disabilityTypes}
                            role="group"
                            aria-labelledby={ids.disabilityTypes}
                            className="mt-2 grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2"
                        >
                            {DISABILITY_TYPES.map((type) => {
                                const checked = formData.disabilityTypes.includes(type);
                                return (
                                    <label
                                        key={type}
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
                                            onChange={() => toggleDisabilityType(type)}
                                            className="accent-primary shrink-0"
                                        />
                                        <span className="leading-tight">{type}</span>
                                    </label>
                                );
                            })}
                        </div>
                        {errors.disabilityTypes && (
                            <p className={errorClass}>{errors.disabilityTypes}</p>
                        )}
                    </fieldset>
                    {/* SERVICIOS OFRECIDOS */}
                    <fieldset>
                        <legend className="text-sm font-semibold text-primary uppercase tracking-wide mb-2">
                            Servicios ofrecidos
                        </legend>
                        <Label htmlFor={ids.services} name="Describe los servicios que ofrece la organización" required />
                        <textarea
                            id={ids.services}
                            rows={4}
                            className={`${fieldClass} mt-2 ${errors.services ? "border-error" : ""}`}
                            placeholder="Ej. Transporte adaptado, terapias de rehabilitación, apoyo psicosocial, entrega de ayudas técnicas..."
                            value={formData.services}
                            onChange={(e) => setFormData({ ...formData, services: e.target.value })}
                            aria-invalid={!!errors.services}
                            aria-describedby={errors.services ? `${ids.services}-err` : undefined}
                        />
                        {errors.services && (
                            <p id={`${ids.services}-err`} className={errorClass}>{errors.services}</p>
                        )}
                    </fieldset>
                    {/* DOCUMENTACIÓN REQUERIDA */}
                    <fieldset className="space-y-3">
                        <legend className="text-sm font-semibold text-primary uppercase tracking-wide mb-2">
                            Documentación requerida (adjuntar)
                        </legend>

                        {REQUIRED_DOCUMENTS.map((doc) => {
                            const fileId = `doc-${doc.id}`;
                            const selectedFile = documentFiles[doc.id];
                            return (
                                <div
                                    key={doc.id}
                                    className="rounded-xl border border-outline-variant bg-background px-4 py-3"
                                >
                                    <div className="flex items-center justify-between gap-2 flex-wrap">
                                        <Label htmlFor={fileId} name={`${doc.name}${doc.required ? " *" : ""}`} />
                                        {'templateHref' in doc && doc.templateHref && (
                                            <a
                                                href={doc.templateHref}
                                                download
                                                className="text-xs font-semibold text-primary underline hover:opacity-80"
                                            >
                                                Descargar plantilla
                                            </a>
                                        )}
                                    </div>
                                    <input
                                        id={fileId}
                                        type="file"
                                        accept=".pdf,.jpg,.jpeg,.png,.doc,.docx"
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

                    <div className="pt-2 flex justify-end">
                        <Button type="submit" variant="filled" size="lg" icon="send">
                            Enviar solicitud
                        </Button>
                    </div>
                </form>
            </div>
        </section>
    );
}
