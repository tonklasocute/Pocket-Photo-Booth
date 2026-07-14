/*
 * Premium frame collections — every frame is a designed physical object
 * rendered on canvas: paper texture, print imperfections, typography,
 * emboss/foil, natural shadows. Layout space is STRIP_W wide; pass
 * `scale` to render the same design at higher resolution.
 */
import { filterById, type PhotoCount } from "./booth";

export const STRIP_W = 640;

export type FrameCustom = {
  title: string;
  subtitle: string;
  signature: string;
  location: string;
  dateFormat: "long" | "short" | "none";
  showLogo: boolean;
  paperColor: string | null;
  frameColor: string | null;
  /** multiplier on photo border thickness (0.5–2) */
  borderScale: number;
  /** multiplier on photo corner radius (0–2) */
  radiusScale: number;
};

export const DEFAULT_CUSTOM: FrameCustom = {
  title: "",
  subtitle: "",
  signature: "",
  location: "",
  dateFormat: "long",
  showLogo: true,
  paperColor: null,
  frameColor: null,
  borderScale: 1,
  radiusScale: 1,
};

type Ctx = CanvasRenderingContext2D;
type Rnd = () => number;
type Slot = { x: number; y: number; w: number; h: number };

type Env = {
  w: number;
  h: number;
  slots: Slot[];
  rnd: Rnd;
  custom: FrameCustom;
  date: Date;
  /** resolved font families */
  fd: string;
  fb: string;
  ink: string;
};

export type Collection = {
  id: string;
  name: string;
  vibe: string;
  /** accent color for UI chrome */
  swatch: string;
  pad: number;
  top: number;
  footer: number;
  gap: number;
  paper: { bg: string | [string, string]; texture: "smooth" | "fiber" | "aged" | "lined" | "kraft"; gloss?: boolean };
  photo: { bw: number; bc: string; radius: number; shadow?: boolean; tilt?: number; bottom?: number; hairline?: string };
  fontDisplay: string;
  fontBody: string;
  ink: string;
  drawBack?: (c: Ctx, e: Env) => void;
  drawHeader?: (c: Ctx, e: Env) => void;
  drawPhotoExtra?: (c: Ctx, e: Env, s: Slot, i: number) => void;
  drawFooter: (c: Ctx, e: Env) => void;
  drawOver?: (c: Ctx, e: Env) => void;
};

/* ── small utilities ─────────────────────────────────────── */

