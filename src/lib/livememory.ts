/* Live Memory — turn the booth's background recording into one short looping GIF:
   the printed strip with each shot's live moment playing inside its photo window.
   Frames are pulled from the recorded clip by seeking a <video>, given a light
   film treatment once, then shared by the GIF and the in-app strip player. */

import { applyPalette, GIFEncoder, quantize } from "gifenc";
import { filterById, type PhotoCount } from "./booth";
import {
  collectionById, DEFAULT_CUSTOM, photoRadius, renderStrip, STRIP_W, stripLayout, type FrameCustom,
} from "./collections";
import type { StripRecipe } from "./strip";

/** What the booth hands over: the raw recording + when each shutter fired. */
export type LiveCapture = {
  blob: Blob;
  mime: string;
  /** ms offsets from recording start, one per photo */
  times: number[];
  mirrored: boolean;
};

export type LiveMemory = {
  /** per photo: ~2s of treated frames centred on the shutter moment */
  photoFrames: HTMLCanvasElement[][];
  fps: number;
};

export const LIVE_FPS = 8;
const FRAME_W = 280;

const pickMime = () =>
  ["video/webm;codecs=vp9", "video/webm", "video/mp4"].find(
    (m) => typeof MediaRecorder !== "undefined" && MediaRecorder.isTypeSupported(m)
  );

export const recordingMime = pickMime;

/* ── video loading (MediaRecorder blobs report Infinity duration) ── */

const once = (v: HTMLVideoElement, ev: string) =>
  new Promise<void>((res, rej) => {
    const t = setTimeout(() => res(), 3000); // seek events can be flaky — don't hang forever
    v.addEventListener(ev, () => (clearTimeout(t), res()), { once: true });
    v.addEventListener("error", () => (clearTimeout(t), rej(new Error("video error"))), { once: true });
  });

async function loadVideo(blob: Blob): Promise<HTMLVideoElement> {
  const v = document.createElement("video");
  v.muted = true;
  v.playsInline = true;
  v.preload = "auto";
  v.src = URL.createObjectURL(blob);
  await once(v, "loadedmetadata");
  if (!Number.isFinite(v.duration)) {
    v.currentTime = 1e7;
    await once(v, "seeked");
    v.currentTime = 0;
    await once(v, "seeked");
  }
  return v;
}

/* ── film treatment: grain, vignette, soft leak, dust ── */

let noise: HTMLCanvasElement | null = null;
function grainTile(): HTMLCanvasElement {
  if (noise) return noise;
  noise = document.createElement("canvas");
  noise.width = noise.height = 128;
  const ctx = noise.getContext("2d")!;
  const img = ctx.createImageData(128, 128);
  for (let i = 0; i < img.data.length; i += 4) {
    const v = 128 + (Math.random() - 0.5) * 255;
    img.data[i] = img.data[i + 1] = img.data[i + 2] = v;
    img.data[i + 3] = 22;
  }
  ctx.putImageData(img, 0, 0);
  return noise;
}

function filmLook(c: CanvasRenderingContext2D, w: number, h: number) {
  // grain: random tile offset per frame so it shimmers like film
  const g = grainTile();
  c.save();
  c.globalCompositeOperation = "overlay";
  c.translate(-Math.random() * 128, -Math.random() * 128);
  for (let x = 0; x < w + 128; x += 128) for (let y = 0; y < h + 128; y += 128) c.drawImage(g, x, y);
  c.restore();
  // soft warm light leak, drifting slightly
  const lx = w * (0.85 + Math.random() * 0.05);
  const leak = c.createRadialGradient(lx, 0, 0, lx, 0, w * 0.7);
  leak.addColorStop(0, "rgba(255,150,110,0.10)");
  leak.addColorStop(1, "rgba(255,150,110,0)");
  c.fillStyle = leak;
  c.fillRect(0, 0, w, h);
  // dust
  c.fillStyle = "rgba(255,251,232,0.5)";
  for (let d = 0; d < 3; d++) {
    if (Math.random() < 0.4) continue;
    c.beginPath();
    c.arc(Math.random() * w, Math.random() * h, 0.4 + Math.random(), 0, Math.PI * 2);
    c.fill();
  }
  // gentle vignette
  const vg = c.createRadialGradient(w / 2, h / 2, h * 0.45, w / 2, h / 2, h * 0.95);
  vg.addColorStop(0, "rgba(0,0,0,0)");
  vg.addColorStop(1, "rgba(20,10,15,0.28)");
  c.fillStyle = vg;
  c.fillRect(0, 0, w, h);
}

/* ── frame extraction ── */

async function grabFrames(
  v: HTMLVideoElement,
  timesSec: number[],
  mirrored: boolean,
  onFrame?: () => void
): Promise<HTMLCanvasElement[]> {
  const w = FRAME_W;
  const h = Math.round((v.videoHeight / v.videoWidth) * FRAME_W) || Math.round(FRAME_W * 0.75);
  const out: HTMLCanvasElement[] = [];
  const max = Math.max(0.05, v.duration - 0.05);
  for (const t of timesSec) {
    v.currentTime = Math.min(Math.max(t, 0.05), max);
    await once(v, "seeked");
    const c = document.createElement("canvas");
    c.width = w;
    c.height = h;
    const ctx = c.getContext("2d")!;
    if (mirrored) {
      ctx.translate(w, 0);
      ctx.scale(-1, 1);
    }
    ctx.drawImage(v, 0, 0, w, h);
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    filmLook(ctx, w, h);
    out.push(c);
    onFrame?.();
  }
  return out;
}

