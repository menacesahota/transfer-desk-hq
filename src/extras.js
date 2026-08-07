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
import {
  computeRumourUpdates,
  rumourWatchStateKey,
  buildRumourWatchPost,
} from "./rumourwatch.js";
import {
  computeContractWatch,
  contractWatchPostKey,
  buildContractWatchPost,
} from "./contractwatch.js";
import {
  computeBirthdaysToday,
  computeOnThisDaySignings,
  almanacPostKey,
  buildAlmanacPost,
} from "./almanac.js";
import { SMOKETEST_KEY, smokeTestEnabled, buildSmokeTestPost } from "./smoketest.js";
import { postTweet, saveDraft } from "./post.js";
import { verifyStory, hasSerperKey } from "./verify.js";

const MAX_EXTRAS_PER_CYCLE = Number(process.env.MAX_EXTRAS_PER_CYCLE || 2);
const RADAR_HOUR = Number(process.env.RADAR_HOUR ?? 9); // UTC hour; -1 = off
const RADAR_MIN_ITEMS = Number(process.env.RADAR_MIN_ITEMS || 3);
const CONTRACTWATCH_HOUR = Number(process.env.CONTRACTWATCH_HOUR ?? 11); // UTC hour; -1 = off
const CONTRACTWATCH_MIN_ITEMS = Number(process.env.CONTRACTWATCH_MIN_ITEMS || 2);
const ALMANAC_HOUR = Number(process.env.ALMANAC_HOUR ?? 8); // UTC hour; -1 = off
const SCORECARD_DAY = Number(process.env.SCORECARD_DAY ?? 0); // 0 = Sunday, -1 = off
const PULSE_EVERY_CYCLES = Number(process.env.PULSE_EVERY_CYCLES || 0); // 0 = manual only

const WEIGHTS = Object.fromEntries(
  BREAKERS.map((b) => [b.handle.toLowerCase(), b.weight])
);

/** Log every newsworthy tip from this cycle (also RSS — still useful signal). */
export async function logCycleTips(tips) {
  return recordTips(tips, { weights: WEIGHTS });
}

export function describeError(err) {
  // twitter-api-v2 errors carry the real reason in .data / .code, which the
  // generic err.message ("Request failed.") hides completely.
  const parts = [];
  if (err?.code) parts.push(`code=${err.code}`);
  if (err?.data?.status) parts.push(`status=${err.data.status}`);
  if (err?.data?.title) parts.push(err.data.title);
  if (err?.data?.detail) parts.push(err.data.detail);
  if (Array.isArray(err?.data?.errors)) {
    parts.push(err.data.errors.map((e) => e.message || e.code).join("; "));
  }
  if (!parts.length) parts.push(err?.message || String(err));
  return parts.join(" | ");
}

/**
 * Publish or draft one item. Never throws — a failed post (bad credentials,
 * rate limit, network blip) must not take down the rest of the cycle or
 * skip saveState for everything else that already succeeded.
 */
/**
 * Live fact-check gate — every post asserting a specific player+club story
 * goes through this before publishing. Two independent checks (see
 * verify.js): is this actually a real player (always on, free, catches
 * category errors like a club name ending up in the player slot), and does
 * recent web news corroborate the move without saying it fell through
 * (opt-in, needs SERPER_API_KEY). Internal consistency checks elsewhere
 * (direction fully resolved, staff/nickname handling, etc.) catch the
 * parser being wrong about its OWN data; this catches it being internally
 * coherent but wrong about what's actually true.
 */
async function factCheck({ kind, player, to, from, stage }) {
  const result = await verifyStory({ player, to, from, stage });
  if (!result.verified) {
    console.log(`[${kind}] HELD (not posted) — ${player}: ${result.reason}`);
  } else if (hasSerperKey()) {
    console.log(`[${kind}] fact-check ok — ${player}: ${result.reason}`);
  }
  return result.verified;
}

