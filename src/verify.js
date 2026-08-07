/**
 * Two independent live checks, run right before an advanced/high-stakes
 * post goes out — each catches a different class of error the entity
 * parser's own internal-consistency checks can't:
 *
 *   - isKnownPlayer(): does a real professional footballer by this name
 *     even exist? Catches category errors — the parser extracting a club
 *     name, competition, or other non-person string into the player slot
 *     (real case: "Al Gharafa leaving AC Milan" — Al Gharafa is a Qatari
 *     club, not a player; the real story was Ismaël Bennacer leaving AC
 *     Milan to join them). Free, no signup, always on.
 *
 *   - verifyMove(): does recent web news actually corroborate this
 *     player+club combination, and does it NOT say the move fell through?
 *     Catches the parser being internally coherent but wrong about the
 *     real world (real case: "Yan Diomande -> PSG" — PSG had already
 *     pulled out days earlier, he signed for Real Madrid instead). Opt-in,
 *     needs a free Serper.dev key.
 *
 * Both fail OPEN on network/API errors (a flaky third party can't silently
 * stop the desk from posting real news) and fail CLOSED only when the
 * check genuinely completed and came back negative.
 */

const SERPER_URL = "https://google.serper.dev/news";
const SPORTSDB_URL = "https://www.thesportsdb.com/api/v1/json/3/searchplayers.php";
const TIMEOUT_MS = Number(process.env.VERIFY_TIMEOUT_MS || 8000);
const CACHE_TTL_MS = 6 * 3600_000; // re-check a story periodically, not every cycle

// In-memory only — watch() is a long-running process, so this still saves
// repeat lookups within a session without needing to touch disk.
const cache = new Map();
const playerCache = new Map();

export function hasSerperKey() {
  return Boolean(process.env.SERPER_API_KEY);
}

/**
 * Does a real professional footballer by this name exist, per TheSportsDB
 * (free, public, no API key required)? Names with 1-2 words only — a
 * mononym allowlist entry (e.g. "Rodri") is looked up as-is.
 */
export async function isKnownPlayer(name) {
  if (!name) return { known: false, reason: "no player name" };
  const cacheKey = name.toLowerCase();
  const cached = playerCache.get(cacheKey);
  if (cached && Date.now() - cached.at < CACHE_TTL_MS) return cached.result;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  let result;
  try {
    const url = `${SPORTSDB_URL}?p=${encodeURIComponent(name.trim().replace(/\s+/g, "_"))}`;
    const res = await fetch(url, { signal: controller.signal });
    if (!res.ok) throw new Error(`TheSportsDB HTTP ${res.status}`);
    const data = await res.json();
    const players = Array.isArray(data.player) ? data.player : [];
    const soccerPlayers = players.filter((p) => !p.strSport || /soccer|football/i.test(p.strSport));
    result = soccerPlayers.length
      ? { known: true, reason: `found (${soccerPlayers[0].strTeam || "no club listed"})` }
      : { known: false, reason: "no matching player found in player database" };
  } catch (err) {
    // Fail open — a lookup timeout/outage isn't evidence the player is fake.
    result = { known: true, reason: `lookup failed, not held on this alone (${err.message})` };
  } finally {
    clearTimeout(timer);
  }
  playerCache.set(cacheKey, { result, at: Date.now() });
  return result;
}

function buildQuery({ player, to, from }) {
  const club = to || from;
  return club ? `${player} ${club} transfer` : `${player} transfer`;
}

async function searchNews(query) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(SERPER_URL, {
      method: "POST",
      headers: {
        "X-API-KEY": process.env.SERPER_API_KEY,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ q: query, gl: "gb", tbs: "qdr:w" }), // past week only — freshness matters
      signal: controller.signal,
    });
    if (!res.ok) throw new Error(`Serper HTTP ${res.status}`);
    const data = await res.json();
    return data.news || [];
  } finally {
    clearTimeout(timer);
  }
}

/** Strip diacritics so "Guimarães" still matches news text rendered as "Guimaraes". */
function fold(s) {
  return String(s || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "");
}

/** Loose but cheap corroboration check: does this text mention the surname AND the club? */
function mentions(text, player, club) {
  const t = fold(text);
  const surname = fold(player.trim().split(/\s+/).pop());
  const hasPlayer = surname.length >= 3 && t.includes(surname);
  const hasClub = club ? t.includes(fold(club)) : true;
  return hasPlayer && hasClub;
}

