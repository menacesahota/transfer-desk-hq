/**
 * Entity extraction: players, clubs, deal stage.
 * Shared by consensus, saga, scorecard, and pulse features.
 */

import { extractFeeMillions } from "./filter.js";

/** Canonical clubs with aliases (lowercase). Order matters: longer aliases first per club. */
export const CLUBS = [
  { name: "Arsenal", aliases: ["arsenal", "#afc", "gunners"] },
  { name: "Chelsea", aliases: ["chelsea", "#cfc"] },
  { name: "Tottenham", aliases: ["tottenham", "spurs", "#thfc"] },
  { name: "Newcastle", aliases: ["newcastle", "#nufc", "magpies"] },
  { name: "Aston Villa", aliases: ["aston villa", "#avfc", "avfc"] },
  { name: "West Ham", aliases: ["west ham", "#whu", "hammers"] },
  { name: "Brighton", aliases: ["brighton", "#bhafc", "seagulls"] },
  { name: "Fulham", aliases: ["fulham", "#fulhamfc", "#ffc"] },
  { name: "Brentford", aliases: ["brentford"] },
  { name: "Crystal Palace", aliases: ["crystal palace", "#cpfc"] },
  { name: "Wolves", aliases: ["wolves", "wolverhampton", "#wwfc"] },
  { name: "Everton", aliases: ["everton", "#efc", "toffees"] },
  { name: "Nottingham Forest", aliases: ["nottingham forest", "nottm forest", "#nffc"] },
  { name: "Bournemouth", aliases: ["bournemouth", "#afcb", "cherries"] },
  { name: "Leeds", aliases: ["leeds united", "leeds", "#lufc"] },
  { name: "Sunderland", aliases: ["sunderland", "#safc"] },
  { name: "Burnley", aliases: ["burnley", "clarets"] },
  { name: "Ipswich", aliases: ["ipswich town", "ipswich", "#itfc"] },
  { name: "Leicester", aliases: ["leicester city", "leicester", "#lcfc"] },
  { name: "Southampton", aliases: ["southampton", "saints"] },
  { name: "Liverpool", aliases: ["liverpool", "#lfc"] },
  { name: "Manchester United", aliases: ["manchester united", "man united", "man utd", "#mufc"] },
  { name: "Manchester City", aliases: ["manchester city", "man city", "#mcfc"] },
  { name: "Real Madrid", aliases: ["real madrid"] },
  { name: "Barcelona", aliases: ["barcelona", "barça", "barca"] },
  { name: "Atletico Madrid", aliases: ["atletico madrid", "atlético madrid", "atleti"] },
  { name: "Bayern Munich", aliases: ["bayern munich", "bayern münchen", "bayern"] },
  { name: "Borussia Dortmund", aliases: ["borussia dortmund", "dortmund", "bvb"] },
  { name: "PSG", aliases: ["paris saint-germain", "paris saint germain", "psg"] },
  { name: "Juventus", aliases: ["juventus", "juve"] },
  { name: "Inter Milan", aliases: ["inter milan", "inter"] },
  { name: "AC Milan", aliases: ["ac milan", "milan"] },
  { name: "Napoli", aliases: ["napoli"] },
  { name: "Roma", aliases: ["as roma", "roma"] },
  { name: "Lazio", aliases: ["lazio"] },
  { name: "Atalanta", aliases: ["atalanta"] },
  { name: "Ajax", aliases: ["ajax"] },
  { name: "Benfica", aliases: ["benfica"] },
  { name: "Porto", aliases: ["porto"] },
  { name: "Sporting CP", aliases: ["sporting cp", "sporting lisbon"] },
  { name: "RB Leipzig", aliases: ["rb leipzig", "leipzig"] },
  { name: "Bayer Leverkusen", aliases: ["bayer leverkusen", "leverkusen"] },
  { name: "Marseille", aliases: ["olympique marseille", "marseille"] },
  { name: "Lyon", aliases: ["lyon"] },
  { name: "Monaco", aliases: ["monaco"] },
  { name: "Sevilla", aliases: ["sevilla"] },
  { name: "Villarreal", aliases: ["villarreal"] },
  { name: "Valencia", aliases: ["valencia"] },
  { name: "Galatasaray", aliases: ["galatasaray"] },
  { name: "Fenerbahce", aliases: ["fenerbahce", "fenerbahçe"] },
  { name: "Besiktas", aliases: ["besiktas", "beşiktaş"] },
  { name: "Celtic", aliases: ["celtic"] },
  { name: "Rangers", aliases: ["rangers"] },
  { name: "Olympiacos", aliases: ["olympiacos", "olympiakós"] },
  // More Serie A — mid-table clubs still active in the transfer market
  { name: "Como", aliases: ["como 1907", "como"] },
  { name: "Fiorentina", aliases: ["fiorentina"] },
  { name: "Bologna", aliases: ["bologna"] },
  { name: "Torino", aliases: ["torino"] },
  { name: "Udinese", aliases: ["udinese"] },
  { name: "Genoa", aliases: ["genoa"] },
  { name: "Cagliari", aliases: ["cagliari"] },
  { name: "Parma", aliases: ["parma"] },
  { name: "Hellas Verona", aliases: ["hellas verona", "verona"] },
  { name: "Lecce", aliases: ["lecce"] },
  { name: "Sassuolo", aliases: ["sassuolo"] },
  { name: "Cremonese", aliases: ["cremonese"] },
  { name: "Pisa", aliases: ["pisa"] },
  // More La Liga
  { name: "Real Sociedad", aliases: ["real sociedad"] },
  { name: "Athletic Bilbao", aliases: ["athletic bilbao", "athletic club"] },
  { name: "Real Betis", aliases: ["real betis", "betis"] },
  { name: "Girona", aliases: ["girona"] },
  { name: "Celta Vigo", aliases: ["celta vigo", "celta"] },
  { name: "Rayo Vallecano", aliases: ["rayo vallecano", "rayo"] },
  { name: "Osasuna", aliases: ["osasuna"] },
  { name: "Getafe", aliases: ["getafe"] },
  { name: "Alaves", aliases: ["alavés", "alaves"] },
  { name: "Mallorca", aliases: ["mallorca"] },
  { name: "Las Palmas", aliases: ["las palmas"] },
  // More Bundesliga
  { name: "Eintracht Frankfurt", aliases: ["eintracht frankfurt", "frankfurt"] },
  { name: "VfB Stuttgart", aliases: ["vfb stuttgart", "stuttgart"] },
  { name: "Borussia Monchengladbach", aliases: ["borussia mönchengladbach", "monchengladbach", "gladbach"] },
  { name: "Wolfsburg", aliases: ["wolfsburg"] },
  { name: "Freiburg", aliases: ["freiburg"] },
  { name: "Union Berlin", aliases: ["union berlin"] },
  { name: "Mainz", aliases: ["mainz"] },
  { name: "Hoffenheim", aliases: ["hoffenheim"] },
  { name: "Werder Bremen", aliases: ["werder bremen"] },
  // More Ligue 1
  { name: "Lille", aliases: ["lille"] },
  { name: "Nice", aliases: ["ogc nice"] }, // bare "nice" is far too common a word to match safely
  { name: "Rennes", aliases: ["rennes"] },
  { name: "Lens", aliases: ["rc lens"] }, // bare "lens" collides with contact/camera lens
  { name: "Strasbourg", aliases: ["strasbourg"] },
  { name: "Toulouse", aliases: ["toulouse"] },
  // Netherlands / Portugal / Turkey
  { name: "PSV", aliases: ["psv eindhoven", "psv"] },
  { name: "Feyenoord", aliases: ["feyenoord"] },
  { name: "AZ Alkmaar", aliases: ["az alkmaar"] },
  { name: "Braga", aliases: ["sporting braga", "braga"] },
  { name: "Trabzonspor", aliases: ["trabzonspor"] },
  // Championship / EFL — frequent loan and sale destinations
  { name: "Middlesbrough", aliases: ["middlesbrough", "#boro"] },
  { name: "Norwich", aliases: ["norwich city", "norwich"] },
  { name: "West Brom", aliases: ["west bromwich albion", "west brom", "#wba"] },
  { name: "Sheffield United", aliases: ["sheffield united", "sheff utd"] },
  { name: "Sheffield Wednesday", aliases: ["sheffield wednesday", "sheff wed"] },
  { name: "Hull City", aliases: ["hull city", "hull"] },
  { name: "Coventry", aliases: ["coventry city", "coventry"] },
  { name: "Stoke", aliases: ["stoke city", "stoke"] },
  { name: "Swansea", aliases: ["swansea city", "swansea"] },
  { name: "Cardiff", aliases: ["cardiff city", "cardiff"] },
  { name: "Watford", aliases: ["watford"] },
  { name: "Millwall", aliases: ["millwall"] },
  { name: "Preston", aliases: ["preston north end", "preston"] },
  { name: "QPR", aliases: ["queens park rangers", "qpr"] },
  { name: "Blackburn", aliases: ["blackburn rovers", "blackburn"] },
  { name: "Bristol City", aliases: ["bristol city"] },
  { name: "Derby County", aliases: ["derby county"] },
  { name: "Portsmouth", aliases: ["portsmouth"] },
  { name: "Luton", aliases: ["luton town", "luton"] },
  { name: "Birmingham", aliases: ["birmingham city", "birmingham"] },
  { name: "Charlton", aliases: ["charlton athletic", "charlton"] },
  { name: "Wrexham", aliases: ["wrexham"] },
  { name: "Plymouth", aliases: ["plymouth argyle", "plymouth"] },
  { name: "Oxford United", aliases: ["oxford united"] },
];

