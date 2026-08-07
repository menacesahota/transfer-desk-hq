/**
 * Saga tracker: per-player transfer timelines.
 * A saga = all logged tips about one player. When the story advances a stage,
 * post a "Day N" timeline update, threaded onto the previous saga post.
 */

import { stageRank, stageLabel, resolveMove, moveLabel, entryPlayer, entryPlayerKey, entryRenewal, appendHashtags } from "./entities.js";

const SAGA_MIN_EVENTS = Number(process.env.SAGA_MIN_EVENTS || 2);
const SAGA_MAX_AGE_DAYS = Number(process.env.SAGA_MAX_AGE_DAYS || 45);

/** Build sagas from the log: one per playerKey with 2+ events. */
export function buildSagas(log, { now = Date.now() } = {}) {
  const cutoff = now - SAGA_MAX_AGE_DAYS * 86400_000;
  const byPlayer = new Map();

  for (const e of log) {
    if (!e.playerKey || !e.stage) continue;
    if (new Date(e.createdAt).getTime() < cutoff) continue;
    if (entryRenewal(e)) continue; // renewals are not transfer sagas
    const key = entryPlayerKey(e);
    if (!key) continue;
    if (!byPlayer.has(key)) byPlayer.set(key, []);
    byPlayer.get(key).push(e);
  }

  const sagas = [];
  for (const [key, entries] of byPlayer) {
    if (entries.length < SAGA_MIN_EVENTS) continue;
    const events = [...entries].sort(
      (a, b) => new Date(a.createdAt) - new Date(b.createdAt)
    );
    const first = events[0];
    const latest = events[events.length - 1];
    const day =
      Math.floor((new Date(latest.createdAt) - new Date(first.createdAt)) / 86400_000) + 1;
    const topStage = events.reduce(
      (best, e) => (stageRank(e.stage) > stageRank(best) ? e.stage : best),
      events[0].stage
    );
    const move = resolveMove(events);

    const player = events.map(entryPlayer).filter(Boolean).sort((a, b) => b.length - a.length)[0];
    if (!player) continue; // story has no credible player (club/manager news)

    sagas.push({
      playerKey: key,
      player,
      day,
      stage: topStage,
      done: topStage === "done",
      move,
      events,
      first,
      latest,
    });
  }

  return sagas.sort((a, b) => new Date(b.latest.createdAt) - new Date(a.latest.createdAt));
}


/**
 * A saga is worth posting when its latest event raised the max stage.
 * Key includes stage so each escalation posts once.
 */
export function sagaPostKey(saga) {
  return `saga:${saga.playerKey}:${saga.stage}`;
}

/** Milestone events: first occurrence of each stage, chronological. */
export function sagaMilestones(saga) {
  const seen = new Set();
  const out = [];
  for (const e of saga.events) {
    if (!e.stage || seen.has(e.stage)) continue;
    seen.add(e.stage);
    out.push(e);
  }
  return out.sort((a, b) => stageRank(a.stage) - stageRank(b.stage));
}

function shortDate(iso) {
  const d = new Date(iso);
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "short" });
}

/** Build the saga update post (≤280 chars). */
export function buildSagaPost(saga) {
  const title = moveLabel(saga.player, saga.move);
  const header = saga.done
    ? `SAGA COMPLETE | ${title}`
    : `SAGA DAY ${saga.day} | ${title}`;

  const milestones = sagaMilestones(saga);
  let lines = milestones.map(
    (e) => `${shortDate(e.createdAt)}: ${stageLabel(e.stage)} (@${e.handle})`
  );

  let post = `${header}\n\n${lines.join("\n")}`;
  while (post.length > 280 && lines.length > 2) {
    lines = lines.slice(1); // drop oldest milestones first
    post = `${header}\n\n…\n${lines.join("\n")}`;
  }
  if (post.length > 280) post = `${header}\n\n${lines[lines.length - 1]}`;
  return appendHashtags(post, [saga.move?.to, saga.move?.from]);
}

/** One-line summary for the CLI listing. */
export function sagaSummary(saga) {
  return `${moveLabel(saga.player, saga.move)} | day ${saga.day} | ${stageLabel(saga.stage)} | ${saga.events.length} tips from ${new Set(saga.events.map((e) => e.handle)).size} source(s)`;
}
