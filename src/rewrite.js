/**
 * Paraphrase tips in our own words.
 * Anything inside "double quotes" is kept verbatim.
 */

const FILLER = [
  /\bhere we go[!.,]*/gi,
  /\bexclusive(?:\s+story)?\b[:\-!]*/gi,
  /\bbreaking\b[:\-!]*/gi,
  /\bJUST IN\b[:\-!]*/gi,
  /\bstory,?\s*confirmed\.?/gi,
  /\bEXC:\s*/gi,
  /\bEXCL:\s*/gi,
  /\bExclusive:\s*/gi,
];

/** Broad emoji / pictograph strip (incl. flags, ZWJ sequences, keycaps, dingbats). */
const EMOJI_RUN =
  /(?:\p{Extended_Pictographic}|\p{Emoji_Presentation}|\p{Emoji}\uFE0F|\p{Emoji_Modifier_Base}\p{Emoji_Modifier}?|\u200D|\uFE0F|\u20E3)+/gu;

function stripEmojis(text) {
  return String(text || "")
    .replace(EMOJI_RUN, " ")
    .replace(/[\u{1F1E6}-\u{1F1FF}]{2}/gu, " ") // flags
    .replace(/[\u2600-\u27BF]/g, " ") // misc symbols / dingbats leftover
    .replace(/\s+([,.!?])/g, "$1")
    .replace(/\s{2,}/g, " ")
    .trim();
}

/** Replace em/en dashes with plain hyphens or commas for cleaner posts. */
function stripEmDashes(text) {
  return String(text || "")
    .replace(/\s*[—–―]\s*/g, " - ")
    .replace(/\s{2,}/g, " ")
    .trim();
}

function cleanPostText(text) {
  return stripEmDashes(stripEmojis(text));
}

