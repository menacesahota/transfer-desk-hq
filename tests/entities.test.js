/**
 * Regression tests for src/entities.js — one case per real bug this desk
 * actually posted and had to be fixed, so none of them can silently come
 * back. Run with `npm test`.
 */
import { test } from "node:test";
import assert from "node:assert/strict";

import {
  extractPlayer,
  extractPlayerCandidates,
  extractSubjectAndStage,
  detectDirection,
  detectRenewal,
  entryPlayer,
  entryPlayerKey,
  entryStage,
  playerKey,
  clubHashtag,
  clubHashtags,
  isClubbish,
  resolveMove,
  moveLabel,
} from "../src/entities.js";

// --- Cuti Romero nickname (commit 8e77d16) ---------------------------------
// Breakers use nicknames; without mapping them the same real player was
// tracked (and posted about) as two different people.
test("nickname 'Cuti Romero' resolves to the canonical full name", () => {
  assert.equal(extractPlayer("Cuti Romero set for Tottenham medical"), "Cristian Romero");
});

// --- Ben Latty / commercial director (commit 5a71170) -----------------------
// "Ben Latty rejoins Liverpool as commercial director" reads like a transfer
// (rejoins) but is a staff hire, not a player move.
test("staff hire with role AFTER the name is excluded from player candidates", () => {
  const names = extractPlayerCandidates("Ben Latty rejoins Liverpool as commercial director").map((c) => c.name);
  assert.ok(!names.includes("Ben Latty"), `expected Ben Latty to be filtered, got: ${names.join(", ")}`);
});

test("staff mention with role BEFORE the name is excluded from player candidates", () => {
  const names = extractPlayerCandidates("Arsenal manager Mikel Arteta says the club is close to a deal").map((c) => c.name);
  assert.ok(!names.includes("Mikel Arteta"), `expected Mikel Arteta to be filtered, got: ${names.join(", ")}`);
});

// --- Bruno Guimarães medical direction (commit ee102c3) ---------------------
// "completes his medical at Arsenal" was previously undetected as a
// destination cue and fell back to a heuristic that got it backwards.
test("'medical at CLUB' resolves CLUB as the destination", () => {
  const { to } = detectDirection("Bruno Guimarães completes his medical at Arsenal");
  assert.equal(to, "Arsenal");
});

// --- Al Gharafa mistaken for a player (commit 189e073) ----------------------
// Al Gharafa is a Qatari club, not a player; the real player in this story
// was Ismaël Bennacer.
test("'Al X' two-word run is treated as club-shaped, not a player candidate", () => {
  const names = extractPlayerCandidates("Ismael Bennacer set to leave AC Milan for Al Gharafa").map((c) => c.name);
  assert.ok(names.includes("Ismael Bennacer"), `expected Ismael Bennacer to be found, got: ${names.join(", ")}`);
  assert.ok(!names.includes("Al Gharafa"), `expected Al Gharafa to be filtered, got: ${names.join(", ")}`);
});

test("isClubbish flags a stored club-shaped name so stale data gets re-derived", () => {
  // Al Gharafa is now in the CLUBS list (added alongside this fix), so
  // isClubbish catches it directly too — belt and braces with the "Al X"
  // candidate-extraction heuristic above.
  assert.equal(isClubbish("Al Gharafa"), true);
  assert.equal(isClubbish("Arsenal"), true);
  assert.equal(isClubbish("Ismael Bennacer"), false);
});

// --- Rodri/Barcola/Salah never posted (commit dd5572b) ----------------------
test("mononym allowlist catches bare 'Rodri'", () => {
  const names = extractPlayerCandidates("Rodri is a top target for Barcelona this summer").map((c) => c.name);
  assert.ok(names.includes("Rodri"), `expected Rodri to be found, got: ${names.join(", ")}`);
});

test("'reached an agreement in principle with' resolves buying club as destination", () => {
  const { to, from } = detectDirection(
    "Liverpool have reached an agreement in principle with PSG for Bradley Barcola"
  );
  assert.equal(to, "Liverpool");
  assert.equal(from, "PSG");
});

test("'CLUB exit' (reverse word order) resolves CLUB as the origin", () => {
  const { to, from } = detectDirection("Salah nearing Liverpool exit amid Trabzonspor interest");
  assert.equal(from, "Liverpool");
  assert.equal(to, "Trabzonspor");
});

// --- Direction-ambiguity gate relaxation (commit dd5572b) -------------------
// Single-club stories (only the pursuing club named) must not be held —
// only 2+ club ambiguity should ever hold an advanced-stage post.
test("single-club agreement story resolves a destination without needing an origin", () => {
  const { to, from } = detectDirection("Rodri set to join Barcelona this summer");
  assert.equal(to, "Barcelona");
  assert.equal(from, null);
});

// --- Renewal detection widening (commit 85a3a6a) ----------------------------
test("'new long-term contract' phrasing is detected as a renewal, not a transfer", () => {
  assert.equal(detectRenewal("Bukayo Saka signs a new long-term contract at Arsenal"), true);
});

