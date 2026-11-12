/**
 * Rutas — definición del router de Express para emergencias.
 */
const express = require("express");
const controller = require("./emergencies.controller");
const service = require("./emergencies.service");
const repository = require("./emergencies.repository");
const schema = require("./emergencies.schema");
const { authenticate } = require("../../middleware/authenticate");
const { authorize } = require("../../middleware/authorize");
const { optionalAuthenticate } = require("../../middleware/optionalAuthenticate");

// ── Voz ──
const {
  EmergenciaVozSchema,
  createEmergencyVoiceHandler,
  handleMulterUpload,
} = require("./emergencies.voice");

const router = express.Router();

// Pública (el mapa debe verse sin login) — el servicio redacta nombre y
// tipo de discapacidad cuando el solicitante no es admin/organización/
// voluntario (ver emergencies.service.js redactPersonalData).
router.get("/",
    optionalAuthenticate,
    controller.listEmergencies(service, repository, schema));
// Conteo por estado para los contadores del dashboard.
// Debe ir antes de "/:id" — si no, Express interpreta "stats" como un id.
router.get("/stats",
    authenticate, authorize("admin", "organization", "volunteer"),
    controller.getEmergencyStats(service, repository));
router.get("/:id", 
    controller.getEmergencyById(service, schema, repository));

// ── Estado de procesamiento asíncrono ──
router.get("/:id/processing-status",
    authenticate, authorize("admin", "organization", "volunteer"),
    controller.getProcessingStatus(service, schema, repository));

router.post("/",
    optionalAuthenticate,
    controller.createEmergency(service, schema));

// ── Voz: reporte con audio + transcripción (autenticado o anónimo) ──
router.post("/voice",
    handleMulterUpload,
    optionalAuthenticate,
    createEmergencyVoiceHandler(EmergenciaVozSchema));

module.exports = router;
