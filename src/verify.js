/**
 * Live web-search fact-check, run right before an advanced/high-stakes post
 * goes out. Catches the class of error internal consistency checks can't:
 * the parser being confident and *internally* coherent but simply wrong
 * about what's actually happening in the world (e.g. reporting a deal that
 * was later denied, or attributing a real story to the wrong player/club
 * combination that nonetheless "reads fine" on its own).
 *
 * Fully opt-in: with no SERPER_API_KEY set, verifyMove() always returns
 * verified so the desk behaves exactly as before. Get a key from
 * https://serper.dev (free tier covers this comfortably — a handful of
 * searches per day, only right before a post, not every watch cycle).
 */

const SERPER_URL = "https://google.serper.dev/news";
const TIMEOUT_MS = Number(process.env.VERIFY_TIMEOUT_MS || 8000);
const CACHE_TTL_MS = 6 * 3600_000; // re-check a story periodically, not every cycle

// In-memory only — watch() is a long-running process, so this still saves
// repeat lookups within a session without needing to touch disk.
const cache = new Map();

export function hasSerperKey() {
  return Boolean(process.env.SERPER_API_KEY);
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
    result = matches.length
      ? { verified: true, reason: `corroborated by ${matches.length} recent result(s)`, query, checked: items.length }
      : { verified: false, reason: "no recent web results corroborate this", query, checked: items.length };
  } catch (err) {
    // Fail open — see doc comment above.
    result = { verified: true, reason: `search failed, posting anyway (${err.message})`, query, checked: 0 };
  }

  cache.set(cacheKey, { result, at: Date.now() });
  return result;
}