const PHRASE_SWAPS = [
  [/\bhave(?:\s+now)?\s+completed the signing of\b/gi, "have wrapped up a move for"],
  [/\bcompleted the signing of\b/gi, "sealed a move for"],
  // Player arrivals — not "signed a contract"
  [/\bhave signed (?=[A-Z#])/g, "have brought in "],
  [/\bhas signed (?=[A-Z#])/g, "has brought in "],
  [/\bhas signed a\b/gi, "is tied down on a"],
  [/\bhave signed a\b/gi, "are tied down on a"],
  [/\bhave reached an agreement(?:\s+in principle)?\s+with\b/gi, "are agreed with"],
  [/\breach(?:ed)? agreement(?:\s+in principle)?\s+with\b/gi, "struck a deal with"],
  [/\bagreement in principle\b/gi, "outline agreement"],
  [/\bformalised the agreement\b/gi, "locked in the agreement"],
  [/\bfinalised the agreement\b/gi, "locked in the agreement"],
  [/\bhave sent (?:a |their )?first official bid\b/gi, "have lodged an opening official offer"],
  [/\bsent first official bid\b/gi, "lodged an opening official offer"],
  [/\bofficial bid\b/gi, "formal offer"],
  [/\bsubmitted a bid\b/gi, "tabled an offer"],
  [/\bhave rejected (?:a |an )?/gi, "have turned down "],
  [/\bhas rejected (?:a |an )?/gi, "has turned down "],
  [/\brejected (?:a |an )?(?:formal )?(?:offer|bid)\b/gi, "knocked back an offer"],
  [/\bturned down\b/gi, "knocked back"],
  [/\bnegotiations underway\b/gi, "talks are ongoing"],
  [/\btalks underway\b/gi, "discussions are live"],
  [/\badvancing in talks\b/gi, "pushing talks forward"],
  [/\bset to join\b/gi, "poised to move to"],
  [/\bset to sign\b/gi, "poised to put pen to paper with"],
  [/\bclose to joining\b/gi, "nearing a switch to"],
  [/\bclose to signing\b/gi, "nearing a signature with"],
  [/\bon the verge of\b/gi, "edged close to"],
  [/\bannouncement is imminent\b/gi, "an announcement is expected soon"],
  [/\bpersonal terms\b/gi, "contract terms"],
  [/\bseason-long loan\b/gi, "loan for the season"],
  [/\bon loan from\b/gi, "joining on loan from"],
  [/\bloan deal\b/gi, "temporary switch"],
  [/\bbuy option\b/gi, "option to buy"],
  [/\bbuy obligation\b/gi, "obligation to buy"],
  [/\bcombined fee of around\b/gi, "package fee near"],
  [/\bcombined fee\b/gi, "package fee"],
  [/\bdeal worth\b/gi, "move valued at"],
  [/\bfee of\b/gi, "fee around"],
  [/\bfee is\b/gi, "fee sits at"],
  [/\bin the region of\b/gi, "around"],
  [/\bnever in doubt\b/gi, "as expected"],
  [/\binterested in\b/gi, "keeping tabs on"],
  [/\bshown interest in\b/gi, "flagged interest in"],
  [/\bshowing interest in\b/gi, "monitoring"],
  [/\blinked with\b/gi, "being linked to"],
  [/\blinked to\b/gi, "connected with"],
  [/\bmonitoring\b/gi, "keeping eyes on"],
  [/\btracking\b/gi, "following"],
  [/\btargeting\b/gi, "lined up as a target"],
  [/\beyeing\b/gi, "taking a look at"],
  [/\bkeen on\b/gi, "keen to pursue"],
  [/\bwant to sign\b/gi, "want to bring in"],
  [/\bwants to sign\b/gi, "wants to bring in"],
  [/\blooking to sign\b/gi, "looking to recruit"],
  [/\bmaking enquiries\b/gi, "sounding out"],
  [/\bmade enquiries\b/gi, "sounded out"],
  [/\benquired about\b/gi, "asked about"],
  [/\binquired about\b/gi, "asked about"],
  [/\bI (can )?confirm\b/gi, "It's been confirmed"],
  [/\bI've been told\b/gi, "Sources indicate"],
  [/\bUnderatd\b/gi, "Word is"],
  [/\bUnderstand(?:ing)?\b/gi, "Word is"],
  [/\bMy understanding is\b/gi, "Word is"],
  [/\bWe understand\b/gi, "Word is"],
  [/\bdone deals?\b/gi, "completed moves"],
  [/\bto join\b/gi, "heading to"],
  [/\bon next steps:\s*/gi, "outlined what comes next: "],
  [/\btold CNN\b/gi, "speaking to CNN"],
  [/\btold Sky Sports\b/gi, "speaking to Sky Sports"],
  [/\btold BBC\b/gi, "speaking to the BBC"],
];

/**
 * Rewrite tip text. Quoted segments ("...") stay verbatim.
 */
export function rewriteTip({ text, handle, label, kind = "news" }) {
  let raw = (text || "").trim();
  raw = raw.replace(/\r\n/g, "\n").replace(/\n+/g, ". ");
  raw = raw.replace(/https?:\/\/\S+/gi, " ").trim();

  for (const re of FILLER) raw = raw.replace(re, " ").trim();
  raw = cleanPostText(raw);

  const { text: withoutQuotes, quotes } = extractDoubleQuotes(raw);

  let body = withoutQuotes;
  body = body
    .replace(/\brumou?rs?:\s*/gi, " ")
    .replace(/\brumou?red:\s*/gi, " ")
    .replace(/\s+/g, " ")
    .trim();

  const shellBefore = body;
  body = applyPhraseSwaps(body);
  body = restructureSentences(body, kind);
  body = cleanupCopy(body);

  // If the non-quote shell barely moved, force a reshape around placeholders
  if (tooSimilar(shellBefore, body.replace(/«Q\d+»/g, " "))) {
    body = forceReshape(stripPlaceholdersForReshape(body), kind, true);
    // re-apply phrase swaps once more on forced text without destroying placeholders
    body = applyPhraseSwaps(body);
  }

  body = restoreDoubleQuotes(body, quotes.map(cleanPostText));
  body = cleanupCopy(cleanPostText(body));

  if (!body) {
    body = `Transfer update circulating from ${label || `@${handle}`}.`;
  }

  const prefix = kind === "rumour" ? "RUMOUR: " : "";
  const credit = `via @${handle}`;
  if (kind === "rumour") body = body.replace(/^rumou?rs?:\s*/i, "");

  let post = `${prefix}${ensureStop(body)}\n\n${credit}`;
  post = cleanPostText(post.replace(/\.\./g, "."));

  if (post.length > 280) {
    post = cleanPostText(trimToLimit(prefix, body, credit));
  }

  return post;
}

function extractDoubleQuotes(text) {
  const quotes = [];
  const out = text.replace(/"([^"\n]{1,200})"/g, (_, inner) => {
    const i = quotes.length;
    quotes.push(inner);
    return ` «Q${i}» `;
  });
  return { text: out, quotes };
}

function restoreDoubleQuotes(text, quotes) {
  return text.replace(/«Q(\d+)»/g, (_, n) => {
    const q = quotes[Number(n)];
    return q != null ? `"${q}"` : "";
  });
}

function stripPlaceholdersForReshape(text) {
  // Keep placeholders; forceReshape should not lowercase them oddly
  return text;
}

function applyPhraseSwaps(text) {
  let out = text;
  for (const [re, swap] of PHRASE_SWAPS) out = out.replace(re, swap);
  return out;
}

function restructureSentences(text, kind) {
  let raw = text.replace(/\s*\.\s*/g, ". ").replace(/^(?:\.\s*)+/g, "").trim();
  raw = raw.replace(/\.\s*\./g, ".");
  raw = raw.replace(
    /\b(deal|bid|offer|loan|signed|signing|agreement|rejected|confirmed|underway|talks|race)\s+([A-Z][a-z])/g,
    "$1. $2"
  );

  const sentences = raw
    .split(/(?<=[.!?])\s+/)
    .map((s) =>
      s
        .trim()
        .replace(/^[,:\-–—.\s]+/, "")
        .replace(/[.?!…]+$/, "")
        .trim()
    )
    .filter((s) => s.length > 3)
    .filter((s) => !/^(confirmed|exclusive|update|rumour|rumor|rumours|rumors)$/i.test(s))
    .map((s) => shuffleClause(s));

  if (!sentences.length) return "";

  // Keep chronological lead first (club action before contract detail)
  let lead = capitalise(sentences[0]);
  let detail = sentences.slice(1).map(capitalise).join(". ").trim();

  if (!detail && lead.length < 140) {
    detail =
      kind === "rumour"
        ? "Unconfirmed - situation still developing"
        : "More expected as talks continue";
  }

  return detail ? `${ensureStop(lead)} ${ensureStop(detail)}` : ensureStop(lead);
}

function shuffleClause(s) {
  let out = s;
  out = out.replace(/\bWord is\s+/i, "Reports say ");
  out = out.replace(
    /\b(.+?)\s+will be the next one to leave\s+(.+?)\s+on loan\b/i,
    (_, player, club) => `${player.trim()} is next in line for a loan exit from ${club.trim()}`
  );
  out = out.replace(/\s*@\w+\s*$/g, "").trim();
  return out;
}

function forceReshape(body, kind) {
  const clean = body.replace(/\s+/g, " ").trim().replace(/[.?!…]+$/, "");
  if (kind === "rumour") {
    return `${capitalise(clean)}. Unconfirmed - situation still developing`;
  }
  return `Latest: ${capitalise(clean)}. More expected as talks continue`;
}

function tooSimilar(original, rewritten) {
  const a = norm(original);
  const b = norm(rewritten);
  if (!a || !b) return false;
  if (a === b) return true;
  const ta = new Set(a.split(" ").filter((w) => w.length > 3));
  const tb = b.split(" ").filter((w) => w.length > 3);
  if (!tb.length) return false;
  const hit = tb.filter((w) => ta.has(w)).length;
  return hit / tb.length > 0.78;
}

function norm(s) {
  return String(s || "")
    .toLowerCase()
    .replace(/https?:\/\/\S+/g, " ")
    .replace(/«q\d+»/g, " ")
    .replace(/[^a-z0-9£€$#\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function cleanupCopy(s) {
  return s
    .replace(/\s+/g, " ")
    .replace(/\s+([,.;:!?])/g, "$1")
    .replace(/\s+»/g, "»")
    .replace(/«\s+/g, "«")
    .replace(/\s{2,}/g, " ")
    .trim();
}

function trimToLimit(prefix, body, credit) {
  const room = 280 - credit.length - 2 - prefix.length;
  let trimmed = body.slice(0, Math.max(40, room - 1)).trim().replace(/\s+\S*$/, "");
  if (!/[.!?…]"?$/.test(trimmed) && !/»$/.test(trimmed)) trimmed += "…";
  return `${prefix}${trimmed}\n\n${credit}`;
}

function capitalise(s) {
  if (!s) return s;
  if (s.startsWith("«Q")) return s;
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function ensureStop(s) {
  if (!s) return s;
  return /[.!?…]"?$/.test(s) || /»$/.test(s) ? s : `${s}.`;
}