test("two clubs mentioned overrides renewal wording (real transfer, not a stay)", () => {
  assert.equal(
    detectRenewal("Player agrees a new deal but Arsenal and Chelsea both remain interested"),
    false
  );
});

// --- Multi-subject clause-scoped attribution (commit 85a3a6a) ---------------
// Nearest-distance-across-the-whole-tip previously picked the wrong subject
// in both of these real cases.
test("medical-stage subject wins over a textually-closer but lower-rank mention in another clause", () => {
  const { player, stage } = extractSubjectAndStage(
    "James Trafford completes his medical at Man City. City now targeting Geronimo Rulli as backup."
  );
  assert.equal(player, "James Trafford");
  assert.equal(stage, "medical");
});

test("an orphan stage keyword (no candidate in its own clause) attributes to the first-mentioned subject", () => {
  const { player, stage } = extractSubjectAndStage(
    "Arsenal want Bruno Guimarães to partner Declan Rice in midfield, initial contact made with Newcastle."
  );
  assert.equal(player, "Bruno Guimarães");
  assert.equal(stage, "talks");
});

// --- entryPlayer/entryPlayerKey always re-derive from original text --------
// A player field cached before a fix (e.g. logged as a club name by an
// older parser version) must not be trusted forever.
test("entryPlayer re-derives from original text when the stored player is club-shaped", () => {
  const entry = { player: "Al Gharafa", original: "Ismael Bennacer set to leave AC Milan for Al Gharafa" };
  assert.equal(entryPlayer(entry), "Ismael Bennacer");
  assert.equal(entryPlayerKey(entry), playerKey("Ismael Bennacer"));
});

// --- Single-club fallback defaults to "leaving" when the text says so
// (live bug: "Roony Bardghji -> Barcelona" posted for a story that was
// actually about him LEAVING Barcelona, destination unknown) -------------
test("resolveMove: single-club fallback defaults to origin when the text signals leaving, cue too distant from the club to fire directly", () => {
  const events = [
    {
      handle: "FabrizioRomano",
      original:
        "Official: Roony Bardghji does not travel with Barça squad for pre-season game, as he's leaving. Story from yesterday confirmed: Roony will go, loan or permanent with buy back clause.",
      clubs: ["Barcelona"],
    },
  ];
  assert.deepEqual(resolveMove(events), { to: null, from: "Barcelona" });
  assert.equal(moveLabel("Roony Bardghji", resolveMove(events)), "Roony Bardghji leaving Barcelona");
});

test("resolveMove: single-club fallback defaults to origin when 'leaving CLUB' has a prefix (FC) breaking direct cue adjacency", () => {
  const events = [
    {
      handle: "Plettigoal",
      original:
        "As revealed, and now officially confirmed: Roony Bardghji is on the verge of leaving FC Barcelona. The clear plan has been in place for weeks. There are multiple enquiries, with talks ongoing.",
      clubs: ["Barcelona"],
    },
  ];
  assert.deepEqual(resolveMove(events), { to: null, from: "Barcelona" });
});

test("resolveMove: single-club fallback still defaults to destination when there's no leaving language", () => {
  const events = [
    { handle: "FabrizioRomano", original: "Arsenal are strongly linked with a move for this player.", clubs: ["Arsenal"] },
  ];
  assert.deepEqual(resolveMove(events), { to: "Arsenal", from: null });
});

// --- entryStage always re-derives from original text -----------------------
test("entryStage re-derives from original text rather than trusting a stale stored stage", () => {
  const entry = { stage: "talks", original: "OFFICIAL: Test Player signs for Arsenal" };
  assert.equal(entryStage(entry), "done");
});

test("entryStage falls back to the stored stage when there's no original text", () => {
  assert.equal(entryStage({ stage: "bid" }), "bid");
});

// --- playerKey collapses middle names but keeps distinct first names -------
test("playerKey collapses a middle name onto the same key as first+last", () => {
  assert.equal(playerKey("John Alexander Isak"), playerKey("Alexander Isak"));
});

test("playerKey keeps genuinely different first names distinct", () => {
  assert.notEqual(playerKey("Alexander Isak"), playerKey("Alex Isak"));
});

// --- Club hashtags (commit 22eef06) -----------------------------------------
test("clubHashtag prefers the club's own recognised abbreviation", () => {
  assert.equal(clubHashtag("Arsenal"), "#AFC");
  assert.equal(clubHashtag("Newcastle"), "#NUFC");
});

test("clubHashtag falls back to the stripped full name when there's no short alias", () => {
  assert.equal(clubHashtag("Real Madrid"), "#RealMadrid");
});

test("clubHashtags dedupes and preserves first-appearance order", () => {
  assert.deepEqual(clubHashtags(["Arsenal", "Chelsea", "Arsenal"]), ["#AFC", "#CFC"]);
});
