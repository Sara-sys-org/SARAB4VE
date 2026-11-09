-- Migración: agregar country a volunteer_profiles
-- Fecha: 2026-11-08
--
-- Motivo: se necesita mostrar el país del voluntario en el panel admin
-- (listado y detalle), pero esa columna nunca existió — volunteer_profiles
-- solo tiene `address` (texto libre, ver migración 005). No se hace backfill
-- de los voluntarios ya registrados: queda NULL hasta que ellos mismos o un
-- admin lo completen desde VolunteerEditForm.
--
-- Aditiva, no toca filas existentes.

ALTER TABLE volunteer_profiles
  ADD COLUMN IF NOT EXISTS country TEXT;
