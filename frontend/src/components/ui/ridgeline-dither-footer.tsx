"use client"

// Ridgeline Dither Footer — a quiet, airy site footer that sits over a range of
// mountains printed in ordered dither. Six ridges, each generated from ridged
// noise, recede into valley mist that drifts slowly across them, and the whole
// range dissolves upward into the paper behind the copyright line.
//
// Storyboard. When the footer scrolls into view the frame's hairline guides
// draw down, the brand and link columns rise out of a soft blur one after the
// other, and the range develops back to front: each ridge climbs a few pixels
// while its dither threshold sweeps from paper to full tone, so the dots
// arrive in their ordered pattern the way a print comes up in the tray. The
// mist lifts last. Afterwards the mist keeps drifting; the pointer parts it
// like a lantern, tilts the ridges in parallax and reads off the altitude of
// the crest beneath it. Click the range and a gust sweeps the mist sideways.
//
// One file, React only. A pixel-scaled 2D canvas for the range, real anchors
// for every link, a scoped <style> where every rule is .rdf- prefixed, and
// nothing fetched: the faces come from the host page or the fallback stacks.

import * as React from "react"

export interface RidgelinePalette {
  /** The footer background, and the colour the mist dissolves into. */
  paper: string
  /** Body text and the logo. */
  ink: string
  /** Headings, tagline and the copyright line. */
  muted: string
  /** Section title labels (e.g. NAWIGACJA, GODZINY OTWARCIA). */
  sectionLabel?: string
  /** Hairlines. */
  line: string
  /** The heart in the credit line. */
  heart: string
  /** Dither tones from mist to deepest ridge. The first should be the paper. */
  tones: string[]
}

export type RidgelineTheme = "evergreen" | "glacier" | "dusk" | "sepia" | "night"

export type RidgelinePreset = "auto" | RidgelineTheme

export interface RidgelineLink {
  label: React.ReactNode
  href?: string
  /** A small pill after the label, e.g. "New" or "Hiring". */
  badge?: string
  onClick?: (e: React.MouseEvent) => void
  target?: string
  rel?: string
}

export interface RidgelineColumn {
  title: string
  links: RidgelineLink[]
}

export type RidgelineSocialIcon = "x" | "instagram" | "linkedin" | "github" | "youtube" | "facebook"

export interface RidgelineSocial {
  icon: RidgelineSocialIcon
  href?: string
  /** Accessible name. Defaults to the network's name. */
  label?: string
}

export interface RidgelineDitherFooterProps {
  /** Brand name beside the mark. */
  name?: string
  /** Where the brand links to. */
  brandHref?: string
  /** Replace the built-in ridge mark. */
  logo?: React.ReactNode
  /** The line under the brand. */
  tagline?: string
  /** Link columns. */
  columns?: RidgelineColumn[]
  /** Social icons under the tagline. */
  socials?: RidgelineSocial[]
  /** Bottom-left line. Defaults to "© <year> <name>, Inc. All rights reserved." */
  copyright?: string
  /** Content placed on the right side of the bottom bar. */
  bottomRight?: React.ReactNode
  /** "Made with ♥ by …" on the right. Pass null to hide it. */
  credit?: { label: string; href?: string } | null
  /** Colours. "auto" is evergreen, or night under a .dark ancestor. */
  preset?: RidgelinePreset
  /** Colour overrides, merged over the preset. */
  palette?: { paper?: string; ink?: string; muted?: string; sectionLabel?: string; line?: string; heart?: string; tones?: string[] }
  /** Which range to generate. Any integer. */
  seed?: number
  /** How many ridges recede into the mist, 2–9. Defaults to 6. */
  ridges?: number
  /** Size of one dither pixel in CSS px. Defaults to 2. */
  pixel?: number
  /** How thick the drifting mist is, 0–1. Defaults to 0.8. */
  mist?: number
  /** Speed the mist drifts at. 0 holds it still. Defaults to 1. */
  drift?: number
  /** Radius, in CSS px, of the clearing the pointer makes. Defaults to 130. */
  radius?: number
  /** Pointer parallax, mist clearing and the click gust. Defaults to true. */
  interactive?: boolean
  /** Read out the altitude of the crest under the pointer. Defaults to true. */
  altimeter?: boolean
  /** Widest the framed content gets. Defaults to "1120px". */
  maxWidth?: string
  /** Face for the body type. */
  fontFamily?: string
  /** Face for the headings and the altimeter. */
  monoFamily?: string
  /** Root height. A definite length, never a percentage. The footer grows past it rather than crush the range when its content needs more room. */
  height?: string
  /** The least height the range itself gets. Defaults to "260px". */
  sceneMinHeight?: string
  /** Extra root class names. */
  className?: string
}

const PRESETS: RidgelinePresetMap = {
  evergreen: {
    paper: "#f3f8f5",
    ink: "#14211a",
    muted: "#67776e",
    line: "#dce8e1",
    heart: "#e5484d",
    tones: ["#f3f8f5", "#d4ecdf", "#a5d7bb", "#69b38a", "#2e7c52", "#145131", "#0a2d1a"],
  },
  glacier: {
    paper: "#f2f6fa",
    ink: "#121b26",
    muted: "#637184",
    line: "#dae3ed",
    heart: "#e5484d",
    tones: ["#f2f6fa", "#d6e6f4", "#a8cae7", "#6b9ecc", "#34679a", "#1a3e66", "#0b2140"],
  },
  dusk: {
    paper: "#f8f4f7",
    ink: "#21151f",
    muted: "#7a6876",
    line: "#ecdfe8",
    heart: "#e5484d",
    tones: ["#f8f4f7", "#efdbe7", "#d9b2cb", "#b1789f", "#7a4975", "#4a2750", "#25102c"],
  },
  sepia: {
    paper: "#f7f2ea",
    ink: "#231a10",
    muted: "#7b6d5c",
    line: "#e9dfcf",
    heart: "#d6452f",
    tones: ["#f7f2ea", "#efdfc6", "#ddbb8d", "#bb8a55", "#8a5a2e", "#5a3518", "#2f1a0b"],
  },
  night: {
    paper: "#08100c",
    ink: "#e2eee7",
    muted: "#7d9286",
    line: "#18271f",
    heart: "#ff6369",
    tones: ["#08100c", "#0c1c14", "#123224", "#1a4b33", "#256a48", "#3a8c63", "#62b388"],
  },
}

