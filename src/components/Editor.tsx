"use client";

import { AnimatePresence, motion } from "framer-motion";
import {
  Check, Copy, Download, Highlighter, Link2, Pen, PenLine, Redo2, Share2, Smile, Trash2, Type, Undo2,
} from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { CAPTION_FONTS, STICKERS } from "@/lib/booth";
import {
  canvasToBlob, composeFinal, drawStrokes,
  type StickerItem, type StripRecipe, type Stroke, type TextItem,
} from "@/lib/strip";
import { sfx } from "@/lib/sound";

const PALETTE = ["#e05a7a", "#f6a86b", "#f2d16b", "#7ec98f", "#7fa8d0", "#9b8ccf", "#4b4145", "#ffffff"];
const TOOLS = [
  { id: "pen" as const, name: "Pen", size: 4, icon: Pen },
  { id: "marker" as const, name: "Marker", size: 11, icon: PenLine },
  { id: "highlighter" as const, name: "Highlighter", size: 20, icon: Highlighter },
];

type Tab = "stickers" | "draw" | "text";
type Selection = { type: "sticker" | "text"; id: string } | null;
type DragState = {
  mode: "move" | "transform";
  type: "sticker" | "text";
  id: string;
  startX: number;
  startY: number;
  orig: { x: number; y: number; scale: number; rotation: number };
  startAngle: number;
  startDist: number;
};

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

