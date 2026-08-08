/**
 * Consensus meter + first-to-break credits.
 * When 2+ distinct breakers report the same player move within a window,
 * post a tiered "confirmed by N sources" update crediting who broke it first.
 */

import { stageRank, stageLabel, resolveMove, moveLabel, entryPlayer, entryPlayerKey, entryRenewal, appendHashtags } from "./entities.js";

const WINDOW_HOURS = Number(process.env.CONSENSUS_WINDOW_HOURS || 12);
const MIN_SOURCES = Number(process.env.CONSENSUS_MIN_SOURCES || 2);

/**
 * Cluster recent log entries by playerKey.
 * Returns clusters with 2+ distinct handles, newest first.
 */
export function findClusters(log, { windowHours = WINDOW_HOURS, now = Date.now() } = {}) {
  const cutoff = now - windowHours * 3600_000;
  const recent = log.filter(
    (e) =>
      e.playerKey &&
      new Date(e.createdAt).getTime() >= cutoff &&
      !entryRenewal(e) // contract renewals are not transfer stories
  );

  const byPlayer = new Map();
  for (const e of recent) {
    const key = entryPlayerKey(e);
    if (!key) continue;
    if (!byPlayer.has(key)) byPlayer.set(key, []);
    byPlayer.get(key).push(e);
  }

  const clusters = [];
  for (const [key, entries] of byPlayer) {
    const handles = new Set(entries.map((e) => e.handle?.toLowerCase()).filter(Boolean));
    if (handles.size < MIN_SOURCES) continue;

    const sorted = [...entries].sort(
      (a, b) => new Date(a.createdAt) - new Date(b.createdAt)
    );
    const first = sorted[0];
    const latest = sorted[sorted.length - 1];
    const topStage = sorted.reduce(
      (best, e) => (stageRank(e.stage) > stageRank(best) ? e.stage : best),
      sorted[0].stage
    );
    const move = resolveMove(sorted);
    const fee = sorted.map((e) => e.fee).filter((f) => f != null).sort((a, b) => b - a)[0] ?? null;

    clusters.push({
      playerKey: key,
      player: pickBestName(sorted),
      sources: handles.size,
      handles: [...new Set(sorted.map((e) => e.handle))],
      first,
      latest,
      stage: topStage,
      move,
      fee,
      entries: sorted,
    });
  }

  return clusters.sort(
    (a, b) => new Date(b.latest.createdAt) - new Date(a.latest.createdAt)
  );
}

function pickBestName(entries) {
  // Longest validated name is usually the fullest
  return entries
    .map(entryPlayer)
    .filter(Boolean)
    .sort((a, b) => b.length - a.length)[0];
}


/**
 * Stable key so each cluster+stage posts once. Deliberately does NOT
 * include the source count — that number naturally fluctuates as more
 * corroborating tips arrive (or as older ones age out of the consensus
 * window), and keying on it meant the exact same stage could re-post
 * every time the count ticked over, even for a story whose real-world
 * status hadn't changed at all.
 */
export function clusterPostKey(cluster) {
  return `consensus:${cluster.playerKey}:${cluster.stage}`;
}

function minutesBetween(a, b) {
  return Math.round((new Date(b) - new Date(a)) / 60_000);
}

function tierMark(sources) {
  if (sources >= 4) return "CONFIRMED BY 4+ SOURCES";
  if (sources === 3) return "CONFIRMED BY 3 SOURCES";
  return "BACKED BY 2 SOURCES";
}

/** Build the consensus post text (≤280 chars incl. credits). */
export function buildConsensusPost(cluster) {
  const { player, stage, fee, sources, first, entries } = cluster;

  const move = moveLabel(player, cluster.move);
  const feeStr = fee != null ? ` (~£${fee}m)` : "";
  const stageStr = stage ? ` | ${stageLabel(stage)}` : "";

  const second = entries.find((e) => e.handle !== first.handle);
  const gap = second ? minutesBetween(first.createdAt, second.createdAt) : null;
  const firstLine =
    gap != null && gap > 0
      ? `First: @${first.handle}, ${formatGap(gap)} ahead.`
      : `First: @${first.handle}.`;

  const others = [...new Set(entries.map((e) => e.handle))]
    .filter((h) => h !== first.handle)
    .slice(0, 3)
    .map((h) => `@${h}`)
    .join(" ");

  let post = `${tierMark(sources)}\n\n${move}${feeStr}${stageStr}\n\n${firstLine} Also: ${others}`;
  if (post.length > 280) {
    post = `${tierMark(sources)}\n\n${move}${stageStr}\n\n${firstLine}`;
  }
  return appendHashtags(post, [cluster.move?.to, cluster.move?.from]);
}

function formatGap(minutes) {
  if (minutes < 60) return `${minutes} min`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m ? `${h}h ${m}m` : `${h}h`;
}
