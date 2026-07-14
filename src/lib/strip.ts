import { renderStrip, resolveFontFamily, type FrameCustom } from "./collections";

export { resolveFontFamily };

/** Everything the renderer needs to reproduce a strip (display or hi-res). */
export type StripRecipe = {
  photos: string[];
  frameId: string;
  filterId: string;
  custom: Partial<FrameCustom>;
  seed: number;
};

export type StickerItem = { id: string; emoji: string; x: number; y: number; scale: number; rotation: number };
export type TextItem = { id: string; text: string; fontCss: string; color: string; x: number; y: number; scale: number; rotation: number };
export type Stroke = { tool: "pen" | "marker" | "highlighter"; color: string; size: number; points: { x: number; y: number }[] };

export function drawStrokes(ctx: CanvasRenderingContext2D, strokes: Stroke[]) {
  for (const st of strokes) {
    if (st.points.length < 2) continue;
    ctx.save();
    ctx.lineJoin = "round";
    ctx.lineCap = st.tool === "highlighter" ? "butt" : "round";
    ctx.strokeStyle = st.color;
    ctx.lineWidth = st.size;
    ctx.globalAlpha = st.tool === "highlighter" ? 0.35 : st.tool === "marker" ? 0.85 : 1;
    ctx.beginPath();
    ctx.moveTo(st.points[0].x, st.points[0].y);
    for (const p of st.points.slice(1)) ctx.lineTo(p.x, p.y);
    ctx.stroke();
    ctx.restore();
  }
}

/**
 * Re-render the strip at `scale` resolution and bake the overlays on top.
 * Textures, shadows and type are re-drawn (not upscaled), so exports stay crisp.
 */
export async function composeFinal(
  recipe: StripRecipe,
  overlays: { strokes: Stroke[]; stickers: StickerItem[]; texts: TextItem[] },
  scale = 3
): Promise<HTMLCanvasElement> {
  const out = await renderStrip({ ...recipe, scale });
  const ctx = out.getContext("2d")!;
  // renderStrip leaves the context scaled to layout space
  drawStrokes(ctx, overlays.strokes);
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  for (const s of overlays.stickers) {
    ctx.save();
    ctx.translate(s.x, s.y);
    ctx.rotate((s.rotation * Math.PI) / 180);
    ctx.font = `${Math.round(56 * s.scale)}px serif`;
    ctx.fillText(s.emoji, 0, 0);
    ctx.restore();
  }
  for (const t of overlays.texts) {
    ctx.save();
    ctx.translate(t.x, t.y);
    ctx.rotate((t.rotation * Math.PI) / 180);
    ctx.fillStyle = t.color;
    ctx.font = `600 ${Math.round(30 * t.scale)}px ${resolveFontFamily(t.fontCss)}`;
    ctx.fillText(t.text, 0, 0);
    ctx.restore();
  }
  return out;
}

export function canvasToBlob(canvas: HTMLCanvasElement, type: "image/png" | "image/jpeg"): Promise<Blob> {
  return new Promise((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("export failed"))), type, 0.95)
  );
}
