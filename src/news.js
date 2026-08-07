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
 *
 * Two API-spend reductions, both opt-in via `cursors` (mutated in place —
 * caller persists it after the call):
 *   - userIds cache skips the userByUsername lookup once a handle's id is
 *     known (ids don't change), cutting API calls per source in half.
 *   - since_id means userTimeline only returns tweets newer than the last
 *     one we already logged, instead of re-pulling the same ~5 recent
 *     tweets from all 29 breakers on every single 10-minute cycle.
 * Without `cursors` (e.g. the one-off `npm run news` preview) this falls
 * back to the original always-fresh, always-full-lookup behaviour.
 */
export async function fetchFromX({ perSource = 5, breakingOnly = true, cursors = null } = {}) {
  if (!hasXCredentials() && !hasBearer()) {
    throw new Error("X credentials not set");
  }

  const client = getAppClient().readOnly;
  const tips = [];
  const userIds = cursors?.userIds || {};
  const sinceIds = cursors?.sinceIds || {};

  for (const source of BREAKERS) {
    const key = source.handle.toLowerCase();
    try {
      let userId = userIds[key];
      if (!userId) {
        const user = await client.v2.userByUsername(source.handle, {
          "user.fields": ["id", "name", "username"],
        });
        if (!user.data?.id) continue;
        userId = user.data.id;
        if (cursors) userIds[key] = userId;
      }

      const timelineParams = {
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
      };
      if (sinceIds[key]) timelineParams.since_id = sinceIds[key];

      const timeline = await client.v2.userTimeline(userId, timelineParams);

      const mediaByKey = new Map();
      for (const m of timeline.includes?.media || []) {
        if (m.media_key) mediaByKey.set(m.media_key, m);
      }

      let newestId = sinceIds[key] || null;
      for (const tweet of timeline.tweets || []) {
        if (!newestId || BigInt(tweet.id) > BigInt(newestId)) newestId = tweet.id;

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
      if (cursors && newestId) sinceIds[key] = newestId;
    } catch (err) {
      // A cached user id that starts erroring (renamed/suspended handle) —
      // drop it so the next cycle re-resolves instead of failing forever.
      const status = err?.data?.status || err?.code;
      if (cursors && (status === 404 || status === 400)) delete userIds[key];
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
      const errors = fromX.filter((t) => t.source === "error");
      if (usable.length) return { channel: "x", tips: usable, errors };
      // With since_id cursors active, a quiet cycle can legitimately return
      // zero new X tips without the channel being down — only fall back to
      // RSS when X genuinely failed for every source, not just when
      // there's nothing new since the last check.
      if (options.cursors && errors.length < BREAKERS.length) {
        return { channel: "x", tips: usable, errors };
      }
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