const DEFAULT_COLUMNS: RidgelineColumn[] = [
  {
    title: "Product",
    links: [{ label: "How it works" }, { label: "Integrations" }, { label: "Pricing" }, { label: "Security" }],
  },
  { title: "Company", links: [{ label: "About us" }, { label: "Careers", badge: "Hiring" }, { label: "Contact" }] },
  { title: "Legal", links: [{ label: "Privacy Policy" }, { label: "Terms of Service" }, { label: "Compliance" }] },
]

const DEFAULT_SOCIALS: RidgelineSocial[] = [
  { icon: "x", href: "https://x.com" },
  { icon: "instagram", href: "https://instagram.com" },
  { icon: "linkedin", href: "https://linkedin.com" },
]

const SOCIAL_NAMES: RidgelineSocialNameMap = {
  facebook: "Facebook",
  x: "X",
  instagram: "Instagram",
  linkedin: "LinkedIn",
  github: "GitHub",
  youtube: "YouTube",
}

const SANS_STACK = '"Barlow", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'
const MONO_STACK = '"JetBrains Mono", "Geist Mono", "SF Mono", ui-monospace, Menlo, Consolas, monospace'

// #region ridge
// Pure helpers, lifted out and executed by tests/ridgeline-dither-footer.test.mjs.

/** Hex → [r, g, b] in 0–255, or null for anything that isn't #rgb / #rrggbb. */
export function rdfHex(hex: string) {
  const m = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.exec((hex || "").trim())
  if (!m) return null
  const h = m[1].length === 3 ? m[1].split("").map((c) => c + c).join("") : m[1]
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)]
}

/** [r, g, b] → one opaque pixel for a little-endian Uint32 view of ImageData. */
export function rdfPack(rgb: number[]) {
  return ((255 << 24) | (rgb[2] << 16) | (rgb[1] << 8) | rgb[0]) >>> 0
}

/** The classic 8×8 Bayer matrix, as thresholds in (0, 1). */
export const RDF_BAYER = [
  0, 32, 8, 40, 2, 34, 10, 42, 48, 16, 56, 24, 50, 18, 58, 26,
  12, 44, 4, 36, 14, 46, 6, 38, 60, 28, 52, 20, 62, 30, 54, 22,
  3, 35, 11, 43, 1, 33, 9, 41, 51, 19, 59, 27, 49, 17, 57, 25,
  15, 47, 7, 39, 13, 45, 5, 37, 63, 31, 55, 23, 61, 29, 53, 21,
].map((v) => (v + 0.5) / 64)

/** Palette index for a tone in [0, 1] across `n` colours at Bayer threshold `b`. */
export function rdfDither(tone: number, n: number, b: number) {
  const t = tone < 0 ? 0 : tone > 1 ? 1 : tone
  const v = Math.floor(t * (n - 1) + b)
  return v > n - 1 ? n - 1 : v
}

/** Integer lattice hash → [0, 1). */
export function rdfHash(x: number, y: number, seed: number) {
  let h = Math.imul(x | 0, 374761393) + Math.imul(y | 0, 668265263) + Math.imul(seed | 0, 1442695041)
  h = Math.imul(h ^ (h >>> 13), 1274126177)
  h ^= h >>> 16
  return (h >>> 0) / 4294967296
}

/** Smooth value noise in [0, 1). */
export function rdfNoise(x: number, y: number, seed: number) {
  const xi = Math.floor(x)
  const yi = Math.floor(y)
  const xf = x - xi
  const yf = y - yi
  const u = xf * xf * (3 - 2 * xf)
  const v = yf * yf * (3 - 2 * yf)
  const a = rdfHash(xi, yi, seed)
  const b = rdfHash(xi + 1, yi, seed)
  const c = rdfHash(xi, yi + 1, seed)
  const d = rdfHash(xi + 1, yi + 1, seed)
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v
}

/** Fractal value noise, normalised back into [0, 1). */
export function rdfFbm(x: number, y: number, seed: number, octaves: number) {
  let sum = 0
  let amp = 0.5
  let norm = 0
  for (let o = 0; o < octaves; o++) {
    sum += rdfNoise(x, y, seed + o * 31) * amp
    norm += amp
    x *= 2.03
    y *= 2.03
    amp *= 0.5
  }
  return norm > 0 ? sum / norm : 0
}

/** Hermite step from e0 to e1, clamped. */
export function rdfSmooth(e0: number, e1: number, x: number) {
  const t = e1 === e0 ? (x < e0 ? 0 : 1) : Math.min(1, Math.max(0, (x - e0) / (e1 - e0)))
  return t * t * (3 - 2 * t)
}

/** Ease-out cubic over a progress that may run outside [0, 1]. */
export function rdfEase(t: number) {
  const c = t < 0 ? 0 : t > 1 ? 1 : t
  return 1 - Math.pow(1 - c, 3)
}

/**
 * Crest row of ridge `i` of `layers` (0 is the farthest) for every column of
 * a `cols` × `rows` grid, plus `margin` columns either side for parallax.
 * Farther ridges sit higher with more, smaller peaks; nearer ones are lower,
 * broader and taller.
 */
