// server.js (CommonJS)
const path = require("path");
const express = require("express");
const dotenv = require("dotenv");
const { sonarGraphqlRequest } = require("./sonarClient");

dotenv.config();

const app = express();

const PORT = Number(process.env.PORT || 3000);
const HOST = "0.0.0.0"; // important for LAN access

// Serve static frontend
app.use(express.static(path.join(__dirname, "public")));

// Simple health check
app.get("/health", (req, res) => res.json({ ok: true }));

/**
 * For now, this returns mock totals shaped exactly like your UI expects.
 * Later you’ll swap the mock data with real values from Sonar GraphQL.
 */
function getMockSummary() {
  return {
    infrastructureEquipment: { good: 71, warning: 0, bad: 0, down: 58 },
    customerEquipment: { good: 1489, warning: 9, bad: 1, down: 71 }
  };
}

/**
 * Placeholder for real Sonar query.
 * When you're ready, replace this with the actual query that returns your totals.
 */
async function getSonarSummary() {
  const endpoint = process.env.SONAR_ENDPOINT;
  const token = process.env.SONAR_TOKEN;

  // If not configured, use mock
  if (!endpoint || !token) return getMockSummary();

  // TODO: Replace with your real query.
  // This is just a stub showing where the call goes.
  const query = `
    query StatusTotals {
      statusTotals {
        infrastructureEquipment { good warning bad down }
        customerEquipment { good warning bad down }
      }
    }
  `;

  // If your real schema differs (it probably will), we’ll adjust this.
  const data = await sonarGraphqlRequest({ endpoint, token, query });

  // If the query isn't valid yet, you can temporarily fall back to mock:
  if (!data?.statusTotals) return getMockSummary();

  return data.statusTotals;
}

// API endpoint the frontend calls
app.get("/api/status-summary", async (req, res) => {
  try {
    const summary = await getSonarSummary();
    res.json(summary);
  } catch (err) {
    // If Sonar errors, return mock but tell you what happened
    console.error("Status summary error:", err.message);
    res.status(200).json(getMockSummary());
  }
});

// Start server
app.listen(PORT, HOST, () => {
  console.log(`Dashboard running on http://${HOST}:${PORT}`);
  console.log(`LAN access: http://<this-server-ip>:${PORT}`);
});
