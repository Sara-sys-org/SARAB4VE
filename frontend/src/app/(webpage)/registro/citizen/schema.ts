import { z } from "zod";
import { isValidPhoneNumber } from "libphonenumber-js";
import { COUNTRIES } from "@/lib/countries";

/**
 * Esquema de validación para el registro de ciudadano.
 *
 * El backend define CommonFields en auth.schema.js con campos como
 * location (opcional) y zone (opcional). En el formulario del frontend
 * exigimos ambos para que el mapa pueda mostrar la posición del
 * solicitante al recibir ayuda, y para alimentar el campo `zone`
 * que luego se usa como filtro geográfico.
 *
 * Nota: `acceptedTerms` se fuerza a `true` antes de validar (mismo
 * patrón que en volunteer y organization) — no se muestra un checkbox
 * separado en el formulario.
 */
export const citizenSchema = z.object({
  fullName: z
    .string()
    .trim()
    .min(3, "El nombre debe tener al menos 3 caracteres")
    .max(100, "El nombre es demasiado largo"),

  email: z
    .string()
    .trim()
    .email("Correo electrónico inválido"),

  phone: z
    .string()
    .trim()
    .refine((val) => isValidPhoneNumber(val), {
      message: "Ingresa un número de teléfono válido para el país seleccionado",
    }),

  password: z
    .string()
    .min(8, "La contraseña debe tener al menos 8 caracteres"),

  // Aceptamos `null` (estado inicial) o el objeto `{lat, lng}`. Zod infiere
  // correctamente la unión `null | { lat, lng }` con `z.union`. Usamos
  // `superRefine` abajo para rechazar `null` con un mensaje claro — esto
  // evita perder la nulabilidad en el tipo inferido (que pasa si ponemos
  // el refine inline, como ya vimos con el bug de TS2322).
  location: z
    .union([
      z.object({
        lat: z.number(),
        lng: z.number(),
      }),
      z.null(),
    ]),

  zone: z
    .string()
    .trim()
    .min(2, "Ingresa una zona válida"),

  country: z
    .string()
    .refine((val) => (COUNTRIES as readonly string[]).includes(val), {
      message: "Selecciona un país válido",
    }),

  acceptedTerms: z.literal(true, {
    error: () => ({ message: "Debes aceptar los términos y el código de conducta" }),
  }),
}).superRefine((data, ctx) => {
  // `location` se captura como `null` en el estado inicial del formulario,
  // pero en el envío debe ser un objeto { lat, lng }. La validación la
  // hacemos aquí (en superRefine) para preservar la nulabilidad del tipo
  // inferido; si la pusiéramos inline en el schema, Zod estrecharía el
  // output a `{ lat, lng }` y `null` dejaría de compilar (TS2322).
  if (data.location === null) {
    ctx.addIssue({
      code: "custom",
      path: ["location"],
      message: "Selecciona tu ubicación en el mapa",
    });
  }
});

export type CitizenFormData = z.infer<typeof citizenSchema>;

/**
 * Convierte un error de Zod en un mapa { campo: mensaje } para pintar
 * los errores por input. Coincide con la firma usada en
 * volunteer/schema.ts y organization/schema.ts para mantener consistencia
 * entre los tres formularios.
 */
export function getFieldErrors(
  data: unknown
): Partial<Record<keyof CitizenFormData, string>> {
  const result = citizenSchema.safeParse(data);
  if (result.success) return {};

  const errors: Partial<Record<keyof CitizenFormData, string>> = {};
  for (const issue of result.error.issues) {
    const field = issue.path[0] as keyof CitizenFormData;
    if (!errors[field]) {
      errors[field] = issue.message;
    }
  }
  return errors;
}