function mulberry32(seed: number): Rnd {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function resolveFontFamily(cssValue: string): string {
  if (!cssValue.startsWith("var(")) return cssValue;
  const name = cssValue.slice(4, -1).trim();
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim() || "sans-serif";
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}

function drawCover(c: Ctx, img: HTMLImageElement, x: number, y: number, w: number, h: number) {
  const s = Math.max(w / img.naturalWidth, h / img.naturalHeight);
  const dw = img.naturalWidth * s;
  const dh = img.naturalHeight * s;
  c.drawImage(img, x + (w - dw) / 2, y + (h - dh) / 2, dw, dh);
}

let noiseTile: HTMLCanvasElement | null = null;
function getNoise(): HTMLCanvasElement {
  if (noiseTile) return noiseTile;
  const cv = document.createElement("canvas");
  cv.width = cv.height = 160;
  const c = cv.getContext("2d")!;
  const img = c.createImageData(160, 160);
  const rnd = mulberry32(7);
  for (let i = 0; i < img.data.length; i += 4) {
    const v = rnd() * 255;
    img.data[i] = img.data[i + 1] = img.data[i + 2] = v;
    img.data[i + 3] = 255;
  }
  c.putImageData(img, 0, 0);
  noiseTile = cv;
  return cv;
}

function grainRegion(c: Ctx, x: number, y: number, w: number, h: number, alpha: number) {
  const n = getNoise();
  c.save();
  c.beginPath();
  c.rect(x, y, w, h);
  c.clip();
  c.globalAlpha = alpha;
  c.globalCompositeOperation = "overlay";
  for (let ny = y; ny < y + h; ny += n.height)
    for (let nx = x; nx < x + w; nx += n.width) c.drawImage(n, nx, ny);
  c.restore();
}

/** paper fibre / age / tooth — the thing that makes it feel printed */
function paperTexture(c: Ctx, e: Env, kind: Collection["paper"]["texture"]) {
  grainRegion(c, 0, 0, e.w, e.h, kind === "smooth" ? 0.025 : 0.05);
  if (kind === "fiber" || kind === "kraft" || kind === "aged") {
    c.save();
    c.strokeStyle = kind === "kraft" ? "rgba(120,90,50,0.05)" : "rgba(140,120,90,0.05)";
    c.lineWidth = 1;
    for (let i = 0; i < 90; i++) {
      const x = e.rnd() * e.w;
      const y = e.rnd() * e.h;
      const len = 8 + e.rnd() * 26;
      const a = e.rnd() * Math.PI;
      c.beginPath();
      c.moveTo(x, y);
      c.lineTo(x + Math.cos(a) * len, y + Math.sin(a) * len * 0.25);
      c.stroke();
    }
    c.restore();
  }
  if (kind === "aged") {
    // blotches of age
    c.save();
    for (let i = 0; i < 10; i++) {
      const x = e.rnd() * e.w;
      const y = e.rnd() * e.h;
      const r = 20 + e.rnd() * 60;
      const g = c.createRadialGradient(x, y, 0, x, y, r);
      g.addColorStop(0, "rgba(170,130,70,0.05)");
      g.addColorStop(1, "rgba(170,130,70,0)");
      c.fillStyle = g;
      c.fillRect(x - r, y - r, r * 2, r * 2);
    }
    c.restore();
  }
}

function spacedText(
  c: Ctx,
  str: string,
  x: number,
  y: number,
  spacing: number,
  align: "center" | "left" | "right" = "center"
) {
  const widths = [...str].map((ch) => c.measureText(ch).width);
  const total = widths.reduce((a, b) => a + b, 0) + spacing * (str.length - 1);
  let cx = align === "center" ? x - total / 2 : align === "right" ? x - total : x;
  const prevAlign = c.textAlign;
  c.textAlign = "left";
  [...str].forEach((ch, i) => {
    c.fillText(ch, cx, y);
    cx += widths[i] + spacing;
  });
  c.textAlign = prevAlign;
}

function embossText(c: Ctx, str: string, x: number, y: number, font: string, color: string, spacing = 0) {
  c.save();
  c.font = font;
  c.fillStyle = "rgba(255,255,255,0.55)";
  const draw = (dx: number, dy: number) =>
    spacing > 0 ? spacedText(c, str, x + dx, y + dy, spacing) : c.fillText(str, x + dx, y + dy);
  draw(0, 1.2);
  c.fillStyle = "rgba(0,0,0,0.18)";
  draw(0, -1);
  c.fillStyle = color;
  draw(0, 0);
  c.restore();
}

function foilText(c: Ctx, str: string, x: number, y: number, font: string, spacing = 0) {
  c.save();
  c.font = font;
  const w = c.measureText(str).width + spacing * str.length;
  const g = c.createLinearGradient(x - w / 2, y - 20, x + w / 2, y + 12);
  g.addColorStop(0, "#b89545");
  g.addColorStop(0.35, "#f3e5b5");
  g.addColorStop(0.55, "#d9c07a");
  g.addColorStop(0.8, "#f7ecc4");
  g.addColorStop(1, "#a98738");
  c.fillStyle = "rgba(0,0,0,0.55)";
  if (spacing > 0) spacedText(c, str, x, y + 1.4, spacing);
  else c.fillText(str, x, y + 1.4);
  c.fillStyle = g;
  if (spacing > 0) spacedText(c, str, x, y, spacing);
  else c.fillText(str, x, y);
  c.restore();
}

function tape(c: Ctx, e: Env, x: number, y: number, w: number, angle: number, color: string) {
  c.save();
  c.translate(x, y);
  c.rotate(angle);
  c.globalAlpha = 0.72;
  c.fillStyle = color;
  c.shadowColor = "rgba(0,0,0,0.15)";
  c.shadowBlur = 4;
  c.shadowOffsetY = 2;
  c.fillRect(-w / 2, -13, w, 26);
  c.shadowColor = "transparent";
  // torn ends
  c.globalCompositeOperation = "destination-out";
  for (const end of [-w / 2, w / 2]) {
    c.beginPath();
    for (let i = 0; i <= 6; i++) {
      const yy = -13 + (26 / 6) * i;
      const xx = end + (e.rnd() - 0.5) * 5;
      if (i === 0) c.moveTo(xx, yy);
      else c.lineTo(xx, yy);
    }
    c.lineTo(end + (end > 0 ? 8 : -8), 13);
    c.lineTo(end + (end > 0 ? 8 : -8), -13);
    c.closePath();
    c.fill();
  }
  c.restore();
}

function barcode(c: Ctx, e: Env, x: number, y: number, w: number, h: number, color = "#111") {
  c.save();
  c.fillStyle = color;
  let cx = x;
  while (cx < x + w) {
    const bw = 1 + Math.floor(e.rnd() * 3);
    if (e.rnd() > 0.4) c.fillRect(cx, y, bw, h);
    cx += bw + 1 + Math.floor(e.rnd() * 2);
  }
  c.restore();
}

function stampCircle(c: Ctx, e: Env, x: number, y: number, r: number, top: string, bottom: string, color: string) {
  c.save();
  c.translate(x, y);
  c.rotate((e.rnd() - 0.5) * 0.5);
  c.globalAlpha = 0.55 + e.rnd() * 0.2;
  c.strokeStyle = color;
  c.fillStyle = color;
  c.lineWidth = 2.5;
  c.beginPath();
  c.arc(0, 0, r, 0, Math.PI * 2);
  c.stroke();
  c.lineWidth = 1.2;
  c.beginPath();
  c.arc(0, 0, r - 7, 0, Math.PI * 2);
  c.stroke();
  c.font = `700 11px ${e.fb}`;
  c.textAlign = "center";
  c.textBaseline = "middle";
  // text on arc
  const put = (str: string, dir: 1 | -1) => {
    const arc = Math.PI * 0.9;
    const step = arc / Math.max(1, str.length - 1);
    for (let i = 0; i < str.length; i++) {
      const a = -arc / 2 + step * i;
      c.save();
      c.rotate(dir === 1 ? a : Math.PI - a);
      c.translate(0, dir === 1 ? -(r - 16) : r - 16);
      if (dir === -1) c.rotate(Math.PI);
      c.fillText(str[i], 0, 0);
      c.restore();
    }
  };
  put(top, 1);
  put(bottom, -1);
  c.font = `700 13px ${e.fb}`;
  c.fillText("✈", 0, 0);
  c.restore();
}

function scratches(c: Ctx, e: Env, count: number, color = "rgba(255,255,250,0.16)") {
  c.save();
  c.strokeStyle = color;
  for (let i = 0; i < count; i++) {
    const x = e.rnd() * e.w;
    const y0 = e.rnd() * e.h * 0.6;
    c.lineWidth = 0.5 + e.rnd() * 0.8;
    c.beginPath();
    c.moveTo(x, y0);
    c.lineTo(x + (e.rnd() - 0.5) * 14, y0 + 60 + e.rnd() * 180);
    c.stroke();
  }
  c.restore();
}

function dustSpecks(c: Ctx, e: Env, count: number, color = "rgba(255,251,232,0.3)") {
  c.save();
  c.fillStyle = color;
  for (let i = 0; i < count; i++) {
    c.globalAlpha = 0.2 + e.rnd() * 0.5;
    c.beginPath();
    c.arc(e.rnd() * e.w, e.rnd() * e.h, 0.4 + e.rnd() * 1.4, 0, Math.PI * 2);
    c.fill();
  }
  c.restore();
}

function lightLeakRegion(c: Ctx, x: number, y: number, w: number, h: number) {
  const g = c.createLinearGradient(x + w, y, x + w * 0.45, y + h);
  g.addColorStop(0, "rgba(255,120,80,0.5)");
  g.addColorStop(0.4, "rgba(255,180,120,0.2)");
  g.addColorStop(1, "rgba(255,180,120,0)");
  c.save();
  c.globalCompositeOperation = "screen";
  c.fillStyle = g;
  c.fillRect(x, y, w, h);
  c.restore();
}

function fmtDate(e: Env): string {
  if (e.custom.dateFormat === "none") return "";
  if (e.custom.dateFormat === "short") {
    const d = e.date;
    return `${String(d.getMonth() + 1).padStart(2, "0")}.${String(d.getDate()).padStart(2, "0")}.${String(d.getFullYear()).slice(2)}`;
  }
  return e.date.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" }).replace(",", "");
}

/** print-offset + ink-density jitter so every export is subtly unique */
function withInk(c: Ctx, e: Env, fn: () => void) {
  c.save();
  c.translate((e.rnd() - 0.5) * 1.8, (e.rnd() - 0.5) * 1.8);
  c.globalAlpha *= 0.88 + e.rnd() * 0.12;
  c.textAlign = "center";
  c.textBaseline = "middle";
  fn();
  c.restore();
}

function heart(c: Ctx, x: number, y: number, size: number, color: string, alpha = 1) {
  c.save();
  c.globalAlpha = alpha;
  c.fillStyle = color;
  c.font = `${size}px serif`;
  c.textAlign = "center";
  c.textBaseline = "middle";
  c.fillText("♥", x, y);
  c.restore();
}

/* ── the collections ─────────────────────────────────────── */

const SANS = "var(--font-cute)";
const HAND = "var(--font-hand)";
const SERIF = "var(--font-serif)";
const TYPE = "var(--font-type)";

const seasonalVariants = [
  { months: [1], name: "New Year", bg: ["#12142a", "#1d2140"] as [string, string], ink: "#e8d49a", deco: ["✨", "🎆"], greeting: "HAPPY NEW YEAR", photoBc: "#20244a", dark: true },
  { months: [2], name: "Valentine", bg: ["#ffe6ec", "#ffd0dd"] as [string, string], ink: "#c04a6a", deco: ["💌", "🌹", "♥"], greeting: "be my valentine", photoBc: "#ffffff", dark: false },
  { months: [3, 4], name: "Cherry Blossom", bg: ["#fff4f6", "#ffe3ec"] as [string, string], ink: "#d1798f", deco: ["🌸", "🌸", "🍡"], greeting: "spring picnic", photoBc: "#ffffff", dark: false },
  { months: [5, 6, 7, 8, 9], name: "Summer", bg: ["#dff2fb", "#fdf3d9"] as [string, string], ink: "#3f7fa6", deco: ["🌊", "🍉", "☀️"], greeting: "summer forever", photoBc: "#ffffff", dark: false },
  { months: [10], name: "Halloween", bg: ["#1f1430", "#2b1a3e"] as [string, string], ink: "#f2a541", deco: ["🎃", "👻", "🕸️"], greeting: "spooky season", photoBc: "#160e24", dark: true },
  { months: [11, 12], name: "Christmas", bg: ["#f2faf3", "#e2f2e5"] as [string, string], ink: "#3f7a4e", deco: ["🎄", "❄️", "🎁"], greeting: "merry & bright", photoBc: "#ffffff", dark: false },
];

function currentSeason(date = new Date()) {
  const m = date.getMonth() + 1;
  return seasonalVariants.find((v) => v.months.includes(m)) ?? seasonalVariants[3];
}

function logoRow(c: Ctx, e: Env, x: number, y: number, color: string, size = 15) {
  if (!e.custom.showLogo) return;
  c.save();
  c.fillStyle = color;
  c.font = `600 ${size}px ${e.fb}`;
  spacedText(c, "POCKET PHOTO BOOTH", x, y, 3);
  c.restore();
}

export const COLLECTIONS: Collection[] = [
  /* 1 ── Classic Korean Booth */
  {
    id: "classic",
    name: "Classic Korean Booth",
    vibe: "clean · modern · timeless",
    swatch: "#e88ea9",
    pad: 42,
    top: 52,
    footer: 128,
    gap: 24,
    paper: { bg: "#ffffff", texture: "smooth", gloss: true },
    photo: { bw: 0, bc: "#ffffff", radius: 14, hairline: "#e8e8e8" },
    fontDisplay: SANS,
    fontBody: SANS,
    ink: "#8a8a8a",
    drawFooter(c, e) {
      const y = e.h - this.footer;
      withInk(c, e, () => {
        if (e.custom.showLogo) {
          c.fillStyle = "#f5b8c8";
          c.beginPath();
          c.arc(e.w / 2 - 52, y + 46, 5, 0, Math.PI * 2);
          c.fill();
          c.fillStyle = "#4b4145";
          c.font = `700 20px ${e.fd}`;
          spacedText(c, "POCKET", e.w / 2 + 8, y + 46, 6);
        }
        const d = fmtDate(e);
        if (d) {
          c.fillStyle = e.ink;
          c.font = `500 16px ${e.fb}`;
          c.fillText(d, e.w / 2, y + 82);
        }
        if (e.custom.title) {
          c.fillStyle = "#4b4145";
          c.font = `600 18px ${e.fd}`;
          c.fillText(e.custom.title, e.w / 2, y + 16);
        }
      });
    },
  },

  /* 2 ── MUJI Edition */
  {
    id: "muji",
    name: "MUJI Edition",
    vibe: "warm cream · japanese minimal",
    swatch: "#b8a98c",
    pad: 56,
    top: 104,
    footer: 168,
    gap: 40,
    paper: { bg: "#f3eee2", texture: "fiber" },
    photo: { bw: 0, bc: "#f3eee2", radius: 2, hairline: "#d9d2c0" },
    fontDisplay: SANS,
    fontBody: SANS,
    ink: "#7a7264",
    drawHeader(c, e) {
      withInk(c, e, () => {
        c.strokeStyle = "#c9c1ad";
        c.lineWidth = 1;
        c.beginPath();
        c.moveTo(e.w / 2 - 30, 52);
        c.lineTo(e.w / 2 + 30, 52);
        c.stroke();
        c.fillStyle = e.ink;
        c.font = `400 15px ${e.fb}`;
        c.fillText("ポケット写真", e.w / 2, 74);
      });
    },
    drawFooter(c, e) {
      const y = e.h - this.footer;
      withInk(c, e, () => {
        c.fillStyle = "#5f594d";
        c.font = `500 17px ${e.fd}`;
        spacedText(c, (e.custom.title || "PHOTO ALBUM").toUpperCase(), e.w / 2, y + 52, 7);
        const d = fmtDate(e);
        if (d) {
          c.fillStyle = e.ink;
          c.font = `400 13px ${e.fb}`;
          spacedText(c, d.toUpperCase(), e.w / 2, y + 86, 3);
        }
        if (e.custom.showLogo) logoRow(c, e, e.w / 2, y + 120, "#a89f8a", 11);
      });
    },
  },

  /* 3 ── Retro Film */
  {
    id: "retro",
    name: "Retro Film",
    vibe: "kodak · grain · light leaks",
    swatch: "#e8a33d",
    pad: 74,
    top: 64,
    footer: 118,
    gap: 34,
    paper: { bg: "#191612", texture: "smooth" },
    photo: { bw: 5, bc: "#000000", radius: 3 },
    fontDisplay: TYPE,
    fontBody: TYPE,
    ink: "#e8a33d",
    drawBack(c, e) {
      // sprocket holes
      c.save();
      for (const x of [18, e.w - 40]) {
        for (let y = 22; y < e.h - 30; y += 46) {
          c.fillStyle = "#0a0908";
          c.beginPath();
          c.roundRect(x, y + (e.rnd() - 0.5) * 1.4, 22, 27, 5);
          c.fill();
          c.fillStyle = "rgba(255,255,255,0.05)";
          c.fillRect(x, y, 22, 2);
        }
      }
      c.restore();
    },
    drawHeader(c, e) {
      withInk(c, e, () => {
        c.fillStyle = e.ink;
        c.font = `16px ${e.fb}`;
        spacedText(c, "POCKET FILM  •  P-400", e.w / 2, 34, 2);
      });
    },
    drawPhotoExtra(c, e, s, i) {
      c.save();
      c.fillStyle = "rgba(232,163,61,0.85)";
      c.font = `12px ${e.fb}`;
      c.textAlign = "left";
      c.fillText(`▸ ${i + 1}A`, s.x + 2, s.y + s.h + 18);
      c.textAlign = "right";
      c.fillText("KODAK 400", s.x + s.w - 2, s.y + s.h + 18);
      c.restore();
    },
    drawFooter(c, e) {
      const y = e.h - this.footer;
      withInk(c, e, () => {
        c.fillStyle = e.ink;
        c.font = `18px ${e.fd}`;
        c.fillText(e.custom.title || "MEMORIES ON FILM", e.w / 2, y + 40);
        const d = fmtDate(e);
        c.fillStyle = "#9c7b45";
        c.font = `13px ${e.fb}`;
        if (d) c.fillText(`DEV ${d.toUpperCase()}  ·  FRAME 0${e.slots.length}`, e.w / 2, y + 70);
      });
    },
    drawOver(c, e) {
      grainRegion(c, 0, 0, e.w, e.h, 0.07);
      scratches(c, e, 5);
      dustSpecks(c, e, 40);
      const s = e.slots[Math.floor(e.rnd() * e.slots.length)];
      lightLeakRegion(c, s.x, s.y, s.w, s.h);
    },
  },

  /* 4 ── Scrapbook */
  {
    id: "scrapbook",
    name: "Scrapbook",
    vibe: "washi tape · doodles · notes",
    swatch: "#7ec98f",
    pad: 58,
    top: 86,
    footer: 168,
    gap: 44,
    paper: { bg: "#fbf7ea", texture: "fiber" },
    photo: { bw: 12, bc: "#ffffff", radius: 4, shadow: true, tilt: 2.4 },
    fontDisplay: HAND,
    fontBody: HAND,
    ink: "#5a4f43",
    drawBack(c, e) {
      c.save();
      c.strokeStyle = "rgba(100,140,190,0.28)";
      c.lineWidth = 1;
      for (let y = 60; y < e.h; y += 42) {
        c.beginPath();
        c.moveTo(0, y);
        c.lineTo(e.w, y);
        c.stroke();
      }
      c.strokeStyle = "rgba(220,110,110,0.35)";
      c.beginPath();
      c.moveTo(34, 0);
      c.lineTo(34, e.h);
      c.stroke();
      c.restore();
    },
    drawHeader(c, e) {
      withInk(c, e, () => {
        c.fillStyle = e.ink;
        c.font = `26px ${e.fd}`;
        c.save();
        c.translate(e.w / 2, 48);
        c.rotate(-0.03 + (e.rnd() - 0.5) * 0.04);
        c.fillText(e.custom.title || "my little scrapbook ✿", 0, 0);
        c.restore();
      });
    },
    drawPhotoExtra(c, e, s) {
      const colors = ["rgba(245,184,200,0.9)", "rgba(176,224,190,0.9)", "rgba(250,225,150,0.9)", "rgba(180,210,245,0.9)"];
      tape(c, e, s.x + 14 + e.rnd() * 10, s.y - 2, 74, -0.5 + e.rnd() * 0.25, colors[Math.floor(e.rnd() * colors.length)]);
      tape(c, e, s.x + s.w - 18 - e.rnd() * 10, s.y + 2, 74, 0.35 + e.rnd() * 0.25, colors[Math.floor(e.rnd() * colors.length)]);
      // doodle in the margin
      c.save();
      c.strokeStyle = ["#e05a7a", "#7fa8d0", "#e8a33d"][Math.floor(e.rnd() * 3)];
      c.lineWidth = 2;
      c.lineCap = "round";
      const dx = e.rnd() > 0.5 ? s.x - 26 : s.x + s.w + 26;
      const dy = s.y + s.h * (0.3 + e.rnd() * 0.5);
      if (e.rnd() > 0.5) {
        // little star
        c.beginPath();
        for (let i = 0; i < 5; i++) {
          const a = (i * 4 * Math.PI) / 5 - Math.PI / 2;
          const px = dx + Math.cos(a) * 9;
          const py = dy + Math.sin(a) * 9;
          if (i === 0) c.moveTo(px, py);
          else c.lineTo(px, py);
        }
        c.closePath();
        c.stroke();
      } else {
        c.font = `18px ${e.fd}`;
        c.fillStyle = c.strokeStyle;
        c.textAlign = "center";
        c.fillText("♡", dx, dy);
      }
      c.restore();
    },
    drawFooter(c, e) {
      const y = e.h - this.footer;
      withInk(c, e, () => {
        c.fillStyle = e.ink;
        c.font = `24px ${e.fd}`;
        c.save();
        c.translate(e.w / 2, y + 58);
        c.rotate((e.rnd() - 0.5) * 0.05);
        c.fillText(e.custom.signature || "such a good day!!", 0, 0);
        c.restore();
        const d = fmtDate(e);
        if (d) {
          c.font = `17px ${e.fd}`;
          c.fillStyle = "#8d8271";
          c.fillText(`✎ ${d}`, e.w / 2, y + 98);
        }
      });
      // corner sticker
      c.save();
      c.font = "26px serif";
      c.textAlign = "center";
      c.globalAlpha = 0.9;
      c.fillText(["🌼", "🍒", "⭐", "🧸"][Math.floor(e.rnd() * 4)], e.w - 52, y + 66);
      c.restore();
    },
  },

  /* 5 ── Museum Collection */
  {
    id: "museum",
    name: "Museum Collection",
    vibe: "gallery label · minimal luxury",
    swatch: "#8a8578",
    pad: 62,
    top: 96,
    footer: 208,
    gap: 46,
    paper: { bg: "#faf9f6", texture: "smooth" },
    photo: { bw: 16, bc: "#ffffff", radius: 0, shadow: true, hairline: "#22201d" },
    fontDisplay: SERIF,
    fontBody: SANS,
    ink: "#3f3c36",
    drawHeader(c, e) {
      withInk(c, e, () => {
        c.fillStyle = "#98917f";
        c.font = `600 12px ${e.fb}`;
        spacedText(c, "POCKET MUSEUM OF MEMORIES", e.w / 2, 50, 4);
        c.strokeStyle = "#d6d1c4";
        c.lineWidth = 1;
        c.beginPath();
        c.moveTo(e.w / 2 - 26, 70);
        c.lineTo(e.w / 2 + 26, 70);
        c.stroke();
      });
    },
    drawFooter(c, e) {
      const y = e.h - this.footer;
      // gallery label card
      c.save();
      c.shadowColor = "rgba(0,0,0,0.09)";
      c.shadowBlur = 10;
      c.shadowOffsetY = 3;
      c.fillStyle = "#ffffff";
      c.fillRect(e.w / 2 - 190, y + 18, 380, 138);
      c.shadowColor = "transparent";
      c.strokeStyle = "#e4dfd2";
      c.strokeRect(e.w / 2 - 190, y + 18, 380, 138);
      c.restore();
      withInk(c, e, () => {
        embossText(c, e.custom.title || "Untitled Memory", e.w / 2, y + 56, `italic 600 26px ${e.fd}`, e.ink);
        c.font = `400 15px ${e.fb}`;
        c.fillStyle = "#6f695c";
        const no = String(Math.floor(e.rnd() * 900) + 100);
        c.fillText(`Memory No. ${no} · Edition of 1`, e.w / 2, y + 90);
        const d = fmtDate(e);
        const loc = e.custom.location;
        c.fillStyle = "#98917f";
        c.font = `400 13px ${e.fb}`;
        spacedText(c, [d, loc].filter(Boolean).join("  ·  ").toUpperCase() || "PERMANENT COLLECTION", e.w / 2, y + 124, 2);
      });
    },
  },

  /* 6 ── Travel Memories */
  {
    id: "travel",
    name: "Travel Memories",
    vibe: "postcard · stamps · boarding pass",
    swatch: "#c96f4a",
    pad: 58,
    top: 96,
    footer: 200,
    gap: 38,
    paper: { bg: "#f6f1e4", texture: "aged" },
    photo: { bw: 10, bc: "#ffffff", radius: 3, shadow: true, tilt: 1.2 },
    fontDisplay: TYPE,
    fontBody: TYPE,
    ink: "#4a4238",
    drawBack(c, e) {
      // airmail bands top & bottom
      c.save();
      for (const y of [0, e.h - 14]) {
        for (let x = -10; x < e.w; x += 34) {
          c.fillStyle = "#c94f4f";
          c.save();
          c.translate(x, y);
          c.transform(1, 0, -0.6, 1, 0, 0);
          c.fillRect(0, 0, 15, 14);
          c.fillStyle = "#3c5f8f";
          c.fillRect(17, 0, 15, 14);
          c.restore();
        }
      }
      c.restore();
    },
    drawHeader(c, e) {
      withInk(c, e, () => {
        c.fillStyle = e.ink;
        c.font = `22px ${e.fd}`;
        spacedText(c, "POST CARD", e.w / 2, 52, 8);
        c.fillStyle = "#8d8271";
        c.font = `12px ${e.fb}`;
        spacedText(c, "PAR AVION · VIA AIR MAIL", e.w / 2, 76, 3);
      });
    },
    drawPhotoExtra(c, e, s, i) {
      if (i === 0) stampCircle(c, e, s.x + s.w - 34, s.y + 30, 34, "POCKET AIRLINES", "AIR MAIL", "#b04a3f");
    },
    drawFooter(c, e) {
      const y = e.h - this.footer;
      withInk(c, e, () => {
        c.strokeStyle = "#b8ad98";
        c.setLineDash([6, 5]);
        c.beginPath();
        c.moveTo(46, y + 12);
        c.lineTo(e.w - 46, y + 12);
        c.stroke();
        c.setLineDash([]);
        c.fillStyle = e.ink;
        c.font = `16px ${e.fb}`;
        c.textAlign = "left";
        c.fillText(`FROM : ${(e.custom.location || "HOME").toUpperCase()}`, 52, y + 52);
        c.fillText("TO   : MEMORY LANE", 52, y + 82);
        const d = fmtDate(e);
        if (d) c.fillText(`DATE : ${d.toUpperCase()}`, 52, y + 112);
        c.textAlign = "center";
      });
      barcode(c, e, e.w - 190, y + 118, 140, 44, "#3a342c");
      withInk(c, e, () => {
        c.fillStyle = "#8d8271";
        c.font = `11px ${e.fb}`;
        c.fillText("BOARDING · SEAT 4B · GATE P", e.w / 2, y + 178);
      });
    },
  },

  /* 7 ── Love Letter */
  {
    id: "love",
    name: "Love Letter",
    vibe: "wax seal · soft pink · serif",
    swatch: "#d97b93",
    pad: 60,
    top: 88,
    footer: 196,
    gap: 36,
    paper: { bg: ["#fdeef2", "#fbdce6"], texture: "smooth", gloss: true },
    photo: { bw: 10, bc: "#ffffff", radius: 12, shadow: true },
    fontDisplay: SERIF,
    fontBody: SERIF,
    ink: "#a35a6e",
    drawBack(c, e) {
      // lace dotted inner border
      c.save();
      c.strokeStyle = "rgba(217,123,147,0.5)";
      c.lineWidth = 3;
      c.setLineDash([0.1, 11]);
      c.lineCap = "round";
      c.strokeRect(22, 22, e.w - 44, e.h - 44);
      c.restore();
      for (let i = 0; i < 14; i++) {
        heart(c, e.rnd() * e.w, e.rnd() * e.h, 8 + e.rnd() * 8, "#e9a8ba", 0.25 + e.rnd() * 0.3);
      }
    },
    drawHeader(c, e) {
      withInk(c, e, () => {
        c.fillStyle = e.ink;
        c.font = `italic 400 24px ${e.fd}`;
        c.fillText(e.custom.title || "to my favorite person,", e.w / 2, 52);
      });
    },
    drawFooter(c, e) {
      const y = e.h - this.footer;
      // wax seal
      const sx = e.w / 2;
      const sy = y + 52;
      c.save();
      c.shadowColor = "rgba(120,20,40,0.35)";
      c.shadowBlur = 8;
      c.shadowOffsetY = 3;
      const g = c.createRadialGradient(sx - 8, sy - 10, 4, sx, sy, 34);
      g.addColorStop(0, "#d95d68");
      g.addColorStop(0.7, "#a8323f");
      g.addColorStop(1, "#7e222d");
      c.fillStyle = g;
      c.beginPath();
      for (let a = 0; a < Math.PI * 2; a += Math.PI / 9) {
        const r = 31 + e.rnd() * 5;
        const px = sx + Math.cos(a) * r;
        const py = sy + Math.sin(a) * r;
        if (a === 0) c.moveTo(px, py);
        else c.lineTo(px, py);
      }
      c.closePath();
      c.fill();
      c.shadowColor = "transparent";
      c.strokeStyle = "rgba(255,255,255,0.25)";
      c.lineWidth = 1.5;
      c.beginPath();
      c.arc(sx, sy, 22, 0, Math.PI * 2);
      c.stroke();
      c.fillStyle = "rgba(255,235,238,0.85)";
      c.font = `700 24px ${e.fd}`;
      c.textAlign = "center";
      c.textBaseline = "middle";
      c.fillText("P", sx, sy + 1);
      c.restore();
      withInk(c, e, () => {
        c.fillStyle = e.ink;
        c.font = `italic 400 24px ${e.fd}`;
        c.fillText(e.custom.signature || "with love,", e.w / 2, y + 116);
        const d = fmtDate(e);
        if (d) {
          c.font = `400 15px ${e.fb}`;
          c.fillStyle = "#c08a99";
          c.fillText(d, e.w / 2, y + 152);
        }
      });
    },
  },

  /* 8 ── Magazine Cover */
  {
    id: "magazine",
    name: "Magazine Cover",
    vibe: "editorial · bold masthead",
    swatch: "#d43f3f",
    pad: 34,
    top: 172,
    footer: 168,
    gap: 12,
    paper: { bg: "#ffffff", texture: "smooth", gloss: true },
    photo: { bw: 0, bc: "#ffffff", radius: 0 },
    fontDisplay: SERIF,
    fontBody: SANS,
    ink: "#141414",
    drawHeader(c, e) {
      withInk(c, e, () => {
        const title = (e.custom.title || "POCKET").toUpperCase();
        let size = 88;
        c.font = `900 ${size}px ${e.fd}`;
        while (c.measureText(title).width > e.w - 70 && size > 30) {
          size -= 4;
          c.font = `900 ${size}px ${e.fd}`;
        }
        c.fillStyle = e.ink;
        c.fillText(title, e.w / 2, 74);
        c.strokeStyle = "#141414";
        c.lineWidth = 2;
        c.beginPath();
        c.moveTo(40, 128);
        c.lineTo(e.w - 40, 128);
        c.stroke();
        c.font = `600 13px ${e.fb}`;
        c.fillStyle = "#d43f3f";
        const mon = e.date.toLocaleDateString("en-US", { month: "long", year: "numeric" }).toUpperCase();
        spacedText(c, `VOL. ${e.date.getMonth() + 1} — ${mon} — ISSUE №${Math.floor(e.rnd() * 90) + 10}`, e.w / 2, 148, 2);
      });
    },
    drawFooter(c, e) {
      const y = e.h - this.footer;
      withInk(c, e, () => {
        c.fillStyle = "#d43f3f";
        c.fillRect(40, y + 22, 46, 7);
        c.fillStyle = e.ink;
        c.textAlign = "left";
        c.font = `700 30px ${e.fb}`;
        c.fillText((e.custom.subtitle || "the best day ever").toUpperCase(), 40, y + 62);
        c.font = `400 15px ${e.fb}`;
        c.fillStyle = "#6a6a6a";
        c.fillText("EXCLUSIVE — four frames, one unforgettable afternoon", 40, y + 96);
        c.textAlign = "center";
      });
      barcode(c, e, e.w - 150, y + 112, 104, 36);
      withInk(c, e, () => {
        c.fillStyle = "#141414";
        c.font = `600 12px ${e.fb}`;
        c.textAlign = "left";
        c.fillText("₩4,000", 40, y + 126);
        c.textAlign = "center";
      });
    },
  },

  /* 9 ── Polaroid Vintage */
  {
    id: "polaroid",
    name: "Polaroid Vintage",
    vibe: "instant film · aged paper",
    swatch: "#c9b68a",
    pad: 52,
    top: 60,
    footer: 108,
    gap: 40,
    paper: { bg: "#e6e1d6", texture: "fiber" },
    photo: { bw: 15, bc: "#fffdf2", radius: 2, shadow: true, tilt: 2.6, bottom: 58 },
    fontDisplay: HAND,
    fontBody: HAND,
    ink: "#6b5f52",
    drawPhotoExtra(c, e, s, i) {
      // caption strip on each polaroid bottom + aging tint
      c.save();
      c.globalAlpha = 0.1;
      c.fillStyle = "#e0b45f";
      c.beginPath();
      c.roundRect(s.x, s.y, s.w, s.h, 2);
      c.fill();
      c.restore();
      if (i === e.slots.length - 1) {
        withInk(c, e, () => {
          c.fillStyle = e.ink;
          c.font = `19px ${e.fd}`;
          c.save();
          c.translate(s.x + s.w / 2, s.y + s.h - 26);
          c.rotate((e.rnd() - 0.5) * 0.05);
          c.fillText(fmtDate(e) || e.custom.signature || "♡", 0, 0);
          c.restore();
        });
      }
    },
    drawFooter(c, e) {
      const y = e.h - this.footer;
      withInk(c, e, () => {
        c.fillStyle = "#8d8271";
        c.font = `20px ${e.fd}`;
        c.fillText(e.custom.title || "shake it like a polaroid ✦", e.w / 2, y + 46);
        if (e.custom.showLogo) logoRow(c, e, e.w / 2, y + 80, "#a89f8a", 10);
      });
    },
    drawOver(c, e) {
      grainRegion(c, 0, 0, e.w, e.h, 0.035);
      dustSpecks(c, e, 24, "rgba(120,100,70,0.35)");
    },
  },

  /* 10 ── Cloud Dream */
  {
    id: "cloud",
    name: "Cloud Dream",
    vibe: "pastel sky · floating · dreamy",
    swatch: "#9db8e8",
    pad: 54,
    top: 96,
    footer: 152,
    gap: 42,
    paper: { bg: ["#cfd8fb", "#fbd8ea"], texture: "smooth" },
    photo: { bw: 9, bc: "#ffffff", radius: 24, shadow: true },
    fontDisplay: SANS,
    fontBody: SANS,
    ink: "#ffffff",
    drawBack(c, e) {
      c.save();
      for (let i = 0; i < 9; i++) {
        const x = e.rnd() * e.w;
        const y = e.rnd() * e.h;
        const r = 26 + e.rnd() * 42;
        c.filter = "blur(10px)";
        c.fillStyle = `rgba(255,255,255,${0.25 + e.rnd() * 0.3})`;
        c.beginPath();
        c.ellipse(x, y, r * 1.6, r, 0, 0, Math.PI * 2);
        c.fill();
      }
      c.filter = "none";
      c.fillStyle = "rgba(255,255,255,0.85)";
      c.font = "13px serif";
      for (let i = 0; i < 12; i++) {
        c.globalAlpha = 0.4 + e.rnd() * 0.6;
        c.fillText("✦", e.rnd() * e.w, e.rnd() * e.h);
      }
      c.restore();
    },
    drawHeader(c, e) {
      withInk(c, e, () => {
        c.save();
        c.shadowColor = "rgba(140,150,220,0.6)";
        c.shadowBlur = 12;
        c.fillStyle = "#ffffff";
        c.font = `700 26px ${e.fd}`;
        c.fillText(e.custom.title || "head in the clouds", e.w / 2, 54);
        c.restore();
      });
    },
    drawFooter(c, e) {
      const y = e.h - this.footer;
      withInk(c, e, () => {
        c.save();
        c.shadowColor = "rgba(140,150,220,0.6)";
        c.shadowBlur = 10;
        c.fillStyle = "#ffffff";
        const d = fmtDate(e);
        c.font = `600 20px ${e.fd}`;
        if (d) c.fillText(`☁ ${d} ☁`, e.w / 2, y + 56);
        if (e.custom.showLogo) {
          c.font = `500 13px ${e.fb}`;
          spacedText(c, "POCKET PHOTO BOOTH", e.w / 2, y + 96, 3);
        }
        c.restore();
      });
    },
  },

  /* 11 ── Dark Edition */
  {
    id: "dark",
    name: "Dark Edition",
    vibe: "matte black · gold foil",
    swatch: "#d9c07a",
    pad: 56,
    top: 92,
    footer: 164,
    gap: 44,
    paper: { bg: "#141414", texture: "smooth", gloss: true },
    photo: { bw: 1, bc: "#141414", radius: 6, hairline: "rgba(217,192,122,0.45)" },
    fontDisplay: SERIF,
    fontBody: SANS,
    ink: "#d9c07a",
    drawHeader(c, e) {
      withInk(c, e, () => {
        c.strokeStyle = "rgba(217,192,122,0.6)";
        c.lineWidth = 1;
        c.beginPath();
        c.moveTo(e.w / 2 - 34, 48);
        c.lineTo(e.w / 2 + 34, 48);
        c.stroke();
        c.textAlign = "center";
        c.textBaseline = "middle";
        foilText(c, "P O C K E T", e.w / 2, 74, `600 19px ${e.fd}`);
      });
    },
    drawFooter(c, e) {
      const y = e.h - this.footer;
      c.save();
      c.textAlign = "center";
      c.textBaseline = "middle";
      foilText(c, (e.custom.title || "STUDIO EDITION").toUpperCase(), e.w / 2, y + 52, `600 22px ${e.fd}`, 4);
      c.restore();
      withInk(c, e, () => {
        const d = fmtDate(e);
        c.fillStyle = "#8f8a7c";
        c.font = `400 13px ${e.fb}`;
        if (d) spacedText(c, d.toUpperCase(), e.w / 2, y + 92, 3);
        if (e.custom.showLogo) {
          c.fillStyle = "#5f5b50";
          c.font = `500 10px ${e.fb}`;
          spacedText(c, "POCKET PHOTO BOOTH · FINE PRINTS", e.w / 2, y + 124, 2);
        }
      });
    },
  },

  /* 12 ── Seasonal (auto) */
  {
    id: "seasonal",
    name: `Seasonal · ${currentSeason().name}`,
    vibe: "changes with the calendar",
    swatch: "#f2a541",
    pad: 56,
    top: 92,
    footer: 156,
    gap: 36,
    paper: { bg: currentSeason().bg, texture: "smooth" },
    photo: { bw: 9, bc: currentSeason().photoBc, radius: 14, shadow: true },
    fontDisplay: SANS,
    fontBody: SANS,
    ink: currentSeason().ink,
    drawBack(c, e) {
      const v = currentSeason(e.date);
      c.save();
      c.textAlign = "center";
      c.textBaseline = "middle";
      for (let i = 0; i < 16; i++) {
        const x = e.rnd() * e.w;
        const y = e.rnd() * e.h;
        c.save();
        c.translate(x, y);
        c.rotate((e.rnd() - 0.5) * 0.9);
        c.globalAlpha = 0.35 + e.rnd() * 0.45;
        c.font = `${14 + e.rnd() * 16}px serif`;
        c.fillText(v.deco[Math.floor(e.rnd() * v.deco.length)], 0, 0);
        c.restore();
      }
      c.restore();
    },
    drawHeader(c, e) {
      const v = currentSeason(e.date);
      withInk(c, e, () => {
        c.fillStyle = v.ink;
        c.font = `700 24px ${e.fd}`;
        c.fillText(e.custom.title || v.greeting, e.w / 2, 52);
      });
    },
    drawFooter(c, e) {
      const v = currentSeason(e.date);
      const y = e.h - this.footer;
      withInk(c, e, () => {
        c.fillStyle = v.ink;
        const d = fmtDate(e);
        c.font = `600 19px ${e.fd}`;
        if (d) c.fillText(d, e.w / 2, y + 54);
        if (e.custom.showLogo) {
          c.globalAlpha *= 0.75;
          c.font = `500 12px ${e.fb}`;
          spacedText(c, "POCKET PHOTO BOOTH", e.w / 2, y + 92, 3);
        }
      });
    },
  },
];

export const collectionById = (id: string) => COLLECTIONS.find((c) => c.id === id) ?? COLLECTIONS[0];

/* ── layout & render ─────────────────────────────────────── */

export function stripLayout(col: Collection, count: PhotoCount, custom: FrameCustom) {
  const bw = col.photo.bw * custom.borderScale;
  const bottom = (col.photo.bottom ?? col.photo.bw) * custom.borderScale;
  const cardW = STRIP_W - col.pad * 2;
  const imgW = cardW - bw * 2;
  const imgH = Math.round((imgW * 3) / 4);
  const cardH = imgH + bw + bottom;
  const slots: Slot[] = Array.from({ length: count }, (_, i) => ({
    x: col.pad,
    y: col.top + i * (cardH + col.gap),
    w: cardW,
    h: cardH,
  }));
  const height = col.top + count * cardH + (count - 1) * col.gap + col.footer;
  return { width: STRIP_W, height, slots, bw, bottom, imgH };
}

export async function renderStrip(opts: {
  photos: string[];
  frameId: string;
  filterId: string;
  custom?: Partial<FrameCustom>;
  date?: Date;
  seed?: number;
  scale?: number;
}): Promise<HTMLCanvasElement> {
  const col = collectionById(opts.frameId);
  const custom: FrameCustom = { ...DEFAULT_CUSTOM, ...opts.custom };
  const filter = filterById(opts.filterId);
  const count = opts.photos.length as PhotoCount;
  const scale = opts.scale ?? 1;
  const { width, height, slots, bw, bottom } = stripLayout(col, count, custom);

  const canvas = document.createElement("canvas");
  canvas.width = Math.round(width * scale);
  canvas.height = Math.round(height * scale);
  const c = canvas.getContext("2d")!;
  c.scale(scale, scale);
  c.imageSmoothingQuality = "high";

  const rnd = mulberry32(opts.seed ?? 42);
  const e: Env = {
    w: width,
    h: height,
    slots,
    rnd,
    custom,
    date: opts.date ?? new Date(),
    fd: resolveFontFamily(col.fontDisplay),
    fb: resolveFontFamily(col.fontBody),
    ink: col.ink,
  };

  // paper
  const bg = custom.paperColor ?? col.paper.bg;
  if (Array.isArray(bg)) {
    const g = c.createLinearGradient(0, 0, 0, height);
    g.addColorStop(0, bg[0]);
    g.addColorStop(1, bg[1]);
    c.fillStyle = g;
  } else {
    c.fillStyle = bg;
  }
  c.fillRect(0, 0, width, height);
  paperTexture(c, e, col.paper.texture);
  col.drawBack?.(c, e);

  // photos
  const images = await Promise.all(opts.photos.map(loadImage));
  const radius = col.photo.radius * custom.radiusScale;
  images.forEach((img, i) => {
    const s = slots[i];
    c.save();
    const tilt = col.photo.tilt ? ((rnd() - 0.5) * 2 * col.photo.tilt * Math.PI) / 180 : 0;
    if (tilt) {
      c.translate(s.x + s.w / 2, s.y + s.h / 2);
      c.rotate(tilt);
      c.translate(-(s.x + s.w / 2), -(s.y + s.h / 2));
    }
    if (col.photo.shadow) {
      c.shadowColor = "rgba(30,20,20,0.28)";
      c.shadowBlur = 14;
      c.shadowOffsetY = 6;
    }
    if (bw > 0 || col.photo.bottom) {
      c.fillStyle = custom.frameColor ?? col.photo.bc;
      c.beginPath();
      c.roundRect(s.x, s.y, s.w, s.h, Math.max(2, radius * 0.4));
      c.fill();
    }
    c.shadowColor = "transparent";
    const ix = s.x + bw;
    const iy = s.y + bw;
    const iw = s.w - bw * 2;
    const ih = s.h - bw - bottom;
    c.beginPath();
    c.roundRect(ix, iy, iw, ih, bw > 0 ? Math.max(0, radius - 4) : radius);
    c.save();
    c.clip();
    if (filter.css !== "none") c.filter = filter.css;
    drawCover(c, img, ix, iy, iw, ih);
    c.filter = "none";
    if (filter.grain) grainRegion(c, ix, iy, iw, ih, filter.grain);
    if (filter.dust) {
      c.save();
      c.beginPath();
      c.rect(ix, iy, iw, ih);
      c.clip();
      for (let d = 0; d < 22; d++) {
        c.globalAlpha = 0.15 + rnd() * 0.25;
        c.fillStyle = "#fffbe8";
        c.beginPath();
        c.arc(ix + rnd() * iw, iy + rnd() * ih, 0.5 + rnd() * 1.6, 0, Math.PI * 2);
        c.fill();
      }
      c.restore();
    }
    if (filter.lightLeak) lightLeakRegion(c, ix, iy, iw, ih);
    c.restore();
    if (col.photo.hairline) {
      c.strokeStyle = col.photo.hairline;
      c.lineWidth = 1.2;
      c.beginPath();
      c.roundRect(ix - 0.5, iy - 0.5, iw + 1, ih + 1, radius);
      c.stroke();
    }
    col.drawPhotoExtra?.(c, e, s, i);
    c.restore();
  });

  c.textAlign = "center";
  c.textBaseline = "middle";
  col.drawHeader?.(c, e);
  col.drawFooter(c, e);
  col.drawOver?.(c, e);

  // physicality: edge light, edge shade, vignette, gloss coat
  c.save();
  c.fillStyle = "rgba(255,255,255,0.4)";
  c.fillRect(0, 0, width, 1.5);
  c.fillStyle = "rgba(0,0,0,0.14)";
  c.fillRect(0, height - 1.5, width, 1.5);
  const vg = c.createRadialGradient(width / 2, height / 2, Math.min(width, height) / 2, width / 2, height / 2, Math.max(width, height) * 0.72);
  vg.addColorStop(0, "rgba(0,0,0,0)");
  vg.addColorStop(1, "rgba(0,0,0,0.07)");
  c.fillStyle = vg;
  c.fillRect(0, 0, width, height);
  if (col.paper.gloss) {
    const gg = c.createLinearGradient(0, 0, width, height * 0.7);
    gg.addColorStop(0, "rgba(255,255,255,0)");
    gg.addColorStop(0.48, "rgba(255,255,255,0)");
    gg.addColorStop(0.55, "rgba(255,255,255,0.05)");
    gg.addColorStop(0.62, "rgba(255,255,255,0)");
    gg.addColorStop(1, "rgba(255,255,255,0)");
    c.fillStyle = gg;
    c.fillRect(0, 0, width, height);
  }
  c.restore();

  return canvas;
}

/* ── UI previews ─────────────────────────────────────────── */

let placeholderPhotos: string[] | null = null;
function getPlaceholders(): string[] {
  if (placeholderPhotos) return placeholderPhotos;
  const make = (hues: [string, string], emoji: string) => {
    const cv = document.createElement("canvas");
    cv.width = 400;
    cv.height = 300;
    const c = cv.getContext("2d")!;
    const g = c.createLinearGradient(0, 0, 400, 300);
    g.addColorStop(0, hues[0]);
    g.addColorStop(1, hues[1]);
    c.fillStyle = g;
    c.fillRect(0, 0, 400, 300);
    c.fillStyle = "rgba(255,255,255,0.35)";
    c.beginPath();
    c.arc(290, 80, 70, 0, Math.PI * 2);
    c.fill();
    c.font = "90px serif";
    c.textAlign = "center";
    c.textBaseline = "middle";
    c.fillText(emoji, 200, 160);
    return cv.toDataURL("image/jpeg", 0.85);
  };
  placeholderPhotos = [make(["#f5c1cf", "#c9d8f2"], "🙂"), make(["#f8e3c0", "#e8c4dd"], "✌️")];
  return placeholderPhotos;
}

const previewCache = new Map<string, string>();

export async function renderPreview(frameId: string, custom?: Partial<FrameCustom>): Promise<string> {
  const key = frameId + JSON.stringify(custom ?? {});
  const hit = previewCache.get(key);
  if (hit) return hit;
  await document.fonts.ready;
  const canvas = await renderStrip({
    photos: getPlaceholders(),
    frameId,
    filterId: "none",
    custom,
    seed: 7,
    scale: 0.55,
  });
  const url = canvas.toDataURL("image/jpeg", 0.85);
  previewCache.set(key, url);
  return url;
}
