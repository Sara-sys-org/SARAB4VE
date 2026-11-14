const express = require("express");
const cors = require("cors");
const helpRequestsRouter = require("./modules/helpRequests/helpRequests.routes");
const emergenciesRouter = require("./modules/emergencies/emergencies.routes");
const authRouter = require("./modules/auth/auth.routes");
const usersRouter = require("./modules/users/users.routes");
const emergencyAttendeesRouter = require("./modules/emergencyAttendees/emergencyAttendees.routes");
const helpRequestAttendeesRouter = require("./modules/helpRequestAttendees/helpRequestAttendees.routes");
const verificationRouter = require("./modules/verification/verification.routes");
const auditRouter = require("./modules/audit/audit.routes");
const { conversationsRoutes, messagesRoutes } = require("./modules/conversations");
const { nodeEnv } = require("./config");

const app = express();

app.use(cors());
app.use(express.json());

// Health check
app.get("/health", (_req, res) => {
  res.json({ status: "ok" });
});

// Rutas de la API
app.use("/api/help-requests", helpRequestsRouter);
app.use("/api/emergencies", emergenciesRouter);
app.use("/api/auth", authRouter);
app.use("/api/users", usersRouter);
app.use("/api/audit", auditRouter);

// Chat module
app.use("/api/conversations", conversationsRoutes);
app.use("/api/messages", messagesRoutes);

// Rutas anidadas — attendees
app.use("/api/emergencies/:emergencyId/attendees", emergencyAttendeesRouter);
app.use("/api/help-requests/:helpRequestId/attendees", helpRequestAttendeesRouter);

// Verificación de organizaciones y voluntarios
app.use("/api", verificationRouter);

// 📚 Documentación OpenAPI
const { setupDocs } = require("./openapi");
setupDocs(app);

// Error handler global
app.use((error, _req, res, _next) => {
  console.error(error);
  res.status(500).json({ error: "Internal server error" });
});

module.exports = app;
