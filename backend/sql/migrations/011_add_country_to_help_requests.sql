-- Migración: agregar country a help_requests
-- Fecha: 2026-11-08
--
-- Motivo: se necesita mostrar de qué país es quien pide ayuda en /solicitudes
-- y en el detalle del mapa, pero esa columna nunca existió — help_requests
-- solo tiene `address`/`zone` como ubicación en texto libre. No hay backfill
-- de solicitudes ya creadas: quedan NULL (el formulario de SOS/solicitud
-- hace que todas las nuevas sí lo traigan).
--
-- Aditiva, no toca filas existentes.

ALTER TABLE help_requests
  ADD COLUMN IF NOT EXISTS country TEXT;
