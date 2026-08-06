/**
 * Breaker scorecard: how reliable is each source?
 * A "claim" = a tip at agreement/medical/done stage. It verifies if the same
 * player later (or already) reaches "done" — from any source — within the window.
 */

import { stageRank } from "./entities.js";

const VERIFY_WINDOW_DAYS = Number(process.env.SCORECARD_VERIFY_DAYS || 21);
const MIN_CLAIMS = Number(process.env.SCORECARD_MIN_CLAIMS || 3);
const CLAIM_MIN_RANK = stageRank("agreement");

/**
 * Compute per-handle reliability from the log.
 * Pending claims (younger than the verify window, not yet done) don't count
 * against a source.
 */
export function computeScores(log, { now = Date.now() } = {}) {
  const doneByPlayer = new Map();
  for (const e of log) {
    if (e.playerKey && e.stage === "done") {
      const t = new Date(e.createdAt).getTime();
      const prev = doneByPlayer.get(e.playerKey);
      if (prev == null || t < prev) doneByPlayer.set(e.playerKey, t);
    }
  }

  const perHandle = new Map();
  for (const e of log) {
    if (!e.playerKey || stageRank(e.stage) < CLAIM_MIN_RANK) continue;
    const t = new Date(e.createdAt).getTime();
    const doneAt = doneByPlayer.get(e.playerKey);
    const windowMs = VERIFY_WINDOW_DAYS * 86400_000;

    let outcome;
    if (doneAt != null && Math.abs(doneAt - t) <= windowMs) outcome = "hit";
    else if (now - t < windowMs) outcome = "pending";
    else outcome = "miss";

    const key = e.handle || "?";
    if (!perHandle.has(key)) {
      perHandle.set(key, { handle: key, label: e.label, hits: 0, misses: 0, pending: 0 });
    }
    const s = perHandle.get(key);
    if (outcome === "hit") s.hits++;
    else if (outcome === "miss") s.misses++;
    else s.pending++;
  }

  const scores = [];
  for (const s of perHandle.values()) {
    const settled = s.hits + s.misses;
    scores.push({
      ...s,
      claims: settled + s.pending,
      settled,
      accuracy: settled ? s.hits / settled : null,
    });
  }

  return scores
    .filter((s) => s.settled >= MIN_CLAIMS)
    .sort((a, b) => (b.accuracy ?? 0) - (a.accuracy ?? 0) || b.settled - a.settled);
}

export function scorecardPostKey(week) {
  return `scorecard:${week}`;
}

const MEDALS = ["🥇", "🥈", "🥉"];

/** Weekly reliability table post (≤280 chars). */
export function buildScorecardPost(scores, { week } = {}) {
  const header = `BREAKER SCORECARD${week ? ` | ${week.replace("-W", " week ")}` : ""}\n\nAdvanced claims that became done deals:`;

  let rows = scores.slice(0, 6).map((s, i) => {
    const mark = MEDALS[i] || `${i + 1}.`;
    const pct = Math.round((s.accuracy ?? 0) * 100);
    return `${mark} @${s.handle} ${pct}% (${s.hits}/${s.settled})`;
  });

  let post = `${header}\n${rows.join("\n")}\n\nTracked from every tip we log.`;
  while (post.length > 280 && rows.length > 3) {
    rows = rows.slice(0, -1);
    post = `${header}\n${rows.join("\n")}`;
  }
  if (post.length > 280) post = `${header}\n${rows.slice(0, 3).join("\n")}`;
  return post;
}
