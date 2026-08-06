import fs from "node:fs/promises";
import path from "node:path";
import { getUserClient } from "./x-client.js";
import { downloadImage, uploadImageToX, toBlackAndWhite } from "./media.js";

// On Render this points at the mounted persistent disk (see render.yaml) so
// seen.json / drafts survive across deploys and restarts. Defaults to the
// repo root for local dev.
const STORAGE_DIR = process.env.TRANSFER_DESK_STORAGE || ".";
const DRAFTS_DIR = path.resolve(STORAGE_DIR, "drafts");
const SEEN_PATH = path.resolve(STORAGE_DIR, "data/seen.json");

export async function ensureDirs() {
  await fs.mkdir(DRAFTS_DIR, { recursive: true });
  await fs.mkdir(path.resolve(STORAGE_DIR, "data"), { recursive: true });
  await fs.mkdir(path.resolve(STORAGE_DIR, "data/media"), { recursive: true });
}

export async function loadSeen() {
  try {
    const raw = await fs.readFile(SEEN_PATH, "utf8");
    return new Set(JSON.parse(raw));
  } catch {
    return new Set();
  }
}

export async function saveSeen(seen) {
  await ensureDirs();
  await fs.writeFile(SEEN_PATH, JSON.stringify([...seen], null, 2));
}

// Handles whose images we never attach to a post, regardless of channel.
const NO_IMAGE_HANDLES = new Set(["skysportsnews"]);

/** Reuse the source tip's image, converted to black and white. */
export async function enrichTipWithImage(tip) {
  if (NO_IMAGE_HANDLES.has(String(tip.handle || "").toLowerCase())) {
    return { ...tip, imageUrl: null, localImage: undefined, usedSourceImage: false, usedBwImage: false };
  }
  if (tip.localImage && tip.usedBwImage) return tip;
  if (!tip.imageUrl) return tip;

  try {
    const downloaded = await downloadImage(tip.imageUrl, tip.id);
    const bw = await toBlackAndWhite({
      filePath: downloaded.filePath,
      buffer: downloaded.buffer,
      tipId: tip.id,
    });
    return {
      ...tip,
      localImage: bw.filePath,
      imageContentType: bw.contentType,
      usedSourceImage: true,
      usedBwImage: true,
    };
  } catch (err) {
    return { ...tip, imageError: err.message };
  }
}

export async function saveDraft(tip) {
  await ensureDirs();
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const file = path.join(DRAFTS_DIR, `${stamp}-${tip.handle}.json`);
  await fs.writeFile(file, JSON.stringify(tip, null, 2));
  return file;
}

export async function postTweet(text, { localImage, imageContentType, imageUrl, replyTo } = {}) {
  const client = getUserClient();
  let mediaIds;

  if (localImage || imageUrl) {
    try {
      const payload = localImage
        ? { filePath: localImage, contentType: imageContentType || "image/jpeg" }
        : await downloadImage(imageUrl, `post-${Date.now()}`);
      const mediaId = await uploadImageToX(payload);
      mediaIds = [mediaId];
    } catch (err) {
      console.warn(`Image upload skipped: ${err.message}`);
    }
  }

  const payload = { text };
  if (mediaIds?.length) payload.media = { media_ids: mediaIds };
  if (replyTo) payload.reply = { in_reply_to_tweet_id: String(replyTo) };

  const result = await client.v2.tweet(payload);
  return result.data;
}
