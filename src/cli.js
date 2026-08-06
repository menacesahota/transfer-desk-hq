import "dotenv/config";
import { fetchNews } from "./news.js";
import { hasXCredentials, hasBearer, getUserClient } from "./x-client.js";
import {
  ensureDirs,
  loadSeen,
  saveSeen,
  saveDraft,
  postTweet,
  enrichTipWithImage,
} from "./post.js";
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

async function draftOrPost({ publish, cycleCount = 0 }) {
  await ensureDirs();
  const seen = await loadSeen();
  const perSource = Number(process.env.POSTS_PER_SOURCE || 5);
  const { channel, tips, errors } = await fetchNews({ perSource, breakingOnly: true });

  console.log(`Channel: ${channel}`);
  if (errors?.length) {
    for (const e of errors) console.log(`  API: @${e.handle || "?"}: ${e.error}`);
  }

  // Log every newsworthy tip for consensus/saga/scorecard/pulse, even ones we
  // don't relay this cycle.
  const logged = await logCycleTips(tips.filter((t) => t.source !== "error"));
  if (logged.length) console.log(`Logged ${logged.length} tip(s) to the desk history.`);

  const fresh = tips.filter((t) => t.source !== "error" && !seen.has(t.id));
  if (!fresh.length) {
    console.log("No new breaking tips.");
    await runExtras({ publish });
    return;
  }

  // Trust the explicit `publish` flag only — don't let POST_MODE override it here.
  // (`watch()` already folds POST_MODE into `publish` before calling this; `draft`
  // must always stay local regardless of POST_MODE.)
  const mode = publish ? "post" : "draft";
  console.log(`Processing ${fresh.length} tip(s) in ${mode} mode…\n`);

  for (const tip of fresh.slice(0, Number(process.env.MAX_POSTS_PER_CYCLE || 3))) {
    const enriched = await enrichTipWithImage(tip);
    console.log(`@${enriched.handle}${enriched.kind === "rumour" ? " [RUMOUR]" : ""}:\n${enriched.draft}`);
    console.log(`Image: ${enriched.localImage || enriched.imageUrl || "(none)"}${enriched.usedBwImage ? " (B&W)" : ""}\n`);

    if (mode === "post") {
      const posted = await postTweet(enriched.draft, enriched);
      console.log(`Posted: https://x.com/TransferDeskHQ/status/${posted.id}`);
    } else {
      const file = await saveDraft(enriched);
      console.log(`Saved draft: ${file}`);
    }
    seen.add(tip.id);
  }

  await saveSeen(seen);
  await runExtras({ publish, cycleCount });
}

async function watch() {
  const mode = process.env.POST_MODE === "post" ? "post" : "draft";
  console.log(`Watching every 10 minutes (Ctrl+C to stop). Mode: ${mode}\n`);
  let cycle = 0;
  const tick = async () => {
    cycle++;
    try {
      await draftOrPost({ publish: mode === "post", cycleCount: cycle });
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
  draft: () => draftOrPost({ publish: false }),
  post: () => draftOrPost({ publish: true }),
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
