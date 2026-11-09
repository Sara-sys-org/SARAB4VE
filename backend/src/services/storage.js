/**
 * Servicio de almacenamiento — upload de archivos a Cloudflare R2 (API S3-compatible).
 *
 * Expone:
 *   - uploadAudio(fileBuffer, fileName, mimeType): sube un audio a R2 y retorna la URL pública.
 *   - uploadDocument(fileBuffer, fileName, mimeType, ownerId): sube un documento de verificación a R2.
 *   - documentExists(storageKey): indica si un objeto existe en R2.
 *   - deleteDocument(storageKey): elimina un objeto de R2.
 *
 * Requiere las variables de entorno:
 *   R2_ENDPOINT       — endpoint S3 de R2 (ej: https://<id>.r2.cloudflarestorage.com)
 *   R2_ACCESS_KEY_ID  — access key de R2
 *   R2_SECRET_ACCESS_KEY — secret key de R2
 *   R2_BUCKET         — nombre del bucket (default: "sara-audio")
 *   R2_PUBLIC_URL     — URL pública base para los objetos (ej: https://pub-<hash>.r2.dev)
 */

const {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  DeleteObjectCommand,
} = require("@aws-sdk/client-s3");
const { getSignedUrl } = require("@aws-sdk/s3-request-presigner");

// ---------------------------------------------------------------------------
// Configuración del cliente R2 (S3-compatible)
// ---------------------------------------------------------------------------

const R2_ENDPOINT = process.env.R2_ENDPOINT || "";
const R2_ACCESS_KEY_ID = process.env.R2_ACCESS_KEY_ID || "";
const R2_SECRET_ACCESS_KEY = process.env.R2_SECRET_ACCESS_KEY || "";
const R2_BUCKET = process.env.R2_BUCKET || "sara-audio";
const R2_PUBLIC_URL = process.env.R2_PUBLIC_URL || "";

/** Cliente S3 configurado para Cloudflare R2. Solo se crea si hay credenciales. */
let s3Client = null;

function getClient() {
  if (!s3Client && R2_ENDPOINT && R2_ACCESS_KEY_ID && R2_SECRET_ACCESS_KEY) {
    s3Client = new S3Client({
      region: "auto",
      endpoint: R2_ENDPOINT,
      credentials: {
        accessKeyId: R2_ACCESS_KEY_ID,
        secretAccessKey: R2_SECRET_ACCESS_KEY,
      },
      forcePathStyle: true,
    });
  }
  return s3Client;
}

// ---------------------------------------------------------------------------
// uploadAudio
// ---------------------------------------------------------------------------

/**
 * Sube un archivo de audio a Cloudflare R2.
 *
 * @param {Buffer} fileBuffer — contenido binario del archivo
 * @param {string} fileName  — nombre original del archivo (se usa para extensión)
 * @param {string} mimeType  — MIME type del archivo (ej: "audio/webm", "audio/mp4")
 * @returns {Promise<string>} URL pública del audio subido
 * @throws {Error} si R2 no está configurado o falla la subida
 */
async function uploadAudio(fileBuffer, fileName, mimeType) {
  const client = getClient();

  if (!client) {
    throw new Error(
      "R2 no está configurado. Revisa R2_ENDPOINT, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY.",
    );
  }

  if (!fileBuffer || fileBuffer.length === 0) {
    throw new Error("El archivo de audio está vacío.");
  }

  // Generar un key único: voice/<timestamp>-<random>-<nombre original>
  const ext = fileName.includes(".") ? fileName.split(".").pop() : "webm";
  const uniqueName = `voice/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;

  await client.send(
    new PutObjectCommand({
      Bucket: R2_BUCKET,
      Key: uniqueName,
      Body: fileBuffer,
      ContentType: mimeType || "audio/webm",
      CacheControl: "public, max-age=31536000, immutable",
    }),
  );

  // Construir la URL pública
  if (R2_PUBLIC_URL) {
    return `${R2_PUBLIC_URL.replace(/\/$/, "")}/${uniqueName}`;
  }

  // Fallback: URL directa de R2 (requiere que el bucket sea público)
  return `${R2_ENDPOINT.replace(/\/$/, "")}/${R2_BUCKET}/${uniqueName}`;
}

// ---------------------------------------------------------------------------
// uploadDocument
// ---------------------------------------------------------------------------

/**
 * Sube un documento de verificación a Cloudflare R2 en la carpeta
 * `documents_verifications/<ownerId>/`.
 *
 * @param {Buffer} fileBuffer — contenido binario del archivo
 * @param {string} fileName  — nombre original del archivo (se usa para extensión)
 * @param {string} mimeType  — MIME type del archivo (ej: "application/pdf", "image/jpeg")
 * @param {string} ownerId   — UUID del propietario (se usa como sub-carpeta)
 * @returns {Promise<{ storageKey: string }>} Key de R2 del documento subido
 * @throws {Error} si R2 no está configurado o falla la subida
 */
async function uploadDocument(fileBuffer, fileName, mimeType, ownerId) {
  const client = getClient();

  if (!client) {
    throw new Error(
      "R2 no está configurado. Revisa R2_ENDPOINT, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY.",
    );
  }

  if (!fileBuffer || fileBuffer.length === 0) {
    throw new Error("El archivo está vacío.");
  }

  const ext = fileName.includes(".") ? fileName.split(".").pop() : "bin";
  const uniqueName = `documents_verifications/${ownerId}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;

  await client.send(
    new PutObjectCommand({
      Bucket: R2_BUCKET,
      Key: uniqueName,
      Body: fileBuffer,
      ContentType: mimeType || "application/octet-stream",
    }),
  );

  return { storageKey: uniqueName };
}

