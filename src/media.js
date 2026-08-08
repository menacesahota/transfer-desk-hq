import fs from "node:fs/promises";
import path from "node:path";
import { getUserClient } from "./x-client.js";

const STORAGE_DIR = process.env.TRANSFER_DESK_STORAGE || ".";
const MEDIA_DIR = path.resolve(STORAGE_DIR, "data/media");

/**
 * Pick the best still image URL from X media objects.
 * Photos → url; videos/gifs → preview_image_url.
 */
export function pickMediaUrl(mediaList = []) {
  for (const m of mediaList) {
    if (m.type === "photo" && m.url) return m.url;
  }
  for (const m of mediaList) {
    if (m.preview_image_url) return m.preview_image_url;
  }
  return null;
}

/** Download a remote image to data/media/ for draft review + upload. */
export async function downloadImage(url, tipId) {
  if (!url) return null;

  await fs.mkdir(MEDIA_DIR, { recursive: true });
  const res = await fetch(url, {
    headers: {
      "User-Agent": "TransferDeskHQ/1.0 (https://x.com/TransferDeskHQ; football transfer desk bot)",
      Accept: "image/*,*/*",
    },
    redirect: "follow",
  });
  if (!res.ok) throw new Error(`Image download failed (${res.status})`);

  const contentType = (res.headers.get("content-type") || "image/jpeg").split(";")[0].trim();
  const ext =
    contentType.includes("png") ? "png" :
    contentType.includes("webp") ? "webp" :
    contentType.includes("gif") ? "gif" : "jpg";

  const safe = String(tipId || "img").replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 80);
  const filePath = path.join(MEDIA_DIR, `${safe}.${ext}`);
  const buf = Buffer.from(await res.arrayBuffer());
  await fs.writeFile(filePath, buf);

  return { filePath, contentType, buffer: buf };
}

/** Convert any image buffer/file to a black-and-white JPEG. */
export async function toBlackAndWhite({ filePath, buffer, tipId }) {
  // Lazy-imported (same reasoning as pulse.js's card renderer): importing
  // sharp at module load time pulls in its native binary eagerly, which is
  // slow in some sandboxes and entirely unnecessary for any code path that
  // never touches an image.
  const { default: sharp } = await import("sharp");
  await fs.mkdir(MEDIA_DIR, { recursive: true });
  const input = buffer || (await fs.readFile(filePath));
  const safe = String(tipId || path.basename(filePath || "img", path.extname(filePath || "")))
    .replace(/[^a-zA-Z0-9_-]/g, "_")
    .slice(0, 80);
  const outPath = path.join(MEDIA_DIR, `${safe}-bw.jpg`);

  const outBuf = await sharp(input)
    .rotate()
    .greyscale()
    .jpeg({ quality: 88, mozjpeg: true })
    .toBuffer();

  await fs.writeFile(outPath, outBuf);
  return { filePath: outPath, contentType: "image/jpeg", buffer: outBuf };
}

/** Upload local/buffer image to X; returns media_id string. */
export async function uploadImageToX({ filePath, buffer, contentType }) {
  const client = getUserClient();
  const mimeType = contentType || guessMime(filePath);
  const data = buffer || (await fs.readFile(filePath));
  const mediaId = await client.v1.uploadMedia(data, { mimeType });
  return String(mediaId);
}

function guessMime(filePath = "") {
  if (filePath.endsWith(".png")) return "image/png";
  if (filePath.endsWith(".webp")) return "image/webp";
  if (filePath.endsWith(".gif")) return "image/gif";
  return "image/jpeg";
}

/** Best-effort og:image (or twitter:image) from an article URL. */
export async function fetchOgImage(pageUrl) {
  if (!pageUrl) return null;
  try {
    const res = await fetch(pageUrl, {
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; TransferDeskHQ/1.0)",
        Accept: "text/html",
      },
      redirect: "follow",
      signal: AbortSignal.timeout(12000),
    });
    if (!res.ok) return null;
    const html = await res.text();
    const patterns = [
      /property=["']og:image["']\s+content=["']([^"']+)["']/i,
      /content=["']([^"']+)["']\s+property=["']og:image["']/i,
      /name=["']twitter:image["']\s+content=["']([^"']+)["']/i,
      /content=["']([^"']+)["']\s+name=["']twitter:image["']/i,
    ];
    for (const re of patterns) {
      const m = html.match(re);
      if (m?.[1]) return m[1].replace(/&amp;/g, "&");
    }
  } catch {
    // ignore
  }
  return null;
}