export function rdfRidgeline(cols: number, rows: number, i: number, layers: number, seed: number, margin: number) {
  const k = layers > 1 ? i / (layers - 1) : 1
  const n = cols + margin * 2
  const out = new Float32Array(n)
  const base = rows * (0.38 + 0.66 * Math.pow(k, 1.4))
  const amp = rows * (0.2 + 0.24 * k)
  const freq = 6 - 3.8 * k
  // Near ridges climb toward both edges, one side more than the other, so the
  // range opens into a valley. Nothing climbs into the faded band at the top.
  const flankL = rows * 0.5 * k * k * k * (0.55 + 0.6 * rdfHash(i, 11, seed))
  const flankR = rows * 0.5 * k * k * k * (0.55 + 0.6 * rdfHash(i, 13, seed))
  const ceil = rows * 0.17
  const tilt = (rdfHash(i, 7, seed) - 0.5) * rows * 0.34 * (0.4 + k)
  const s = (seed | 0) * 13 + i * 101
  for (let x = 0; x < n; x++) {
    const u = (x - margin) / cols
    const r1 = 1 - Math.abs(rdfNoise(u * freq + i * 3.7, 0.5, s) * 2 - 1)
    const r2 = 1 - Math.abs(rdfNoise(u * freq * 2.3, 3.5, s + 1) * 2 - 1)
    const f = rdfFbm(u * freq * 4.1, 9.5, s + 2, 3)
    const h = r1 * r1 * 0.62 + r2 * 0.24 + f * 0.14
    const e = Math.min(1.2, Math.abs(u * 2 - 1))
    const y = base - h * amp + tilt * (u - 0.5) * 2 - (u < 0.5 ? flankL : flankR) * e * e * Math.sqrt(e)
    out[x] = y < ceil ? ceil - (ceil - y) * 0.25 : y
  }
  return out
}

/** Altitude in metres shown for a crest at `crest` rows down a `rows`-tall range. */
export function rdfElevation(crest: number, rows: number, layer: number, layers: number) {
  const up = rows > 0 ? 1 - Math.min(1, Math.max(0, crest / rows)) : 0
  return Math.round(420 + up * 2600 + (layers - 1 - layer) * 140)
}
// #endregion

