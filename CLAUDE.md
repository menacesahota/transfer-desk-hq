# Transfer Desk HQ (transfer-desk-hq)

Football transfer desk for @TransferDeskHQ — original desk content built from logged breaker tips: consensus calls, saga timelines, breaker scorecards, and the LIVE DESK pulse. Source tweets are logged for analysis but never rewritten or reposted.

## Stack

- Node.js >= 20 (ESM)
- twitter-api-v2, rss-parser, sharp, dotenv
- Deploy: Render background worker (render.yaml) — runs `npm run watch` continuously so posting doesn't depend on your computer being on

## Commands

```bash
npm install
npm run news      # preview fetched tips
npm run watch     # watch cycle: fetch + log tips, emit due desk posts
npm run draft     # one cycle, desk posts to drafts/ only
npm run post      # one cycle, desk posts published
npm run verify
npm run consensus # preview multi-source story clusters
npm run sagas     # list active per-player transfer sagas
npm run scorecard # breaker reliability table
npm run pulse     # digest of last PULSE_HOURS + image card (add --post to publish)
npm run radar     # daily rumour likelihood rankings (auto-posts after RADAR_HOUR UTC)
npm run rumourwatch # reactive per-story odds update when likelihood shifts (add --post to publish)
npm run contracts # daily contract watch: renewals/extensions (auto-posts after CONTRACTWATCH_HOUR UTC)
npm run almanac   # daily birthdays + on-this-day confirmed signings (auto-posts after ALMANAC_HOUR UTC)
npm run smoketest # preview/force the one-time "posting works" pipeline check (add --post to publish)
npm test          # regression test suite (entities.js extraction + verify.js checks)
```

## Layout

- src/cli.js — CLI entry
- src/news.js, rewrite.js, post.js, filter.js, media.js, x-client.js
- src/entities.js — player/club/stage extraction shared by desk features
- src/store.js — persistent tip log (data/tiplog.json) + feature state
- src/consensus.js, saga.js, scorecard.js, pulse.js, radar.js, rumourwatch.js, contractwatch.js, almanac.js — desk features
- src/verify.js — live fact-check gating consensus/saga/rumour watch/radar/contract watch posts: free player-identity check (TheSportsDB, always on) + optional web-search corroboration (Serper.dev, no-op without SERPER_API_KEY)
- src/almanac.js — daily birthdays (TheSportsDB) + on-this-day confirmed signings from the desk's own tip log; text-only, no images
- src/smoketest.js — one-time "posting works" pipeline check, fires before real desk content
- src/extras.js — orchestrates feature posts inside the watch cycle
- tests/ — regression suite (`npm test`), one case per bug fixed in production
- drafts/ — generated drafts
- .env.example — X OAuth 1.0a keys, optional OPENAI_API_KEY/SERPER_API_KEY, POST_MODE
- render.yaml — Render background worker + persistent disk (TRANSFER_DESK_STORAGE) for seen.json/drafts/media/birthdays.json

## Rules

- Never rewrite or repost source tweets; desk posts are original summaries.
- Always credit sources (@handles) in consensus, saga, and pulse output.
- POST_MODE=draft keeps output local; post publishes to X.
- Never commit .env.

## Related

Orchestrated/referenced from MENACE (C:\Users\User\.cursor\MenaceSahota) via X_REPO_PATH / TRANSFER_X_* keys.
