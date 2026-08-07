/**
 * Persistent tip log + feature state.
 * Lives on TRANSFER_DESK_STORAGE (Render persistent disk) like seen.json.
 */

import fs from "node:fs/promises";
import path from "node:path";
import { extractEntities, buildSurnameIndex } from "./entities.js";

const STORAGE_DIR = process.env.TRANSFER_DESK_STORAGE || ".";
const DATA_DIR = path.resolve(STORAGE_DIR, "data");
const LOG_PATH = path.join(DATA_DIR, "tiplog.json");
const STATE_PATH = path.join(DATA_DIR, "feature-state.json");
const CURSORS_PATH = path.join(DATA_DIR, "x-cursors.json");

const LOG_MAX_ENTRIES = 5000;
const LOG_MAX_AGE_DAYS = 120;

async function readJson(file, fallback) {
  try {
    return JSON.parse(await fs.readFile(file, "utf8"));
  } catch {
    return fallback;
  }
}

async function writeJson(file, value) {
  await fs.mkdir(DATA_DIR, { recursive: true });
  await fs.writeFile(file, JSON.stringify(value, null, 2));
}

/** Full tip log, oldest → newest. */
export async function loadLog() {
  return readJson(LOG_PATH, []);
}

export async function saveLog(log) {
  const cutoff = Date.now() - LOG_MAX_AGE_DAYS * 86400_000;
  const pruned = log
    .filter((e) => new Date(e.createdAt || e.loggedAt).getTime() >= cutoff)
    .slice(-LOG_MAX_ENTRIES);
  await writeJson(LOG_PATH, pruned);
}

/**
 * Record fetched tips into the log with extracted entities.
 * Skips duplicates by tip id. Returns the entries that were added.
 */
export async function recordTips(tips, { weights = {} } = {}) {
  const log = await loadLog();
  const known = new Set(log.map((e) => e.id));
  const added = [];
  // Surname-only mentions ("Isak now advancing") are linked back to a
  // player already established by a full-name mention ("Alexander Isak")
  // earlier in the log or earlier in this same batch — kept current as we
  // go so tips within one fetch cycle can resolve against each other too.
  let surnameIndex = buildSurnameIndex(log);

  for (const tip of tips) {
    if (!tip?.id || tip.source === "error" || known.has(tip.id)) continue;
    const entities = extractEntities(tip.original, { surnameIndex });
    const entry = {
      id: tip.id,
      handle: tip.handle,
      label: tip.label,
      weight: weights[tip.handle?.toLowerCase?.()] ?? 5,
      kind: tip.kind || "news",
      original: tip.original,
      createdAt: tip.createdAt || new Date().toISOString(),
      loggedAt: new Date().toISOString(),
      ...entities,
    };
    log.push(entry);
    known.add(entry.id);
    added.push(entry);
    if (entry.player) surnameIndex = buildSurnameIndex(log);
  }

  if (added.length) await saveLog(log);
  return added;
}

/**
 * Feature state: which consensus/saga/scorecard posts we've already made,
 * saga thread tweet ids, last scorecard week, rumour-watch odds history, etc.
 * Shape: { postedKeys: {key: iso}, sagaThreads: {playerKey: tweetId},
 *          rumourWatch: {playerKey: {pct, postedAt}} }
 */
export async function loadState() {
  const state = await readJson(STATE_PATH, {});
  state.postedKeys ||= {};
  state.sagaThreads ||= {};
  state.rumourWatch ||= {};
  return state;
}

export async function saveState(state) {
  await writeJson(STATE_PATH, state);
}

export function hasPosted(state, key) {
  return Boolean(state.postedKeys[key]);
}

export function markPosted(state, key) {
  state.postedKeys[key] = new Date().toISOString();
  // Keep the map from growing forever
  const keys = Object.keys(state.postedKeys);
  if (keys.length > 3000) {
    for (const k of keys.slice(0, keys.length - 3000)) delete state.postedKeys[k];
  }
}

/**
 * X API call-saving cursors, kept across watch cycles:
 *   - userIds: handle (lowercase) -> resolved numeric user id, so we stop
 *     spending a userByUsername lookup on every single cycle for accounts
 *     whose id essentially never changes.
 *   - sinceIds: handle (lowercase) -> newest tweet id we've already logged,
 *     passed as `since_id` so userTimeline only returns genuinely new
 *     tweets instead of re-pulling the same recent posts every 10 minutes.
 * Shared only by the automated watch/draft/post cycle — manual `npm run
 * news` previews intentionally don't touch this, so a preview run can never
 * advance since_id and cause the real loop to miss a tip it never logged.
 */
export async function loadXCursors() {
  const c = await readJson(CURSORS_PATH, {});
  c.userIds ||= {};
  c.sinceIds ||= {};
  return c;
}

export async function saveXCursors(cursors) {
  await writeJson(CURSORS_PATH, cursors);
}

/** ISO week id like "2026-W32" for weekly scorecards. */
export function isoWeek(date = new Date()) {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const day = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const week = Math.ceil(((d - yearStart) / 86400_000 + 1) / 7);
  return `${d.getUTCFullYear()}-W${String(week).padStart(2, "0")}`;
}
