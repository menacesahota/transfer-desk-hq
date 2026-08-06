import "dotenv/config";
import { fetchNews } from "./news.js";
import { hasXCredentials, hasBearer, getUserClient } from "./x-client.js";
import { ensureDirs } from "./post.js";
import { logCycleTips, runExtras, emitPulse } from "./extras.js";
import { loadLog } from "./store.js";
import { findClusters, buildConsensusPost } from "./consensus.js";
import { buildSagas, sagaSummary, buildSagaPost } from "./saga.js";
import { computeScores, buildScorecardPost } from "./scorecard.js";

const cmd = process.argv[2] || "news";

async function verify() {
  console.log("Checking credentials…");
  console.log(`  OAuth 1.0a keys: ${hasXCredentials() ? "yes" : "NO"}`);
  console.log(`  Bearer token:    ${hasBearer() ? "yes" : "no"}`);
  console.log(`  POST_MODE:       ${process.env.POST_MODE || "draft"}`);

  if (!hasXCredentials()) {
    console.log("\nAdd keys to .env (from Developer Portal → your app → Keys).");
    console.log("Needed: X_API_KEY, X_API_SECRET, X_ACCESS_TOKEN, X_ACCESS_SECRET");
    process.exitCode = 1;
    return;
  }

  try {
    const me = await getUserClient().v2.me();
    console.log(`\nAuthenticated as @${me.data.username} (${me.data.name})`);
  } catch (err) {
    console.error("\nAuth failed:", err?.data || err.message);
    process.exitCode = 1;
  }
}

async function news() {
  const perSource = Number(process.env.POSTS_PER_SOURCE || 5);
  const { channel, tips, errors } = await fetchNews({ perSource, breakingOnly: false });

  console.log(`Channel: ${channel}`);
  if (errors?.length) {
    console.log("API notes:");
    for (const e of errors) console.log(`  - @${e.handle || "?"}: ${e.error}`);
  }

  if (!tips.length) {
    console.log("No tips found.");
    return;
  }

  const withImg = tips.filter((t) => t.imageUrl).length;
  console.log(`\n${tips.length} items (${withImg} with images):\n`);

  for (const tip of tips.slice(0, 12)) {
    console.log("─".repeat(48));
    console.log(`Source: @${tip.handle} (${tip.label})`);
    console.log(`Original: ${tip.original}`);
    console.log(`Draft:\n${tip.draft}`);
    console.log(`Image: ${tip.imageUrl || "(none)"}`);
    if (tip.link) console.log(`Link: ${tip.link}`);
    console.log();
  }
}

/**
 * One desk cycle: fetch breaker tips, log them for the desk features,
 * then emit any due desk posts (consensus / saga / scorecard / pulse).
 * Individual source tweets are never rewritten or reposted.
 */
async function runCycle({ publish, cycleCount = 0 }) {
  await ensureDirs();
  const perSource = Number(process.env.POSTS_PER_SOURCE || 5);
  const { channel, tips, errors } = await fetchNews({ perSource, breakingOnly: true });

  console.log(`Channel: ${channel}`);
  if (errors?.length) {
    for (const e of errors) console.log(`  API: @${e.handle || "?"}: ${e.error}`);
  }

  const logged = await logCycleTips(tips.filter((t) => t.source !== "error"));
  console.log(
    logged.length
      ? `Logged ${logged.length} tip(s) to the desk history.`
      : "No new tips this cycle."
  );

  await runExtras({ publish, cycleCount });
}

async function watch() {
  const mode = process.env.POST_MODE === "post" ? "post" : "draft";
  console.log(`Watching every 10 minutes (Ctrl+C to stop). Mode: ${mode}\n`);
  let cycle = 0;
  const tick = async () => {
    cycle++;
    try {
      await runCycle({ publish: mode === "post", cycleCount: cycle });
    } catch (err) {
      console.error("Watch cycle error:", err.message);
    }
  };
  await tick();
  setInterval(tick, 10 * 60 * 1000);
}

/* -------- desk data commands (read from the tip log) -------- */

async function consensus() {
  const clusters = findClusters(await loadLog());
  if (!clusters.length) return console.log("No multi-source stories in the window.");
  for (const c of clusters) {
    console.log("─".repeat(48));
    console.log(buildConsensusPost(c));
    console.log();
  }
}

async function sagas() {
  const list = buildSagas(await loadLog());
  if (!list.length) return console.log("No active sagas yet (need 2+ tips per player).");
  for (const s of list) {
    console.log("─".repeat(48));
    console.log(sagaSummary(s));
    console.log();
    console.log(buildSagaPost(s));
    console.log();
  }
}

async function scorecard() {
  const scores = computeScores(await loadLog());
  if (!scores.length) {
    return console.log(
      "Not enough settled claims yet - the scorecard needs a few weeks of logged tips."
    );
  }
  console.log(buildScorecardPost(scores));
}

async function pulse() {
  const publish = process.env.POST_MODE === "post" && process.argv[3] === "--post";
  await ensureDirs();
  await emitPulse({ publish, hours: Number(process.env.PULSE_HOURS || 24) });
}

const runners = {
  verify,
  news,
  draft: () => runCycle({ publish: false }),
  post: () => runCycle({ publish: true }),
  watch,
  consensus,
  sagas,
  scorecard,
  pulse,
};

if (!runners[cmd]) {
  console.log(
    "Usage: npm run news | draft | post | watch | verify | consensus | sagas | scorecard | pulse"
  );
  process.exit(1);
}

runners[cmd]().catch((err) => {
  console.error(err?.data || err);
  process.exit(1);
});
