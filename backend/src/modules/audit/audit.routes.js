const express = require("express");
const controller = require("./audit.controller");
const service = require("./audit.service");
const repository = require("./audit.repository");
const { authenticate } = require("../../middleware/authenticate");
const { authorize } = require("../../middleware/authorize");

const router = express.Router();

// Read-only by design: no POST/PATCH/PUT/DELETE routes belong in this module.
router.get(
  "/",
  authenticate,
  authorize("admin"),
  controller.listAudit(service, repository),
);

module.exports = router;