// A real case this missed: "Yan Diomande -> PSG" got "verified" because
// plenty of past-week articles genuinely mention Diomande + PSG together —
// they just say PSG PULLED OUT and he signed for Real Madrid instead. Pure
// keyword co-occurrence can't tell "X joins Y" from "X snubs Y" / "Y drops
// out of the race for X". A result matching on names but ALSO carrying
// reversal language should count AGAINST the claim, not for it.
const NEGATION = /\b(pull(?:s|ed)?\s+out|pulled\s+the\s+plug|collapse[sd]?|fall[s]?\s+through|fell\s+through|rule[sd]?\s+out|ruled\s+out|no\s+longer|instead\s+of|rather\s+than|opts?\s+(?:for|against)|snubbed|snubs|rejects?|rejected|turn(?:s|ed)?\s+down|in\s+doubt|considering\s+(?:the\s+)?(?:file|deal)\s+closed|deal\s+(?:is\s+)?off|not\s+(?:happening|moving\s+forward)|scrapped|abandon(?:s|ed)?|walks?\s+away|withdraw[sn]?|out\s+of\s+the\s+race|missed?\s+out|lose[s]?\s+out|lost\s+out)\b/i;

function hasNegation(text) {
  return NEGATION.test(fold(text));
}

/**
 * Verify a player+club story against recent web news before posting it.
 * Returns { verified, reason, query, checked } — never throws. On a search
 * failure (network, rate limit, bad key) it fails OPEN (verified: true,
 * reason notes the failure) so a flaky third-party API can't silently stop
 * the desk from posting real news, mirroring the failure-isolation already
 * used for publishing itself. It only fails CLOSED when the search
 * genuinely succeeded and found nothing corroborating.
 */
export async function verifyMove({ player, to, from, stage }) {
  if (!player) return { verified: false, reason: "no player name", query: null, checked: 0 };
  if (!hasSerperKey()) {
    return { verified: true, reason: "skipped (no SERPER_API_KEY set)", query: null, checked: 0 };
  }

  const query = buildQuery({ player, to, from });
  const cacheKey = `${query}|${stage || ""}`;
  const cached = cache.get(cacheKey);
  if (cached && Date.now() - cached.at < CACHE_TTL_MS) return cached.result;

  let result;
  try {
    const items = await searchNews(query);
    const club = to || from;
    const matches = items.filter((n) => mentions(`${n.title} ${n.snippet}`, player, club));
    const reversed = matches.filter((n) => hasNegation(`${n.title} ${n.snippet}`));

    if (!matches.length) {
      result = { verified: false, reason: "no recent web results corroborate this", query, checked: items.length };
    } else if (reversed.length) {
      // Any matching result carrying reversal language (pulled out, fell
      // through, snubbed, etc.) holds the post — better to miss a cycle
      // than confidently state a story that's already been reversed.
      result = {
        verified: false,
        reason: `${reversed.length} recent result(s) suggest this move did NOT happen as stated (e.g. "${reversed[0].title}")`,
        query,
        checked: items.length,
      };
    } else {
      result = { verified: true, reason: `corroborated by ${matches.length} recent result(s)`, query, checked: items.length };
    }
  } catch (err) {
    // Fail open — see doc comment above.
    result = { verified: true, reason: `search failed, posting anyway (${err.message})`, query, checked: 0 };
  }

  cache.set(cacheKey, { result, at: Date.now() });
  return result;
}

/**
 * Run both checks and combine into one pass/fail — this is what callers
 * should use. isKnownPlayer runs first since it's free and catches
 * category errors (wrong thing extracted as a player) that verifyMove's
 * keyword search can't: a plausible-sounding but wrong entity like a club
 * name will often still turn up genuine matching news results (the real
 * story just has it in the wrong slot), so isKnownPlayer needs to be the
 * one to catch that specific failure mode.
 */
export async function verifyStory({ player, to, from, stage }) {
  const identity = await isKnownPlayer(player);
  if (!identity.known) {
    return { verified: false, reason: `not a recognised player — ${identity.reason}`, stage: "identity" };
  }
  const move = await verifyMove({ player, to, from, stage });
  return { verified: move.verified, reason: move.reason, stage: "move", query: move.query, checked: move.checked };
}
