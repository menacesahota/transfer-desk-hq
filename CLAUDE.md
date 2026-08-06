# Transfer Desk HQ (transfer-desk-hq)

Football breaking-news desk for @TransferDeskHQ — pull breaker posts, rewrite, credit source, post to X.

## Stack

- Node.js >= 20 (ESM)
- twitter-api-v2, rss-parser, sharp, dotenv
- Deploy: Render background worker (render.yaml) — runs `npm run watch` continuously so posting doesn't depend on your computer being on

## Commands

```bash
npm install
npm run news      # fetch news
npm run watch     # watch cycle
npm run draft     # write drafts/ only
npm run post      # publish (respects POST_MODE)
npm run verify
npm run consensus # preview multi-source story clusters
npm run sagas     # list active per-player transfer sagas
npm run scorecard # breaker reliability table
npm run pulse     # digest of last PULSE_HOURS + image card (add --post to publish)
```

## Layout

- src/cli.js — CLI entry
- src/news.js, rewrite.js, post.js, filter.js, media.js, x-client.js
- src/entities.js — player/club/stage extraction shared by desk features
- src/store.js — persistent tip log (data/tiplog.json) + feature state
- src/consensus.js, saga.js, scorecard.js, pulse.js — desk features
- src/extras.js — orchestrates feature posts inside the watch cycle
- drafts/ — generated drafts
- .env.example — X OAuth 1.0a keys, optional OPENAI_API_KEY, POST_MODE
- render.yaml — Render background worker + persistent disk (TRANSFER_DESK_STORAGE) for seen.json/drafts/media

## Rules

- Always credit the original source when rewriting.
- POST_MODE=draft keeps output local; post publishes to X.
- Never commit .env.

## Related

Orchestrated/referenced from MENACE (C:\Users\User\.cursor\MenaceSahota) via X_REPO_PATH / TRANSFER_X_* keys.
