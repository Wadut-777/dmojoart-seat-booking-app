/** Browser-safe helpers for locally stored images (served by /media/* and uploaded via /api/upload). */

export function mediaUrl(path?: string | null): string | null {
  if (!path) return null;
  if (/^https?:\/\//i.test(path)) return path;
  return `/media/${path.split("/").map(encodeURIComponent).join("/")}`;
}

export async function uploadMedia(file: File, folder: "posters" | "blocks"): Promise<string> {
  const body = new FormData();
  body.append("folder", folder);
  body.append("file", file);
  const res = await fetch("/api/upload", { method: "POST", body, credentials: "same-origin" });
  const json = (await res.json().catch(() => null)) as { path?: string; error?: string } | null;
  if (!res.ok || !json?.path) throw new Error(json?.error ?? "Upload failed.");
  return json.path;
}
