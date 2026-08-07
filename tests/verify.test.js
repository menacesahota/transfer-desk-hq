/**
 * Regression tests for src/verify.js — the live fact-check layer added
 * after real wrong posts (Al Gharafa mistaken for a player, Yan Diomande
 * posted as PSG-bound after PSG had already pulled out). global.fetch is
 * mocked so these run offline and deterministically; each test uses a
 * unique player/query name to avoid the module's internal TTL caches
 * bleeding results between cases.
 */
import { test } from "node:test";
import assert from "node:assert/strict";

import { isKnownPlayer, verifyMove, verifyStory } from "../src/verify.js";

function withFetch(t, impl) {
  const original = global.fetch;
  global.fetch = impl;
  t.after(() => {
    global.fetch = original;
  });
}

function withSerperKey(t, value) {
  const original = process.env.SERPER_API_KEY;
  if (value === undefined) delete process.env.SERPER_API_KEY;
  else process.env.SERPER_API_KEY = value;
  t.after(() => {
    if (original === undefined) delete process.env.SERPER_API_KEY;
    else process.env.SERPER_API_KEY = original;
  });
}

function sportsDbResponse(players) {
  return { ok: true, json: async () => ({ player: players }) };
}

function serperResponse(news) {
  return { ok: true, json: async () => ({ news }) };
}

// --- isKnownPlayer -----------------------------------------------------

test("isKnownPlayer: known real footballer -> known true", async (t) => {
  withFetch(t, async () =>
    sportsDbResponse([{ strPlayer: "Test Player Alpha", strTeam: "Some FC", strSport: "Soccer" }])
  );
  const result = await isKnownPlayer("Test Player Alpha");
  assert.equal(result.known, true);
});

test("isKnownPlayer: no matching player (Al Gharafa case) -> known false", async (t) => {
  withFetch(t, async () => sportsDbResponse(null));
  const result = await isKnownPlayer("Al Gharafa Test Case");
  assert.equal(result.known, false);
});

test("isKnownPlayer: non-soccer namesake filtered out -> known false", async (t) => {
  withFetch(t, async () =>
    sportsDbResponse([{ strPlayer: "Test Player Beta", strTeam: "Some NBA Team", strSport: "Basketball" }])
  );
  const result = await isKnownPlayer("Test Player Beta");
  assert.equal(result.known, false);
});

test("isKnownPlayer: fails OPEN on network error, does not silently block real news", async (t) => {
  withFetch(t, async () => {
    throw new Error("network down");
  });
  const result = await isKnownPlayer("Test Player Gamma");
  assert.equal(result.known, true);
  assert.match(result.reason, /lookup failed/);
});

// --- verifyMove ----------------------------------------------------------

test("verifyMove: no SERPER_API_KEY -> skipped, verified true", async (t) => {
  withSerperKey(t, undefined);
  const result = await verifyMove({ player: "Test Player Delta", to: "Arsenal" });
  assert.equal(result.verified, true);
  assert.match(result.reason, /skipped/);
});

test("verifyMove: corroborating news, no reversal language -> verified true", async (t) => {
  withSerperKey(t, "test-key");
  withFetch(t, async () =>
    serperResponse([
      { title: "Test Player Epsilon set to join Arsenal", snippet: "Arsenal are closing in on Test Player Epsilon." },
    ])
  );
  const result = await verifyMove({ player: "Test Player Epsilon", to: "Arsenal" });
  assert.equal(result.verified, true);
});

test("verifyMove: reversed story (Diomande/PSG case) -> held, not posted", async (t) => {
  withSerperKey(t, "test-key");
  withFetch(t, async () =>
    serperResponse([
      {
        title: "Arsenal pull out of race for Test Player Zeta",
        snippet: "Test Player Zeta will not join Arsenal after they pulled out of the deal.",
      },
    ])
  );
  const result = await verifyMove({ player: "Test Player Zeta", to: "Arsenal" });
  assert.equal(result.verified, false);
  assert.match(result.reason, /did NOT happen/);
});

test("verifyMove: no corroborating results at all -> held", async (t) => {
  withSerperKey(t, "test-key");
  withFetch(t, async () => serperResponse([]));
  const result = await verifyMove({ player: "Test Player Eta", to: "Arsenal" });
  assert.equal(result.verified, false);
  assert.match(result.reason, /no recent web results/);
});

test("verifyMove: fails OPEN on search error", async (t) => {
  withSerperKey(t, "test-key");
  withFetch(t, async () => {
    throw new Error("Serper down");
  });
  const result = await verifyMove({ player: "Test Player Theta", to: "Arsenal" });
  assert.equal(result.verified, true);
  assert.match(result.reason, /search failed/);
});

// --- verifyStory (combined identity + move check) -------------------------

test("verifyStory: unrecognised player (category error) holds before even checking news", async (t) => {
  withSerperKey(t, "test-key");
  withFetch(t, async (url) => {
    if (String(url).includes("thesportsdb")) return sportsDbResponse(null);
    // Should never reach the news search once identity fails.
    throw new Error("verifyMove should not run when identity check fails");
  });
  const result = await verifyStory({ player: "Test Club Not A Player", to: "Arsenal" });
  assert.equal(result.verified, false);
  assert.equal(result.stage, "identity");
});

test("verifyStory: recognised player + corroborating news -> verified true", async (t) => {
  withSerperKey(t, "test-key");
  withFetch(t, async (url) => {
    if (String(url).includes("thesportsdb")) {
      return sportsDbResponse([{ strPlayer: "Test Player Iota", strTeam: "Some FC", strSport: "Soccer" }]);
    }
    return serperResponse([
      { title: "Test Player Iota set to join Arsenal", snippet: "Arsenal are closing in on Test Player Iota." },
    ]);
  });
  const result = await verifyStory({ player: "Test Player Iota", to: "Arsenal" });
  assert.equal(result.verified, true);
  assert.equal(result.stage, "move");
});
