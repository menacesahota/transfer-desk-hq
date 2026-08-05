import { PREMIER_LEAGUE_TERMS, ELITE_EUROPE_TERMS } from "./config.js";

/** Canonical club key → Wikipedia-friendly stadium title. */
export const CLUB_STADIUMS = {
  arsenal: "Emirates Stadium",
  chelsea: "Stamford Bridge",
  liverpool: "Anfield",
  "manchester united": "Old Trafford",
  "man united": "Old Trafford",
  "man utd": "Old Trafford",
  "manchester city": "City of Manchester Stadium",
  "man city": "City of Manchester Stadium",
  tottenham: "Tottenham Hotspur Stadium",
  spurs: "Tottenham Hotspur Stadium",
  newcastle: "St James' Park",
  "aston villa": "Villa Park",
  "west ham": "London Stadium",
  brighton: "Falmer Stadium",
  fulham: "Craven Cottage",
  brentford: "Brentford Community Stadium",
  "crystal palace": "Selhurst Park",
  wolves: "Molineux Stadium",
  wolverhampton: "Molineux Stadium",
  everton: "Hill Dickinson Stadium",
  "nottingham forest": "City Ground",
  "nottm forest": "City Ground",
  bournemouth: "Dean Court",
  leeds: "Elland Road",
  "leeds united": "Elland Road",
  sunderland: "Stadium of Light",
  burnley: "Turf Moor",
  ipswich: "Portman Road",
  leicester: "King Power Stadium",
  southampton: "St Mary's Stadium",
  "real madrid": "Santiago Bernabéu Stadium",
  barcelona: "Camp Nou",
  barca: "Camp Nou",
  "atletico madrid": "Metropolitano Stadium",
  "atlético madrid": "Metropolitano Stadium",
  bayern: "Allianz Arena",
  "bayern munich": "Allianz Arena",
  dortmund: "Westfalenstadion",
  "borussia dortmund": "Westfalenstadion",
  bvb: "Westfalenstadion",
  psg: "Parc des Princes",
  "paris saint-germain": "Parc des Princes",
  "paris saint germain": "Parc des Princes",
  juventus: "Juventus Stadium",
  juve: "Juventus Stadium",
  "inter milan": "San Siro",
  inter: "San Siro",
  "ac milan": "San Siro",
  milan: "San Siro",
  napoli: "Stadio Diego Armando Maradona",
  roma: "Stadio Olimpico",
  "as roma": "Stadio Olimpico",
  lazio: "Stadio Olimpico",
  ajax: "Johan Cruyff Arena",
  benfica: "Estádio da Luz",
  porto: "Estádio do Dragão",
  "sporting cp": "Estádio José Alvalade",
  "rb leipzig": "Red Bull Arena (Leipzig)",
  leipzig: "Red Bull Arena (Leipzig)",
  "bayer leverkusen": "BayArena",
  leverkusen: "BayArena",
  marseille: "Stade Vélodrome",
  "olympique marseille": "Stade Vélodrome",
  lyon: "Parc Olympique Lyonnais",
  monaco: "Stade Louis II",
  sevilla: "Ramón Sánchez Pizjuán Stadium",
  celtic: "Celtic Park",
  rangers: "Ibrox Stadium",
};

