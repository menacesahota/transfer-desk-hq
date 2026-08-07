/**
 * Rumour Watch: reactive, per-story odds updates.
 *
 * Where Rumour Radar posts one daily leaderboard, Rumour Watch reacts as
 * individual stories move — posting a single-story update whenever a
 * tracked rumour's likelihood shifts meaningfully since the last update we
 * posted about it (or the first time a story crosses the minimum bar).
 * Scoring is the same desk heuristic as radar.js (stage, corroboration,
 * source quality, momentum, decay) — this just decides WHEN to speak up
 * about ONE story instead of ranking all of them once a day.
 */

import { scoreAllRumours, bar } from "./radar.js";
import { moveLabel, stageLabel } from "./entities.js";

const MIN_DELTA = Number(process.env.RUMOURWATCH_DELTA || 12);
const MIN_FIRST_LIKELIHOOD = Number(process.env.RUMOURWATCH_MIN_FIRST || 30);
const MIN_HOURS_BETWEEN = Number(process.env.RUMOURWATCH_COOLDOWN_HOURS || 3);
const MAX_PER_CYCLE = Number(process.env.RUMOURWATCH_MAX_PER_CYCLE || 1);

/**
 * Decide which active rumours are due an update post, given what we last
 * posted for each (from state.rumourWatch: { [playerKey]: { pct, postedAt } }).
 * Returns items ready to post, biggest move first, capped to MAX_PER_CYCLE.
 */
export function computeRumourUpdates(log, rumourWatchState = {}, { now = Date.now() } = {}) {
  const due = [];

  for (const item of scoreAllRumours(log, { now })) {
    const last = rumourWatchState[item.playerKey];

    if (last) {
      const hoursSince = (now - new Date(last.postedAt).getTime()) / 3600_000;
      if (hoursSince < MIN_HOURS_BETWEEN) continue;
      const delta = item.likelihood - last.pct;
      if (Math.abs(delta) < MIN_DELTA) continue;
      due.push({ ...item, previous: last.pct, delta });
    } else {
      if (item.likelihood < MIN_FIRST_LIKELIHOOD) continue; // too thin to lead with
      due.push({ ...item, previous: null, delta: null });
    }
  }

  // Biggest swings (or strongest fresh entries) first
  due.sort((a, b) => Math.abs(b.delta ?? b.likelihood) - Math.abs(a.delta ?? a.likelihood));
  return due.slice(0, MAX_PER_CYCLE);
}

/** Stable per-story key so cooldown/delta tracking survives restarts via feature-state.json. */
export function rumourWatchStateKey(item) {
  return item.playerKey;
}

/** Build the single-story update post (≤280 chars). */
export function buildRumourWatchPost(item) {
  const title = moveLabel(item.player, item);
  const trend =
    item.previous == null
      ? "first tracked odds"
      : item.delta > 0
        ? `up from ${item.previous}%`
        : `down from ${item.previous}%`;

  const detail = `${stageLabel(item.stage)} · ${item.sources} source${item.sources === 1 ? "" : "s"}, led by @${item.lead}`;

  let post = `RUMOUR WATCH | ${title}\n\n${bar(item.likelihood)} ${item.likelihood}% (${trend})\n\n${detail}`;
  if (post.length > 280) {
    post = `RUMOUR WATCH | ${title}\n\n${bar(item.likelihood)} ${item.likelihood}% (${trend})`;
  }
  return post;
}
