/**
 * Desk Rewind: daily post pairing two things —
 *
 *   - Birthdays: footballing legends, well-known/popular current players,
 *     and anyone the desk has covered recently, whose birthday (any year)
 *     falls today. Sourced from TheSportsDB (same free, no-signup API
 *     already used for the player-identity check in verify.js) — a
 *     player's date of birth is looked up once ever and cached permanently
 *     to data/birthdays.json, since it never changes.
 *
 *   - On this day: confirmed ("done" stage) signings drawn from the desk's
 *     OWN historical tip log on this exact month/day in a previous year.
 *     Deliberately does NOT use any external "on this day" history source —
 *     there's no free, structured, reliably-accurate API for that, and
 *     after this session's run of wrong posts (Al Gharafa, Yan Diomande)
 *     the bar here is: only ever state something the desk itself already
 *     logged from a real breaker tip. This starts sparse and gets richer
 *     as the tip log accumulates over months/years.
 *
 * No images — real signing-day photos are typically owned by a photo
 * agency or the club, and pulling the club's *original* announcement tweet
 * isn't feasible on this account's X API tier (that needs paid full-archive
 * search). Text-only by explicit choice.
 */

import {
  entryPlayer,
  entryPlayerKey,
  entryStage,
  entryRenewal,
  entryDirection,
  extractClubs,
  appendHashtags,
  playerKey,
} from "./entities.js";
import { loadBirthdayCache, saveBirthdayCache } from "./store.js";

const SPORTSDB_URL = "https://www.thesportsdb.com/api/v1/json/3/searchplayers.php";
const TIMEOUT_MS = Number(process.env.VERIFY_TIMEOUT_MS || 8000);
const BIRTHDAY_LOOKUP_WINDOW_DAYS = Number(process.env.ALMANAC_PLAYER_WINDOW_DAYS || 120);
const ON_THIS_DAY_MAX_ITEMS = Number(process.env.ALMANAC_MAX_SIGNINGS || 3);
const BIRTHDAY_MAX_ITEMS = Number(process.env.ALMANAC_MAX_BIRTHDAYS || 6);

/**
 * Curated names checked for a birthday every day, on top of whoever the
 * desk has covered recently. This is a manually-maintained editorial list
 * (same trust model as PLAYER_NICKNAMES/MONONYMS in entities.js) rather
 * than an auto-pulled "current Premier League roster" — TheSportsDB's bulk
 * team/league-roster endpoints turned out to be unreliable/inconsistent on
 * the free tier when this was built (missing teams, stale gaps), while its
 * single-player search (searchplayers.php) is solid. A name that isn't
 * found is just silently skipped (see fetchBirthDate), so a typo or an
 * unlisted player never risks a wrong post — worst case is a missed
 * birthday, never a fabricated one. Extend freely.
 */
const FOOTBALL_LEGENDS = [
  "Pele", "Diego Maradona", "Zinedine Zidane", "Ronaldo", "Ronaldinho",
  "Thierry Henry", "David Beckham", "Paolo Maldini", "Andrea Pirlo",
  "Xavi Hernandez", "Andres Iniesta", "Franz Beckenbauer", "Johan Cruyff",
  "George Best", "Bobby Moore", "Alan Shearer", "Steven Gerrard",
  "Frank Lampard", "Wayne Rooney", "Ryan Giggs", "Paul Scholes", "Roy Keane",
  "Patrick Vieira", "Dennis Bergkamp", "Ian Wright", "Didier Drogba",
  "Luka Modric", "Iker Casillas", "Gianluigi Buffon", "Kaka", "Samuel Eto'o",
  "Michael Owen", "David Ginola", "Eric Cantona", "Peter Schmeichel",
  "Rio Ferdinand", "John Terry", "Gary Neville", "Jamie Carragher",
  "Didier Deschamps", "Fabio Cannavaro", "Luis Figo", "Roberto Carlos",
];

const NOTABLE_PLAYERS = [
  "Erling Haaland", "Kylian Mbappe", "Mohamed Salah", "Bukayo Saka",
  "Kevin De Bruyne", "Bruno Fernandes", "Harry Kane", "Jude Bellingham",
  "Vinicius Junior", "Phil Foden", "Declan Rice", "Martin Odegaard",
  "Son Heung-min", "Virgil van Dijk", "Rodri", "Jamal Musiala", "Pedri",
  "Gavi", "Neymar", "Robert Lewandowski", "Lionel Messi", "Cristiano Ronaldo",
  "Ousmane Dembele", "Florian Wirtz", "Lamine Yamal", "Cole Palmer",
  "William Saliba", "Alexander Isak", "Ollie Watkins", "James Maddison",
];

