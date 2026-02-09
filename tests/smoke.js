const http = require("http");
const { spawn } = require("child_process");

const PORT = process.env.PORT || 5055;
const BASE_URL = `http://localhost:${PORT}`;

function request(path) {
  return new Promise((resolve, reject) => {
    const req = http.get(`${BASE_URL}${path}`, (res) => {
      let body = "";
      res.setEncoding("utf8");
      res.on("data", (chunk) => (body += chunk));
      res.on("end", () => resolve({ status: res.statusCode, body }));
    });
    req.on("error", reject);
  });
}

async function waitForHealth(timeoutMs = 5000) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    try {
      const res = await request("/health");
      if (res.status === 200) return true;
    } catch (err) {
      // Server not ready yet.
    }
    await new Promise((r) => setTimeout(r, 200));
  }
  throw new Error("Timed out waiting for /health");
}

async function run() {
  const server = spawn("node", ["server.js"], {
    env: { ...process.env, PORT },
    stdio: "ignore",
  });

  try {
    await waitForHealth();

    const pages = [
      { path: "/", match: "Network Overview" },
      { path: "/down.html", match: "Down Customers" },
      { path: "/warning.html", match: "Warning Customers" },
      { path: "/suppressed.html", match: "Suppressed Customers" },
    ];

    for (const page of pages) {
      const res = await request(page.path);
      if (res.status !== 200) {
        throw new Error(`${page.path} returned ${res.status}`);
      }
      if (!res.body.includes(page.match)) {
        throw new Error(`${page.path} did not include "${page.match}"`);
      }
    }
  } finally {
    server.kill();
  }
}

run().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
