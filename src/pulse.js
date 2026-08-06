/**
 * Pulse digest: rolling summary of the last N hours — deals done, agreements,
 * bids, rumours — with a sharp-rendered image card.
 * Manual: `npm run pulse`. On deadline day set PULSE_EVERY_CYCLES to post from watch.
 */

import path from "node:path";
import fs from "node:fs/promises";
import { stageLabel } from "./entities.js";

const STORAGE_DIR = process.env.TRANSFER_DESK_STORAGE || ".";
const PULSE_HOURS = Number(process.env.PULSE_HOURS || 24);

/** Summarise the last N hours of the log. */
export function buildPulse(log, { hours = PULSE_HOURS, now = Date.now() } = {}) {
  const cutoff = now - hours * 3600_000;
  const recent = log.filter((e) => new Date(e.createdAt).getTime() >= cutoff);

  const byStage = { done: [], medical: [], agreement: [], bid: [], talks: [], interest: [] };
  for (const e of recent) {
    if (e.stage && byStage[e.stage]) byStage[e.stage].push(e);
  }

  // Each player appears once, in their highest stage only
  const seen = new Set();
  for (const k of ["done", "medical", "agreement", "bid", "talks", "interest"]) {
    byStage[k] = byStage[k].filter((e) => {
      const key = e.playerKey || e.id;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }

  const feeTotal = byStage.done
    .map((e) => e.fee)
    .filter((f) => f != null)
    .reduce((a, b) => a + b, 0);

  return { hours, recent: recent.length, byStage, feeTotal };
}

function itemLine(e) {
  const club = e.clubs?.[0] ? ` → ${e.clubs[0]}` : "";
  const fee = e.fee != null ? ` £${e.fee}m` : "";
  return `${e.player || "Unnamed move"}${club}${fee}`;
}

export function pulsePostKey(now = new Date()) {
  return `pulse:${now.toISOString().slice(0, 13)}`; // hourly resolution
}

/** Pulse post text (≤280 chars). Image card carries the detail. */
export function buildPulsePost(pulse) {
  const { hours, byStage, feeTotal } = pulse;
  const bits = [];
  if (byStage.done.length) bits.push(`${byStage.done.length} done`);
  if (byStage.medical.length) bits.push(`${byStage.medical.length} at medical`);
  if (byStage.agreement.length) bits.push(`${byStage.agreement.length} agreed`);
  if (byStage.bid.length) bits.push(`${byStage.bid.length} bids live`);
  const counts = bits.length ? bits.join(", ") : "quiet window";
  const fees = feeTotal ? ` | ~£${Math.round(feeTotal)}m committed` : "";

  const top = [...byStage.done, ...byStage.medical, ...byStage.agreement]
    .slice(0, 3)
    .map((e) => `• ${itemLine(e)}`);

  let post = `LIVE DESK | last ${hours}h\n\n${counts}${fees}`;
  if (top.length) post += `\n\n${top.join("\n")}`;
  if (post.length > 280) post = `LIVE DESK | last ${hours}h\n\n${counts}${fees}`;
  return post;
}

/* ------------------------- image card ------------------------- */

const esc = (s) =>
  String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/** Render a 1200x675 dark card PNG with the pulse breakdown. Returns file path. */
export async function renderPulseCard(pulse, { outDir } = {}) {
  const { default: sharp } = await import("sharp");
  let logoB64 = null;
  try {
    const logoPath = new URL("../assets/logo-tdhq.png", import.meta.url);
    logoB64 = (await fs.readFile(logoPath)).toString("base64");
  } catch { /* fall back to text wordmark */ }
  const dir = outDir || path.resolve(STORAGE_DIR, "data/media");
  await fs.mkdir(dir, { recursive: true });

  const rows = [];
  const order = ["done", "medical", "agreement", "bid"];
  for (const stage of order) {
    for (const e of pulse.byStage[stage].slice(0, stage === "done" ? 5 : 3)) {
      rows.push({ stage, player: e.player || "Unnamed move", club: e.clubs?.[0] || null, fee: e.fee, handle: e.handle });
      if (rows.length >= 6) break;
    }
    if (rows.length >= 6) break;
  }

  // Monochrome stage ladder: heavier mark = further along the deal
  const STAGE_STYLE = {
    done: { mode: "solid", tone: "#131313", label: "DONE DEAL" },
    medical: { mode: "solid", tone: "#70767d", label: "MEDICAL" },
    agreement: { mode: "outline", tone: "#131313", label: "AGREED" },
    bid: { mode: "outline", tone: "#9aa0a6", label: "BID IN" },
  };

  const INK = "#131313";
  const INK_SOFT = "#5f6368";
  const INK_FAINT = "#8b9096";
  const YELLOW = "#ffff00";

  const FONT = `Arial, 'Helvetica Neue', 'DejaVu Sans', sans-serif`;
  const ROW_H = 60;
  const ROW_GAP = 11;
  const ROW_TOP = 232;

  const rowSvg = rows
    .map((r, i) => {
      const y = ROW_TOP + i * (ROW_H + ROW_GAP);
      const cy = y + ROW_H / 2;
      const st = STAGE_STYLE[r.stage];
      const isDone = r.stage === "done";
      const clubStr = r.club ? `\u2192\u00a0\u00a0${r.club}` : "";
      const feeStr = r.fee != null ? `\u00a3${r.fee}m` : "";
      return `
      <rect x="64" y="${y}" width="1072" height="${ROW_H}" rx="13" fill="#000000" fill-opacity="${isDone ? "0.085" : "0.05"}"/>
      <rect x="64" y="${y}" width="1072" height="${ROW_H}" rx="13" fill="none" stroke="#000000" stroke-opacity="${isDone ? "0.22" : "0.10"}" stroke-width="${isDone ? 2 : 1}"/>
      <rect x="64" y="${y + 11}" width="5" height="${ROW_H - 22}" rx="2.5" fill="${st.tone}"/>
      ${st.mode === "solid"
        ? `<rect x="90" y="${cy - 14}" width="128" height="28" rx="14" fill="${st.tone}"/>
      <text x="154" y="${cy + 6}" font-size="15" fill="#ffffff" font-family="${FONT}" font-weight="bold" text-anchor="middle" letter-spacing="1.5">${st.label}</text>`
        : `<rect x="90" y="${cy - 14}" width="128" height="28" rx="14" fill="none" stroke="${st.tone}" stroke-width="2"/>
      <text x="154" y="${cy + 6}" font-size="15" fill="${st.tone}" font-family="${FONT}" font-weight="bold" text-anchor="middle" letter-spacing="1.5">${st.label}</text>`}
      <text x="244" y="${cy + 8}" font-size="25" font-family="${FONT}"><tspan fill="${INK}" font-weight="bold">${esc(r.player)}</tspan><tspan dx="13" fill="${INK_SOFT}">${esc(clubStr)}</tspan></text>
      ${feeStr ? `<text x="1108" y="${cy - 3}" font-size="23" fill="${INK}" font-family="${FONT}" font-weight="bold" text-anchor="end">${esc(feeStr)}</text>
      <text x="1108" y="${cy + 19}" font-size="14" fill="${INK_FAINT}" font-family="${FONT}" text-anchor="end">@${esc(r.handle)}</text>`
      : `<text x="1108" y="${cy + 6}" font-size="15" fill="${INK_FAINT}" font-family="${FONT}" text-anchor="end">@${esc(r.handle)}</text>`}`;
    })
    .join("\n");

  const emptySvg = `
      <rect x="64" y="${ROW_TOP}" width="1072" height="120" rx="13" fill="#000000" fill-opacity="0.05"/>
      <text x="600" y="${ROW_TOP + 58}" font-size="28" fill="${INK_SOFT}" font-family="${FONT}" text-anchor="middle">Quiet window</text>
      <text x="600" y="${ROW_TOP + 92}" font-size="19" fill="${INK_FAINT}" font-family="${FONT}" text-anchor="middle">No major moves logged - the desk is watching.</text>`;

  // Stat chips: solid black pills with yellow figures
  const chips = [];
  chips.push(`${pulse.recent} TIPS TRACKED`);
  if (pulse.feeTotal) chips.push(`~\u00a3${Math.round(pulse.feeTotal)}M COMMITTED`);
  const doneCount = pulse.byStage.done.length;
  if (doneCount) chips.push(`${doneCount} DONE DEAL${doneCount > 1 ? "S" : ""}`);

  let chipX = 76;
  const chipSvg = chips
    .map((label) => {
      const w = Math.round(label.length * 11.2 + 44);
      const svgChip = `
      <rect x="${chipX}" y="168" width="${w}" height="40" rx="20" fill="${INK}"/>
      <text x="${chipX + w / 2}" y="194" font-size="18" fill="${YELLOW}" font-family="${FONT}" font-weight="bold" text-anchor="middle" letter-spacing="1">${label}</text>`;
      chipX += w + 14;
      return svgChip;
    })
    .join("\n");

  const stamp = new Date().toLocaleString("en-GB", {
    day: "numeric", month: "short", hour: "2-digit", minute: "2-digit",
  });

  const tickerText = `@TRANSFERDESKHQ  \u2022  LAST ${pulse.hours}H  \u2022  LIVE TRANSFER COVERAGE`;

  const svg = `
<svg width="1200" height="675" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#ffffff"/>
      <stop offset="0.55" stop-color="#fbfbfb"/>
      <stop offset="1" stop-color="#f1f2f4"/>
    </linearGradient>
    <radialGradient id="glow" cx="0.85" cy="0.1" r="0.9">
      <stop offset="0" stop-color="#ffffff" stop-opacity="0.08"/>
      <stop offset="0.5" stop-color="#ffffff" stop-opacity="0.08"/>
      <stop offset="1" stop-color="#ffffff" stop-opacity="0"/>
    </radialGradient>
  </defs>
  <rect width="1200" height="675" fill="url(#bg)"/>
  <rect width="1200" height="675" fill="url(#glow)"/>
  <!-- faint pitch markings -->
  <g stroke="#000000" stroke-opacity="0.05" fill="none" stroke-width="3">
    <circle cx="1200" cy="337" r="210"/>
    <circle cx="1200" cy="337" r="8" fill="#000000" fill-opacity="0.05"/>
    <line x1="990" y1="0" x2="990" y2="675" stroke-opacity="0.03"/>
  </g>
  <rect x="0" y="0" width="1200" height="8" fill="${INK}"/>
  <circle cx="90" cy="106" r="11" fill="${INK}"/>
  <text x="118" y="126" font-size="54" fill="${INK}" font-family="${FONT}" font-weight="bold" letter-spacing="1">LIVE DESK</text>
  <text x="120" y="154" font-size="19" fill="${INK_SOFT}" font-family="${FONT}">${esc(stamp)}</text>
  <!-- TD HQ logo tile, top right -->
  ${logoB64
    ? `<defs><clipPath id="logoClip"><rect x="1016" y="48" width="120" height="120" rx="22"/></clipPath></defs>
  <image x="1016" y="48" width="120" height="120" clip-path="url(#logoClip)" href="data:image/png;base64,${logoB64}"/>`
    : `<g>
    <text x="1136" y="96" font-size="34" fill="${INK}" font-family="${FONT}" font-weight="bold" letter-spacing="2" text-anchor="end">TRANSFER</text>
    <rect x="936" y="106" width="200" height="4" fill="${INK}"/>
    <text x="1136" y="134" font-size="19" fill="${INK}" font-family="${FONT}" font-weight="bold" letter-spacing="5.5" text-anchor="end">DESK HQ</text>
  </g>`}
  ${chipSvg}
  ${rowSvg || emptySvg}
  <!-- breaking-news ticker -->
  <rect x="0" y="617" width="1200" height="58" fill="${INK}"/>
  <rect x="0" y="617" width="150" height="58" fill="${YELLOW}"/>
  <text x="75" y="653" font-size="20" fill="${INK}" font-family="${FONT}" font-weight="bold" text-anchor="middle" letter-spacing="2">LIVE</text>
  <text x="180" y="653" font-size="19" fill="${YELLOW}" font-family="${FONT}" font-weight="bold" letter-spacing="1.5">${tickerText}</text>
</svg>`;

  const file = path.join(dir, `pulse-${Date.now()}.png`);
  await sharp(Buffer.from(svg)).png().toFile(file);
  return file;
}
