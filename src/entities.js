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
  { name: "Ipswich", aliases: ["ipswich"] },
  { name: "Leicester", aliases: ["leicester"] },
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
  ["done", /\b(here we go|done deal|completed the signing|have completed|transfer complete|has signed|have signed|officially?\s+(?:announced|confirmed|unveiled)|joins from|announcement)\b/i],
  ["medical", /\bmedical\b/i],
  ["agreement", /\b(agreement|agreed|personal terms|verbal agreement|set to sign|set to join|close to signing|close to joining|closing in on|on the verge|poised to)\b/i],
  ["bid", /\b(bid|offer|proposal|tabled|submitted|rejected|turned down|knocked back)\b/i],
  ["talks", /\b(talks|negotiations|discussions|meeting|contact)\b/i],
  ["interest", /\b(interest|interested|monitoring|tracking|targeting|eyeing|keen on|linked|enquir|inquir|scouting|shortlist)\b/i],
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
const TO_AFTER = /^\s*(?:have|has)\s+(?:signed|brought\s+in|completed|wrapped\s+up|sealed|agreed\s+(?:a\s+)?(?:deal|terms)\s+to\s+sign|recruit|submitted|tabled|lodged|sent|bid|made\s+an?\s+(?:offer|bid)|opened\s+talks|approached|enquired|asked\s+about)/i;

/** Cues right AFTER a club that mark it as the selling side. */
const SELL_AFTER = /^\s*(?:have|has)\s+(?:sold|agreed\s+to\s+sell|received|rejected|turned\s+down|knocked\s+back|let\s+.*\s+(?:go|leave)|sanctioned|green-?lit)/i;

/** Interest cues AFTER a club — the interested club is the destination. */
const INTEREST_AFTER = /^\s*(?:are|is|have|has|remain)\s+(?:interested|keen|monitoring|tracking|keeping\s+tabs|eyeing|targeting|in\s+talks|pushing|leading\s+the\s+race|favourites)/i;

/**
 * Work out transfer direction: which club the player is heading to (`to`)
 * and which he is leaving (`from`). Null when the text doesn't say.
 */
export function detectDirection(text) {
  const raw = String(text || "");
  const matches = extractClubMatches(raw);
  let to = null;
  let from = null;

  for (const m of matches) {
    const pre = raw.slice(Math.max(0, m.idx - 42), m.idx);
    const post = raw.slice(m.idx + m.len, m.idx + m.len + 60);

    if (!to && TO_BEFORE.test(pre)) to = m.name;
    else if (!to && (TO_AFTER.test(post) || INTEREST_AFTER.test(post))) to = m.name;

    if (!from && FROM_BEFORE.test(pre)) from = m.name;
    else if (!from && (FROM_AFTER.test(post) || SELL_AFTER.test(post))) from = m.name;
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
  "her", "their", "this", "that", "los", "las", "el", "la", "de", "di",
]);

const CLUB_WORDS = new Set(
  CLUBS.flatMap((c) => [
    ...c.name.toLowerCase().split(/\s+/),
    ...c.aliases.flatMap((a) => a.replace(/^#/, "").split(/\s+/)),
  ])
);

/**
 * Best-effort player name extraction: first run of 2–4 capitalised words
 * that isn't a club, competition, or known junk. Falls back to null.
 */
export function extractPlayer(text) {
  const clean = String(text || "")
    .replace(/https?:\/\/\S+/g, " ")
    .replace(/[@#]\w+/g, " ")
    .replace(/["“”«»]/g, " ")
    // Break capitalised-word runs at sentence/clause boundaries so
    // "…Alexander Isak. Negotiations underway" doesn't merge.
    .replace(/[.!?,;:]\s+/g, " ¦ ");

  const NAME_TOKEN = "\\p{Lu}[\\p{L}'’.-]+";
  const runRe = new RegExp(`(?:${NAME_TOKEN})(?:\\s+(?:${NAME_TOKEN})){1,3}`, "gu");

  const clubWord = (w) => CLUB_WORDS.has(w.replace(/['’]s$/, ""));

  for (const m of clean.matchAll(runRe)) {
    const words = m[0].split(/\s+/);
    const lowerWords = words.map((w) => w.toLowerCase().replace(/[.,!?]+$/, ""));
    if (lowerWords.some((w) => NOT_NAME_WORDS.has(w))) continue;
    if (lowerWords.every(clubWord)) continue;
    // Drop leading club words ("Tottenham's Ashley Phillips" → "Ashley Phillips")
    while (lowerWords.length > 1 && clubWord(lowerWords[0])) {
      lowerWords.shift();
      words.shift();
    }
    // Drop trailing club words ("Alexander Isak Newcastle" → "Alexander Isak")
    while (lowerWords.length > 1 && clubWord(lowerWords[lowerWords.length - 1])) {
      lowerWords.pop();
      words.pop();
    }
    if (words.length < 2 || lowerWords.some(clubWord)) continue;
    return words.join(" ").replace(/[.,!?]+$/, "");
  }
  return null;
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

/** Extract everything at once from a tip's original text. */
export function extractEntities(text) {
  const player = extractPlayer(text);
  const { to, from } = detectDirection(text);
  return {
    player,
    playerKey: playerKey(player),
    clubs: extractClubs(text),
    toClub: to,
    fromClub: from,
    stage: detectStage(text),
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