// ---------------------------------------------------------------------------
// getPresignedDownloadUrl
// ---------------------------------------------------------------------------

/**
 * Genera una URL prefirmada temporal para descargar un documento privado de R2.
 * La URL expira automáticamente después del tiempo especificado.
 *
 * @param {string} storageKey — Key del objeto en R2 (ej: "documents_verifications/uuid/file.pdf")
 * @param {number} expiresIn — Segundos hasta expiración (default: 3600 = 1 hora)
 * @returns {Promise<string>} URL prefirmada temporal
 * @throws {Error} si R2 no está configurado
 */
async function getPresignedDownloadUrl(storageKey, expiresIn = 3600) {
  const client = getClient();

  if (!client) {
    throw new Error("R2 no está configurado.");
  }

  const command = new GetObjectCommand({
    Bucket: R2_BUCKET,
    Key: storageKey,
  });

  const signedUrl = await getSignedUrl(client, command, { expiresIn });
  return signedUrl;
}

// ---------------------------------------------------------------------------
// documentExists
// ---------------------------------------------------------------------------

/**
 * Indica si un objeto existe en R2.
 *
 * @param {string} storageKey — Key del objeto en R2
 * @returns {Promise<boolean>} true si existe, false si R2 responde 404
 * @throws {Error} si R2 no está configurado o falla por otro motivo
 */
async function documentExists(storageKey) {
  const client = getClient();

  if (!client) {
    throw new Error("R2 no está configurado.");
  }

  try {
    await client.send(new HeadObjectCommand({ Bucket: R2_BUCKET, Key: storageKey }));
    return true;
  } catch (error) {
    if (error?.$metadata?.httpStatusCode === 404 || error?.name === "NotFound") {
      return false;
    }
    throw error;
  }
}

// ---------------------------------------------------------------------------
// deleteDocument
// ---------------------------------------------------------------------------

/**
 * Elimina un objeto de R2. Si el objeto no existe, R2 responde igual con éxito.
 *
 * @param {string} storageKey — Key del objeto en R2
 * @returns {Promise<void>}
 * @throws {Error} si R2 no está configurado o falla la eliminación
 */
async function deleteDocument(storageKey) {
  const client = getClient();

  if (!client) {
    throw new Error("R2 no está configurado.");
  }

  await client.send(new DeleteObjectCommand({ Bucket: R2_BUCKET, Key: storageKey }));
}

// ---------------------------------------------------------------------------
// hasStoredFile
// ---------------------------------------------------------------------------

/**
 * Indica si un documento tiene un archivo guardado. A diferencia de
 * documentExists, nunca lanza: si R2 no responde (o no está configurado,
 * como en local), asume que el archivo existe mientras haya storageKey.
 *
 * @param {string|null} storageKey
 * @returns {Promise<boolean>}
 */
async function hasStoredFile(storageKey) {
  if (!storageKey) return false;
  if (!getClient()) return true;

  try {
    return await documentExists(storageKey);
  } catch (error) {
    console.error(`[storage] No se pudo comprobar el archivo ${storageKey}:`, error.message);
    return true;
  }
}

module.exports = {
  uploadAudio,
  uploadDocument,
  getPresignedDownloadUrl,
  documentExists,
  deleteDocument,
  hasStoredFile,
};