/**
 * Deal stages in escalating order. Rank matters: saga updates and
 * scorecard verification compare ranks.
 */
export const STAGES = [
  { stage: "interest", rank: 1, label: "Interest" },
  { stage: "talks", rank: 2, label: "Talks" },
  { stage: "bid", rank: 3, label: "Bid" },
  { stage: "agreement", rank: 4, label: "Agreement" },
  { stage: "medical", rank: 5, label: "Medical" },
  { stage: "done", rank: 6, label: "Done deal" },
];

const STAGE_PATTERNS = [
  // Official confirmations are frequently headline-style ("Orozco signs for
  // United", "Man Utd officially confirm sixth summer signing", "Official:
  // X joins Y") rather than the narrower "has signed" / "done deal" wording
  // this pattern originally required — a real deal completing was missed
  // entirely (still scored as a live "agreement" rumour) because none of
  // the source tweets happened to use those exact phrases.
  ["done", /here we go|done deal|completed the signing|have completed|transfer complete|\bhas signed\b|\bhave signed\b|officially?\s+(?:announce[sd]?|confirm(?:s|ed)?|unveil(?:s|ed)?)|\bofficial\s*:|\bconfirms?\s+(?:the\s+)?(?:\w+\s+){0,3}signing\b|joins from|\bsigns\s+for\b|\bsigns\s+(?:a\s+)?(?:[\w-]+[- ]?year\s+)?(?:deal|contract)\b|announcement/i],
  ["medical", /\bmedical\b/i],
  ["agreement", /\b(agreement|agreed|personal terms|verbal agreement|set to sign|set to join|close to signing|close to joining|closing in on|on the verge|poised to)\b/i],
  ["bid", /\b(bid|offer|proposal|tabled|submitted|rejected|turned down|knocked back)\b/i],
  ["talks", /\b(talks|negotiations|discussions|meeting|contact)\b/i],
  ["interest", /\b(interest|interested|monitoring|tracking|targeting|eyeing|keen on|linked|enquir|inquir|scouting|shortlist|wants? to sign|looking to sign|pushing to sign|keeping tabs)\b/i],
];

