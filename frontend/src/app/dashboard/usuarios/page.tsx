"use client";

import Link from "next/link";
import { useUsuariosList, type TipoFiltro } from "@/hooks/useUsuariosList";
import UserListControls from "@/components/layout/dashboard/UserListControls";
import Pagination from "@/components/layout/dashboard/Pagination";
import StatusBadge from "@/components/layout/dashboard/StatusBadge";
import type { ApiUser, ROLES_USER } from "@/types/index";

/** `fullName` de una organización es el representante legal; el nombre real va en organizationName. */
const ORG_NAME_FALLBACK = "Organización sin nombre registrado";

const TIPO_FILTERS: { value: TipoFiltro; label: string }[] = [
  { value: "all", label: "Todos" },
  { value: "organization", label: "Organizaciones" },
  { value: "volunteer", label: "Voluntarios" },
  { value: "citizen", label: "Solicitantes" },
];

const TIPO_LABELS: Record<Exclude<ROLES_USER, "admin">, string> = {
  organization: "Organización",
  volunteer: "Voluntario",
  citizen: "Solicitante",
};

const TIPO_CLASSES: Record<Exclude<ROLES_USER, "admin">, string> = {
  organization: "bg-secondary-fixed text-secondary",
  volunteer: "bg-primary/10 text-primary",
  citizen: "bg-surface-container-high text-on-surface",
};

function nombreVisible(user: ApiUser): string {
  if (user.role === "organization") return user.organizationName || ORG_NAME_FALLBACK;
  return user.fullName;
}

function detalleHref(user: ApiUser): string | null {
  if (user.role === "organization") return `/dashboard/organizaciones/${user.id}`;
  if (user.role === "volunteer") return `/dashboard/voluntarios/${user.id}`;
  return null;
}

export default function UsuariosPage() {
  const {
    users,
    total,
    totalPages,
    page,
    setPage,
    typeFilter,
    updateTypeFilter,
    statusFilter,
    updateStatusFilter,
    search,
    updateSearch,
    isLoading,
  } = useUsuariosList();

  const sinFiltros =
    typeFilter === "all" && statusFilter === "all" && search.trim() === "";

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl sm:text-3xl font-bold text-on-surface">Usuarios</h1>
        <p className="text-on-surface-variant mt-1 text-sm sm:text-base">
          {total} usuario{total !== 1 ? "s" : ""} registrado{total !== 1 ? "s" : ""}
        </p>
      </div>

      <div className="flex flex-wrap gap-2 mb-4">
        {TIPO_FILTERS.map((f) => (
          <button
            key={f.value}
            type="button"
            onClick={() => updateTypeFilter(f.value)}
            className={`rounded-full px-4 py-1.5 text-sm font-semibold transition-colors ${
              typeFilter === f.value
                ? "bg-primary text-on-primary"
                : "border border-outline-variant text-on-surface-variant hover:bg-primary/10 hover:text-primary"
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      <UserListControls
        search={search}
        onSearchChange={updateSearch}
        statusFilter={statusFilter}
        onStatusChange={updateStatusFilter}
      />

      <div className="rounded-2xl border border-outline-variant bg-surface-container-low overflow-hidden">
        {isLoading ? (
          <p className="text-center text-on-surface-variant py-10 text-sm">Cargando...</p>
        ) : users.length === 0 ? (
          <p className="text-center text-on-surface-variant py-10 text-sm px-5">
            {sinFiltros
              ? "Todavía no hay usuarios registrados."
              : "No hay usuarios que coincidan con los filtros."}
          </p>
        ) : (
          <div className="divide-y divide-outline-variant">
            {users.map((user) => {
              const nombre = nombreVisible(user);
              const href = detalleHref(user);
              const tipo = user.role as Exclude<ROLES_USER, "admin">;

              return (
                <div key={user.id} className="flex items-center gap-3 sm:gap-4 p-4 sm:p-5">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="font-semibold text-on-surface truncate min-w-0 flex-1" title={nombre}>
                        {nombre}
                      </p>
                      <span className="shrink-0">
                        <StatusBadge status={user.status as "pending" | "approved" | "rejected"} />
                      </span>
                    </div>
                    <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 min-w-0">
                      <span className={`shrink-0 rounded-full px-2.5 py-0.5 text-xs font-semibold ${TIPO_CLASSES[tipo]}`}>
                        {TIPO_LABELS[tipo]}
                      </span>
                      <span className="text-sm text-on-surface-variant truncate min-w-0">{user.email}</span>
                      {user.country && (
                        <span className="text-xs text-on-surface-variant inline-flex items-center gap-1 shrink-0">
                          <span className="material-symbols-rounded text-sm" aria-hidden="true">public</span>
                          {user.country}
                        </span>
                      )}
                    </div>
                  </div>

                  {href && (
                    <div className="shrink-0">
                      <Link
                        href={href}
                        className="flex items-center justify-center w-10 h-10 rounded-xl border border-outline-variant text-on-surface-variant hover:bg-primary/10 hover:text-primary transition-colors"
                        aria-label={`Ver detalles de ${nombre}`}
                      >
                        <span className="material-symbols-rounded text-xl" aria-hidden="true">
                          edit_note
                        </span>
                      </Link>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      <Pagination page={page} totalPages={totalPages} onPageChange={setPage} />
    </div>
  );
}
