"use client";

import { useUserList } from "@/hooks/useUserList";
import UserListControls from "@/components/layout/dashboard/UserListControls";
import Pagination from "@/components/layout/dashboard/Pagination";
import StatusBadge from "@/components/layout/dashboard/StatusBadge";
import Link from "next/link";

export default function VoluntariosPage() {
  const {
    users,
    total,
    totalPages,
    page,
    setPage,
    statusFilter,
    updateStatusFilter,
    search,
    updateSearch,
    isLoading,
  } = useUserList("volunteer");

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl sm:text-3xl font-bold text-on-surface">Voluntarios</h1>
        <p className="text-on-surface-variant mt-1 text-sm sm:text-base">
          {total} voluntario{total !== 1 ? "s" : ""} registrado{total !== 1 ? "s" : ""}
        </p>
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
          <p className="text-center text-on-surface-variant py-10 text-sm">
            No hay voluntarios que coincidan con la búsqueda.
          </p>
        ) : (
          <div className="divide-y divide-outline-variant">
            {users.map((user) => (
              <div key={user.id} className="flex flex-col sm:flex-row sm:items-center gap-3 sm:gap-4 p-4 sm:p-5">

                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="font-semibold text-on-surface">{user.fullName}</p>
                    <StatusBadge status={user.status as "pending" | "approved" | "rejected"} />
                  </div>
                  <p className="text-sm text-on-surface-variant mt-0.5">{user.email}</p>
                  <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5">
                    {user.country && (
                      <p className="text-xs text-on-surface-variant inline-flex items-center gap-1">
                        <span className="material-symbols-rounded text-sm" aria-hidden="true">public</span>
                        {user.country}
                      </p>
                    )}
                    {user.zone && (
                      <p className="text-xs text-on-surface-variant inline-flex items-center gap-1">
                        <span className="material-symbols-rounded text-sm" aria-hidden="true">location_on</span>
                        {user.zone}
                      </p>
                    )}
                  </div>
                </div>

                <div className="shrink-0">
                  <Link
                    href={`/dashboard/voluntarios/${user.id}`}
                    className="flex items-center justify-center w-10 h-10 rounded-xl border border-outline-variant text-on-surface-variant hover:bg-primary/10 hover:text-primary transition-colors"
                    aria-label={`Ver detalles de ${user.fullName}`}
                  >
                    <span className="material-symbols-rounded text-xl" aria-hidden="true">
                      edit_note
                    </span>
                  </Link>
                </div>

              </div>
            ))}
          </div>
        )}
      </div>

      <Pagination page={page} totalPages={totalPages} onPageChange={setPage} />
    </div>
  );
}