const STAGE_RANK = Object.fromEntries(STAGES.map((s) => [s.stage, s.rank]));
const STAGE_LABEL = Object.fromEntries(STAGES.map((s) => [s.stage, s.label]));

export function stageRank(stage) {
  return STAGE_RANK[stage] || 0;
}

export function stageLabel(stage) {
  return STAGE_LABEL[stage] || stage;
}

/** Detect the most advanced deal stage mentioned in a tip. */
export function detectStage(text) {
  const t = String(text || "");
  for (const [stage, re] of STAGE_PATTERNS) {
    if (re.test(t)) return stage;
  }
  return null;
}

/** Every stage keyword found in the text, with its position. */
function findStageMatches(text) {
  const found = [];
  for (const [stage, re] of STAGE_PATTERNS) {
    const m = text.match(re);
    if (m) found.push({ stage, index: m.index });
  }
  return found;
}

/** Club mentions with positions, in order of appearance. */
export function extractClubMatches(text) {
  const lower = String(text || "").toLowerCase();
  const found = [];
  for (const club of CLUBS) {
    let idx = -1;
    let len = 0;
    for (const alias of club.aliases) {
      const i = alias.startsWith("#")
        ? lower.indexOf(alias)
        : indexOfWord(lower, alias);
      if (i !== -1 && (idx === -1 || i < idx)) {
        idx = i;
        len = alias.length;
      }
    }
    if (idx !== -1) found.push({ name: club.name, idx, len });
  }
  return found.sort((a, b) => a.idx - b.idx);
}

/** All clubs mentioned in a tip, canonical names, in order of appearance. */
export function extractClubs(text) {
  return extractClubMatches(text).map((c) => c.name);
}

/** Cues that mark the club BEFORE the pattern end as a destination. */
const TO_BEFORE = /(?:join(?:s|ing|ed)?|sign(?:s|ing|ed)?\s+for|mov(?:e|es|ed|ing)\s+to|switch(?:ing)?\s+to|heading\s+to|head(?:s|ed)?\s+to|loan(?:ed)?\s+(?:move\s+|switch\s+)?to|transfer(?:ring)?\s+to|sold\s+to|sale\s+to|poised\s+to\s+(?:move\s+to|join)|nearing\s+a\s+(?:switch|move)\s+to|on\s+his\s+way\s+to|→)\s*(?:the\s+)?$/i;

/** Cues that mark the club BEFORE the pattern end as the origin. */
const FROM_BEFORE = /(?:from|leav(?:e|es|ing)|left|exit(?:s|ing)?(?:\s+from)?|depart(?:s|ing|ure)?(?:\s+from)?|away\s+from|out\s+of)\s*(?:the\s+)?$/i;

