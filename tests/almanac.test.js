/**
 * Regression tests for src/almanac.js. Uses a temp TRANSFER_DESK_STORAGE
 * dir (via dynamic import, so the env var is set before store.js's
 * module-level STORAGE_DIR constant is computed) and a mocked global.fetch
 * so these run offline and don't touch the real birthday cache file.
 */
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

let computeBirthdaysToday, computeOnThisDaySignings, buildAlmanacPost;
let saveBirthdayCache;
let tmpDir;

before(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "almanac-test-"));
  process.env.TRANSFER_DESK_STORAGE = tmpDir;
  ({ computeBirthdaysToday, computeOnThisDaySignings, buildAlmanacPost } = await import("../src/almanac.js"));
  ({ saveBirthdayCache } = await import("../src/store.js"));
});

after(async () => {
  await fs.rm(tmpDir, { recursive: true, force: true });
});

function withFetch(t, impl) {
  const original = global.fetch;
  global.fetch = impl;
  t.after(() => {
    global.fetch = original;
  });
}

/**
 * The birthday pool always includes the full curated legends/notable-players
 * list (dozens of names) on top of whatever the test's own log contains, so
 * every birthdays test needs (a) a clean cache — the cache is a single file
 * shared across this whole test file, and (b) a URL-aware fetch mock that
 * only "finds" the name(s) the test cares about, returning "not found" for
 * every curated name so they don't pollute the result with spurious matches.
 */
async function freshCache() {
  await saveBirthdayCache({});
}

function fetchFor(matchers) {
  return async (url) => {
    const u = String(url);
    for (const [needle, response] of matchers) {
      if (u.includes(needle)) return response;
    }
    return { ok: true, json: async () => ({ player: null }) };
  };
}

// --- computeOnThisDaySignings ------------------------------------------

test("on-this-day: confirmed signing from a previous year on the same month/day is included", () => {
  const now = new Date("2026-08-07T12:00:00Z");
  const log = [
    {
      id: "1",
      original: "OFFICIAL: Test Player Nine signs for Arsenal",
      createdAt: "2022-08-07T10:00:00.000Z",
    },
  ];
  const items = computeOnThisDaySignings(log, { now });
  assert.equal(items.length, 1);
  assert.equal(items[0].player, "Test Player Nine");
  assert.equal(items[0].club, "Arsenal");
  assert.equal(items[0].year, 2022);
});

test("on-this-day: excludes an entry from today's own year (not history yet)", () => {
  const now = new Date("2026-08-07T12:00:00Z");
  const log = [
    { id: "1", original: "OFFICIAL: Test Player Ten signs for Arsenal", createdAt: "2026-08-07T09:00:00.000Z" },
  ];
  assert.deepEqual(computeOnThisDaySignings(log, { now }), []);
});

test("on-this-day: excludes a different month/day", () => {
  const now = new Date("2026-08-07T12:00:00Z");
  const log = [
    { id: "1", original: "OFFICIAL: Test Player Eleven signs for Arsenal", createdAt: "2022-03-01T09:00:00.000Z" },
  ];
  assert.deepEqual(computeOnThisDaySignings(log, { now }), []);
});

test("on-this-day: excludes a renewal (staying, not joining)", () => {
  const now = new Date("2026-08-07T12:00:00Z");
  const log = [
    {
      id: "1",
      original: "Test Player Twelve signs a new long-term contract at Arsenal",
      createdAt: "2022-08-07T09:00:00.000Z",
    },
  ];
  assert.deepEqual(computeOnThisDaySignings(log, { now }), []);
});

test("on-this-day: excludes a non-done stage even on the right date", () => {
  const now = new Date("2026-08-07T12:00:00Z");
  const log = [
    { id: "1", original: "Test Player Thirteen linked with a move to Arsenal", createdAt: "2022-08-07T09:00:00.000Z" },
  ];
  assert.deepEqual(computeOnThisDaySignings(log, { now }), []);
});

// --- buildAlmanacPost ----------------------------------------------------

test("buildAlmanacPost: nothing to report -> null", () => {
  assert.equal(buildAlmanacPost([], []), null);
});

