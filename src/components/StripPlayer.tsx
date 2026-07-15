"use client";

import { useEffect, useRef } from "react";
import { filterById, type PhotoCount } from "@/lib/booth";
import { collectionById, DEFAULT_CUSTOM, photoRadius, stripLayout, type FrameCustom } from "@/lib/collections";
import type { LiveMemory } from "@/lib/livememory";
import type { StripRecipe } from "@/lib/strip";

/**
 * Animates the photo windows of a printed strip in place: an overlay canvas
 * draws each photo's live frames into its slot with crossfades and a tiny
 * handheld drift. The strip itself (paper, frames, type) stays put underneath.
 * ponytail: slots are drawn untilted, so collections with tilted photos animate
 * inside the straight slot rect; reproduce the seeded tilt if that ever grates.
 */
export function StripPlayer({ recipe, memory, playing }: { recipe: StripRecipe; memory: LiveMemory; playing: boolean }) {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas || !playing) return;
    const col = collectionById(recipe.frameId);
    const custom: FrameCustom = { ...DEFAULT_CUSTOM, ...recipe.custom };
    const { width, height, slots, bw, bottom } = stripLayout(col, recipe.photos.length as PhotoCount, custom);
    canvas.width = width;
    canvas.height = height;
    const radius = photoRadius(col, custom);
    const filter = filterById(recipe.filterId);
    const c = canvas.getContext("2d")!;
    let raf = 0;
    const start = performance.now();

    const draw = (now: number) => {
      const t = (now - start) / 1000;
      c.clearRect(0, 0, width, height);
      slots.forEach((s, i) => {
        const fs = memory.photoFrames[i];
        if (!fs?.length) return;
        // rAF's first timestamp can precede the performance.now() captured above → keep pos non-negative
        const pos = (((t * memory.fps) % fs.length) + fs.length) % fs.length;
        const i0 = Math.floor(pos);
        const ix = s.x + bw;
        const iy = s.y + bw;
        const iw = s.w - bw * 2;
        const ih = s.h - bw - bottom;
        c.save();
        c.beginPath();
        c.roundRect(ix, iy, iw, ih, bw > 0 ? Math.max(0, radius - 4) : radius);
        c.clip();
        if (filter.css !== "none") c.filter = filter.css;
        const dx = Math.sin(t * 1.3 + i * 2) * 2;
        const dy = Math.cos(t * 0.9 + i) * 2;
        const drawFrame = (f: HTMLCanvasElement, alpha: number) => {
          c.globalAlpha = alpha;
          const sc = Math.max(iw / f.width, ih / f.height) * 1.05; // cover + room for drift
          const dw = f.width * sc;
          const dh = f.height * sc;
          c.drawImage(f, ix + (iw - dw) / 2 + dx, iy + (ih - dh) / 2 + dy, dw, dh);
        };
        drawFrame(fs[i0], 1);
        drawFrame(fs[(i0 + 1) % fs.length], pos - i0); // crossfade → smooth motion, seamless loop
        c.restore();
      });
      raf = requestAnimationFrame(draw);
    };
    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, [playing, memory, recipe]);

  return playing ? <canvas ref={ref} aria-hidden className="pointer-events-none absolute inset-0 h-full w-full" /> : null;
}
