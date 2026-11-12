-- Migración: agregar country a citizen_profiles
-- Fecha: 2026-11-09
--
-- Motivo: el ciudadano ahora puede indicar su país en su propio registro de
-- cuenta (no solo en cada solicitud de ayuda que haga). Se guarda en
-- citizen_profiles, igual que ya se hace para organization_profiles.country
-- y volunteer_profiles.country, aunque citizen_profiles antes solo tenía
-- campos de discapacidad.
--
-- Aditiva, no toca filas existentes.

ALTER TABLE citizen_profiles
  ADD COLUMN IF NOT EXISTS country TEXT;
