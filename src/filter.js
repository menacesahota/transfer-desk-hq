import {
  HARD_NEWS_PHRASES,
  RUMOUR_PHRASES,
  NOISE_PATTERNS,
  PREMIER_LEAGUE_TERMS,
  ELITE_EUROPE_TERMS,
  HIGH_PROFILE_FEE_M,
} from "./config.js";

/**
 * True if this post is a reply (API flag, referenced tweet, or leading @).
 */
export function isReplyTweet(tweet) {
  if (!tweet) return true;
  if (tweet.in_reply_to_user_id) return true;
  if (tweet.referenced_tweets?.some((r) => r.type === "replied_to")) return true;
  const text = (tweet.text || "").trim();
  if (/^@\w+/.test(text)) return true;
  return false;
}

/**
 * Concrete transfer news / PL rumours from breaker accounts:
 * - Done deals / bids / medicals: PL or high-profile Europe
 * - Rumours / interest: Premier League clubs only
 */
export function isNewsworthyTip(text) {
  return classifyTip(text) !== null;
}

/** Returns 'news' | 'rumour' | null */
export function classifyTip(text) {
  const raw = (text || "").trim();
  if (raw.length < 40) return null;

  const lower = raw.toLowerCase();

  if (NOISE_PATTERNS.some((re) => re.test(raw))) return null;

  const questionHeavy = (raw.match(/\?/g) || []).length >= 2;
  if (questionHeavy) return null;

  const rumour = hasRumourPhrase(lower);
  const hard =
    hasHardPhrase(lower) ||
    hasFeeSignal(raw) ||
    /\b(signed|signing|bid|loan|medical|offer|agreement|joins?|joining)\b/i.test(raw);

  if (!rumour && !hard) return null;
  if (/^\s*.+\?\s*$/.test(raw) && !hard && !rumour) return null;

  // Soft rumours / interest → Premier League only
  if (rumour && !hard) {
    return mentionsAny(lower, PREMIER_LEAGUE_TERMS) ? "rumour" : null;
  }

  // Hard news that also uses rumour words still counts as news if scoped
  if (!isPremierLeagueOrHighProfile(raw, lower)) return null;
  return hard ? "news" : "rumour";
}

export function isRumourTip(text) {
  return classifyTip(text) === "rumour";
}

/** PL club tip, or elite-Europe tip with big-club and/or high fee. */
export function isPremierLeagueOrHighProfile(raw, lower = raw.toLowerCase()) {
  if (mentionsAny(lower, PREMIER_LEAGUE_TERMS)) return true;

  const elite = mentionsAny(lower, ELITE_EUROPE_TERMS);
  if (!elite) return false;

  const fee = extractFeeMillions(raw);
  if (fee == null) return true;
  return fee >= HIGH_PROFILE_FEE_M;
}

function mentionsAny(lower, terms) {
  return terms.some((term) => {
    const t = term.toLowerCase();
    if (t.startsWith("#")) return lower.includes(t);
    const escaped = t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const re = new RegExp(`(?:^|[^a-z0-9])${escaped}(?:[^a-z0-9]|$)`, "i");
    return re.test(lower);
  });
}

function hasHardPhrase(lower) {
  return HARD_NEWS_PHRASES.some((p) => lower.includes(p));
}

function hasRumourPhrase(lower) {
  return RUMOUR_PHRASES.some((p) => lower.includes(p));
}

function hasFeeSignal(text) {
  return extractFeeMillions(text) != null;
}

/** Best-effort parse of £/€/$ Xm style fees → millions number. */
export function extractFeeMillions(text) {
  const patterns = [
    /[£€$]\s*(\d+(?:\.\d+)?)\s*(m|million)?\b/i,
    /\b(\d+(?:\.\d+)?)\s*(m|million)\b/i,
  ];
  let best = null;
  for (const re of patterns) {
    for (const m of text.matchAll(new RegExp(re.source, "gi"))) {
      let n = Number(m[1]);
      if (!Number.isFinite(n)) continue;
      const unit = (m[2] || "").toLowerCase();
      if (!unit && /[£€$]/.test(m[0]) && n >= 1 && n < 500) {
        // tipster millions shorthand
      } else if (unit === "m" || unit === "million") {
        // already millions
      } else if (!unit && n >= 1000) {
        n = n / 1_000_000;
      } else if (!unit) {
        continue;
      }
      if (best == null || n > best) best = n;
    }
  }
  return best;
}

/** @deprecated use isNewsworthyTip */
export function looksBreaking(text) {
  return isNewsworthyTip(text);
}