const CURATED_PLAYER_NAMES = [...new Set([...FOOTBALL_LEGENDS, ...NOTABLE_PLAYERS])];

/**
 * Look up a player's date of birth (and current/most recent club, per
 * TheSportsDB) via searchplayers.php. Returns { dateBorn, club } with null
 * fields when genuinely not found — also a valid, cacheable result. Unlike
 * verify.js's isKnownPlayer, this has no "fail open" concept: a lookup
 * failure just means this player's birthday can't be checked today, which
 * is harmless to skip rather than guess at.
 */
async function fetchBirthDate(name) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const url = `${SPORTSDB_URL}?p=${encodeURIComponent(name.trim().replace(/\s+/g, "_"))}`;
    const res = await fetch(url, { signal: controller.signal });
    if (!res.ok) throw new Error(`TheSportsDB HTTP ${res.status}`);
    const data = await res.json();
    const players = Array.isArray(data.player) ? data.player : [];
    const soccer = players.find((p) => !p.strSport || /soccer|football/i.test(p.strSport));
    return {
      dateBorn: soccer?.dateBorn ? soccer.dateBorn.slice(0, 10) : null,
      club: soccer?.strTeam || null,
    };
  } catch {
    return undefined; // undefined = "couldn't check", distinct from a checked-but-empty result
  } finally {
    clearTimeout(timer);
  }
}

/** Most recent club mentioned for a player, for hashtag purposes only. */
function latestClubFor(events) {
  for (let i = events.length - 1; i >= 0; i--) {
    const dir = entryDirection(events[i]);
    if (dir.to) return dir.to;
    const clubs = events[i].clubs?.length ? events[i].clubs : extractClubs(events[i].original || "");
    if (clubs.length) return clubs[0];
  }
  return null;
}

/** Distinct players covered within the lookback window, most-recent event per player. */
function trackedPlayers(log, { now = Date.now(), windowDays = BIRTHDAY_LOOKUP_WINDOW_DAYS } = {}) {
  const cutoff = now - windowDays * 86400_000;
  const byKey = new Map();
  for (const e of log) {
    if (new Date(e.createdAt).getTime() < cutoff) continue;
    const player = entryPlayer(e);
    if (!player) continue;
    const key = entryPlayerKey(e);
    if (!key) continue;
    if (!byKey.has(key)) byKey.set(key, []);
    byKey.get(key).push(e);
  }
  return byKey;
}

/**
 * Full candidate pool for today's birthday check: the curated legends/
 * notable-players list, plus anyone the desk has covered recently. Curated
 * names use their own name as the display name and have no log events
 * (club comes from TheSportsDB's strTeam instead, see fetchBirthDate);
 * tracked names use the fullest name seen and their most recent club from
 * the log. A name tracked in the log AND on the curated list is merged
 * under one key so it's only ever checked/shown once.
 */
function candidatePlayers(log, { now } = {}) {
  const byKey = trackedPlayers(log, { now });
  const candidates = new Map();

  for (const [key, events] of byKey) {
    const name = events
      .map(entryPlayer)
      .filter(Boolean)
      .sort((a, b) => b.length - a.length)[0];
    if (!name) continue;
    candidates.set(key, { key, name, club: latestClubFor(events) });
  }

  for (const name of CURATED_PLAYER_NAMES) {
    const key = playerKey(name);
    if (!key || candidates.has(key)) continue;
    candidates.set(key, { key, name, club: null });
  }

  return [...candidates.values()];
}

/**
 * Birthdays landing today among legends, notable/popular players, and
 * anyone the desk has covered recently. Resolves and permanently caches any
 * not-yet-known birth dates via TheSportsDB (at most once per player,
 * ever); everything else is pure local date math.
 */
export async function computeBirthdaysToday(log, { now = new Date() } = {}) {
  const pool = candidatePlayers(log, { now: now.getTime() });
  const cache = await loadBirthdayCache();
  let cacheDirty = false;

  const month = now.getUTCMonth() + 1;
  const day = now.getUTCDate();
  const year = now.getUTCFullYear();
  const results = [];

  for (const { key, name, club } of pool) {
    let cached = cache[key];
    if (!cached) {
      const fetched = await fetchBirthDate(name);
      if (fetched === undefined) continue; // lookup failed — skip, don't cache, try again another day
      cached = { name, dateBorn: fetched.dateBorn, club: fetched.club, checkedAt: new Date().toISOString() };
      cache[key] = cached;
      cacheDirty = true;
    }
    if (!cached.dateBorn) continue;

    const [bYear, bMonth, bDay] = cached.dateBorn.split("-").map(Number);
    if (bMonth !== month || bDay !== day) continue;

    results.push({
      playerKey: key,
      player: cached.name || name,
      age: year - bYear,
      club: club || cached.club || null,
    });
  }

  if (cacheDirty) await saveBirthdayCache(cache);
  return results.slice(0, BIRTHDAY_MAX_ITEMS);
}

