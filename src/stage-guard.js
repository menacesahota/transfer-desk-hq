/**
 * Monotonic stage guard for consensus/saga posts — persisted in
 * state.maxStage, independent of the tip log's rolling time window.
 *
 * findClusters()/buildSagas() only look at whatever's currently inside
 * their window (12h / 45d), recomputed fresh every cycle. Once the tip
 * that established a story's highest stage (say "done") ages out of that
 * window, the NEXT cycle's max-rank calculation over the remaining,
 * lower-stage tips silently comes out lower ("medical") — a real story
 * that's already confirmed done then gets a follow-up post announcing a
 * less-advanced status, which is never true (a real-world transfer's
 * status doesn't reverse just because time passed). This guard remembers
 * the peak stage ever posted about a player permanently, so a later
 * cycle's recomputation can never walk it backwards in what actually gets
 * published, regardless of what's aged out of the log's window.
 *
 * Kept in its own module (no import of extras.js's post/media dependency
 * chain) so it's cheap to import from tests and, in principle, reusable by
 * other features later without pulling in sharp/twitter-api-v2.
 */

import { stageRank } from "./entities.js";

export function stageHasRegressed(state, playerKey, stage) {
  const seenRank = state.maxStage[playerKey] || 0;
  return stageRank(stage) <= seenRank && seenRank > 0;
}

export function recordMaxStage(state, playerKey, stage) {
  state.maxStage[playerKey] = Math.max(state.maxStage[playerKey] || 0, stageRank(stage));
}
