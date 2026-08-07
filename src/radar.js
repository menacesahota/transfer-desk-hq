/**
 * Rumour Radar: daily post ranking active transfer rumours by likelihood.
 *
 * The percentage is a heuristic desk estimate built from logged signals:
 *   - deal stage reached (talks < bid < agreement < medical)
 *   - number of distinct sources on the story
 *   - reliability weight of those sources (config BREAKERS weights)
 *   - freshness / momentum (recent escalation up, stale stories decay)
 * It is presented as the desk's read, not a statistical claim.
 */

import { stageRank, resolveMove, moveLabel, entryPlayer, entryRenewal } from "./entities.js";

const ACTIVE_DAYS = Number(process.env.RADAR_ACTIVE_DAYS || 14);
const MAX_ITEMS = Number(process.env.RADAR_MAX_ITEMS || 5);

const STAGE_BASE = {
  interest: 18,
  talks: 32,
  bid: 48,
  agreement: 72,
  medical: 88,
};

/**
 * Score every active (not done, not renewal) rumour in the log, best first.
 * Unlike computeOdds() this does NOT truncate to the daily top N — used by
 * features (like rumour-watch) that need to consider every tracked story,
 * not just the ones that make the digest.
 */
export function scoreAllRumours(log, { now = Date.now() } = {}) {
  const cutoff = now - ACTIVE_DAYS * 86400_000;
  const byPlayer = new Map();

  for (const e of log) {
    if (!e.playerKey || !e.stage) continue;
    if (entryRenewal(e)) continue; // staying put is not a transfer rumour
    if (!byPlayer.has(e.playerKey)) byPlayer.set(e.playerKey, []);
    byPlayer.get(e.playerKey).push(e);
  }

  const items = [];
  for (const [key, entries] of byPlayer) {
    const events = [...entries].sort(
      (a, b) => new Date(a.createdAt) - new Date(b.createdAt)
    );
    const latest = events[events.length - 1];
    const latestAt = new Date(latest.createdAt).getTime();
    if (latestAt < cutoff) continue; // stale story

    const topStage = events.reduce(
      (best, e) => (stageRank(e.stage) > stageRank(best) ? e.stage : best),
      events[0].stage
    );
    if (topStage === "done") continue; // no longer a rumour

    const handles = [...new Set(events.map((e) => e.handle).filter(Boolean))];
    const avgWeight =
      events.reduce((a, e) => a + (e.weight ?? 5), 0) / events.length;

    let score = STAGE_BASE[topStage] ?? 18;
    score += Math.min(3, handles.length - 1) * 7; // corroboration
    score += ((avgWeight - 5) / 5) * 8; // source quality vs baseline

    // Momentum: stage escalated in the last 72h
    const recent = events.filter((e) => now - new Date(e.createdAt) < 72 * 3600_000);
    const olderTop = events
      .filter((e) => now - new Date(e.createdAt) >= 72 * 3600_000)
      .reduce((best, e) => Math.max(best, stageRank(e.stage)), 0);
    if (recent.some((e) => stageRank(e.stage) > olderTop)) score += 8;

    // Decay: quiet for 5+ days
    const quietDays = (now - latestAt) / 86400_000;
    if (quietDays > 5) score -= (quietDays - 5) * 3;

    score = Math.round(Math.max(5, Math.min(92, score)));

    const move = resolveMove(events);
    items.push({
      playerKey: key,
      player: events
        .map(entryPlayer)
        .filter(Boolean)
        .sort((a, b) => b.length - a.length)[0],
      to: move.to,
      from: move.from,
      stage: topStage,
      sources: handles.length,
      lead: events[0].handle,
      likelihood: score,
    });
  }

  return items.filter((i) => i.player).sort((a, b) => b.likelihood - a.likelihood);
}

/** Daily-digest view: same scoring, capped to the top N for the radar post. */
export function computeOdds(log, opts = {}) {
  return scoreAllRumours(log, opts).slice(0, MAX_ITEMS);
}

export function radarPostKey(now = new Date()) {
  return `radar:${now.toISOString().slice(0, 10)}`; // once per day
}

export function bar(pct) {
  const filled = Math.round(pct / 20); // 0–5 blocks
  return "▓".repeat(filled) + "░".repeat(5 - filled);
}

/** Build the daily radar post (≤280 chars). */
export function buildRadarPost(items, now = new Date()) {
  const date = now.toLocaleDateString("en-GB", { day: "numeric", month: "short" });
  const header = `RUMOUR RADAR | ${date}\n\nDesk odds on the moves being talked about:`;

  let lines = items.map(
    (i) => `${bar(i.likelihood)} ${i.likelihood}% ${moveLabel(i.player, i)}`
  );

  let post = `${header}\n\n${lines.join("\n")}`;
  while (post.length > 280 && lines.length > 3) {
    lines = lines.slice(0, -1);
    post = `${header}\n\n${lines.join("\n")}`;
  }
  if (post.length > 280) {
    post = `RUMOUR RADAR | ${date}\n\n${lines.slice(0, 3).join("\n")}`;
  }
  return post;
}
