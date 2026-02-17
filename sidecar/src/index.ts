import { Hono } from "hono";
import { cors } from "hono/cors";
import { logger } from "hono/logger";
import { api } from "./routes/api";
import { scanAllMonths, startWatching, ensureFolderStructure, setOnNewInvoice } from "./watcher";
import { closeDb, getInvoice } from "./db";
import { tmpdir } from "os";
import { writeFileSync } from "fs";
import { join } from "path";

const app = new Hono();

// Middleware
app.use("*", cors({ origin: "*" }));
app.use("*", logger());

// Mount API routes
app.route("/api", api);

// Root health check
app.get("/", (c) => c.json({ name: "invoices-sidecar", version: "0.1.0" }));

// Start the server
const PORT = parseInt(process.env.PORT ?? "0") || 3001;

const server = Bun.serve({
  port: PORT,
  fetch: app.fetch,
});

const actualPort = server.port;

setOnNewInvoice((invoiceId: string) => {
  const invoice = getInvoice(invoiceId);
  if (!invoice) return;

  if (!["pdf", "jpg", "jpeg", "png"].includes(invoice.file_type)) {
    return;
  }

  void fetch(`http://localhost:${actualPort}/api/ocr/queue/invoice/${invoiceId}`, {
    method: "POST",
  }).catch((error) => {
    console.error(`[auto-ocr] Failed for ${invoice.file_name}:`, error);
  });
});

// Write port to temp file so Tauri can discover it
const portFile = join(tmpdir(), "invoices-sidecar-port");
writeFileSync(portFile, String(actualPort));

console.log(`[sidecar] Server running on http://localhost:${actualPort}`);
console.log(`[sidecar] Port written to ${portFile}`);

// Initialize on startup
(async () => {
  try {
    await ensureFolderStructure();
    const { months, newFiles } = await scanAllMonths();
    console.log(
      `[sidecar] Scanned ${months.length} months, found ${newFiles} new files`
    );
    startWatching();
  } catch (error) {
    console.error("[sidecar] Initialization error:", error);
  }
})();

// Graceful shutdown
process.on("SIGINT", () => {
  console.log("[sidecar] Shutting down...");
  closeDb();
  process.exit(0);
});

process.on("SIGTERM", () => {
  console.log("[sidecar] Shutting down...");
  closeDb();
  process.exit(0);
});
