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
  ["agreement", /\b(agreement|agreed|personal terms|verbal agreement|set to sign|set to join|close to signing|close to joining|on the verge|poised to)\b/i],
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

/** All clubs mentioned in a tip, canonical names, in order of appearance. */
export function extractClubs(text) {
  const lower = String(text || "").toLowerCase();
  const found = [];
  for (const club of CLUBS) {
    let idx = -1;
    for (const alias of club.aliases) {
      const i = alias.startsWith("#")
        ? lower.indexOf(alias)
        : indexOfWord(lower, alias);
      if (i !== -1 && (idx === -1 || i < idx)) idx = i;
    }
    if (idx !== -1) found.push({ name: club.name, idx });
  }
  return found.sort((a, b) => a.idx - b.idx).map((c) => c.name);
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

  for (const m of clean.matchAll(runRe)) {
    const words = m[0].split(/\s+/);
    const lowerWords = words.map((w) => w.toLowerCase().replace(/[.,!?]+$/, ""));
    if (lowerWords.some((w) => NOT_NAME_WORDS.has(w))) continue;
    if (lowerWords.every((w) => CLUB_WORDS.has(w))) continue;
    // Drop trailing club words ("Alexander Isak Newcastle" → "Alexander Isak")
    while (lowerWords.length > 1 && CLUB_WORDS.has(lowerWords[lowerWords.length - 1])) {
      lowerWords.pop();
      words.pop();
    }
    if (words.length < 2) continue;
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
  return {
    player,
    playerKey: playerKey(player),
    clubs: extractClubs(text),
    stage: detectStage(text),
    fee: extractFeeMillions(String(text || "")),
  };
}
