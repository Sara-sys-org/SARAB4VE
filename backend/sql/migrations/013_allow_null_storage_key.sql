-- Migración: permitir documentos de verificación sin archivo
-- Fecha: 2026-11-09
--
-- Motivo: el administrador puede eliminar el archivo de un documento sin
-- borrar el documento. La fila se conserva con storage_key en NULL para que
-- siga apareciendo en el panel y se pueda agregar un archivo nuevo después.

ALTER TABLE verification_documents
  ALTER COLUMN storage_key DROP NOT NULL;