/** Filter a list of {player, to?, from?, club?, stage} items down to only the ones that pass factCheck. */
async function factCheckAll(kind, items) {
  const kept = [];
  for (const item of items) {
    if (await factCheck({ kind, player: item.player, to: item.to ?? item.club, from: item.from, stage: item.stage })) {
      kept.push(item);
    }
  }
  return kept;
}

async function publishExtra({ text, kind, publish, replyTo, localImage }) {
  try {
    if (publish) {
      const posted = await postTweet(text, { replyTo, localImage, imageContentType: "image/png" });
      console.log(`Posted ${kind}: https://x.com/TransferDeskHQ/status/${posted.id}`);
      return { ok: true, posted };
    }
    const file = await saveDraft({ handle: `desk-${kind}`, kind, draft: text, localImage });
    console.log(`Saved ${kind} draft: ${file}`);
    return { ok: true, posted: null };
  } catch (err) {
    console.error(`FAILED to publish ${kind}: ${describeError(err)}`);
    return { ok: false, posted: null };
  }
}

/**
 * Run after tips are processed. Emits due consensus + saga posts (capped),
 * plus the weekly scorecard and optional pulse.
 */
export async function runExtras({ publish = false, cycleCount = 0 } = {}) {
  const state = await loadState();

  // 0) One-time pipeline smoke test — doesn't need any tip data, so it can
  // fire on the very first cycle and give an immediate yes/no signal on
  // whether posting actually works. Never counts against the per-cycle cap;
  // keeps quietly retrying each cycle until it succeeds once, then never
  // runs again.
  if (smokeTestEnabled() && !hasPosted(state, SMOKETEST_KEY)) {
    const text = buildSmokeTestPost();
    console.log(`\n[smoketest]\n${text}\n`);
    const result = await publishExtra({ text, kind: "smoketest", publish });
    if (result.ok) markPosted(state, SMOKETEST_KEY);
    await saveState(state);
  }

  const log = await loadLog();
  if (!log.length) return;
  let emitted = 0;

  // Every step below is isolated (publishExtra never throws) and state is
  // saved in a `finally` so one failing post — bad credentials, a rate
  // limit, a network blip — can never wipe out progress from the rest of
  // the cycle or block every other feature from being attempted.
  try {
    // 1) Consensus posts (includes first-to-break credit)
    for (const cluster of findClusters(log)) {
      if (emitted >= MAX_EXTRAS_PER_CYCLE) break;
      const key = clusterPostKey(cluster);
      if (hasPosted(state, key) || !cluster.player) continue;
      if (!(await factCheck({ kind: "consensus", player: cluster.player, to: cluster.move?.to, from: cluster.move?.from, stage: cluster.stage }))) continue;
      const text = buildConsensusPost(cluster);
      console.log(`\n[consensus] ${cluster.player} (${cluster.sources} sources)\n${text}\n`);
      const result = await publishExtra({ text, kind: "consensus", publish });
      if (result.ok) markPosted(state, key);
      emitted++;
    }

    // 2) Saga updates, threaded onto the previous saga post when possible
    for (const saga of buildSagas(log)) {
      if (emitted >= MAX_EXTRAS_PER_CYCLE) break;
      const key = sagaPostKey(saga);
      if (hasPosted(state, key) || !saga.player) continue;
      if (!(await factCheck({ kind: "saga", player: saga.player, to: saga.move?.to, from: saga.move?.from, stage: saga.stage }))) continue;
      const text = buildSagaPost(saga);
      console.log(`\n[saga] ${saga.player} day ${saga.day}\n${text}\n`);
      const result = await publishExtra({
        text,
        kind: "saga",
        publish,
        replyTo: state.sagaThreads[saga.playerKey],
      });
      if (result.ok) {
        if (result.posted?.id) state.sagaThreads[saga.playerKey] = result.posted.id;
        markPosted(state, key);
      }
      emitted++;
    }

    // 3) Rumour Watch — reactive single-story odds updates, independent of
    // the shared consensus/saga cap (self-limited via RUMOURWATCH_MAX_PER_CYCLE)
    for (const item of computeRumourUpdates(log, state.rumourWatch)) {
      if (!(await factCheck({ kind: "rumourwatch", player: item.player, to: item.to, from: item.from, stage: item.stage }))) continue;
      const text = buildRumourWatchPost(item);
      console.log(`\n[rumourwatch] ${item.player} ${item.previous ?? "-"}% -> ${item.likelihood}%\n${text}\n`);
      const result = await publishExtra({ text, kind: "rumourwatch", publish });
      if (result.ok) {
        state.rumourWatch[rumourWatchStateKey(item)] = {
          pct: item.likelihood,
          postedAt: new Date().toISOString(),
        };
      }
    }

    // 4) Weekly scorecard
    if (SCORECARD_DAY >= 0 && new Date().getDay() === SCORECARD_DAY) {
      const week = isoWeek();
      const key = scorecardPostKey(week);
      if (!hasPosted(state, key)) {
        const scores = computeScores(log);
        if (scores.length >= 2) {
          const text = buildScorecardPost(scores, { week });
          console.log(`\n[scorecard]\n${text}\n`);
          const result = await publishExtra({ text, kind: "scorecard", publish });
          if (result.ok) markPosted(state, key);
        }
      }
    }

    // 5) Daily rumour radar (first cycle after RADAR_HOUR UTC)
    if (RADAR_HOUR >= 0 && new Date().getUTCHours() >= RADAR_HOUR) {
      const key = radarPostKey();
      if (!hasPosted(state, key)) {
        const items = await factCheckAll("radar", computeOdds(log));
        if (items.length >= RADAR_MIN_ITEMS) {
          const text = buildRadarPost(items);
          console.log(`\n[radar]\n${text}\n`);
          const result = await publishExtra({ text, kind: "radar", publish });
          if (result.ok) markPosted(state, key);
        }
      }
    }

    // 6) Daily contract watch — renewals, which the radar deliberately excludes
    if (CONTRACTWATCH_HOUR >= 0 && new Date().getUTCHours() >= CONTRACTWATCH_HOUR) {
      const key = contractWatchPostKey();
      if (!hasPosted(state, key)) {
        const items = await factCheckAll("contractwatch", computeContractWatch(log));
        if (items.length >= CONTRACTWATCH_MIN_ITEMS) {
          const text = buildContractWatchPost(items);
          console.log(`\n[contractwatch]\n${text}\n`);
          const result = await publishExtra({ text, kind: "contractwatch", publish });
          if (result.ok) markPosted(state, key);
        }
      }
    }

    // 7) Daily almanac — birthdays (TheSportsDB) + on-this-day confirmed
    // signings drawn from the desk's OWN historical log. No fact-check gate
    // needed here: birthdays are resolved live against TheSportsDB itself
    // (already a verification source), and on-this-day only ever restates
    // something the desk already logged from a real breaker tip.
    if (ALMANAC_HOUR >= 0 && new Date().getUTCHours() >= ALMANAC_HOUR) {
      const key = almanacPostKey();
      if (!hasPosted(state, key)) {
        const birthdays = await computeBirthdaysToday(log);
        const onThisDay = computeOnThisDaySignings(log);
        const text = buildAlmanacPost(birthdays, onThisDay);
        if (text) {
          console.log(`\n[almanac]\n${text}\n`);
          const result = await publishExtra({ text, kind: "almanac", publish });
          if (result.ok) markPosted(state, key);
        }
      }
    }

    // 8) Pulse (opt-in from watch via PULSE_EVERY_CYCLES; e.g. deadline day)
    if (PULSE_EVERY_CYCLES > 0 && cycleCount > 0 && cycleCount % PULSE_EVERY_CYCLES === 0) {
      await emitPulse({ publish, state });
    }
  } catch (err) {
    // Belt-and-braces: a bug in the compute/build step (not the publish
    // step, which is already isolated) should still not lose state.
    console.error(`runExtras: unexpected error, saving progress anyway: ${describeError(err)}`);
  } finally {
    await saveState(state);
  }
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
  const result = await publishExtra({ text, kind: "pulse", publish, localImage: card });
  if (result.ok) markPosted(ownState, key);
  if (!state) await saveState(ownState);
}
