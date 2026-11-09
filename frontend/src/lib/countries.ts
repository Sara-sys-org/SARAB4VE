/**
 * Lista de países para los selects de "País" en toda la app. Mismo
 * conjunto que ya usaba el registro de organizaciones
 * (registro/organization/constants.ts COUNTRIES_FISCAL_ID), extraído
 * acá para reutilizarlo sin acoplarse al tipo de identificador fiscal.
 */
export const COUNTRIES = [
  "Venezuela",
  "Colombia",
  "Perú",
  "Argentina",
  "Brasil",
  "España",
  "México",
  "Chile",
  "Ecuador",
] as const;

export type Country = typeof COUNTRIES[number];