/**
 * Confirmed signings the desk itself logged on this month/day in a
 * previous year. Grouped by (player, year) so a heavily-corroborated
 * signing doesn't produce duplicate lines.
 */
export function computeOnThisDaySignings(log, { now = new Date() } = {}) {
  const month = now.getUTCMonth() + 1;
  const day = now.getUTCDate();
  const thisYear = now.getUTCFullYear();

  const byKey = new Map();
  for (const e of log) {
    const created = new Date(e.createdAt);
    if (created.getUTCMonth() + 1 !== month || created.getUTCDate() !== day) continue;
    if (created.getUTCFullYear() >= thisYear) continue; // history only, not today's own news
    if (entryStage(e) !== "done") continue;
    if (entryRenewal(e)) continue; // a re-signing at the same club isn't "on this day, X joined Y"
    const player = entryPlayer(e);
    if (!player) continue;
    const key = `${entryPlayerKey(e)}:${created.getUTCFullYear()}`;
    if (!byKey.has(key)) byKey.set(key, []);
    byKey.get(key).push(e);
  }

  const items = [];
  for (const events of byKey.values()) {
    const best = events[0];
    const player = events
      .map(entryPlayer)
      .filter(Boolean)
      .sort((a, b) => b.length - a.length)[0];
    if (!player) continue;
    const dir = entryDirection(best);
    const club = dir.to || (best.clubs?.length ? best.clubs[0] : extractClubs(best.original || "")[0]) || null;
    if (!club) continue; // "on this day, X joined ???" isn't worth posting
    items.push({
      player,
      club,
      year: new Date(best.createdAt).getUTCFullYear(),
    });
  }

  return items.sort((a, b) => b.year - a.year).slice(0, ON_THIS_DAY_MAX_ITEMS);
}

export function almanacPostKey(now = new Date()) {
  return `almanac:${now.toISOString().slice(0, 10)}`; // once per day
}

/** Build the daily almanac post (≤280 chars). Returns null when there's nothing to say today. */
export function buildAlmanacPost(birthdays, onThisDay, now = new Date()) {
  if (!birthdays.length && !onThisDay.length) return null;

  const date = now.toLocaleDateString("en-GB", { day: "numeric", month: "short" });
  const sections = [];

  if (birthdays.length) {
    const lines = birthdays.map((b) => `🎂 ${b.player} turns ${b.age}${b.club ? ` (${b.club})` : ""}`);
    sections.push(lines.join("\n"));
  }
  if (onThisDay.length) {
    const lines = onThisDay.map((o) => `📅 ${o.year}: ${o.player} joined ${o.club}`);
    sections.push(lines.join("\n"));
  }

  const header = `DESK REWIND | ${date}`;
  let post = `${header}\n\n${sections.join("\n\n")}`;

  // Fit to 280: drop the on-this-day section's oldest lines first, then
  // birthdays, rather than truncating mid-line.
  let shownBirthdays = birthdays;
  let shownOnThisDay = onThisDay;
  const rebuild = () => {
    const secs = [];
    if (shownBirthdays.length) {
      secs.push(shownBirthdays.map((b) => `🎂 ${b.player} turns ${b.age}${b.club ? ` (${b.club})` : ""}`).join("\n"));
    }
    if (shownOnThisDay.length) {
      secs.push(shownOnThisDay.map((o) => `📅 ${o.year}: ${o.player} joined ${o.club}`).join("\n"));
    }
    return `${header}\n\n${secs.join("\n\n")}`;
  };

  while (post.length > 280 && (shownOnThisDay.length || shownBirthdays.length)) {
    if (shownOnThisDay.length) shownOnThisDay = shownOnThisDay.slice(0, -1);
    else shownBirthdays = shownBirthdays.slice(0, -1);
    post = rebuild();
  }
  if (!shownBirthdays.length && !shownOnThisDay.length) return null;

  const clubs = [...shownBirthdays.map((b) => b.club), ...shownOnThisDay.map((o) => o.club)];
  return appendHashtags(post, clubs);
}