export function Editor({
  base,
  recipe,
  onFinish,
}: {
  base: HTMLCanvasElement;
  recipe: StripRecipe;
  onFinish: (finalUrl: string) => void;
}) {
  const [tab, setTab] = useState<Tab>("stickers");
  const [stickers, setStickers] = useState<StickerItem[]>([]);
  const [texts, setTexts] = useState<TextItem[]>([]);
  const [strokes, setStrokes] = useState<Stroke[]>([]);
  const [redoStack, setRedoStack] = useState<Stroke[]>([]);
  const [selected, setSelected] = useState<Selection>(null);
  const [tool, setTool] = useState<(typeof TOOLS)[number]>(TOOLS[0]);
  const [color, setColor] = useState(PALETTE[0]);
  const [textInput, setTextInput] = useState("");
  const [fontId, setFontId] = useState(CAPTION_FONTS[0].id);
  const [note, setNote] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [baseUrl] = useState(() => base.toDataURL("image/jpeg", 0.92));

  const wrapRef = useRef<HTMLDivElement>(null);
  const drawRef = useRef<HTMLCanvasElement>(null);
  const dragRef = useRef<DragState | null>(null);
  const strokeRef = useRef<Stroke | null>(null);

  const toast = (msg: string) => {
    setNote(msg);
    setTimeout(() => setNote(null), 2200);
  };

  const getScale = () => (wrapRef.current?.getBoundingClientRect().width ?? base.width) / base.width;

  /* ── stickers & text: move / transform ─────────────────── */

  const getItem = (sel: NonNullable<Selection>) =>
    sel.type === "sticker" ? stickers.find((s) => s.id === sel.id) : texts.find((t) => t.id === sel.id);

  const updateItem = useCallback(
    (type: "sticker" | "text", id: string, patch: Partial<StickerItem & TextItem>) => {
      if (type === "sticker") setStickers((a) => a.map((s) => (s.id === id ? { ...s, ...patch } : s)));
      else setTexts((a) => a.map((t) => (t.id === id ? { ...t, ...patch } : t)));
    },
    []
  );

  const startMove = (e: React.PointerEvent, type: "sticker" | "text", id: string) => {
    e.stopPropagation();
    const item = type === "sticker" ? stickers.find((s) => s.id === id) : texts.find((t) => t.id === id);
    if (!item) return;
    setSelected({ type, id });
    dragRef.current = {
      mode: "move", type, id,
      startX: e.clientX, startY: e.clientY,
      orig: { x: item.x, y: item.y, scale: item.scale, rotation: item.rotation },
      startAngle: 0, startDist: 1,
    };
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  };

  const startTransform = (e: React.PointerEvent, type: "sticker" | "text", id: string) => {
    e.stopPropagation();
    const item = type === "sticker" ? stickers.find((s) => s.id === id) : texts.find((t) => t.id === id);
    const rect = wrapRef.current?.getBoundingClientRect();
    if (!item || !rect) return;
    const s = getScale();
    const cx = rect.left + item.x * s;
    const cy = rect.top + item.y * s;
    dragRef.current = {
      mode: "transform", type, id,
      startX: cx, startY: cy,
      orig: { x: item.x, y: item.y, scale: item.scale, rotation: item.rotation },
      startAngle: Math.atan2(e.clientY - cy, e.clientX - cx),
      startDist: Math.max(10, Math.hypot(e.clientX - cx, e.clientY - cy)),
    };
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  };

  const onItemPointerMove = (e: React.PointerEvent) => {
    const d = dragRef.current;
    if (!d) return;
    const s = getScale();
    if (d.mode === "move") {
      updateItem(d.type, d.id, {
        x: d.orig.x + (e.clientX - d.startX) / s,
        y: d.orig.y + (e.clientY - d.startY) / s,
      });
    } else {
      const ang = Math.atan2(e.clientY - d.startY, e.clientX - d.startX);
      const dist = Math.hypot(e.clientX - d.startX, e.clientY - d.startY);
      updateItem(d.type, d.id, {
        scale: clamp((d.orig.scale * dist) / d.startDist, 0.35, 5),
        rotation: d.orig.rotation + ((ang - d.startAngle) * 180) / Math.PI,
      });
    }
  };

  const endItemDrag = () => (dragRef.current = null);

  const deleteSelected = () => {
    if (!selected) return;
    sfx.click();
    if (selected.type === "sticker") setStickers((a) => a.filter((s) => s.id !== selected.id));
    else setTexts((a) => a.filter((t) => t.id !== selected.id));
    setSelected(null);
  };

  const addSticker = (emoji: string) => {
    sfx.pop();
    const item: StickerItem = {
      id: crypto.randomUUID(),
      emoji,
      x: base.width / 2 + (Math.random() - 0.5) * 80,
      y: base.height / 2 + (Math.random() - 0.5) * 120,
      scale: 1,
      rotation: (Math.random() - 0.5) * 24,
    };
    setStickers((a) => [...a, item]);
    setSelected({ type: "sticker", id: item.id });
  };

  const addText = () => {
    if (!textInput.trim()) return;
    sfx.pop();
    const item: TextItem = {
      id: crypto.randomUUID(),
      text: textInput.trim(),
      fontCss: CAPTION_FONTS.find((f) => f.id === fontId)!.css,
      color,
      x: base.width / 2,
      y: base.height - 170,
      scale: 1,
      rotation: 0,
    };
    setTexts((a) => [...a, item]);
    setSelected({ type: "text", id: item.id });
    setTextInput("");
  };

  /* ── drawing ────────────────────────────────────────────── */

  useEffect(() => {
    const c = drawRef.current;
    if (!c) return;
    const ctx = c.getContext("2d")!;
    ctx.clearRect(0, 0, c.width, c.height);
    drawStrokes(ctx, strokes);
  }, [strokes]);

  const canvasPoint = (e: React.PointerEvent) => {
    const rect = drawRef.current!.getBoundingClientRect();
    const s = base.width / rect.width;
    return { x: (e.clientX - rect.left) * s, y: (e.clientY - rect.top) * s };
  };

  const onDrawDown = (e: React.PointerEvent) => {
    if (tab !== "draw") return;
    strokeRef.current = { tool: tool.id, color, size: tool.size, points: [canvasPoint(e)] };
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  };

  const onDrawMove = (e: React.PointerEvent) => {
    const st = strokeRef.current;
    if (!st) return;
    st.points.push(canvasPoint(e));
    const ctx = drawRef.current!.getContext("2d")!;
    ctx.clearRect(0, 0, drawRef.current!.width, drawRef.current!.height);
    drawStrokes(ctx, [...strokes, st]);
  };

  const onDrawUp = () => {
    if (!strokeRef.current) return;
    setStrokes((a) => [...a, strokeRef.current!]);
    setRedoStack([]);
    strokeRef.current = null;
  };

  const undo = () => {
    sfx.click();
    setStrokes((a) => {
      if (a.length === 0) return a;
      setRedoStack((r) => [...r, a[a.length - 1]]);
      return a.slice(0, -1);
    });
  };

  const redo = () => {
    sfx.click();
    setRedoStack((r) => {
      if (r.length === 0) return r;
      setStrokes((a) => [...a, r[r.length - 1]]);
      return r.slice(0, -1);
    });
  };

  /* ── export (re-renders the strip at 3× for crisp prints) ─ */

  const compose = () => composeFinal(recipe, { strokes, stickers, texts }, 3);

  const download = async (type: "image/png" | "image/jpeg") => {
    sfx.click();
    setBusy(true);
    try {
      const blob = await canvasToBlob(await compose(), type);
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = `pocket-photo-booth.${type === "image/png" ? "png" : "jpg"}`;
      a.click();
      URL.revokeObjectURL(a.href);
      toast("Saved! 📸");
    } finally {
      setBusy(false);
    }
  };

  const share = async () => {
    sfx.click();
    setBusy(true);
    try {
      const blob = await canvasToBlob(await compose(), "image/png");
      const file = new File([blob], "pocket-photo-booth.png", { type: "image/png" });
      if (navigator.canShare?.({ files: [file] })) {
        await navigator.share({ files: [file], title: "Pocket Photo Booth" });
      } else {
        await navigator.clipboard.write([new ClipboardItem({ "image/png": blob })]);
        toast("Sharing unavailable — copied instead!");
      }
    } catch {
      /* user cancelled */
    } finally {
      setBusy(false);
    }
  };

  const copyImage = async () => {
    sfx.click();
    setBusy(true);
    try {
      const blob = await canvasToBlob(await compose(), "image/png");
      await navigator.clipboard.write([new ClipboardItem({ "image/png": blob })]);
      toast("Image copied! ✨");
    } catch {
      toast("Copy isn't supported in this browser");
    } finally {
      setBusy(false);
    }
  };

  const copyLink = async () => {
    sfx.click();
    await navigator.clipboard.writeText(location.href);
    toast("Link copied! 🔗");
  };

  const finish = async () => {
    sfx.chime();
    setBusy(true);
    // desk copy at 1.5× keeps localStorage small; downloads stay 3×
    const final = await composeFinal(recipe, { strokes, stickers, texts }, 1.5);
    onFinish(final.toDataURL("image/jpeg", 0.85));
  };

  /* ── render ─────────────────────────────────────────────── */

  const displayScale = getScale();
  const selectedItem = selected ? getItem(selected) : undefined;

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-5xl flex-col gap-6 px-4 py-6 md:flex-row md:items-start md:justify-center md:gap-10 md:py-10">
      {/* strip */}
      <motion.div
        initial={{ opacity: 0, y: 20, rotate: -2 }}
        animate={{ opacity: 1, y: 0, rotate: 0 }}
        className="mx-auto shrink-0 md:sticky md:top-8"
      >
        <div
          ref={wrapRef}
          className="relative touch-none select-none overflow-hidden rounded-xl shadow-2xl shadow-pink-200/60"
          style={{ width: "min(300px, 82vw)" }}
          onPointerDown={() => setSelected(null)}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={baseUrl} alt="Your photo strip" className="block w-full" draggable={false} />
          <canvas
            ref={drawRef}
            width={base.width}
            height={base.height}
            className={`absolute inset-0 h-full w-full ${tab === "draw" ? "cursor-crosshair" : "pointer-events-none"}`}
            onPointerDown={onDrawDown}
            onPointerMove={onDrawMove}
            onPointerUp={onDrawUp}
            onPointerCancel={onDrawUp}
          />
          {stickers.map((s) => (
            <div
              key={s.id}
              role="button"
              aria-label={`Sticker ${s.emoji}`}
              className={`absolute cursor-grab leading-none active:cursor-grabbing ${tab === "draw" ? "pointer-events-none" : ""}`}
              style={{
                left: s.x * displayScale,
                top: s.y * displayScale,
                fontSize: 56 * s.scale * displayScale,
                transform: `translate(-50%, -50%) rotate(${s.rotation}deg)`,
              }}
              onPointerDown={(e) => startMove(e, "sticker", s.id)}
              onPointerMove={onItemPointerMove}
              onPointerUp={endItemDrag}
            >
              {s.emoji}
            </div>
          ))}
          {texts.map((t) => (
            <div
              key={t.id}
              role="button"
              aria-label={`Caption: ${t.text}`}
              className={`absolute cursor-grab whitespace-nowrap font-semibold leading-none active:cursor-grabbing ${tab === "draw" ? "pointer-events-none" : ""}`}
              style={{
                left: t.x * displayScale,
                top: t.y * displayScale,
                fontSize: 30 * t.scale * displayScale,
                fontFamily: t.fontCss,
                color: t.color,
                transform: `translate(-50%, -50%) rotate(${t.rotation}deg)`,
              }}
              onPointerDown={(e) => startMove(e, "text", t.id)}
              onPointerMove={onItemPointerMove}
              onPointerUp={endItemDrag}
            >
              {t.text}
            </div>
          ))}
          {/* selection ring + transform handle */}
          {selected && selectedItem && tab !== "draw" && (
            <>
              <div
                aria-hidden
                className="pointer-events-none absolute rounded-lg border-2 border-dashed border-[#e88ea9]"
                style={{
                  left: selectedItem.x * displayScale,
                  top: selectedItem.y * displayScale,
                  width: 90 * selectedItem.scale * displayScale,
                  height: 90 * selectedItem.scale * displayScale,
                  transform: `translate(-50%, -50%) rotate(${selectedItem.rotation}deg)`,
                }}
              />
              <div
                role="slider"
                aria-label="Resize and rotate"
                aria-valuenow={Math.round(selectedItem.scale * 100)}
                className="absolute z-10 flex size-6 cursor-nwse-resize items-center justify-center rounded-full bg-[#e88ea9] shadow-md"
                style={{
                  left: selectedItem.x * displayScale + 50 * selectedItem.scale * displayScale,
                  top: selectedItem.y * displayScale + 50 * selectedItem.scale * displayScale,
                  transform: "translate(-50%, -50%)",
                }}
                onPointerDown={(e) => startTransform(e, selected.type, selected.id)}
                onPointerMove={onItemPointerMove}
                onPointerUp={endItemDrag}
              >
                <span className="size-2 rounded-full bg-white" />
              </div>
            </>
          )}
        </div>
      </motion.div>

      {/* controls */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1 }}
        className="flex w-full max-w-md flex-col gap-4 md:max-w-sm"
      >
        <h1 className="text-2xl font-bold">Decorate your strip</h1>

        {/* tabs */}
        <div className="flex gap-2 rounded-2xl bg-muted p-1.5" role="tablist" aria-label="Editing tools">
          {(
            [
              { id: "stickers", name: "Stickers", icon: Smile },
              { id: "draw", name: "Draw", icon: Pen },
              { id: "text", name: "Text", icon: Type },
            ] as const
          ).map((t) => (
            <button
              key={t.id}
              role="tab"
              aria-selected={tab === t.id}
              onClick={() => {
                sfx.click();
                setTab(t.id);
                setSelected(null);
              }}
              className={`flex flex-1 items-center justify-center gap-1.5 rounded-xl py-2.5 text-sm font-semibold transition-colors ${
                tab === t.id ? "bg-white text-[#5c3a44] shadow-sm" : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <t.icon className="size-4" />
              {t.name}
            </button>
          ))}
        </div>

        {/* panel */}
        <div className="rounded-2xl border border-border bg-white p-4">
          {tab === "stickers" && (
            <div className="grid grid-cols-6 gap-2">
              {STICKERS.map((e) => (
                <motion.button
                  key={e}
                  aria-label={`Add ${e} sticker`}
                  whileHover={{ scale: 1.15, rotate: 6 }}
                  whileTap={{ scale: 0.85 }}
                  onClick={() => addSticker(e)}
                  className="flex aspect-square items-center justify-center rounded-xl text-2xl hover:bg-accent"
                >
                  {e}
                </motion.button>
              ))}
            </div>
          )}

          {tab === "draw" && (
            <div className="flex flex-col gap-3">
              <div className="flex gap-2">
                {TOOLS.map((t) => (
                  <button
                    key={t.id}
                    aria-label={t.name}
                    aria-pressed={tool.id === t.id}
                    onClick={() => {
                      sfx.click();
                      setTool(t);
                    }}
                    className={`flex flex-1 items-center justify-center gap-1.5 rounded-xl border-2 py-2 text-sm font-medium ${
                      tool.id === t.id ? "border-[#e88ea9] bg-[#fbe3ea]" : "border-border hover:border-[#f5b8c8]"
                    }`}
                  >
                    <t.icon className="size-4" />
                    {t.name}
                  </button>
                ))}
              </div>
              <div className="flex items-center gap-2">
                <div className="flex flex-1 flex-wrap gap-1.5">
                  {PALETTE.map((c) => (
                    <button
                      key={c}
                      aria-label={`Color ${c}`}
                      aria-pressed={color === c}
                      onClick={() => setColor(c)}
                      className={`size-7 rounded-full border-2 ${color === c ? "border-[#4b4145] scale-110" : "border-border"} transition-transform`}
                      style={{ backgroundColor: c }}
                    />
                  ))}
                </div>
                <Button variant="outline" size="icon" aria-label="Undo" onClick={undo} disabled={strokes.length === 0} className="rounded-xl">
                  <Undo2 className="size-4" />
                </Button>
                <Button variant="outline" size="icon" aria-label="Redo" onClick={redo} disabled={redoStack.length === 0} className="rounded-xl">
                  <Redo2 className="size-4" />
                </Button>
              </div>
            </div>
          )}

          {tab === "text" && (
            <div className="flex flex-col gap-3">
              <div className="flex gap-2">
                <input
                  value={textInput}
                  onChange={(e) => setTextInput(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && addText()}
                  placeholder="Write a caption…"
                  aria-label="Caption text"
                  className="h-11 flex-1 rounded-xl border-2 border-border bg-white px-3 text-sm outline-none focus:border-[#f5b8c8]"
                />
                <Button onClick={addText} disabled={!textInput.trim()} className="h-11 rounded-xl bg-[#e88ea9] text-white hover:bg-[#e37f9d]">
                  Add
                </Button>
              </div>
              <div className="flex flex-wrap gap-2">
                {CAPTION_FONTS.map((f) => (
                  <button
                    key={f.id}
                    aria-pressed={fontId === f.id}
                    onClick={() => setFontId(f.id)}
                    className={`rounded-xl border-2 px-3 py-1.5 text-sm ${
                      fontId === f.id ? "border-[#e88ea9] bg-[#fbe3ea]" : "border-border hover:border-[#f5b8c8]"
                    }`}
                    style={{ fontFamily: f.css }}
                  >
                    {f.name}
                  </button>
                ))}
              </div>
              <div className="flex flex-wrap gap-1.5">
                {PALETTE.map((c) => (
                  <button
                    key={c}
                    aria-label={`Text color ${c}`}
                    aria-pressed={color === c}
                    onClick={() => setColor(c)}
                    className={`size-7 rounded-full border-2 ${color === c ? "border-[#4b4145] scale-110" : "border-border"} transition-transform`}
                    style={{ backgroundColor: c }}
                  />
                ))}
              </div>
              <p className="text-xs text-muted-foreground">Drag your caption on the strip to move it. Use the pink handle to resize & rotate.</p>
            </div>
          )}
        </div>

        {selected && (
          <Button variant="outline" onClick={deleteSelected} className="rounded-xl border-red-200 text-red-400 hover:bg-red-50 hover:text-red-500">
            <Trash2 className="mr-1 size-4" /> Remove selected
          </Button>
        )}

        {/* export actions */}
        <div className="grid grid-cols-2 gap-2">
          <Button variant="outline" disabled={busy} onClick={() => download("image/png")} className="rounded-xl">
            <Download className="mr-1 size-4" /> PNG
          </Button>
          <Button variant="outline" disabled={busy} onClick={() => download("image/jpeg")} className="rounded-xl">
            <Download className="mr-1 size-4" /> JPG
          </Button>
          <Button variant="outline" disabled={busy} onClick={share} className="rounded-xl">
            <Share2 className="mr-1 size-4" /> Share
          </Button>
          <Button variant="outline" disabled={busy} onClick={copyImage} className="rounded-xl">
            <Copy className="mr-1 size-4" /> Copy image
          </Button>
          <Button variant="outline" onClick={copyLink} className="col-span-2 rounded-xl">
            <Link2 className="mr-1 size-4" /> Copy link
          </Button>
        </div>

        <motion.div whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.97 }}>
          <Button
            size="lg"
            disabled={busy}
            onClick={finish}
            className="h-14 w-full rounded-full bg-gradient-to-r from-[#f5a8be] to-[#e88ea9] text-lg font-semibold text-white shadow-xl shadow-pink-300/40 hover:from-[#f39cb5] hover:to-[#e37f9d]"
          >
            <Check className="mr-1 size-5" />
            Keep on my desk
          </Button>
        </motion.div>
      </motion.div>

      {/* toast */}
      <AnimatePresence>
        {note && (
          <motion.div
            role="status"
            className="glass fixed bottom-6 left-1/2 z-50 -translate-x-1/2 rounded-full px-5 py-2.5 text-sm font-semibold shadow-lg"
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 16 }}
          >
            {note}
          </motion.div>
        )}
      </AnimatePresence>
    </main>
  );
}