const RDF_CSS = `
.rdf-root {
  position: relative; display: grid; width: 100%; overflow: hidden; isolation: isolate;
  background: var(--rdf-paper); color: var(--rdf-ink); font-family: var(--rdf-sans);
  -webkit-font-smoothing: antialiased; --rdf-pad: clamp(24px, 4vw, 48px);
}
.rdf-frame {
  position: relative; display: grid; grid-template-rows: auto auto minmax(var(--rdf-scene-min), 1fr);
  width: 100%; max-width: var(--rdf-max); margin: 0 auto;
  min-height: inherit; height: 100%;
}
.rdf-frame::before, .rdf-frame::after {
  content: ""; position: absolute; top: 0; bottom: 0; width: 1px; z-index: 3; pointer-events: none;
  background: var(--rdf-line); transform: scaleY(0); transform-origin: 50% 0;
  transition: transform 1.4s cubic-bezier(.2,.7,.1,1);
}
.rdf-frame::before { left: 0; }
.rdf-frame::after { right: 0; transition-delay: .08s; }
.rdf-in .rdf-frame::before, .rdf-in .rdf-frame::after { transform: scaleY(1); }

.rdf-r {
  opacity: 0; transform: translateY(12px); filter: blur(5px);
  transition: opacity .9s cubic-bezier(.2,.7,.1,1), transform 1s cubic-bezier(.2,.7,.1,1), filter .9s ease;
  transition-delay: calc(var(--d, 0) * 1ms);
}
.rdf-in .rdf-r { opacity: 1; transform: none; filter: none; }

.rdf-top {
  position: relative; z-index: 2; display: grid;
  grid-template-columns: minmax(0, 1.8fr) repeat(var(--rdf-n), minmax(0, 1fr));
  gap: clamp(40px, 4.5vw, 64px);
  padding: clamp(68px, 7vw, 104px) var(--rdf-pad) clamp(44px, 5vw, 68px);
}
.rdf-brand { display: flex; flex-direction: column; align-items: flex-start; gap: 24px; }
.rdf-logo {
  display: inline-flex; align-items: center; gap: 10px; color: var(--rdf-ink); text-decoration: none;
  font-size: 23px; font-weight: 500; letter-spacing: -.035em; line-height: 1;
}
.rdf-mark { width: 30px; height: 21px; display: block; overflow: visible; }
.rdf-mark rect { fill: var(--rdf-paper); transition: transform .7s cubic-bezier(.2,.7,.1,1); }
.rdf-logo:hover .rdf-mist-a { transform: translateX(4px); }
.rdf-logo:hover .rdf-mist-b { transform: translateX(-5px); }
.rdf-tag { margin: 0; max-width: 32ch; font-size: 14px; line-height: 1.6; color: var(--rdf-muted); text-wrap: pretty; }
.rdf-social { display: flex; gap: 10px; margin: 4px 0 0 0; padding: 0; list-style: none; }
.rdf-social a {
  display: grid; place-items: center; width: 34px; height: 34px; border-radius: 8px; color: var(--rdf-muted);
  transition: color .3s ease, background-color .3s ease, transform .45s cubic-bezier(.2,.7,.1,1);
}
.rdf-social a:hover { color: var(--rdf-ink); background: color-mix(in srgb, var(--rdf-deep) 8%, transparent); transform: translateY(-2px); }
.rdf-social svg { width: 17px; height: 17px; display: block; }

.rdf-col h3 {
  margin: 4px 0 22px; font: 600 11px/1 var(--rdf-mono); letter-spacing: .14em; text-transform: uppercase; color: var(--rdf-section, var(--rdf-muted));
}
.rdf-col ul { list-style: none; margin: 0; padding: 0; display: grid; gap: 14px; }
.rdf-link {
  position: relative; display: inline-flex; align-items: center; gap: 8px;
  color: var(--rdf-ink); text-decoration: none; font-size: 14.5px; line-height: 1.4; letter-spacing: -.005em;
  transition: color .3s ease, transform .5s cubic-bezier(.2,.7,.1,1);
}
.rdf-link::before {
  content: ""; position: absolute; left: -12px; top: 50%; width: 7px; height: 1px; background: var(--rdf-accent);
  transform: scaleX(0); transform-origin: 0 50%; transition: transform .45s cubic-bezier(.2,.7,.1,1);
}
.rdf-link:hover { color: var(--rdf-accent); transform: translateX(7px); }
.rdf-link:hover::before { transform: scaleX(1); }
.rdf-badge {
  font: 500 9px/1 var(--rdf-mono); letter-spacing: .1em; text-transform: uppercase; padding: 4px 6px 3px; border-radius: 99px;
  color: var(--rdf-accent); background: color-mix(in srgb, var(--rdf-accent) 11%, transparent);
}
.rdf-link:focus-visible, .rdf-logo:focus-visible, .rdf-social a:focus-visible, .rdf-credit:focus-visible {
  outline: 1px solid var(--rdf-accent); outline-offset: 4px; border-radius: 3px;
}

.rdf-bar {
  position: relative; z-index: 2; display: flex; justify-content: space-between; align-items: center; gap: 16px;
  padding: 0 var(--rdf-pad); font-size: 12px; color: var(--rdf-muted); margin-bottom: 12px;
}
.rdf-bar p { margin: 0; }
.rdf-bar-right {
  display: inline-flex; align-items: center; justify-content: flex-end;
  font: inherit; font-size: inherit; color: inherit;
}
.rdf-bar-right button, .rdf-bar-right a {
  background: none; border: none; padding: 0; margin: 0; font: inherit; font-size: inherit;
  color: var(--rdf-muted); cursor: pointer; text-decoration: underline; text-underline-offset: 3px;
  transition: color .3s ease, text-decoration-color .3s ease;
}
.rdf-bar-right button:hover, .rdf-bar-right a:hover {
  color: var(--rdf-ink); text-decoration-color: currentColor;
}
.rdf-credit {
  color: inherit; text-decoration: underline; text-decoration-color: color-mix(in srgb, var(--rdf-muted) 55%, transparent);
  text-underline-offset: 3px; transition: color .3s ease, text-decoration-color .3s ease;
}
.rdf-credit:hover { color: var(--rdf-ink); text-decoration-color: currentColor; }
.rdf-heart { display: inline-block; width: 11px; height: 11px; margin: 0 3px; vertical-align: -1px; color: var(--rdf-heart); }
.rdf-credit:hover .rdf-heart { animation: rdf-beat 1s ease-in-out infinite; }
@keyframes rdf-beat { 0%, 60%, 100% { transform: scale(1); } 15% { transform: scale(1.3); } 32% { transform: scale(.95); } 45% { transform: scale(1.15); } }

.rdf-scene { position: relative; z-index: 1; margin-top: -64px; overflow: hidden; min-height: var(--rdf-scene-min); width: 100%; }
.rdf-scene canvas {
  position: absolute; left: 0; bottom: 0; display: block; max-width: none;
  image-rendering: pixelated; image-rendering: crisp-edges;
}
.rdf-alt {
  position: absolute; left: 0; top: 0; z-index: 2; pointer-events: none; opacity: 0;
  transition: opacity .35s ease; font: 500 10px/1 var(--rdf-mono); letter-spacing: .08em; color: var(--rdf-ink);
}
.rdf-alt i {
  position: absolute; left: -4px; top: -4px; width: 8px; height: 8px; border-radius: 50%;
  background: var(--rdf-paper); box-shadow: 0 0 0 1.5px var(--rdf-ink);
}
.rdf-alt b { position: absolute; left: -.5px; bottom: 6px; width: 1px; height: 26px; background: var(--rdf-ink); opacity: .55; }
.rdf-alt span {
  position: absolute; left: 0; bottom: 34px; transform: translateX(-50%); white-space: nowrap; padding: 5px 7px 4px;
  border-radius: 5px; background: color-mix(in srgb, var(--rdf-paper) 88%, transparent); box-shadow: 0 0 0 1px var(--rdf-line);
  -webkit-backdrop-filter: blur(4px); backdrop-filter: blur(4px);
}
.rdf-sr { position: absolute; width: 1px; height: 1px; overflow: hidden; clip-path: inset(50%); white-space: nowrap; }

@media (max-width: 760px) {
  .rdf-root { min-height: 0 !important; }
  .rdf-frame { min-height: 0 !important; display: grid; grid-template-rows: auto auto minmax(280px, 1fr); height: 100%; }
  .rdf-top {
    grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
    row-gap: 22px;
    column-gap: 16px;
    padding: 32px var(--rdf-pad) 16px;
  }
  .rdf-brand {
    display: grid;
    grid-template-columns: 1fr auto;
    grid-template-rows: auto auto;
    align-items: center;
    column-gap: 16px;
    row-gap: 10px;
    width: 100%;
    margin-bottom: 6px;
    grid-column: 1 / -1;
  }
  .rdf-logo {
    grid-column: 1;
    grid-row: 1;
    justify-self: start;
  }
  .rdf-social {
    grid-column: 2;
    grid-row: 1;
    justify-self: end;
    display: flex;
    gap: 8px;
    margin: 0;
  }
  .rdf-tag {
    grid-column: 1 / -1;
    grid-row: 2;
    max-width: none;
    font-size: 13px;
    line-height: 1.45;
  }

  .rdf-col h3 { margin: 2px 0 10px; font-size: 10.5px; color: var(--rdf-section, var(--rdf-muted)); }
  .rdf-col ul { gap: 8px; }
  .rdf-link { font-size: 13.5px; }

  /* Zamiana miejscami: Kolumna 1 (Godziny otwarcia) obok Nawigacji w wierszu 2; Kolumna 2 (Kontakt) w wierszu 3 */
  .rdf-col-0 { grid-column: 1; grid-row: 2; }
  .rdf-col-1 { grid-column: 2; grid-row: 2; }
  .rdf-col-2 { grid-column: 1 / -1; grid-row: 3; }
  .rdf-col-2 ul {
    display: flex; flex-direction: column; gap: 8px;
  }

  .rdf-bar {
    display: flex; flex-direction: row; justify-content: space-between; align-items: center;
    flex-wrap: wrap; gap: 8px; font-size: 11.5px; padding: 0 var(--rdf-pad);
  }
  .rdf-scene {
    position: relative;
    z-index: 1;
    margin-top: -36px;
    overflow: hidden;
    min-height: 280px !important;
    height: 280px;
    width: 100%;
  }
}
@media (prefers-reduced-motion: reduce) {
  .rdf-r, .rdf-frame::before, .rdf-frame::after, .rdf-link, .rdf-link::before, .rdf-social a, .rdf-mark rect { transition: none; }
  .rdf-r { filter: none; }
  .rdf-credit:hover .rdf-heart { animation: none; }
}
`

