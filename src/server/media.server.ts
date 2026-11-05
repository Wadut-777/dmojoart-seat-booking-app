import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { dirname, extname, join, normalize, resolve, sep } from "node:path";

/** Uploaded images (event posters, page-builder blocks) live on local disk. */
let announced = false;

export function storageRoot(): string {
  // Tolerate quotes, stray spaces and "~" in .env (e.g. STORAGE_DIR="D:\\dmojo\\media" or ~/dmojo/media).
  let raw = (process.env["STORAGE_DIR"] ?? "").trim().replace(/^(['"])(.*)\1$/, "$2").trim();
  if (raw.startsWith("~")) raw = join(process.env["HOME"] ?? process.env["USERPROFILE"] ?? "", raw.slice(1));
  const root = resolve(raw || "./storage/event-media");
  if (!announced) {
    announced = true;
    console.log(`[media] storing and serving uploads from ${root}${raw ? "" : " (STORAGE_DIR is not set; using the default)"}`);
  }
  return root;
}

export const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;
export const UPLOAD_FOLDERS = ["posters", "blocks"] as const;

const TYPES: Record<string, string> = {
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".webp": "image/webp",
  ".gif": "image/gif",
  ".avif": "image/avif",
};

export function contentTypeFor(path: string): string | null {
  return TYPES[extname(path).toLowerCase()] ?? null;
}

/** Resolves a stored relative path to a file inside the storage root, or null if it escapes it. */
function safePath(relative: string): string | null {
  const root = storageRoot();
  const full = resolve(root, normalize(relative));
  return full === root || full.startsWith(root + sep) ? full : null;
}

export async function saveUpload(folder: (typeof UPLOAD_FOLDERS)[number], file: File): Promise<string> {
  const ext = extname(file.name).toLowerCase();
  if (!TYPES[ext] || !file.type.startsWith("image/")) throw new Error("Only JPG, PNG, WebP, GIF or AVIF images are allowed.");
  if (file.size > MAX_UPLOAD_BYTES) throw new Error("Image is larger than 10 MB.");
  const base = file.name.slice(0, -ext.length).replace(/[^\w-]+/g, "_").slice(0, 60) || "image";
  const relative = `${folder}/${randomUUID()}-${base}${ext}`;
  const full = safePath(relative);
  if (!full) throw new Error("Invalid file name.");
  await mkdir(dirname(full), { recursive: true });
  await writeFile(full, Buffer.from(await file.arrayBuffer()));
  return relative;
}

export async function readUpload(relative: string): Promise<{ body: Buffer; type: string } | null> {
  const type = contentTypeFor(relative);
  const full = safePath(join(relative));
  if (!type || !full) return null;
  try {
    if (!(await stat(full)).isFile()) return null;
    return { body: await readFile(full), type };
  } catch {
    console.warn(`[media] file not found: ${full} (STORAGE_DIR resolves to ${storageRoot()})`);
    return null;
  }
}
