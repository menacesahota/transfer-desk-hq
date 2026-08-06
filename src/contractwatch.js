/**
 * Contract Watch: daily post on players tying their future down where they are.
 *
 * Companion to the renewal-exclusion fix in entities.js — renewal stories are
 * kept out of radar/saga/consensus/pulse (they are not transfers), so they get
 * their own desk slot here instead of being silently dropped.
 *
 * Selection is deliberately strict: an entry must be flagged as a renewal by
 * `entryRenewal` AND yield a credible player name from `entryPlayer` (raw
 * `e.player` is never trusted — older log entries can hold club-shaped names).
 */

import { entryPlayer, entryRenewal, extractClubs } from "./entities.js";

const WATCH_DAYS = Number(process.env.CONTRACTWATCH_DAYS || 3);
const MAX_ITEMS = Number(process.env.CONTRACTWATCH_MAX_ITEMS || 5);

/**
 * How far along the renewal is. Ordered most → least advanced; the first
 * pattern that matches wins, mirroring detectStage() in entities.js.
 */
const PHASE_PATTERNS = [
  [
    "signed",
    /\b(?:signed|penned|put pen to paper on|agreed)\s+(?:a\s+)?(?:new|fresh|improved)\s+(?:contract|deal|terms)\b|\b(?:contract|deal)\s+extension\s+(?:signed|completed|confirmed|announced)\b|\bcommit(?:s|ted)?\s+(?:his|her|their)\s+future\b/i,
  ],
  [
    "agreed",
    /\b(?:set to stay|expected to stay|staying put|stays? put|agreement\s+(?:reached|in place)|close to (?:signing|agreeing|penning)|verbal agreement|(?:contract|deal) until 20\d\d|off the market)\b/i,
  ],
  [
    "talks",
    /\b(?:contract talks|renewal talks|extension talks|negotiat\w+|discussion\w*|offered|new offer|proposal|tie (?:him|her|them) down|wants? to (?:keep|extend|tie|renew)|in talks)\b/i,
  ],
];

const PHASE_RANK = { signed: 3, agreed: 2, talks: 1 };

/** Most advanced renewal phase mentioned in a tip. Defaults to "talks". */
export function renewalPhase(text) {
  const t = String(text || "");
  for (const [phase, re] of PHASE_PATTERNS) {
    if (re.test(t)) return phase;
  }
  return "talks";
}

/** Human copy for a renewal line: "new deal signed at Arsenal". */
export function phaseLabel(phase, club) {
  const at = club ? ` at ${club}` : "";
  if (phase === "signed") return `new deal signed${at}`;
  if (phase === "agreed") return `set to stay${at}`;
  return `extension talks${at}`;
}

function entryClub(e) {
  const clubs = e.clubs?.length ? e.clubs : extractClubs(e.original || "");
  return clubs[0] || null;
}

/**
 * Renewal stories from the last CONTRACTWATCH_DAYS, one row per player,
 * most advanced (then most recent) first.
 */
export function computeContractWatch(log, { days = WATCH_DAYS, now = Date.now() } = {}) {
  const cutoff = now - days * 86400_000;
  const byPlayer = new Map();

  for (const e of log) {
    if (!e.playerKey) continue;
    if (!entryRenewal(e)) continue; // transfers belong on the radar, not here
    if (!entryPlayer(e)) continue; // club-shaped / unnamed chatter
    if (new Date(e.createdAt).getTime() < cutoff) continue;
    if (!byPlayer.has(e.playerKey)) byPlayer.set(e.playerKey, []);
    byPlayer.get(e.playerKey).push(e);
  }

  const items = [];
  for (const [key, entries] of byPlayer) {
    const events = [...entries].sort(
      (a, b) => new Date(a.createdAt) - new Date(b.createdAt)
    );

    // Most informative entry for this player: furthest along, latest wins ties.
    const best = events.reduce((a, b) => {
      const ra = PHASE_RANK[renewalPhase(a.original)] ?? 1;
      const rb = PHASE_RANK[renewalPhase(b.original)] ?? 1;
      if (rb > ra) return b;
      if (rb < ra) return a;
      return new Date(b.createdAt) >= new Date(a.createdAt) ? b : a;
    });

    const phase = renewalPhase(best.original);
    const handles = [...new Set(events.map((e) => e.handle).filter(Boolean))];

    items.push({
      playerKey: key,
      // Longest validated name is usually the fullest
      player: events
        .map(entryPlayer)
        .filter(Boolean)
        .sort((a, b) => b.length - a.length)[0],
      club: entryClub(best) || events.map(entryClub).find(Boolean) || null,
      phase,
      rank: PHASE_RANK[phase] ?? 1,
      at: best.createdAt,
      sources: handles.length,
      lead: events[0].handle || null,
    });
  }

  return items
    .filter((i) => i.player)
    .sort((a, b) => b.rank - a.rank || new Date(b.at) - new Date(a.at))
    .slice(0, MAX_ITEMS);
}

export function contractWatchPostKey(now = new Date()) {
  return `contractwatch:${now.toISOString().slice(0, 10)}`; // once per day
}

function creditLine(items) {
  const handles = [...new Set(items.map((i) => i.lead).filter(Boolean))].slice(0, 3);
  return handles.length ? `Via ${handles.map((h) => `@${h}`).join(" ")}` : "";
}

/** Build the daily contract watch post (≤280 chars). */
export function buildContractWatchPost(items, now = new Date()) {
  const date = now.toLocaleDateString("en-GB", { day: "numeric", month: "short" });
  const header = `CONTRACT WATCH | ${date}\n\nNot going anywhere — futures being tied down:`;

  const render = (rows, withCredit) => {
    const lines = rows.map((i) => `✍️ ${i.player} — ${phaseLabel(i.phase, i.club)}`);
    const credit = withCredit ? creditLine(rows) : "";
    return `${header}\n\n${lines.join("\n")}${credit ? `\n\n${credit}` : ""}`;
  };

  let rows = [...items];
  let post = render(rows, true);
  while (post.length > 280 && rows.length > 2) {
    rows = rows.slice(0, -1);
    post = render(rows, true);
  }
  if (post.length > 280) post = render(rows, false); // drop credits before rows
  if (post.length > 280) post = render(rows.slice(0, 2), false);
  return post;
}