const CLUB_PHRASES = [
  ...PREMIER_LEAGUE_TERMS,
  ...ELITE_EUROPE_TERMS,
  ...Object.keys(CLUB_STADIUMS),
]
  .map((t) => t.replace(/^#/, "").toLowerCase())
  .filter((t, i, arr) => arr.indexOf(t) === i)
  .sort((a, b) => b.length - a.length);

const STOPWORDS = new Set([
  "and", "at", "for", "from", "with", "as", "after", "before", "over", "under",
  "into", "onto", "about", "his", "her", "their", "the", "a", "an", "to", "on",
  "in", "of", "by", "vs", "versus", "loan", "deal", "fee", "bid", "offer", "talks",
  "move", "medical", "situation", "monitoring", "tracking", "interest", "interested",
  "rumoured", "rumored", "rumour", "rumor",
]);

const TOKEN = String.raw`[A-ZÀ-ÖØ-Þ](?:[A-Za-zÀ-ÖØ-öø-ÿ]|[''.-]){1,24}`;

/**
 * Prefer a player photo; otherwise a club stadium photo.
 * Never uses the source tweet's media.
 */
export async function resolveSubjectImage(text) {
  const player = extractPlayerName(text);
  if (player) {
    const url = await findPlayerImageUrl(player, text);
    if (url) {
      return { type: "player", name: player, imageUrl: url };
    }
  }

  const club = extractClubName(text);
  if (club) {
    const url = await findStadiumImageUrl(club);
    if (url) {
      return { type: "stadium", name: club, imageUrl: url };
    }
  }

  return null;
}

export function extractPlayerName(text) {
  const cleaned = String(text || "")
    .replace(/https?:\/\/\S+/gi, " ")
    .replace(/#[A-Za-z0-9_]+/g, " ")
    .replace(/@\w+/g, " ")
    .replace(/[“”]/g, '"')
    .replace(/\s+/g, " ")
    .trim();

  const patterns = [
    String.raw`\b(?:interested in|linked with|linked to|keen on|eyeing|targeting|bid for|offer for|signing of|signed|sign|move for|deal for|to sign)\s+(${TOKEN}(?:\s+${TOKEN}){0,3})`,
    String.raw`\b(${TOKEN}(?:\s+${TOKEN}){0,3})\s+(?:to join|set to join|set to sign|will join|has joined|joins|joining)`,
    String.raw`\b(?:for|of)\s+(${TOKEN}(?:\s+${TOKEN}){0,3})\s+from\b`,
  ];

  const candidates = [];
  for (const src of patterns) {
    const re = new RegExp(src, "gi");
    for (const m of cleaned.matchAll(re)) {
      const clipped = clipName(m[1]);
      if (clipped) candidates.push(clipped);
    }
  }

  if (!candidates.length) {
    const re = new RegExp(`${TOKEN}(?:\\s+${TOKEN}){1,2}`, "g");
    for (const m of cleaned.matchAll(re)) {
      const clipped = clipName(m[0]);
      if (clipped) candidates.push(clipped);
    }
  }

  for (const c of candidates) {
    if (isLikelyPlayerName(c)) return c;
  }
  return null;
}

/** Longest club phrase mentioned in the tip. */
export function extractClubName(text) {
  const lower = String(text || "").toLowerCase();
  for (const club of CLUB_PHRASES) {
    if (club.length < 4) continue;
    if (club.startsWith("#")) {
      if (lower.includes(club)) return club.replace(/^#/, "");
      continue;
    }
    const escaped = club.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const re = new RegExp(`(?:^|[^a-z0-9])${escaped}(?:[^a-z0-9]|$)`, "i");
    if (re.test(lower)) return club;
  }
  return null;
}

function clipName(raw) {
  const parts = String(raw || "").trim().split(/\s+/).filter(Boolean);
  const keep = [];
  for (const p of parts) {
    if (STOPWORDS.has(p.toLowerCase())) break;
    if (!/^[A-ZÀ-ÖØ-Þ]/.test(p)) break;
    keep.push(p);
    if (keep.length >= 3) break;
  }
  return keep.join(" ").trim();
}

function isLikelyPlayerName(name) {
  const n = name.trim();
  if (n.length < 4 || n.length > 50) return false;
  const lower = n.toLowerCase();
  if (CLUB_PHRASES.some((club) => lower === club || lower.startsWith(club + " ") || lower.endsWith(" " + club))) {
    return false;
  }
  const parts = n.split(/\s+/);
  if (parts.length === 1 && parts[0].length < 6) return false;
  return true;
}

export async function findPlayerImageUrl(playerName, contextText = "") {
  if (!playerName) return null;

  const clubHint = extractClubName(contextText);
  const queries = [
    clubHint ? `${playerName} ${clubHint}` : null,
    `${playerName} footballer`,
    `${playerName} football`,
    playerName,
  ].filter(Boolean);

  for (const q of queries) {
    const title = await wikiSearchTitle(q, { preferPerson: true });
    if (!title) continue;
    const thumb = await wikiPageThumbnail(title);
    if (thumb) return thumb;
  }
  return null;
}

export async function findStadiumImageUrl(clubName) {
  if (!clubName) return null;
  const key = clubName.toLowerCase().replace(/^#/, "");
  const stadium = CLUB_STADIUMS[key];

  const queries = [
    stadium || null,
    stadium ? `${stadium} stadium` : null,
    `${clubName} stadium`,
    `${clubName} football club`,
  ].filter(Boolean);

  for (const q of queries) {
    const title = await wikiSearchTitle(q, { preferStadium: true });
    if (!title) continue;
    const thumb = await wikiPageThumbnail(title);
    if (thumb) return thumb;
  }

  // Direct summary hit on known stadium title
  if (stadium) {
    const thumb = await wikiPageThumbnail(stadium);
    if (thumb) return thumb;
  }
  return null;
}

async function wikiSearchTitle(query, { preferPerson = false, preferStadium = false } = {}) {
  const url =
    "https://en.wikipedia.org/w/api.php?" +
    new URLSearchParams({
      action: "query",
      list: "search",
      srsearch: query,
      srlimit: "8",
      format: "json",
      origin: "*",
    });

  try {
    const res = await fetch(url, {
      headers: wikiHeaders(),
      signal: AbortSignal.timeout(10000),
    });
    if (!res.ok) return null;
    const data = await res.json();
    const hits = data?.query?.search || [];
    const qLower = query.toLowerCase().replace(/\s+football(?:er)?$/, "");

    for (const hit of hits) {
      const title = hit.title || "";
      const t = title.toLowerCase();
      if (t.includes("disambiguation")) continue;

      if (preferPerson) {
        if (/\b(season|league|cup|championship)\b/.test(t) && !/\(/.test(title)) continue;
        if (/\bstadium\b|\barena\b|\bground\b/.test(t)) continue;
      }

      if (preferStadium) {
        // Prefer stadium/arena/ground pages
        if (!/\bstadium\b|\barena\b|\bground\b|\bpark\b|\bcottage\b|\bbridge\b|\btrafford\b|\banfield\b|\bemirates\b|\bbernab|camp nou|velodrome|Allianz|westfalen|san siro|ibrox|celtic park/.test(t)) {
          // still allow exact stadium title matches later
          if (!qLower.includes("stadium") && hit !== hits[0]) continue;
        }
      }

      const tokens = qLower.split(/\s+/).filter((x) => x.length > 2);
      if (tokens.length && tokens.every((tok) => !t.includes(tok))) continue;
      return title;
    }
    return hits[0]?.title || null;
  } catch {
    return null;
  }
}

async function wikiPageThumbnail(title) {
  const url = `https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(title.replace(/ /g, "_"))}`;
  try {
    const res = await fetch(url, {
      headers: { ...wikiHeaders(), Accept: "application/json" },
      signal: AbortSignal.timeout(10000),
    });
    if (!res.ok) return null;
    const data = await res.json();
    return data?.originalimage?.source || data?.thumbnail?.source || null;
  } catch {
    return null;
  }
}

function wikiHeaders() {
  return {
    "User-Agent": "TransferDeskHQ/1.0 (https://x.com/TransferDeskHQ; football transfer desk bot)",
  };
}
