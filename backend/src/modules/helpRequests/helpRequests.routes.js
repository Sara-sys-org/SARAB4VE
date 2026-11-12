/**
 * Rutas — definición del router de Express para help-requests.
 */
const express = require("express");
const multer = require("multer");
const controller = require("./helpRequests.controller");
const service = require("./helpRequests.service");
const repository = require("./helpRequests.repository");
const schema = require("./helpRequests.schema");
const { authenticate } = require("../../middleware/authenticate");
const { authorize } = require("../../middleware/authorize");
const { optionalAuthenticate } = require("../../middleware/optionalAuthenticate");

const router = express.Router();

// Multer — recibe en memoria el carnet de discapacidad y/o la nota de voz
// adjuntos a una solicitud de apoyo (ambos opcionales).
const uploadHelpRequestFiles = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 }, // 10 MB por archivo
}).fields([
  { name: "carnet", maxCount: 1 },
  { name: "voiceNote", maxCount: 1 },
]);

function handleHelpRequestUpload(req, res, next) {
  uploadHelpRequestFiles(req, res, (err) => {
    if (err) {
      if (err.code === "LIMIT_FILE_SIZE") {
        return res.status(400).json({
          errors: ["El archivo excede el tamaño máximo permitido (10 MB)"],
        });
      }
      return res.status(400).json({ errors: [err.message] });
    }
    next();
  });
}

// Pública (el mapa y /solicitudes deben verse sin login) — el servicio
// redacta nombre/contacto/dirección/etc. cuando el solicitante no es
// admin/organización/voluntario (ver helpRequests.service.js redactPersonalData).
router.get("/",
    optionalAuthenticate,
    controller.listHelpRequests(service, repository, schema));
// Conteo por estado para los contadores del dashboard.
// Debe ir antes de "/:id" — si no, Express interpreta "stats" como un id.
router.get("/stats",
    authenticate, authorize("admin", "organization", "volunteer"),
    controller.getHelpRequestStats(service, repository));
// Debe ir antes de "/:id" — si no, Express interpreta "mine" como un id.
router.get("/mine",
    authenticate, authorize("citizen"),
    controller.listMyHelpRequests(service, repository));
router.get("/:id",
    authenticate, authorize("admin", "organization", "volunteer"),
    controller.getHelpRequestById(service, schema, repository));
router.post("/",
    handleHelpRequestUpload,
    optionalAuthenticate,
    controller.createHelpRequest(service, schema, repository));
router.post("/:id/accept", 
    authenticate, authorize("admin", "organization"), 
    controller.acceptHelpRequest(service, schema, repository));
router.post("/:id/resolve",
    authenticate, authorize("admin", "organization"),
    controller.resolveHelpRequest(service, schema, repository));
router.post("/:id/link-account",
    authenticate, authorize("citizen"),
    controller.linkRequesterUser(service, schema, repository));

module.exports = router;