const range = (from: number, to: number, step: number) => {
  const r: number[] = [];
  for (let t = from; t <= to; t += step) r.push(t);
  return r;
};

/** Extract each photo's live moment. Slow (one seek per frame) — run in the background. */
export async function processLive(cap: LiveCapture, onProgress?: (done: number, total: number) => void): Promise<LiveMemory> {
  const v = await loadVideo(cap.blob);
  const step = 1 / LIVE_FPS;

  const perPhoto = cap.times.map((t) => range(t / 1000 - 1, t / 1000 + 1, step));
  const total = perPhoto.reduce((n, a) => n + a.length, 0);
  let done = 0;
  const tick = () => onProgress?.(++done, total);

  const photoFrames: HTMLCanvasElement[][] = [];
  for (const times of perPhoto) {
    const frames = await grabFrames(v, times, cap.mirrored, tick);
    // fake the shutter flash on the centre frames (the real flash is a DOM overlay)
    const mid = frames.length >> 1;
    [mid, mid + 1].forEach((i, k) => {
      const f = frames[i];
      if (!f) return;
      const ctx = f.getContext("2d")!;
      ctx.fillStyle = `rgba(255,255,255,${k === 0 ? 0.55 : 0.22})`;
      ctx.fillRect(0, 0, f.width, f.height);
    });
    photoFrames.push(frames);
  }
  URL.revokeObjectURL(v.src);
  return { photoFrames, fps: LIVE_FPS };
}

/* ── GIF encoding ── */

/** Encode frames as an infinitely looping GIF, crossfading the tail into the head so the loop is seamless.
    Async so the UI keeps breathing — quantization is the hot part. */
export async function encodeGif(frames: HTMLCanvasElement[], fps: number): Promise<Blob> {
  const blend = Math.min(3, frames.length >> 2);
  const gif = GIFEncoder();
  const delay = Math.round(1000 / fps);
  for (let i = 0; i < frames.length; i++) {
    const f = frames[i];
    let src = f;
    const k = i - (frames.length - blend);
    if (k >= 0) {
      // blend loop seam: draw the matching head frame on top with rising alpha
      src = document.createElement("canvas");
      src.width = f.width;
      src.height = f.height;
      const ctx = src.getContext("2d")!;
      ctx.drawImage(f, 0, 0);
      ctx.globalAlpha = (k + 1) / (blend + 1);
      ctx.drawImage(frames[k], 0, 0);
    }
    const { data, width, height } = src.getContext("2d")!.getImageData(0, 0, src.width, src.height);
    const palette = quantize(data, 256);
    gif.writeFrame(applyPalette(data, palette), width, height, { palette, delay, repeat: 0 });
    if (i % 4 === 3) await new Promise((r) => setTimeout(r, 0));
  }
  gif.finish();
  return new Blob([gif.bytes()], { type: "image/gif" });
}

/** The live memory GIF: the whole printed strip, with every shot's live moment
    playing inside its own photo window — like the strip come to life. ~2s loop. */
export async function stripGif(recipe: StripRecipe, mem: LiveMemory): Promise<Blob> {
  const scale = 220 / STRIP_W;
  const base = await renderStrip({ ...recipe, scale });
  const col = collectionById(recipe.frameId);
  const custom: FrameCustom = { ...DEFAULT_CUSTOM, ...recipe.custom };
  const { slots, bw, bottom } = stripLayout(col, recipe.photos.length as PhotoCount, custom);
  const radius = photoRadius(col, custom);
  const filter = filterById(recipe.filterId);
  const n = Math.min(...mem.photoFrames.map((fs) => fs.length));
  const frames: HTMLCanvasElement[] = [];
  for (let k = 0; k < n; k++) {
    const c = document.createElement("canvas");
    c.width = base.width;
    c.height = base.height;
    const ctx = c.getContext("2d")!;
    ctx.drawImage(base, 0, 0);
    ctx.scale(scale, scale); // slot coords live in layout space
    slots.forEach((s, i) => {
      const f = mem.photoFrames[i][k];
      const ix = s.x + bw;
      const iy = s.y + bw;
      const iw = s.w - bw * 2;
      const ih = s.h - bw - bottom;
      ctx.save();
      ctx.beginPath();
      ctx.roundRect(ix, iy, iw, ih, bw > 0 ? Math.max(0, radius - 4) : radius);
      ctx.clip();
      if (filter.css !== "none") ctx.filter = filter.css;
      const sc = Math.max(iw / f.width, ih / f.height);
      ctx.drawImage(f, ix + (iw - f.width * sc) / 2, iy + (ih - f.height * sc) / 2, f.width * sc, f.height * sc);
      ctx.restore();
    });
    frames.push(c);
  }
  return encodeGif(frames, mem.fps);
}

export const blobToDataUrl = (blob: Blob) =>
  new Promise<string>((res, rej) => {
    const r = new FileReader();
    r.onload = () => res(r.result as string);
    r.onerror = () => rej(r.error);
    r.readAsDataURL(blob);
  });

export function downloadBlob(blob: Blob, name: string) {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = name;
  a.click();
  URL.revokeObjectURL(a.href);
}
