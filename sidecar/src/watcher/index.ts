import { watch, type FSWatcher } from "fs";
import { readdir, stat, mkdir } from "fs/promises";
import { join, extname, basename } from "path";
import { getSettings, createInvoice, getDb } from "../db";

const SUPPORTED_TYPES = new Set([
  ".pdf",
  ".jpg",
  ".jpeg",
  ".png",
  ".isdoc",
  ".xml",
  ".csv",
]);

let watcher: FSWatcher | null = null;
let onNewInvoice: ((invoiceId: string) => void) | null = null;

export function setOnNewInvoice(callback: (invoiceId: string) => void): void {
  onNewInvoice = callback;
}

/**
 * Ensure the base iCloud folder structure exists
 */
export async function ensureFolderStructure(): Promise<void> {
  const settings = getSettings();
  const basePath = settings.icloud_base_path;

  await mkdir(basePath, { recursive: true });

  // Create current month folder with incoming/outgoing
  const now = new Date();
  const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  await mkdir(join(basePath, currentMonth, "incoming"), { recursive: true });
  await mkdir(join(basePath, currentMonth, "outgoing"), { recursive: true });
}

/**
 * Scan iCloud Drive base path for all months and invoices.
 * Adds any files not already tracked in the database.
 */
export async function scanAllMonths(): Promise<{
  months: string[];
  newFiles: number;
}> {
  const settings = getSettings();
  const basePath = settings.icloud_base_path;

  let entries: string[];
  try {
    entries = await readdir(basePath).then((e) =>
      e.filter((name) => /^\d{4}-\d{2}$/.test(name))
    );
  } catch {
    await ensureFolderStructure();
    return { months: [], newFiles: 0 };
  }

  const months = entries.sort().reverse();
  let newFiles = 0;

  for (const month of months) {
    const monthPath = join(basePath, month);

    for (const direction of ["incoming", "outgoing"] as const) {
      const dirPath = join(monthPath, direction);

      let files: string[];
      try {
        files = await readdir(dirPath);
      } catch {
        // Directory doesn't exist yet, create it
        await mkdir(dirPath, { recursive: true });
        continue;
      }

      for (const fileName of files) {
        const ext = extname(fileName).toLowerCase();
        if (!SUPPORTED_TYPES.has(ext)) continue;

        const filePath = join(dirPath, fileName);
        const fileType = ext.replace(".", "") as string;

        // Check if already in DB
        const existing = getDb()
          .query("SELECT id FROM invoices WHERE file_path = ?")
          .get(filePath);

        if (!existing) {
          const id = crypto.randomUUID();
          createInvoice({
            id,
            file_path: filePath,
            file_name: fileName,
            file_type: fileType,
            month,
            direction,
          });
          newFiles++;

          if (onNewInvoice) {
            onNewInvoice(id);
          }
        }
      }
    }
  }

  return { months, newFiles };
}

/**
 * Start watching the iCloud Drive folder for new files
 */
export function startWatching(): void {
  const settings = getSettings();
  const basePath = settings.icloud_base_path;

  if (watcher) {
    watcher.close();
  }

  try {
    watcher = watch(basePath, { recursive: true }, async (eventType, filename) => {
      if (!filename) return;
      if (eventType !== "rename") return; // "rename" fires for new files on macOS

      const ext = extname(filename).toLowerCase();
      if (!SUPPORTED_TYPES.has(ext)) return;

      // Parse path: should be YYYY-MM/direction/filename
      const parts = filename.split("/");
      if (parts.length !== 3) return;

      const [month, direction, file] = parts;
      if (!/^\d{4}-\d{2}$/.test(month)) return;
      if (direction !== "incoming" && direction !== "outgoing") return;

      const filePath = join(basePath, filename);

      // Verify file actually exists (not a deletion event)
      try {
        await stat(filePath);
      } catch {
        return;
      }

      // Check if already in DB
      const existing = getDb()
        .query("SELECT id FROM invoices WHERE file_path = ?")
        .get(filePath);

      if (!existing) {
        const id = crypto.randomUUID();
        createInvoice({
          id,
          file_path: filePath,
          file_name: file,
          file_type: ext.replace(".", ""),
          month,
          direction,
        });

        console.log(`[watcher] New invoice detected: ${filename}`);
        if (onNewInvoice) {
          onNewInvoice(id);
        }
      }
    });

    console.log(`[watcher] Watching ${basePath}`);
  } catch (error) {
    console.error(`[watcher] Failed to watch ${basePath}:`, error);
  }
}

export function stopWatching(): void {
  if (watcher) {
    watcher.close();
    watcher = null;
  }
}
