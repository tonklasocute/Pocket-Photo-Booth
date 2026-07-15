"use client";

import { motion } from "framer-motion";
import { ArrowLeft, Check, Sparkles, Wand2 } from "lucide-react";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { FILTERS, type PhotoCount } from "@/lib/booth";
import { COLLECTIONS, collectionById, renderPreview, type FrameCustom } from "@/lib/collections";
import { sfx } from "@/lib/sound";

const SWATCH = "linear-gradient(135deg, #ffb6c1 0%, #ffd9a0 45%, #a0c8f0 100%)";
const PAPER_COLORS = [null, "#ffffff", "#f6efe2", "#fbe3ea", "#e3ecfb", "#eef6ea", "#1a1a1a"] as const;
const FRAME_COLORS = [null, "#ffffff", "#fdf2d0", "#f8d7e0", "#d6e5f7", "#2a2a2a"] as const;

function ColorRow(props: {
  label: string;
  colors: readonly (string | null)[];
  value: string | null;
  onPick: (c: string | null) => void;
}) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-sm font-medium text-muted-foreground">{props.label}</span>
      <div className="flex gap-1.5">
        {props.colors.map((c) => (
          <button
            key={c ?? "auto"}
            aria-label={c ? `${props.label} ${c}` : `${props.label} default`}
            aria-pressed={props.value === c}
            onClick={() => props.onPick(c)}
            className={`size-7 rounded-full border-2 transition-transform ${
              props.value === c ? "scale-110 border-[#4b4145]" : "border-border"
            }`}
            style={c ? { backgroundColor: c } : { background: "conic-gradient(#f5b8c8, #cfe3f5, #fdf3d9, #f5b8c8)" }}
          />
        ))}
      </div>
    </div>
  );
}

