/**
 * Feature orchestrator: after each fetch cycle, decide which consensus,
 * saga, and scorecard posts are due. Respects the same publish/draft flow
 * as regular tips.
 */

import { BREAKERS } from "./config.js";
import { recordTips, loadLog, loadState, saveState, hasPosted, markPosted, isoWeek } from "./store.js";
import { findClusters, clusterPostKey, buildConsensusPost } from "./consensus.js";
import { buildSagas, sagaPostKey, buildSagaPost } from "./saga.js";
import { computeScores, scorecardPostKey, buildScorecardPost } from "./scorecard.js";
import { buildPulse, buildPulsePost, pulsePostKey, renderPulseCard } from "./pulse.js";
import { computeOdds, radarPostKey, buildRadarPost } from "./radar.js";
import { postTweet, saveDraft } from "./post.js";

const MAX_EXTRAS_PER_CYCLE = Number(process.env.MAX_EXTRAS_PER_CYCLE || 2);
const RADAR_HOUR = Number(process.env.RADAR_HOUR ?? 9); // UTC hour; -1 = off
const RADAR_MIN_ITEMS = Number(process.env.RADAR_MIN_ITEMS || 3);
const SCORECARD_DAY = Number(process.env.SCORECARD_DAY ?? 0); // 0 = Sunday, -1 = off
const PULSE_EVERY_CYCLES = Number(process.env.PULSE_EVERY_CYCLES || 0); // 0 = manual only

const WEIGHTS = Object.fromEntries(
  BREAKERS.map((b) => [b.handle.toLowerCase(), b.weight])
);

/** Log every newsworthy tip from this cycle (also RSS — still useful signal). */
export async function logCycleTips(tips) {
  return recordTips(tips, { weights: WEIGHTS });
}

async function publishExtra({ text, kind, publish, replyTo, localImage }) {
  if (publish) {
    const posted = await postTweet(text, { replyTo, localImage, imageContentType: "image/png" });
    console.log(`Posted ${kind}: https://x.com/TransferDeskHQ/status/${posted.id}`);
    return posted;
  }
  const file = await saveDraft({ handle: `desk-${kind}`, kind, draft: text, localImage });
  console.log(`Saved ${kind} draft: ${file}`);
  return null;
}

/**
 * Run after tips are processed. Emits due consensus + saga posts (capped),
 * plus the weekly scorecard and optional pulse.
 */
export async function runExtras({ publish = false, cycleCount = 0 } = {}) {
  const log = await loadLog();
  if (!log.length) return;
  const state = await loadState();
  let emitted = 0;

  // 1) Consensus posts (includes first-to-break credit)
  for (const cluster of findClusters(log)) {
    if (emitted >= MAX_EXTRAS_PER_CYCLE) break;
    const key = clusterPostKey(cluster);
    if (hasPosted(state, key) || !cluster.player) continue;
    const text = buildConsensusPost(cluster);
    console.log(`\n[consensus] ${cluster.player} (${cluster.sources} sources)\n${text}\n`);
    await publishExtra({ text, kind: "consensus", publish });
    markPosted(state, key);
    emitted++;
  }

  // 2) Saga updates, threaded onto the previous saga post when possible
  for (const saga of buildSagas(log)) {
    if (emitted >= MAX_EXTRAS_PER_CYCLE) break;
    const key = sagaPostKey(saga);
    if (hasPosted(state, key) || !saga.player) continue;
    const text = buildSagaPost(saga);
    console.log(`\n[saga] ${saga.player} day ${saga.day}\n${text}\n`);
    const posted = await publishExtra({
      text,
      kind: "saga",
      publish,
      replyTo: state.sagaThreads[saga.playerKey],
    });
    if (posted?.id) state.sagaThreads[saga.playerKey] = posted.id;
    markPosted(state, key);
    emitted++;
  }

  // 3) Weekly scorecard
  if (SCORECARD_DAY >= 0 && new Date().getDay() === SCORECARD_DAY) {
    const week = isoWeek();
    const key = scorecardPostKey(week);
    if (!hasPosted(state, key)) {
      const scores = computeScores(log);
      if (scores.length >= 2) {
        const text = buildScorecardPost(scores, { week });
        console.log(`\n[scorecard]\n${text}\n`);
        await publishExtra({ text, kind: "scorecard", publish });
        markPosted(state, key);
      }
    }
  }

  // 4) Daily rumour radar (first cycle after RADAR_HOUR UTC)
  if (RADAR_HOUR >= 0 && new Date().getUTCHours() >= RADAR_HOUR) {
    const key = radarPostKey();
    if (!hasPosted(state, key)) {
      const items = computeOdds(log);
      if (items.length >= RADAR_MIN_ITEMS) {
        const text = buildRadarPost(items);
        console.log(`\n[radar]\n${text}\n`);
        await publishExtra({ text, kind: "radar", publish });
        markPosted(state, key);
      }
    }
  }

  // 5) Pulse (opt-in from watch via PULSE_EVERY_CYCLES; e.g. deadline day)
  if (PULSE_EVERY_CYCLES > 0 && cycleCount > 0 && cycleCount % PULSE_EVERY_CYCLES === 0) {
    await emitPulse({ publish, state });
  }

  await saveState(state);
}

/** Build + emit a pulse post with its image card. Used by runExtras and `npm run pulse`. */
export async function emitPulse({ publish = false, state = null, hours } = {}) {
  const log = await loadLog();
  const ownState = state || (await loadState());
  const key = pulsePostKey();
  if (hasPosted(ownState, key)) {
    console.log("[pulse] already posted this hour, skipping");
    return;
  }
  const pulse = buildPulse(log, hours ? { hours } : {});
  const text = buildPulsePost(pulse);
  let card = null;
  try {
    card = await renderPulseCard(pulse);
  } catch (err) {
    console.warn(`[pulse] card render failed: ${err.message}`);
  }
  console.log(`\n[pulse]\n${text}\n${card ? `Card: ${card}` : ""}`);
  await publishExtra({ text, kind: "pulse", publish, localImage: card });
  markPosted(ownState, key);
  if (!state) await saveState(ownState);
}