export default function RidgelineDitherFooter({
  name = "Larchwood Labs",
  brandHref = "#",
  logo,
  tagline,
  columns = DEFAULT_COLUMNS,
  socials = DEFAULT_SOCIALS,
  copyright,
  bottomRight,
  credit = { label: "Makora Studio", href: "#" },
  preset = "auto",
  palette,
  seed = 7,
  ridges = 6,
  pixel = 2,
  mist = 0.8,
  drift = 1,
  radius = 130,
  interactive = true,
  altimeter = true,
  maxWidth = "1120px",
  fontFamily = SANS_STACK,
  monoFamily = MONO_STACK,
  height = "680px",
  sceneMinHeight = "260px",
  className = "",
}: RidgelineDitherFooterProps) {
  const rootRef = React.useRef(null as HTMLElement | null)
  const sceneRef = React.useRef(null as HTMLDivElement | null)
  const canvasRef = React.useRef(null as HTMLCanvasElement | null)
  const altRef = React.useRef(null as HTMLDivElement | null)
  const altTextRef = React.useRef(null as HTMLSpanElement | null)
  // When the reveal began (performance.now()), shared by the CSS and the canvas
  // so a re-layout never replays it. null until the footer is first seen.
  const revealAt = React.useRef(null as number | null)
  const [inView, setInView] = React.useState(false)
  const [dark, setDark] = React.useState(false)

  const base = preset === "auto" ? (dark ? PRESETS.night : PRESETS.evergreen) : PRESETS[preset] || PRESETS.evergreen
  const colors = { ...base, ...(palette || {}) }
  const tones = colors.tones && colors.tones.length >= 2 ? colors.tones : base.tones
  const deep = tones[Math.max(1, tones.length - 2)]
  const layers = Math.max(2, Math.min(9, Math.round(ridges)))

  const opts = React.useRef({ mist, drift, radius, interactive, altimeter })
  opts.current = { mist, drift, radius, interactive, altimeter }
  const key = [seed, layers, pixel, tones.join(",")].join("|")

  // "auto" follows a .dark class on the page, the way 21st and shadcn theme.
  React.useEffect(() => {
    if (preset !== "auto") return
    const read = () => {
      const root = rootRef.current
      setDark(document.documentElement.classList.contains("dark") || !!(root && root.closest(".dark")))
    }
    read()
    const mo = new MutationObserver(read)
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] })
    return () => mo.disconnect()
  }, [preset])

  // The reveal starts once, the first time the footer is on screen.
  React.useEffect(() => {
    const root = rootRef.current
    if (!root) return
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches
    const startReveal = () => {
      if (revealAt.current === null) revealAt.current = reduced ? -Infinity : performance.now()
      setInView(true)
    }

    const rect = root.getBoundingClientRect()
    if (rect.top < window.innerHeight && rect.bottom > 0) {
      startReveal()
      return
    }

    const io = new IntersectionObserver(
      (entries) => {
        if (!entries.some((e) => e.isIntersecting)) return
        startReveal()
        io.disconnect()
      },
      { threshold: 0.01, rootMargin: "100px" },
    )
    io.observe(root)
    return () => io.disconnect()
  }, [])

  React.useEffect(() => {
    const root = rootRef.current
    const scene = sceneRef.current
    const canvas = canvasRef.current
    if (!root || !scene || !canvas) return
    const ctx = canvas.getContext("2d")
    if (!ctx) return

    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches
    const pal = new Uint32Array(tones.map((t) => rdfPack(rdfHex(t) || [128, 128, 128])))
    const nTones = pal.length

    let p = 2
    let cols = 1
    let rows = 1
    let margin = 2
    let img = null as ImageData | null
    let buf = new Uint32Array(0)
    let tops = [] as Float32Array[]
    // Per layer, how deep the valley mist reaches under the crest, along its length.
    let pools = [] as Float32Array[]
    // Per frame, per layer per column: crest row and slope.
    let colTop = new Float32Array(0)
    let colSlope = new Float32Array(0)
    let colPool = new Float32Array(0)
    let fog = new Float32Array(0)
    let fw = 1
    let fh = 1
    let ceil = 0
    let fadeTo = 1

    let raf = 0
    let visible = true
    let awake = true
    let lastDraw = 0
    let lastTick = performance.now()
    // Pointer, in grid cells: target and eased.
    let tx = 0
    let ty = 0
    let ex = 0
    let ey = 0
    let inside = false
    let clear = 0
    // Parallax in -1..1, target and eased.
    let pt = 0
    let pe = 0
    let windV = 0
    let windX = 0
    let altShown = false
    let altLabel = ""

    const layout = () => {
      const rect = scene.getBoundingClientRect()
      if (rect.width === 0 || rect.height === 0) return
      p = Math.max(1, Math.round(pixel))
      cols = Math.max(8, Math.ceil(rect.width / p))
      rows = Math.max(8, Math.ceil(rect.height / p))
      canvas.width = cols
      canvas.height = rows
      canvas.style.width = cols * p + "px"
      canvas.style.height = rows * p + "px"
      img = ctx.createImageData(cols, rows)
      buf = new Uint32Array(img.data.buffer)
      margin = Math.ceil(cols * 0.045) + 3
      ceil = Math.max(rows * 0.17, 92 / p)
      fadeTo = Math.max(rows * 0.3, 128 / p)
      tops = []
      pools = []
      for (let i = 0; i < layers; i++) {
        const t = rdfRidgeline(cols, rows, i, layers, seed, margin)
        // Keep every crest clear of the copyright line, which overlaps the top of the range.
        for (let x = 0; x < t.length; x++) if (t[x] < ceil) t[x] = ceil - (ceil - t[x]) * 0.2
        const pool = new Float32Array(t.length)
        for (let x = 0; x < t.length; x++) pool[x] = 0.45 + 1.1 * rdfFbm(((x - margin) / cols) * 4, i * 5.3, seed + 9, 2)
        tops.push(t)
        pools.push(pool)
      }
      colTop = new Float32Array(layers * cols)
      colSlope = new Float32Array(layers * cols)
      colPool = new Float32Array(layers * cols)
      fw = (cols >> 1) + 2
      fh = (rows >> 1) + 2
      fog = new Float32Array(fw * fh)
      awake = true
    }

    const draw = (now: number) => {
      if (!img) return
      const o = opts.current
      const dt = Math.min(64, now - lastTick)
      lastTick = now
      const live = o.interactive && !reduced
      const age = revealAt.current === null ? -1 : now - revealAt.current

      // Ease the pointer, the clearing and the parallax toward their targets.
      const ease = 1 - Math.pow(0.82, dt / 16.7)
      const slow = 1 - Math.pow(0.93, dt / 16.7)
      ex += (tx - ex) * ease
      ey += (ty - ey) * ease
      clear += ((inside && o.interactive ? 1 : 0) - clear) * slow
      pe += ((live ? pt : 0) - pe) * slow
      windV *= Math.pow(0.965, dt / 16.7)
      windX += (windV * dt) / 1000
      const fogT = (reduced ? 0 : (now / 1000) * 0.045 * Math.max(0, o.drift)) + windX

      // The mist: a wide, slow fractal field at half resolution.
      const sx = 9 / cols
      const sy = 4.4 / rows
      for (let gy = 0; gy < fh; gy++) {
        const ny = gy * sy
        for (let gx = 0; gx < fw; gx++) {
          const nx = gx * sx + fogT
          const warp = rdfNoise(nx * 0.45 - fogT * 0.6, ny * 0.8, 77) * 0.6
          const v = rdfFbm(nx + warp, ny + warp * 0.4, 31, 3)
          fog[gy * fw + gx] = rdfSmooth(0.3, 0.74, v)
        }
      }

      // Each ridge's reveal, back to front, and where its crest sits this frame.
      const rev = new Float32Array(layers)
      const k = new Float32Array(layers)
      const toneBase = new Float32Array(layers)
      const fogDepth = new Float32Array(layers)
      for (let i = 0; i < layers; i++) {
        k[i] = i / (layers - 1)
        rev[i] = age < 0 ? 0 : rdfEase((age - 380 - i * 170) / 1300)
        toneBase[i] = 0.16 + 0.76 * Math.pow(k[i], 1.6)
        fogDepth[i] = rows * (0.08 + 0.42 * k[i])
        const rise = (1 - rev[i]) * rows * 0.09
        const shift = Math.round(pe * (0.25 + k[i]) * 0.75 * (margin - 3))
        const t = tops[i]
        const last = t.length - 1
        for (let x = 0; x < cols; x++) {
          const at = x + margin + shift
          colTop[i * cols + x] = t[at] + rise
          colSlope[i * cols + x] = t[Math.min(last, at + 2)] - t[Math.max(0, at - 2)]
          colPool[i * cols + x] = fogDepth[i] * pools[i][at]
        }
      }
      const lift = age < 0 ? 1 : 1 - rdfEase((age - 900) / 1800)
      const mistK = Math.max(0, Math.min(1, o.mist))
      const r = Math.max(1, o.radius / p)
      const r2 = r * r

      for (let y = 0; y < rows; y++) {
        const fade = rdfSmooth(0, fadeTo, y)
        const frow = (y >> 1) * fw
        const by = (y & 7) * 8
        const dyc = (y - ey) * 1.5
        for (let x = 0; x < cols; x++) {
          let L = -1
          for (let i = layers - 1; i >= 0; i--) {
            if (y >= colTop[i * cols + x]) {
              L = i
              break
            }
          }
          let tone = 0
          let mk = 0.3
          if (L >= 0) {
            const kk = k[L]
            const d = y - colTop[L * cols + x]
            const depth = colPool[L * cols + x]
            const crest = 1 - rdfSmooth(0, depth, d) * (0.88 - 0.45 * kk)
            tone = toneBase[L] * crest
            const sl = colSlope[L * cols + x] * 0.06
            tone += (sl < -0.2 ? -0.2 : sl > 0.2 ? 0.2 : sl) * (1 - rdfSmooth(0, depth * 0.5, d))
            tone += (rdfHash(x + Math.round(colTop[L * cols + x] * 7), d | 0, L) - 0.5) * 0.07 * kk
            tone *= rev[L]
            mk = 0.95 - 0.5 * kk
          } else {
            tone = 0.05 * rdfSmooth(rows * 0.15, rows * 0.6, y)
          }

          let m = fog[frow + (x >> 1)] * mistK * mk
          if (clear > 0.01) {
            const dx = x - ex
            const q = (dx * dx + dyc * dyc) / r2
            if (q < 4) {
              const c = clear * Math.exp(-q)
              m *= 1 - c * 0.92
              if (L >= 0) tone += c * 0.16 * rev[L]
            }
          }
          // Just under full tone, so even the deepest slope keeps its texture.
          if (tone > 0.93) tone = 0.93
          m += lift * 0.55
          if (m > 1) m = 1
          tone = (tone * (1 - m) + 0.09 * m * (1 - lift)) * fade

          buf[y * cols + x] = pal[rdfDither(tone, nTones, RDF_BAYER[by + (x & 7)])]
        }
      }
      ctx.putImageData(img, 0, 0)

      // The altimeter rides the crest of the ridge under the pointer.
      const alt = altRef.current
      const label = altTextRef.current
      let show = false
      if (alt && label && o.altimeter && inside && age > 1600) {
        const x = Math.max(0, Math.min(cols - 1, Math.round(ex)))
        for (let i = layers - 1; i >= 0; i--) {
          const crest = colTop[i * cols + x]
          if (ey >= crest - 6) {
            show = true
            alt.style.transform = "translate(" + (x * p).toFixed(1) + "px," + (crest * p).toFixed(1) + "px)"
            const text = rdfElevation(crest, rows, i, layers).toLocaleString("en-US") + " m"
            if (text !== altLabel) {
              altLabel = text
              label.textContent = text
            }
            break
          }
        }
      }
      if (alt && show !== altShown) {
        altShown = show
        alt.style.opacity = show ? "1" : "0"
      }

      const settling =
        Math.abs(tx - ex) + Math.abs(ty - ey) > 0.05 ||
        Math.abs((inside && o.interactive ? 1 : 0) - clear) > 0.005 ||
        Math.abs((live ? pt : 0) - pe) > 0.001 ||
        Math.abs(windV) > 0.002
      awake = (age >= 0 && age < 3400) || age < 0 || settling || (!reduced && o.drift > 0)
    }

    const busy = () => {
      const age = revealAt.current === null ? -1 : performance.now() - revealAt.current
      return (age >= 0 && age < 3400) || inside || Math.abs(windV) > 0.002 || Math.abs(pt - pe) > 0.001
    }

    const loop = (now: number) => {
      raf = 0
      if (!visible) return
      // Nothing to show until the reveal starts; just wait for it.
      if (revealAt.current === null) {
        if (inView) {
          revealAt.current = performance.now()
        } else {
          raf = requestAnimationFrame(loop)
          return
        }
      }
      // Full rate while revealing or under the pointer; the idle drift is slow
      // enough that every other frame reads the same.
      if (busy() || now - lastDraw > 32) {
        draw(now)
        lastDraw = now
      }
      if (awake) raf = requestAnimationFrame(loop)
    }
    const wake = () => {
      awake = true
      if (!raf && visible) raf = requestAnimationFrame(loop)
    }

    const onMove = (e: PointerEv) => {
      const o = opts.current
      if (!o.interactive && !o.altimeter) return
      const b = root.getBoundingClientRect()
      pt = b.width > 0 ? ((e.clientX - b.left) / b.width) * 2 - 1 : 0
      const s = scene.getBoundingClientRect()
      const lx = (e.clientX - s.left) / p
      const ly = (e.clientY - s.top) / p
      const was = inside
      inside = lx >= 0 && ly >= 0 && lx < cols && ly < rows
      tx = lx
      ty = ly
      if (inside && !was) {
        ex = tx
        ey = ty
      }
      wake()
    }
    const onLeave = () => {
      pt = 0
      inside = false
      wake()
    }
    const onDown = (e: PointerEv) => {
      if (!opts.current.interactive || reduced || !inside) return
      if ((e.target as HTMLElement).closest("a,button")) return
      // A gust blows the mist away from whichever side was clicked.
      windV += tx < cols / 2 ? 1.4 : -1.4
      wake()
    }

    layout()
    draw(performance.now())
    wake()

    root.addEventListener("pointermove", onMove)
    root.addEventListener("pointerleave", onLeave)
    root.addEventListener("pointerdown", onDown)
    const ro = new ResizeObserver(() => {
      layout()
      draw(performance.now())
      wake()
    })
    ro.observe(scene)
    const io = new IntersectionObserver((entries) => {
      visible = entries[0] ? entries[0].isIntersecting : true
      if (visible) {
        lastTick = performance.now()
        wake()
      }
    }, { threshold: 0.001, rootMargin: "250px" })
    io.observe(root)

    return () => {
      cancelAnimationFrame(raf)
      ro.disconnect()
      io.disconnect()
      root.removeEventListener("pointermove", onMove)
      root.removeEventListener("pointerleave", onLeave)
      root.removeEventListener("pointerdown", onDown)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key])

  const year = new Date().getFullYear()
  const line = copyright ?? "© " + year + " " + name + ", Inc. All rights reserved."

  return (
    <footer
      ref={rootRef}
      className={"rdf-root" + (inView ? " rdf-in" : "") + (className ? " " + className : "")}
      style={
        {
          minHeight: height,
          "--rdf-scene-min": sceneMinHeight,
          "--rdf-paper": colors.paper,
          "--rdf-ink": colors.ink,
          "--rdf-muted": colors.muted,
          "--rdf-section": colors.sectionLabel || "#64748B",
          "--rdf-line": colors.line,
          "--rdf-heart": colors.heart,
          "--rdf-deep": deep,
          "--rdf-accent": tones[Math.max(1, tones.length - 3)],
          "--rdf-n": columns.length,
          "--rdf-max": maxWidth,
          "--rdf-sans": fontFamily,
          "--rdf-mono": monoFamily,
        } as React.CSSProperties
      }
    >
      <style>{RDF_CSS}</style>
      <div className="rdf-frame">
        <div className="rdf-top">
          <div className="rdf-brand">
            <div className="rdf-logo rdf-r" style={{ "--d": 140 } as React.CSSProperties}>
              {brandHref ? (
                <a href={brandHref} className="inline-flex items-center gap-3">
                  {logo ?? <RidgeMark />}
                  {name ? <span>{name}</span> : null}
                </a>
              ) : (
                <div className="inline-flex items-center gap-3">
                  {logo ?? <RidgeMark />}
                  {name ? <span>{name}</span> : null}
                </div>
              )}
            </div>
            {tagline ? (
              <p className="rdf-tag rdf-r" style={{ "--d": 230 } as React.CSSProperties}>
                {tagline}
              </p>
            ) : null}
            {socials.length ? (
              <ul className="rdf-social">
                {socials.map((s, i) => (
                  <li key={`${s.icon}-${i}`} className="rdf-r" style={{ "--d": 320 + i * 60 } as React.CSSProperties}>
                    <a
                      href={s.href || "#"}
                      aria-label={s.label || SOCIAL_NAMES[s.icon]}
                      target={s.href?.startsWith("http") ? "_blank" : undefined}
                      rel={s.href?.startsWith("http") ? "noopener noreferrer" : undefined}
                    >
                      <SocialIcon icon={s.icon} />
                    </a>
                  </li>
                ))}
              </ul>
            ) : null}
          </div>
          {columns.map((col, ci) => (
            <nav className={`rdf-col rdf-col-${ci}`} key={col.title} aria-label={col.title}>
              <h3 className="rdf-r" style={{ "--d": 260 + ci * 110 } as React.CSSProperties}>
                {col.title}
              </h3>
              <ul>
                {col.links.map((l, li) => (
                  <li
                    key={typeof l.label === "string" ? l.label : li}
                    className="rdf-r"
                    style={{ "--d": 330 + ci * 110 + li * 55 } as React.CSSProperties}
                  >
                    {l.onClick && !l.href ? (
                      <button
                        type="button"
                        className="rdf-link"
                        onClick={l.onClick}
                        style={{
                          background: "none",
                          border: "none",
                          padding: 0,
                          cursor: "pointer",
                          textAlign: "left",
                          font: "inherit",
                        }}
                      >
                        {l.label}
                        {l.badge ? <span className="rdf-badge">{l.badge}</span> : null}
                      </button>
                    ) : l.href ? (
                      <a
                        className="rdf-link"
                        href={l.href}
                        target={l.target}
                        rel={l.rel}
                        onClick={l.onClick}
                      >
                        {l.label}
                        {l.badge ? <span className="rdf-badge">{l.badge}</span> : null}
                      </a>
                    ) : (
                      <span className="rdf-link" style={{ cursor: "default" }}>
                        {l.label}
                        {l.badge ? <span className="rdf-badge">{l.badge}</span> : null}
                      </span>
                    )}
                  </li>
                ))}
              </ul>
            </nav>
          ))}
        </div>
        <div className="rdf-bar rdf-r" style={{ "--d": 1250 } as React.CSSProperties}>
          <p>{line}</p>
          {bottomRight ? (
            <div className="rdf-bar-right">{bottomRight}</div>
          ) : credit ? (
            <a className="rdf-credit" href={credit.href || "#"}>
              Made with
              <svg className="rdf-heart" viewBox="0 0 24 24" aria-hidden="true">
                <path
                  fill="currentColor"
                  d="M12 21s-7.5-4.6-9.6-9.2C.9 8.4 3 4.5 6.7 4.5c2.1 0 3.6 1.1 5.3 3 1.7-1.9 3.2-3 5.3-3 3.7 0 5.8 3.9 4.3 7.3C19.5 16.4 12 21 12 21z"
                />
              </svg>
              <span className="rdf-sr">love</span>
              by {credit.label}
            </a>
          ) : null}
        </div>
        <div ref={sceneRef} className="rdf-scene">
          <canvas ref={canvasRef} aria-hidden="true" />
          <div ref={altRef} className="rdf-alt" aria-hidden="true">
            <b />
            <i />
            <span ref={altTextRef} />
          </div>
        </div>
      </div>
    </footer>
  )
}

