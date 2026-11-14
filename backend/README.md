# Backend - SARA

API Node.js para el MVP de SARA.

## Stack

- Node.js
- Express
- PostgreSQL

## Arranque local

1. Instala dependencias:

```bash
npm install
```

2. Crea variables de entorno:

```bash
cp .env.example .env
```

3. Crea la base y aplica el esquema:

```bash
createdb sara
psql "$DATABASE_URL" -f sql/schema.sql
```

Si vas a usar Supabase, puedes apuntar `DATABASE_URL` al pooler y saltarte la base local:

```bash
DATABASE_URL=postgresql://postgres.svvdcvjtytfsuqeveyza:<password>@aws-1-us-east-2.pooler.supabase.com:5432/postgres
```

4. Arranca la API:

```bash
npm start
```

## Endpoints

- `GET /health`
- `GET /api/help-requests`
- `POST /api/help-requests`
- `POST /api/help-requests/:id/accept`
- `POST /api/help-requests/:id/resolve`
- `POST /api/emergencies/voice` — reporte de emergencia por voz (audio + transcript)
- `GET /api/users/:id/organization-profile` — perfil completo de organización (admin)
- `GET /api/users/:id/volunteer-profile` — perfil completo de voluntario (admin)
- `PATCH /api/users/:id/organization-profile` — corregir datos de organización (admin)
- `PATCH /api/users/:id/volunteer-profile` — corregir datos de voluntario (admin)
- `GET /api/audit` — historial de acciones administrativas (admin)

## Reporte de emergencias por voz

El endpoint `POST /api/emergencies/voice` acepta `multipart/form-data` con
un archivo de audio (campo `audio`, hasta 10 MB) y los demás campos del
formulario de emergencia. El audio se sube a Cloudflare R2 y el
registro queda con `report_origin = 'voz'`.

### Cascada de transcripción

Si el cliente NO envía el campo `transcript` (o lo envía vacío) pero
adjunta el audio, el backend intenta transcribirlo en este orden:

| # | Método                     | Dependencias                 | Cuándo se usa                          |
|---|----------------------------|------------------------------|----------------------------------------|
| 1 | **cliente-webspeech** (frontend) | Ninguna en backend          | Si el cliente ya envió `transcript`     |
| 2 | **Gemini** (Google AI Studio) | `GEMINI_API_KEY` en `.env`   | Si el cliente no envió transcript pero hay audio |
| 3 | **ninguno** (registro manual)    | —                       | Si Gemini falla, no hay key, o el audio > 20 MB |

El método usado se guarda en la columna `transcript_method` del
registro (`cliente-webspeech`, `gemini` o `ninguno`). El registro
SIEMPRE se crea, incluso si la transcripción falla — queda pendiente
de revisión manual del usuario.

### Variables de entorno relevantes

```bash
# Gemini — Transcripción de audio (Nivel 1) + clasificación de texto
GEMINI_API_KEY=...              # https://aistudio.google.com/apikey (gratis)
GEMINI_MODEL=gemini-1.5-flash   # default; soporta audio inline

# Groq — Fallback de clasificación de texto (sin audio)
GROQ_API_KEY=...                # https://console.groq.com (gratis)
GROQ_MODEL=llama-3.3-70b-versatile
```

### Limitación conocida

**El backend no tiene transcripción offline (sin internet).** Si
Gemini no responde y el cliente no envió `transcript` (no usó Web
Speech API), el registro se guarda con `transcript_method='ninguno'`
para que el operador lo complete manualmente.

Razón: agregar Whisper local con `@huggingface/transformers` requiere
~250 MB de bundle y > 1.5 GB de RAM en frío, lo que excede los
límites de Vercel Hobby y añade complejidad innecesaria para el
tamaño actual del proyecto. Si en el futuro se necesita, se puede
reactivar como dependencia opcional.

## Geolocalizacion en listado

`GET /api/help-requests` acepta estos query params opcionales:

- `status`: `open`, `assigned`, `resolved`
- `latitude`
- `longitude`
- `radiusKm`

Reglas:

- `latitude` y `longitude` deben enviarse juntos
- `radiusKm` es opcional y por defecto vale `10`
- `radiusKm` maximo: `100`
- cuando hay geofiltro, la respuesta se ordena por cercania e incluye `distanceKm`

Ejemplo:

```http
GET /api/help-requests?status=open&latitude=10.4806&longitude=-66.9036&radiusKm=10
```

## Aceptar solicitud

`POST /api/help-requests/:id/accept` acepta una solicitud solo si sigue en estado `open`.

Payload:

```json
{
  "volunteerName": "Luis Perez",
  "volunteerContactMethod": "phone",
  "volunteerContactValue": "+584121112233"
}
```

Respuestas:

- `200` si la solicitud se asigna correctamente
- `400` si el `id` o el payload son invalidos
- `404` si la solicitud no existe
- `409` si la solicitud ya no esta disponible

## Resolver solicitud

`POST /api/help-requests/:id/resolve` marca una solicitud como resuelta solo si sigue en estado `assigned`.

Respuestas:

- `200` si la solicitud se cierra correctamente
- `400` si el `id` es invalido
- `404` si la solicitud no existe
- `409` si la solicitud no esta asignada o ya fue resuelta

## Corrección de organizaciones y voluntarios (admin)

Endpoints para que un administrador corrija los campos de un registro ya
enviado:

- `PATCH /api/users/:id/organization-profile`
- `PATCH /api/users/:id/volunteer-profile`

Reglas:

- **Solo administradores autenticados** (`authenticate` + `authorize("admin")`).
  El rol se vuelve a verificar en el servicio (defensa en profundidad).
- La validación usa **exactamente las mismas reglas del formulario de
  registro**: los bodies `UpdateOrganizationProfileBody` /
  `UpdateVolunteerProfileBody` se derivan de `RegisterOrganizationBody` /
  `RegisterVolunteerBody` (`.partial()` + `.omit(password, acceptedTerms)`).
  Todos los campos son opcionales; enviar `{}` responde `400`.
- No se permite cambiar `password` ni `acceptedTerms` por esta vía (para la
  contraseña, usar `PATCH /api/users/:id`).
- La actualización es atómica y **parcial**: solo se persiste lo enviado.
  Toca `users`, `user_details`, `organization_profiles` / `volunteer_profiles`,
  representantes legales y las tablas puente del catálogo. Enviar
  `legalRepresentatives`, `disabilityTypeIds`, `serviceIds`,
  `interestAreaIds` o `experienceCategoryIds` **reemplaza** el conjunto
  completo (no hace merge).
- La respuesta es el perfil completo, con el mismo formato que el `GET` del
  perfil correspondiente.
- Errores: `400` (validación / rol incorrecto del usuario target),
  `403` (no admin), `404` (usuario inexistente), `409` (email/teléfono en uso).

### ¿Editar cambia el estado de verificación?

**No.** Editar los datos de un registro **no modifica** el estado de la
solicitud de verificación (`entregada` / `en_estudio` / `aceptada` /
`rechazada`). El estado solo cambia mediante
`PATCH /api/admin/verifications/:id/transition`.

Matiz: si en el perfil de voluntario se cambia `volunteerType`, el backend
sincroniza el `entity_type` de la solicitud (`volunteer_professional` /
`volunteer_non_professional`) para mantener la coherencia con el checklist de
documentos, **sin tocar el estado**.

## Historial de acciones administrativas

Cada edición, alta, reemplazo o revisión de un registro deja una fila
append-only en `audit_log` con el actor (`actor_id`, `actor_role`), la fecha
(`occurred_at`), la acción y el registro afectado (`entity_type`, `entity_id`).

- `GET /api/audit` — solo `admin`. Filtros: `entityType`, `entityId`, `action`,
  `actorId`, `from`, `to`, `page`, `limit` (máximo 100).
- El módulo no expone `POST`/`PATCH`/`PUT`/`DELETE`: el historial es de solo
  lectura desde la API. La migración agrega además un trigger que bloquea
  `UPDATE`, `DELETE` y `TRUNCATE` sobre la tabla.
- `before_data` y `after_data` guardan **solo los campos que cambiaron**. Los
  textos se truncan a 2000 caracteres y los arreglos a 50 ítems; las claves
  sensibles (`passwordHash`, `token`, `storageKey`, etc.) nunca se persisten.
  Los cambios de contraseña se registran como `credentialsChanged`, sin el hash.
- Aplicar `sql/migrations/010_add_audit_log.sql` antes de desplegar: si la tabla
  no existe, las mutaciones auditadas fallan.

## Ejemplo de payload

```json
{
  "requesterName": "Ana Perez",
  "contactMethod": "phone",
  "contactValue": "+584141234567",
  "needType": "transport",
  "description": "Necesito llegar a un refugio accesible",
  "latitude": 10.4806,
  "longitude": -66.9036,
  "urgency": "high"
}
```

## Tipos de necesidad

- `equipment`
- `medication`
- `transport`
- `companionship`
- `interpreter`
- `accessible_information`
- `neurodivergent_support`
- `psychosocial_support`