test("buildAlmanacPost: includes birthday and on-this-day lines within 280 chars", () => {
  const post = buildAlmanacPost(
    [{ player: "Test Player Fourteen", age: 29, club: "Arsenal" }],
    [{ player: "Test Player Fifteen", club: "Chelsea", year: 2019 }]
  );
  assert.ok(post.includes("Test Player Fourteen turns 29"));
  assert.ok(post.includes("2019: Test Player Fifteen joined Chelsea"));
  assert.ok(post.length <= 280);
});

test("buildAlmanacPost: truncates rather than exceeding 280 chars", () => {
  const onThisDay = Array.from({ length: 12 }, (_, i) => ({
    player: `Test Long Player Name Number ${i}`,
    club: "Nottingham Forest",
    year: 2010 + i,
  }));
  const post = buildAlmanacPost([], onThisDay);
  assert.ok(post === null || post.length <= 280);
});

// --- computeBirthdaysToday (mocked TheSportsDB + temp cache dir) ---------

test("birthdays: a tracked player whose cached birth date matches today is included", async (t) => {
  await freshCache();
  const now = new Date("2026-08-07T12:00:00Z");
  let sixteenCalls = 0;
  withFetch(t, async (url) => {
    if (String(url).includes("Test_Player_Sixteen")) {
      sixteenCalls++;
      return { ok: true, json: async () => ({ player: [{ strPlayer: "Test Player Sixteen", dateBorn: "1997-08-07", strSport: "Soccer" }] }) };
    }
    return { ok: true, json: async () => ({ player: null }) };
  });
  const log = [
    { id: "1", original: "Test Player Sixteen linked with Arsenal move", createdAt: now.toISOString() },
  ];
  const first = await computeBirthdaysToday(log, { now });
  assert.deepEqual(
    first.map((r) => r.player),
    ["Test Player Sixteen"]
  );
  assert.equal(first[0].age, 29);
  assert.equal(sixteenCalls, 1);

  // Second call for the same player should hit the persisted cache for that
  // specific player, not fetch it again.
  await computeBirthdaysToday(log, { now });
  assert.equal(sixteenCalls, 1);
});

test("birthdays: no match found (null dateBorn) is cached and excluded, not re-fetched", async (t) => {
  await freshCache();
  const now = new Date("2026-08-07T12:00:00Z");
  let seventeenCalls = 0;
  withFetch(t, async (url) => {
    if (String(url).includes("Test_Player_Seventeen")) seventeenCalls++;
    return { ok: true, json: async () => ({ player: null }) };
  });
  const log = [
    { id: "1", original: "Test Player Seventeen linked with Chelsea move", createdAt: now.toISOString() },
  ];
  const first = await computeBirthdaysToday(log, { now });
  assert.deepEqual(first, []);
  await computeBirthdaysToday(log, { now });
  assert.equal(seventeenCalls, 1); // second run hits the cached "not found" result instead of re-querying
});

test("birthdays: curated legend/notable names are checked even with an empty tip log", async (t) => {
  await freshCache();
  withFetch(
    t,
    fetchFor([
      [
        "Erling_Haaland",
        { ok: true, json: async () => ({ player: [{ strPlayer: "Erling Haaland", dateBorn: "2000-07-21", strTeam: "Manchester City", strSport: "Soccer" }] }) },
      ],
    ])
  );
  const results = await computeBirthdaysToday([], { now: new Date("2000-07-21T12:00:00Z") });
  assert.deepEqual(
    results.map((r) => r.player),
    ["Erling Haaland"]
  );
  assert.equal(results[0].age, 0);
  assert.equal(results[0].club, "Manchester City");
});

test("birthdays: mismatched month/day is excluded", async (t) => {
  await freshCache();
  const now = new Date("2026-08-07T12:00:00Z");
  withFetch(
    t,
    fetchFor([
      [
        "Test_Player_Eighteen",
        { ok: true, json: async () => ({ player: [{ strPlayer: "Test Player Eighteen", dateBorn: "1997-01-01", strSport: "Soccer" }] }) },
      ],
    ])
  );
  const log = [
    { id: "1", original: "Test Player Eighteen linked with Liverpool move", createdAt: now.toISOString() },
  ];
  assert.deepEqual(await computeBirthdaysToday(log, { now }), []);
});
