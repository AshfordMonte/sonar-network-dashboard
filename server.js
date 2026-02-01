/**
 * server.js
 *
 * Bootstrap:
 * - Load env
 * - Serve static files
 * - Mount /api routes
 * - Print LAN URLs
 */

const path = require("path");
const express = require("express");
const dotenv = require("dotenv");

const { router: apiRouter } = require("./src/routes/api");
const { getLocalIPs } = require("./src/utils/network");
const suppressionsRouter = require("./src/routes/suppressions");

dotenv.config();

const app = express();

//Grabs port from env file, otherwise defaults to 3000
const PORT = Number(process.env.PORT || 3000);
const HOST = "0.0.0.0";

// Static frontend
app.use(express.static(path.join(__dirname, "public")));

// Health
app.get("/health", (req, res) => res.json({ ok: true }));

// API
app.use("/api", apiRouter);
app.use("/api/suppressions", suppressionsRouter);

app.listen(PORT, HOST, () => {
  console.log("Dashboard server started.");
  console.log(`Local: http://localhost:${PORT}`);

  const ips = getLocalIPs();
  if (!ips.length) return console.log("No external IPv4 addresses detected.");

  console.log("LAN access:");
  ips.forEach((ip) => console.log(`  → http://${ip}:${PORT}`));
});
