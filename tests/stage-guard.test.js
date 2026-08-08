/**
 * Regression tests for the consensus/saga stage-regression bug: a real
 * live case (Ronald Araujo -> Liverpool) where the desk posted "Done deal",
 * then posted three follow-up "Medical" updates for the same story after
 * the tip that established "done" aged out of the (much shorter) consensus
 * window, making a later cycle's fresh stage computation come out lower.
 *
 * Root cause repro lives in findClusters() (see consensus.js) — these tests
 * cover the fix: a persistent, window-independent floor on the highest
 * stage ever announced per player, checked before every consensus/saga
 * post goes out.
 */
import { test } from "node:test";
import assert from "node:assert/strict";

import { stageHasRegressed, recordMaxStage } from "../src/stage-guard.js";
import { findClusters, clusterPostKey } from "../src/consensus.js";

function freshState() {
  return { maxStage: {} };
}

// --- stageHasRegressed / recordMaxStage -----------------------------------

test("stageHasRegressed: false before anything has ever been recorded for a player", () => {
  const state = freshState();
  assert.equal(stageHasRegressed(state, "ronald araujo", "medical"), false);
});

test("stageHasRegressed: true once a lower stage follows a higher one already recorded", () => {
  const state = freshState();
  recordMaxStage(state, "ronald araujo", "done");
  assert.equal(stageHasRegressed(state, "ronald araujo", "medical"), true);
  assert.equal(stageHasRegressed(state, "ronald araujo", "agreement"), true);
});

test("stageHasRegressed: true for a repeat of the exact same stage (belt-and-braces alongside hasPosted)", () => {
  const state = freshState();
  recordMaxStage(state, "ronald araujo", "medical");
  assert.equal(stageHasRegressed(state, "ronald araujo", "medical"), true);
});

test("stageHasRegressed: false for genuine forward progress", () => {
  const state = freshState();
  recordMaxStage(state, "ronald araujo", "agreement");
  assert.equal(stageHasRegressed(state, "ronald araujo", "medical"), false);
  assert.equal(stageHasRegressed(state, "ronald araujo", "done"), false);
});

test("recordMaxStage: never lowers an already-recorded peak", () => {
  const state = freshState();
  recordMaxStage(state, "ronald araujo", "done");
  recordMaxStage(state, "ronald araujo", "medical"); // a later, lower-stage post should never lower the floor
  assert.equal(stageHasRegressed(state, "ronald araujo", "done"), true); // done == done, still blocked as a repeat
});

test("stageHasRegressed: different players are tracked independently", () => {
  const state = freshState();
  recordMaxStage(state, "ronald araujo", "done");
  assert.equal(stageHasRegressed(state, "some other player", "interest"), false);
});

// --- clusterPostKey no longer varies with source count --------------------

test("clusterPostKey: stays stable as source count changes for the same stage", () => {
  const key1 = clusterPostKey({ playerKey: "ronald araujo", stage: "medical", sources: 3 });
  const key2 = clusterPostKey({ playerKey: "ronald araujo", stage: "medical", sources: 6 });
  assert.equal(key1, key2);
});

test("clusterPostKey: still differs across genuinely different stages", () => {
  const key1 = clusterPostKey({ playerKey: "ronald araujo", stage: "medical", sources: 4 });
  const key2 = clusterPostKey({ playerKey: "ronald araujo", stage: "done", sources: 4 });
  assert.notEqual(key1, key2);
});

// --- End-to-end repro: the exact live scenario -----------------------------

test("end-to-end: once the establishing 'done' tip ages out of a short window, the monotonic guard still blocks the regression the raw cluster computation would otherwise allow", () => {
  const now = Date.now();
  const log = [
    {
      id: "1",
      handle: "FabrizioRomano",
      original: "Here we go! Ronald Araujo to Liverpool, here we go! Done deal confirmed.",
      createdAt: new Date(now - 70 * 60000).toISOString(),
      stage: "done",
      playerKey: "ronald araujo",
      player: "Ronald Araujo",
      clubs: ["Liverpool", "Barcelona"],
    },
    {
      id: "3",
      handle: "greggevans40",
      original: "Ronald Araujo medical at Liverpool underway.",
      createdAt: new Date(now - 42 * 60000).toISOString(),
      stage: "medical",
      playerKey: "ronald araujo",
      player: "Ronald Araujo",
      clubs: ["Liverpool"],
    },
    {
      id: "4",
      handle: "JamesPearceLFC",
      original: "Ronald Araujo has completed his medical ahead of Liverpool move.",
      createdAt: new Date(now - 40 * 60000).toISOString(),
      stage: "medical",
      playerKey: "ronald araujo",
      player: "Ronald Araujo",
      clubs: ["Liverpool"],
    },
  ];

  // Step 1: cycle where the 'done' tip is still in-window -> posts "done",
  // and the app records that as the peak.
  const wideClusters = findClusters(log, { now, windowHours: 12 });
  assert.equal(wideClusters[0].stage, "done");
  const state = freshState();
  recordMaxStage(state, wideClusters[0].playerKey, wideClusters[0].stage);

  // Step 2: a later cycle where a short window has let the 'done' tip age
  // out — raw cluster computation regresses to "medical" on its own...
  const narrowClusters = findClusters(log, { now, windowHours: 1 });
  assert.equal(narrowClusters[0].stage, "medical"); // confirms the underlying window-aging behavior this guard exists for

  // ...but the monotonic guard catches it before a post would go out.
  assert.equal(stageHasRegressed(state, narrowClusters[0].playerKey, narrowClusters[0].stage), true);
});