export function Setup(props: {
  frameId: string;
  filterId: string;
  count: PhotoCount;
  custom: FrameCustom;
  onChange: (patch: Partial<{ frameId: string; filterId: string; count: PhotoCount; custom: FrameCustom }>) => void;
  onStart: () => void;
  onBack: () => void;
}) {
  const [previews, setPreviews] = useState<Record<string, string>>({});
  const [livePreview, setLivePreview] = useState<string | null>(null);
  const col = collectionById(props.frameId);

  // render the 12 collection cards once
  useEffect(() => {
    let alive = true;
    (async () => {
      for (const c of COLLECTIONS) {
        const url = await renderPreview(c.id);
        if (!alive) return;
        setPreviews((p) => ({ ...p, [c.id]: url }));
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  // live customized preview of the selected collection — renders on every
  // change so slider drags update in real time (renderPreview caches per value)
  useEffect(() => {
    let stale = false;
    renderPreview(props.frameId, props.custom).then((url) => {
      if (!stale) setLivePreview(url);
    });
    return () => {
      stale = true;
    };
  }, [props.frameId, props.custom]);

  const pick = (patch: Parameters<typeof props.onChange>[0]) => {
    sfx.pop();
    props.onChange(patch);
  };
  const setCustom = (patch: Partial<FrameCustom>) => props.onChange({ custom: { ...props.custom, ...patch } });

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-4xl flex-col px-5 py-6">
      <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} className="flex-1">
        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="icon"
            aria-label="Back to home"
            className="rounded-full"
            onClick={() => {
              sfx.click();
              props.onBack();
            }}
          >
            <ArrowLeft className="size-5" />
          </Button>
          <h1 className="text-2xl font-bold sm:text-3xl">Set up your booth</h1>
        </div>

        {/* photo count */}
        <section className="mt-6">
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-muted-foreground">Photos per strip</h2>
          <div className="flex max-w-md gap-3" role="radiogroup" aria-label="Photos per strip">
            {([2, 4, 6] as PhotoCount[]).map((n) => (
              <motion.button
                key={n}
                role="radio"
                aria-checked={props.count === n}
                whileTap={{ scale: 0.92 }}
                onClick={() => pick({ count: n })}
                className={`flex h-14 flex-1 items-center justify-center rounded-2xl border-2 text-lg font-bold transition-colors ${
                  props.count === n
                    ? "border-[#e88ea9] bg-[#fbe3ea] text-[#5c3a44]"
                    : "border-border bg-white text-muted-foreground hover:border-[#f5b8c8]"
                }`}
              >
                {n} cuts
              </motion.button>
            ))}
          </div>
        </section>

        {/* collections */}
        <section className="mt-8">
          <h2 className="mb-1 text-sm font-semibold uppercase tracking-wider text-muted-foreground">Frame collections</h2>
          <p className="mb-4 text-sm text-muted-foreground">Pick a memory style — each one is a designed print, not just a border.</p>
          <div className="perspective-800 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4" role="radiogroup" aria-label="Frame collection">
            {COLLECTIONS.map((c) => {
              const selected = props.frameId === c.id;
              return (
                <motion.button
                  key={c.id}
                  role="radio"
                  aria-checked={selected}
                  aria-label={`${c.name} collection`}
                  onClick={() => pick({ frameId: c.id })}
                  whileHover={{ y: -7, rotateX: 5, rotateY: -4, scale: 1.02 }}
                  whileTap={{ scale: 0.96 }}
                  animate={selected ? { scale: 1.03 } : { scale: 1 }}
                  transition={{ type: "spring", stiffness: 320, damping: 22 }}
                  className={`group relative flex flex-col overflow-hidden rounded-2xl border bg-white text-left transition-shadow ${
                    selected
                      ? "border-[#e88ea9] shadow-[0_10px_36px_-6px_rgba(232,142,169,0.55)]"
                      : "border-border shadow-sm hover:shadow-[0_16px_36px_-12px_rgba(90,60,70,0.3)]"
                  }`}
                  style={{ transformStyle: "preserve-3d" }}
                >
                  <span
                    className="flex h-44 items-center justify-center overflow-hidden sm:h-48"
                    style={{ background: "linear-gradient(160deg, #f6f1ec, #ece4dd)" }}
                  >
                    {previews[c.id] ? (
                      /* eslint-disable-next-line @next/next/no-img-element */
                      <img
                        src={previews[c.id]}
                        alt=""
                        className="h-[88%] w-auto rounded-[3px] shadow-[0_8px_20px_rgba(60,40,40,0.35)] transition-transform duration-500 group-hover:-translate-y-1 group-hover:rotate-1"
                      />
                    ) : (
                      <span className="h-[88%] w-16 animate-pulse rounded bg-black/10" />
                    )}
                  </span>
                  <span className="flex flex-col gap-0.5 border-t border-border/60 px-3 py-2.5">
                    <span className="text-sm font-semibold leading-tight">{c.name}</span>
                    <span className="text-[11px] leading-tight text-muted-foreground">{c.vibe}</span>
                  </span>
                  {selected && (
                    <motion.span
                      initial={{ scale: 0 }}
                      animate={{ scale: 1 }}
                      className="absolute right-2 top-2 flex size-6 items-center justify-center rounded-full bg-[#e88ea9] text-white shadow-md"
                    >
                      <Check className="size-3.5" strokeWidth={3} />
                    </motion.span>
                  )}
                </motion.button>
              );
            })}
          </div>
        </section>

        {/* customization */}
        <section className="mt-8">
          <h2 className="mb-3 flex items-center gap-1.5 text-sm font-semibold uppercase tracking-wider text-muted-foreground">
            <Wand2 className="size-4" /> Make it yours
          </h2>
          <div className="flex flex-col gap-5 rounded-2xl border border-border bg-white p-4 sm:flex-row">
            {/* live preview */}
            <div className="flex items-start justify-center sm:w-40 sm:shrink-0">
              <motion.div key={props.frameId} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>
                {livePreview ? (
                  /* eslint-disable-next-line @next/next/no-img-element */
                  <img
                    src={livePreview}
                    alt={`Live preview of ${col.name}`}
                    className="max-h-72 w-auto rounded-[3px] shadow-[0_10px_26px_rgba(60,40,40,0.3)]"
                  />
                ) : (
                  <span className="block h-64 w-28 animate-pulse rounded bg-black/10" />
                )}
              </motion.div>
            </div>

            <div className="flex flex-1 flex-col gap-4">
              <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
                {(
                  [
                    ["title", "Custom title"],
                    ["subtitle", "Subtitle"],
                    ["location", "Location"],
                    ["signature", "Signature"],
                  ] as const
                ).map(([key, label]) => (
                  <input
                    key={key}
                    value={props.custom[key]}
                    onChange={(e) => setCustom({ [key]: e.target.value })}
                    placeholder={label}
                    aria-label={label}
                    maxLength={40}
                    className="h-10 rounded-xl border-2 border-border bg-white px-3 text-sm outline-none focus:border-[#f5b8c8]"
                  />
                ))}
              </div>

              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-2" role="radiogroup" aria-label="Date format">
                  {(
                    [
                      ["long", "July 14"],
                      ["short", "07.14"],
                      ["none", "No date"],
                    ] as const
                  ).map(([v, label]) => (
                    <button
                      key={v}
                      role="radio"
                      aria-checked={props.custom.dateFormat === v}
                      onClick={() => setCustom({ dateFormat: v })}
                      className={`rounded-xl border-2 px-3 py-1.5 text-xs font-semibold ${
                        props.custom.dateFormat === v ? "border-[#e88ea9] bg-[#fbe3ea]" : "border-border hover:border-[#f5b8c8]"
                      }`}
                    >
                      {label}
                    </button>
                  ))}
                </div>
                <label className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
                  Logo
                  <Switch checked={props.custom.showLogo} onCheckedChange={(v: boolean) => setCustom({ showLogo: v })} aria-label="Show logo" />
                </label>
              </div>

              <ColorRow label="Paper" colors={PAPER_COLORS} value={props.custom.paperColor} onPick={(c) => setCustom({ paperColor: c })} />
              <ColorRow label="Frame" colors={FRAME_COLORS} value={props.custom.frameColor} onPick={(c) => setCustom({ frameColor: c })} />

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <label className="flex flex-col gap-2 text-sm font-medium text-muted-foreground">
                  Border thickness
                  <Slider
                    value={props.custom.borderScale}
                    min={0.5}
                    max={2}
                    step={0.1}
                    onValueChange={(v) => setCustom({ borderScale: v as number })}
                    aria-label="Border thickness"
                  />
                </label>
                <label className="flex flex-col gap-2 text-sm font-medium text-muted-foreground">
                  Corner radius
                  <Slider
                    value={props.custom.radiusScale}
                    min={0}
                    max={2}
                    step={0.1}
                    onValueChange={(v) => setCustom({ radiusScale: v as number })}
                    aria-label="Corner radius"
                  />
                </label>
              </div>
            </div>
          </div>
        </section>

        {/* filters */}
        <section className="mt-8">
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-muted-foreground">Film filter</h2>
          <div className="no-scrollbar -mx-5 flex gap-3 overflow-x-auto px-5 pb-1" role="radiogroup" aria-label="Film filter">
            {FILTERS.map((f) => {
              const selected = props.filterId === f.id;
              return (
                <motion.button
                  key={f.id}
                  role="radio"
                  aria-checked={selected}
                  aria-label={`${f.name} filter`}
                  whileTap={{ scale: 0.92 }}
                  onClick={() => pick({ filterId: f.id })}
                  className={`flex shrink-0 flex-col items-center gap-1.5 rounded-2xl border-2 p-2.5 transition-colors ${
                    selected ? "border-[#a8c8e8] bg-[#eaf3fc]" : "border-border bg-white hover:border-[#cfe3f5]"
                  }`}
                >
                  <span
                    className="relative block size-14 overflow-hidden rounded-full shadow-inner"
                    style={{ background: SWATCH, filter: f.css === "none" ? undefined : f.css }}
                  >
                    {f.lightLeak && (
                      <span className="absolute inset-0" style={{ background: "linear-gradient(220deg, rgba(255,120,80,0.5), transparent 60%)" }} />
                    )}
                  </span>
                  <span className="text-xs font-medium">{f.name}</span>
                </motion.button>
              );
            })}
          </div>
        </section>
      </motion.div>

      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.15 }}
        className="sticky bottom-4 mt-8"
      >
        <motion.div whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.97 }}>
          <Button
            size="lg"
            onClick={() => {
              sfx.chime();
              props.onStart();
            }}
            className="w-full rounded-full bg-gradient-to-r from-[#f5a8be] to-[#e88ea9] py-7 text-lg font-semibold text-white shadow-xl shadow-pink-300/40 hover:from-[#f39cb5] hover:to-[#e37f9d]"
          >
            <Sparkles className="mr-1 size-5" />
            Step inside
          </Button>
        </motion.div>
      </motion.div>
    </main>
  );
}