/** Two peaks with mist drawn through them. The bands slide apart on hover. */
function RidgeMark() {
  return (
    <svg className="rdf-mark" viewBox="0 0 30 21" aria-hidden="true">
      <path fill="currentColor" d="M0 21 L10.5 3 L16 12.2 L20.5 6.5 L30 21 Z" />
      <rect className="rdf-mist-a" x="-2" y="12.6" width="19" height="1.7" />
      <rect className="rdf-mist-b" x="13" y="16.4" width="19" height="1.7" />
    </svg>
  )
}

function SocialIcon({ icon }: { icon: RidgelineSocialIcon }) {
  if (icon === "facebook") {
    return (
      <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
        <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z" />
      </svg>
    )
  }
  if (icon === "instagram") {
    return (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
        <rect x="3" y="3" width="18" height="18" rx="5" />
        <circle cx="12" cy="12" r="4.2" />
        <circle cx="17.4" cy="6.6" r="1" fill="currentColor" stroke="none" />
      </svg>
    )
  }
  if (icon === "linkedin") {
    return (
      <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
        <rect x="3" y="9" width="3.6" height="12" />
        <circle cx="4.8" cy="4.8" r="2.1" />
        <path d="M10 9h3.4v1.7c.6-1 1.9-2 3.9-2 3.3 0 4.3 2.1 4.3 5.3V21h-3.6v-6.2c0-1.5-.3-2.9-2.1-2.9s-2.3 1.3-2.3 2.8V21H10z" />
      </svg>
    )
  }
  if (icon === "github") {
    return (
      <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
        <path d="M12 2C6.48 2 2 6.58 2 12.23c0 4.52 2.87 8.35 6.84 9.7.5.1.68-.22.68-.49 0-.24-.01-.88-.01-1.73-2.78.62-3.37-1.37-3.37-1.37-.45-1.18-1.11-1.5-1.11-1.5-.91-.64.07-.62.07-.62 1 .07 1.53 1.06 1.53 1.06.89 1.57 2.34 1.12 2.91.85.09-.66.35-1.12.63-1.37-2.22-.26-4.56-1.14-4.56-5.07 0-1.12.39-2.03 1.03-2.75-.1-.26-.45-1.3.1-2.71 0 0 .84-.28 2.75 1.05A9.4 9.4 0 0 1 12 6.84c.85 0 1.71.12 2.51.34 1.91-1.33 2.75-1.05 2.75-1.05.55 1.41.2 2.45.1 2.71.64.72 1.03 1.63 1.03 2.75 0 3.94-2.34 4.81-4.57 5.06.36.32.68.94.68 1.9 0 1.37-.01 2.47-.01 2.81 0 .27.18.6.69.49A10.1 10.1 0 0 0 22 12.23C22 6.58 17.52 2 12 2z" />
      </svg>
    )
  }
  if (icon === "youtube") {
    return (
      <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
        <path d="M21.6 7.2a2.6 2.6 0 0 0-1.8-1.9C18.2 4.9 12 4.9 12 4.9s-6.2 0-7.8.4a2.6 2.6 0 0 0-1.8 1.9C2 8.8 2 12 2 12s0 3.2.4 4.8a2.6 2.6 0 0 0 1.8 1.9c1.6.4 7.8.4 7.8.4s6.2 0 7.8-.4a2.6 2.6 0 0 0 1.8-1.9c.4-1.6.4-4.8.4-4.8s0-3.2-.4-4.8zM10 15.1V8.9l5.2 3.1L10 15.1z" />
      </svg>
    )
  }
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M17.75 3h3.07l-6.71 7.67L22 21h-6.18l-4.84-6.33L5.44 21H2.37l7.18-8.2L2 3h6.33l4.37 5.78L17.75 3zm-1.08 16.2h1.7L7.4 4.73H5.58L16.67 19.2z" />
    </svg>
  )
}

type PointerEv = PointerEvent

// Declared after the JSX: the 21st CLI tokenizer hangs on mapped types before it.
type RidgelinePresetMap = { [K in RidgelineTheme]: RidgelinePalette }
type RidgelineSocialNameMap = { [K in RidgelineSocialIcon]: string }

