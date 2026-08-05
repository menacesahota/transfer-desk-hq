import Parser from "rss-parser";
import { BREAKERS, RSS_FEEDS } from "./config.js";
import { getAppClient, hasBearer, hasXCredentials } from "./x-client.js";
import { rewriteTip } from "./rewrite.js";
import { isNewsworthyTip, isReplyTweet, classifyTip } from "./filter.js";
import { pickMediaUrl, fetchOgImage } from "./media.js";

const parser = new Parser({
  timeout: 15000,
  customFields: {
    item: [
      ["media:content", "mediaContent", { keepArray: true }],
      ["media:thumbnail", "mediaThumbnail", { keepArray: true }],
      ["enclosure", "enclosure"],
    ],
  },
});

/**
 * Pull recent posts from breaker accounts via X API (with images when present).
 */
export async function fetchFromX({ perSource = 5, breakingOnly = true } = {}) {
  if (!hasXCredentials() && !hasBearer()) {
    throw new Error("X credentials not set");
  }

  const client = getAppClient().readOnly;
  const tips = [];

  for (const source of BREAKERS) {
    try {
      const user = await client.v2.userByUsername(source.handle, {
        "user.fields": ["id", "name", "username"],
      });
      if (!user.data?.id) continue;

      const timeline = await client.v2.userTimeline(user.data.id, {
        max_results: Math.min(Math.max(perSource, 5), 100),
        exclude: ["retweets", "replies"],
        expansions: ["attachments.media_keys"],
        "tweet.fields": [
          "created_at",
          "text",
          "id",
          "attachments",
          "in_reply_to_user_id",
          "referenced_tweets",
          "conversation_id",
        ],
        "media.fields": ["url", "preview_image_url", "type", "width", "height", "alt_text"],
      });

      const mediaByKey = new Map();
      for (const m of timeline.includes?.media || []) {
        if (m.media_key) mediaByKey.set(m.media_key, m);
      }

      for (const tweet of timeline.tweets || []) {
        // Belt-and-braces: API exclude + local reply checks
        if (isReplyTweet(tweet)) continue;
        if (breakingOnly && !isNewsworthyTip(tweet.text)) continue;

        const attached = (tweet.attachments?.media_keys || [])
          .map((k) => mediaByKey.get(k))
          .filter(Boolean);
        const imageUrl = pickMediaUrl(attached);
        const kind = classifyTip(tweet.text) || "news";

        tips.push({
          id: `x:${tweet.id}`,
          source: "x",
          kind,
          handle: source.handle,
          label: source.label,
          original: tweet.text,
          createdAt: tweet.created_at,
          imageUrl,
          mediaTypes: attached.map((m) => m.type),
          draft: rewriteTip({
            text: tweet.text,
            handle: source.handle,
            label: source.label,
            kind,
          }),
        });
      }
    } catch (err) {
      tips.push({
        id: `error:${source.handle}`,
        source: "error",
        handle: source.handle,
        error: err?.data?.detail || err.message,
      });
    }
  }

  return tips.sort((a, b) => String(b.createdAt || "").localeCompare(String(a.createdAt || "")));
}

/** Free RSS path — works before X read credits are live. */
export async function fetchFromRss({ limit = 12, breakingOnly = false, withImages = true } = {}) {
  const tips = [];

  for (const feed of RSS_FEEDS) {
    try {
      const parsed = await parser.parseURL(feed.url);
      for (const item of (parsed.items || []).slice(0, 8)) {
        const snippet = stripHtml(item.contentSnippet || item.content || "");
        const text = `${item.title || ""}. ${snippet}`.trim();
        if (!isFootballItem(text, item.link)) continue;
        if (breakingOnly && !isNewsworthyTip(text)) continue;

        // Prefer title + fuller snippet for detail
        const rewriteSource = [item.title, snippet].filter(Boolean).join(". ");
        const kind = classifyTip(text) || "news";

        tips.push({
          id: `rss:${item.guid || item.link || item.title}`,
          source: "rss",
          kind,
          handle: feed.handle,
          label: feed.name,
          original: text,
          createdAt: item.isoDate || item.pubDate || null,
          link: item.link || null,
          imageUrl: extractRssImage(item),
          draft: rewriteTip({
            text: rewriteSource,
            handle: feed.handle,
            label: feed.name,
            kind,
          }),
        });
      }
    } catch (err) {
      tips.push({
        id: `error:${feed.name}`,
        source: "error",
        handle: feed.handle,
        error: err.message,
      });
    }
  }

  let list = tips
    .filter((t) => t.source !== "error")
    .sort((a, b) => String(b.createdAt || "").localeCompare(String(a.createdAt || "")))
    .slice(0, limit);

  if (withImages) {
    list = await Promise.all(
      list.map(async (tip) => {
        if (tip.imageUrl || !tip.link) return tip;
        const og = await fetchOgImage(tip.link);
        return og ? { ...tip, imageUrl: og } : tip;
      })
    );
  }

  return list;
}

function extractRssImage(item) {
  if (item.enclosure?.url && /^image\//i.test(item.enclosure.type || "image/jpeg")) {
    return item.enclosure.url;
  }
  if (item.enclosure?.url && /\.(jpe?g|png|webp|gif)(\?|$)/i.test(item.enclosure.url)) {
    return item.enclosure.url;
  }
  const content = item.mediaContent;
  if (Array.isArray(content)) {
    for (const c of content) {
      const url = c?.$?.url || c?.url;
      if (url) return url;
    }
  } else if (content?.$?.url) {
    return content.$.url;
  }
  const thumbs = item.mediaThumbnail;
  if (Array.isArray(thumbs)) {
    for (const t of thumbs) {
      const url = t?.$?.url || t?.url;
      if (url) return url;
    }
  } else if (thumbs?.$?.url) {
    return thumbs.$.url;
  }
  return null;
}

function stripHtml(html) {
  return String(html || "")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

const NON_FOOTBALL =
  /\b(cricket|boxing|ufc|mma|golf|tennis|f1|formula 1|racing|nfl|nba|nhl|mlb|rugby|solheim|wimbledon)\b/i;

function isFootballItem(text, link) {
  if (NON_FOOTBALL.test(text)) return false;
  if (link && /\/(cricket|boxing|golf|tennis|f1|racing|mma)\//i.test(link)) return false;
  return true;
}

/**
 * Prefer X breaker tips when credentials work; otherwise RSS.
 */
export async function fetchNews(options = {}) {
  if (hasXCredentials() || hasBearer()) {
    try {
      const fromX = await fetchFromX(options);
      const usable = fromX.filter((t) => t.source === "x");
      if (usable.length) return { channel: "x", tips: usable, errors: fromX.filter((t) => t.source === "error") };
      const errors = fromX.filter((t) => t.source === "error");
      const rss = await fetchFromRss(options);
      return { channel: "rss-fallback", tips: rss, errors };
    } catch (err) {
      const rss = await fetchFromRss(options);
      return { channel: "rss-fallback", tips: rss, errors: [{ error: err.message }] };
    }
  }

  const rss = await fetchFromRss(options);
  return { channel: "rss", tips: rss, errors: [] };
}