/** Cues right AFTER a club that mark it as the origin (possessive / squad role). */
const FROM_AFTER = /^(?:'|’)?s?\s*(?:defender|midfielder|striker|forward|winger|goalkeeper|keeper|full-?back|centre-?back|youngster|starlet|academy|captain|star|man|player|outcast)\b/i;

/** Cues right AFTER a club that mark it as the acquiring side. */
const TO_AFTER = /^\s*(?:have|has)\s+(?:signed|brought\s+in|completed|wrapped\s+up|sealed|agreed\s+(?:a\s+)?(?:deal|terms)\s+to\s+sign|agreed\s+a\s+fee\s+(?:with|for)|recruit|submitted|tabled|lodged|sent|bid|made\s+an?\s+(?:offer|bid)|opened\s+talks|approached|enquired|asked\s+about)/i;

/** Cues right AFTER a club that mark it as the selling side. */
const SELL_AFTER = /^\s*(?:have|has)\s+(?:sold|agreed\s+to\s+sell|received|rejected|turned\s+down|knocked\s+back|let\s+.*\s+(?:go|leave)|sanctioned|green-?lit)|^\s*(?:are|is)\s+(?:willing\s+to\s+sell|prepared\s+to\s+sell|ready\s+to\s+sell|considering\s+offers)|^\s*(?:are|is)?\s*open\s+to(?:\s+offers|\s+selling|\s+a\s+sale)?\b/i;

/** Interest cues AFTER a club — the interested club is the destination. */
const INTEREST_AFTER = /^\s*(?:are|is|have|has|remain)\s+(?:interested|keen|monitoring|tracking|keeping\s+tabs|eyeing|targeting|in\s+talks|pushing|leading\s+the\s+race|favourites)/i;

/** Contract renewal / stay cues — this is not a transfer. */
// "new (?:contract|deal|terms)" alone missed common real-world phrasing like
// "a new long-term contract" / "a new five-year deal" / "a new bumper
// contract extension" — the adjective between "new" and the noun broke the
// direct-adjacency match. Now allows up to 3 filler words/hyphenated tokens.
const RENEWAL_CUES = /\b(?:new(?:\s+[a-z-]+){0,3}\s+(?:contract|deal|terms)|contract (?:extension|offer|renewal|talks)|extend(?:s|ed|ing)? (?:his |her |their )?(?:contract|stay|deal)|extension (?:at|with|until)|renew(?:s|ed|ing|al)?|stay(?:s|ing)? (?:at|with|put)|set to stay|expected to stay|wants? to stay|commit(?:s|ted|ting)? (?:his|her|their) future|pen(?:s|ned|ning)? a new|fresh terms|improved (?:contract|deal|terms)|(?:contract|deal) until 20\d\d|tie (?:him|her|them) down|off the market|reached (?:a |an )?(?:verbal )?agreement on a new|verbal agreement on (?:a |an )?new)\b/i;

/**
 * True when a tip is about a player staying / re-signing, not moving.
 * A clear two-club transfer direction overrides renewal wording.
 */
export function detectRenewal(text) {
  const raw = String(text || "");
  if (!RENEWAL_CUES.test(raw)) return false;
  // Transfer signals override renewal wording:
  const { to, from } = detectDirection(raw);
  if (from) return false; // leaving/sold-by cues = a move, not a stay
  if (to && from && to !== from) return false;
  if (extractClubs(raw).length >= 2) return false; // two clubs = transfer story
  if (/\b(?:transfer )?fee\b/i.test(raw)) return false; // renewals have no fee
  return true;
}

/**
 * Renewal flag for a log entry. Always re-derived from the original text
 * with the CURRENT detectRenewal logic when available — trusting a stored
 * isRenewal flag blindly meant a tip logged before a renewal-detection fix
 * (e.g. the "new long-term contract" phrasing gap) stayed wrongly flagged
 * as a transfer forever, even after the underlying bug was fixed. Only
 * falls back to the stored flag when there's no original text to re-check.
 */
export function entryRenewal(e) {
  if (e?.original) return detectRenewal(e.original);
  if (typeof e?.isRenewal === "boolean") return e.isRenewal;
  return false;
}

/**
 * Work out transfer direction: which club the player is heading to (`to`)
 * and which he is leaving (`from`). Null when the text doesn't say.
 */
export function detectDirection(text) {
  const raw = String(text || "");
  const matches = extractClubMatches(raw);
  let to = null;
  let from = null;

  // Pass 1: explicit, low-ambiguity signals only ("from Newcastle", "sold
  // to Arsenal", "have submitted a bid"). These always win regardless of
  // where in the sentence they land.
  for (const m of matches) {
    const pre = raw.slice(Math.max(0, m.idx - 42), m.idx);
    const post = raw.slice(m.idx + m.len, m.idx + m.len + 60);
    if (!to && TO_BEFORE.test(pre)) to = m.name;
    else if (!to && TO_AFTER.test(post)) to = m.name;
    if (!from && FROM_BEFORE.test(pre)) from = m.name;
    else if (!from && SELL_AFTER.test(post)) from = m.name;
  }

  // Pass 2: weaker heuristics only fill remaining gaps. FROM_AFTER in
  // particular ("Arsenal captain Martin Odegaard says...") can misfire on a
  // role word introducing an unrelated quoted person rather than the
  // transfer target, so it must never override a slot pass 1 already
  // settled, and must never claim a club already assigned to the other side.
  for (const m of matches) {
    if (to && from) break;
    const post = raw.slice(m.idx + m.len, m.idx + m.len + 60);
    if (!to && !from && INTEREST_AFTER.test(post) && m.name !== from) to = m.name;
    if (!from && !to && FROM_AFTER.test(post) && m.name !== to) from = m.name;
  }

  // Two clubs, one side known -> the other is the opposite side
  const names = matches.map((m) => m.name);
  if (names.length === 2) {
    if (to && !from && names.includes(to)) from = names.find((n) => n !== to);
    if (from && !to && names.includes(from)) to = names.find((n) => n !== from);
  }
  if (to && to === from) from = null;

  return { to, from };
}

function indexOfWord(lower, alias) {
  const escaped = alias.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const m = lower.match(new RegExp(`(?:^|[^a-z0-9])(${escaped})(?:[^a-z0-9]|$)`, "i"));
  return m ? m.index + m[0].indexOf(m[1]) : -1;
}

/**
 * Nickname -> canonical full name. Breakers routinely use a player's
 * nickname instead of their formal name (Fabrizio Romano tweeting "Cuti
 * Romero" for Cristian Romero, for example). Without this, the nickname
 * and the full name key to two different "players" and the desk ends up
 * running two separate rumour trackers — and posting twice — for the same
 * real-world story. Extend this list as new mismatches turn up; only add
 * an entry you're confident about, since a wrong mapping silently merges
 * two different real players into one.
 */
export const PLAYER_NICKNAMES = {
  "cuti romero": "Cristian Romero",
};

function applyNickname(name) {
  if (!name) return name;
  return PLAYER_NICKNAMES[name.toLowerCase()] || name;
}

/** Words that look like names but never are. */
const NOT_NAME_WORDS = new Set([
  "breaking", "exclusive", "excl", "exc", "just", "in", "here", "we", "go",
  "premier", "league", "champions", "europa", "cup", "club", "clubs", "united",
  "city", "the", "new", "old", "fc", "afc", "sources", "story", "confirmed",
  "understand", "understand.", "official", "update", "latest", "deal", "done",
  "medical", "talks", "bid", "loan", "january", "february", "march", "april",
  "may", "june", "july", "august", "september", "october", "november",
  "december", "monday", "tuesday", "wednesday", "thursday", "friday",
  "saturday", "sunday", "sky", "sports", "bbc", "cnn", "espn", "word",
  "reports", "rumour", "rumor", "transfer", "window", "deadline", "day",
  "more", "after", "before", "with", "from", "for", "and", "but", "his",
  "her", "their", "this", "that", "liga", "clasico", "clásico",
]);

/** Non-player roles: a name right after one of these is staff, not a player. */
const ROLE_BEFORE = /(?:chairman|chairwoman|chief executive|ceo|president|owner|manager|head coach|coach|boss|sporting director|director|agent|journalist|reporter|scout)\s*$/i;

/**
 * Staff/executive hire announcements ("Ben Latty rejoins Liverpool as
 * commercial director") read a lot like transfer news to the filter —
 * appointed/joins/rejoins are common to both — but the ROLE word sits
 * AFTER the name here, not before it, so ROLE_BEFORE alone misses it.
 * A plain character-count window (not clause-scoped) is used deliberately:
 * a comma-separated appositive ("...rejoins Liverpool, taking up the
 * commercial director role") describes the SAME person across what
 * cleanForNames() treats as a clause break, so stopping at the ¦ marker
 * cut this off too early. Missing a staff mention is worse here than the
 * rare case of a distant, unrelated role word coincidentally following a
 * real player's name.
 */
const ROLE_AFTER = /^[^\n]{0,70}\b(?:commercial director|chief executive(?:\s+officer)?|\bceo\b|chairman|chairwoman|managing director|technical director|sporting director|director of football|head of recruitment|academy director|chief commercial officer|\bcco\b|chief financial officer|\bcfo\b|chief operating officer|\bcoo\b|general manager|club president|vice[- ]president|board member|non-executive director)\b/i;

const CLUB_WORDS = new Set(
  CLUBS.flatMap((c) => [
    ...c.name.toLowerCase().split(/\s+/),
    ...c.aliases.flatMap((a) => a.replace(/^#/, "").split(/\s+/)),
  ])
);

/** Generic club-name suffixes: "Ipswich Town", "Leicester City", "Bolton Wanderers"… */
const CLUB_SUFFIX_WORDS = new Set([
  "town", "city", "united", "utd", "albion", "rovers", "wanderers", "county",
  "athletic", "hotspur", "palace", "forest", "argyle", "orient", "rangers",
  "wednesday", "north", "end", "fc", "afc",
]);

function isClubWord(w) {
  const clean = w.replace(/['’]s$/, "");
  return CLUB_WORDS.has(clean) || CLUB_SUFFIX_WORDS.has(clean);
}

/** True if a "name" is really a club: every word is a club word or suffix. */
export function isClubbish(name) {
  if (!name) return false;
  const words = name.toLowerCase().replace(/[.,!?]+$/, "").split(/\s+/);
  return words.length > 0 && words.every(isClubWord);
}

/**
 * Trustworthy player name for a log entry. Stored names that are actually
 * clubs (logged by older parser versions) are re-extracted from the
 * original text; returns null when there is no credible player.
 */
export function entryPlayer(e) {
  if (e?.player && !isClubbish(e.player)) return applyNickname(e.player);
  const fresh = extractPlayer(e?.original || "");
  return fresh && !isClubbish(fresh) ? fresh : null;
}

/**
 * Grouping key for a log entry, always freshly derived from entryPlayer()
 * rather than trusting the stored e.playerKey — the same reasoning as
 * entryRenewal(): a key computed and cached at log time can't benefit from
 * a later canonicalization fix (e.g. a new nickname mapping) unless
 * consumers re-derive it. Every feature that groups log entries by player
 * (radar, saga, consensus, scorecard, contract watch, pulse) should use
 * this instead of reading e.playerKey directly, so a fix like "Cuti Romero"
 * -> "Cristian Romero" retroactively re-merges already-logged tips instead
 * of leaving the desk tracking (and posting about) two separate "players".
 */
export function entryPlayerKey(e) {
  return playerKey(entryPlayer(e));
}

/**
 * Best-effort player name extraction: first run of 2–4 capitalised words
 * that isn't a club, competition, or known junk. Falls back to null.
 */
/** Cleaned text used consistently by both player-candidate and stage-position scanning. */
function cleanForNames(text) {
  return String(text || "")
    .replace(/https?:\/\/\S+/g, " ")
    .replace(/[@#]\w+/g, " ")
    .replace(/["“”«»]/g, " ")
    // Break capitalised-word runs at sentence/clause boundaries so
    // "…Alexander Isak. Negotiations underway" doesn't merge.
    .replace(/[.!?,;:]\s+/g, " ¦ ");
}

/**
 * Every plausible player name in the text (2–4 capitalised words, staff and
 * club names filtered out), each with its position in the cleaned text.
 * A tip naming two different transfer subjects — "James Trafford completes
 * medical... Man City turn to Geronimo Rulli as backup" — yields two
 * candidates here; extractEntities() uses their positions relative to the
 * stage keywords to work out which one the story is actually about.
 */
export function extractPlayerCandidates(text) {
  const clean = cleanForNames(text);
  const NAME_TOKEN = "\\p{Lu}[\\p{L}'’.-]+";
  // Lowercase particles allowed inside names: de Ligt, van Dijk, dos Santos…
  const PARTICLE = "(?:de|del|della|di|da|van|von|der|den|ter|ten|la|le|dos|das|el|al)";
  const runRe = new RegExp(
    `(?:${NAME_TOKEN})(?:\\s+(?:${PARTICLE}\\s+)?(?:${NAME_TOKEN})){1,3}`,
    "gu"
  );

  const candidates = [];
  for (const m of clean.matchAll(runRe)) {
    // Skip staff names: "Crystal Palace chairman Steve Parish", "boss Mikel Arteta"
    if (ROLE_BEFORE.test(clean.slice(0, m.index))) continue;
    // Skip staff hire announcements where the role comes AFTER the name:
    // "Ben Latty rejoins Liverpool as commercial director" — reads like a
    // transfer (appointed/joins/rejoins) but isn't a player move at all.
    if (ROLE_AFTER.test(clean.slice(m.index + m[0].length))) continue;
    const words = m[0].split(/\s+/);
    const lowerWords = words.map((w) => w.toLowerCase().replace(/[.,!?]+$/, ""));
    if (lowerWords.some((w) => NOT_NAME_WORDS.has(w))) continue;
    if (lowerWords.every(isClubWord)) continue;
    // Drop leading club words ("Tottenham's Ashley Phillips" → "Ashley Phillips")
    while (lowerWords.length > 1 && isClubWord(lowerWords[0])) {
      lowerWords.shift();
      words.shift();
    }
    // Drop trailing club words ("Alexander Isak Newcastle" → "Alexander Isak")
    while (lowerWords.length > 1 && isClubWord(lowerWords[lowerWords.length - 1])) {
      lowerWords.pop();
      words.pop();
    }
    if (words.length < 2 || lowerWords.some(isClubWord)) continue;
    const name = applyNickname(words.join(" ").replace(/[.,!?]+$/, ""));
    if (!candidates.some((c) => c.name === name)) candidates.push({ name, index: m.index });
  }
  return candidates;
}

/** Best-effort single player name — first valid candidate found. */
export function extractPlayer(text) {
  return extractPlayerCandidates(text)[0]?.name ?? null;
}

/**
 * When a tip names more than one plausible player, work out which one the
 * story is actually about using clause boundaries (the "¦" breaks
 * cleanForNames() inserts at sentence/clause punctuation), not raw
 * character distance across the whole tip. Raw nearest-distance was tried
 * first and got two real cases backwards:
 *   - "James Trafford completes medical... Man City now targeting Geronimo
 *     Rulli as backup" — "targeting" sits immediately next to "Rulli", so
 *     nearest-distance picked Rulli/interest over the correct Trafford/
 *     medical, even though medical is the far more advanced (higher-rank)
 *     stage and belongs to a clause naming only Trafford.
 *   - "Arsenal want Bruno Guimarães to partner Declan Rice in midfield,
 *     initial contact made with Newcastle" — Rice is only an incidental
 *     mention (object of "partner"), but sits textually closer to "contact"
 *     than the real subject Guimarães does, so nearest-distance wrongly
 *     picked Rice/talks.
 *
 * Fix: attribute each stage keyword to a candidate using clause-local
 * evidence, weighted by stage rank so a clearly more advanced stage
 * (medical) beats a weaker one (interest) even if the weaker one sits
 * physically closer to some other name:
 *   1. A clause containing exactly ONE candidate claims any stage keyword
 *      in that same clause outright (unambiguous local attribution).
 *   2. A clause with 2+ candidates and a stage keyword resolves by nearest
 *      distance WITHIN that clause only.
 *   3. A stage keyword whose own clause has no candidate at all (like the
 *      Guimarães/Rice trailing clause) is attributed to the tip's
 *      first-mentioned candidate — the default subject — rather than
 *      whichever name happens to sit closest across a clause boundary.
 *   4. Among all resulting (candidate, stage) pairings, the highest-rank
 *      stage wins; ties break toward the first-mentioned candidate.
 */
export function extractSubjectAndStage(text) {
  const clean = cleanForNames(text);
  const candidates = extractPlayerCandidates(text);
  const stageMatches = findStageMatches(clean);

  if (candidates.length <= 1 || !stageMatches.length) {
    return { player: candidates[0]?.name ?? null, stage: detectStage(text) };
  }

  // Clause boundaries from the "¦" markers cleanForNames() inserts.
  const clauseBreaks = [];
  const breakRe = /¦/g;
  let m;
  while ((m = breakRe.exec(clean))) clauseBreaks.push(m.index);
  const clauseOf = (idx) => clauseBreaks.filter((b) => b < idx).length;

  const candidatesByClause = new Map();
  for (const c of candidates) {
    const cl = clauseOf(c.index);
    if (!candidatesByClause.has(cl)) candidatesByClause.set(cl, []);
    candidatesByClause.get(cl).push(c);
  }

  const pairings = [];
  for (const s of stageMatches) {
    const cl = clauseOf(s.index);
    const local = candidatesByClause.get(cl) || [];
    if (local.length === 1) {
      pairings.push({ player: local[0].name, stage: s.stage, index: local[0].index });
    } else if (local.length > 1) {
      const nearest = local.reduce((best, c) =>
        Math.abs(c.index - s.index) < Math.abs(best.index - s.index) ? c : best
      );
      pairings.push({ player: nearest.name, stage: s.stage, index: nearest.index });
    } else {
      // Orphan stage keyword: no candidate shares its clause — attribute
      // to the tip's default (first-mentioned) subject.
      pairings.push({ player: candidates[0].name, stage: s.stage, index: candidates[0].index });
    }
  }

  const best = pairings.reduce((top, p) => {
    if (!top) return p;
    if (stageRank(p.stage) !== stageRank(top.stage)) {
      return stageRank(p.stage) > stageRank(top.stage) ? p : top;
    }
    return p.index < top.index ? p : top; // tie-break: first-mentioned wins
  }, null);

  return { player: best.player, stage: best.stage };
}

/** Stable key for grouping tips about the same player. */
export function playerKey(name) {
  if (!name) return null;
  return name
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z\s]/g, "")
    .trim()
    .split(/\s+/)
    .slice(-2) // surname-weighted: "alexander isak" and "alex isak" still differ, but middle names collapse
    .join(" ");
}

/**
 * Fallback: a single capitalised word that could be a surname-only mention
 * ("Isak now advancing", "Saka wanted by Real Madrid"). Returned as a bare
 * candidate — callers must resolve it against known full names before
 * trusting it, since one surname alone is too weak to key a story on.
 */
export function extractSurnameCandidate(text) {
  const clean = String(text || "")
    .replace(/https?:\/\/\S+/g, " ")
    .replace(/[@#]\w+/g, " ")
    .replace(/["“”«»]/g, " ")
    .replace(/[.!?,;:]\s+/g, " ¦ ");

  const NAME_TOKEN = "\\p{Lu}[\\p{L}'’.-]+";
  const re = new RegExp(NAME_TOKEN, "gu");

  for (const m of clean.matchAll(re)) {
    if (ROLE_BEFORE.test(clean.slice(0, m.index))) continue;
    const word = m[0].replace(/[.,!?]+$/, "");
    const lower = word.toLowerCase();
    if (NOT_NAME_WORDS.has(lower) || isClubWord(lower)) continue;
    if (word.length < 3) continue;
    // Skip the start of a sentence/tweet-boundary token like "Understand" —
    // already filtered by NOT_NAME_WORDS for known cases, but also require
    // it isn't immediately followed by a colon (label-style prefixes).
    if (/^\s*:/.test(clean.slice(m.index + m[0].length))) continue;
    return word;
  }
  return null;
}

/**
 * Build a surname -> full name index from existing log entries, so a later
 * tip that only uses a surname ("Isak") can be linked to the player already
 * established by an earlier full-name mention ("Alexander Isak"). Ambiguous
 * surnames (shared by 2+ different known players) resolve to null rather
 * than risk mixing two players' stories together.
 */
export function buildSurnameIndex(log) {
  const bySurname = new Map();
  for (const e of log) {
    const name = entryPlayer(e);
    if (!name) continue;
    const surname = name.trim().split(/\s+/).pop().toLowerCase();
    if (!bySurname.has(surname)) bySurname.set(surname, new Set());
    bySurname.get(surname).add(name);
  }
  const resolved = new Map();
  for (const [surname, names] of bySurname) {
    if (names.size === 1) resolved.set(surname, [...names][0]);
  }
  return resolved;
}

/** Extract everything at once from a tip's original text. */
export function extractEntities(text, { surnameIndex } = {}) {
  let { player, stage } = extractSubjectAndStage(text);
  if (!player && surnameIndex) {
    const candidate = extractSurnameCandidate(text);
    if (candidate) {
      const resolved = surnameIndex.get(candidate.toLowerCase());
      if (resolved) player = resolved;
    }
  }
  const { to, from } = detectDirection(text);
  return {
    player,
    playerKey: playerKey(player),
    clubs: extractClubs(text),
    toClub: to,
    fromClub: from,
    isRenewal: detectRenewal(text),
    stage,
    fee: extractFeeMillions(String(text || "")),
  };
}

/**
 * Resolve direction across a story's events (latest signal wins).
 * Falls back to first mentioned club as destination ONLY if no origin
 * evidence exists — never shows the selling club as the destination.
 */
/**
 * Direction for a single log entry. Entries logged before direction parsing
 * existed are re-analysed from their stored original text.
 */
export function entryDirection(e) {
  if (e.toClub || e.fromClub) return { to: e.toClub || null, from: e.fromClub || null };
  if (e.original) return detectDirection(e.original);
  return { to: null, from: null };
}

export function resolveMove(events) {
  let to = null;
  let from = null;
  for (let i = events.length - 1; i >= 0; i--) {
    const dir = entryDirection(events[i]);
    if (!to && dir.to) to = dir.to;
    if (!from && dir.from) from = dir.from;
  }
  if (!to && !from) {
    for (let i = events.length - 1; i >= 0; i--) {
      const clubs = events[i].clubs?.length ? events[i].clubs : extractClubs(events[i].original || "");
      if (clubs.length) {
        to = clubs[0];
        break;
      }
    }
  }
  if (!to && from) {
    // Known origin, unknown destination: try any other mentioned club
    for (let i = events.length - 1; i >= 0; i--) {
      const clubs = events[i].clubs?.length ? events[i].clubs : extractClubs(events[i].original || "");
      const other = clubs.find((c) => c !== from);
      if (other) {
        to = other;
        break;
      }
    }
  }
  if (to && to === from) to = null;
  return { to, from };
}

/** "Player → Club" when destination is known, "Player leaving Club" otherwise. */
export function moveLabel(player, { to, from }) {
  if (to) return `${player} → ${to}`;
  if (from) return `${player} leaving ${from}`;
  return player;
}
