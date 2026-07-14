"use client";

import { motion } from "framer-motion";
import { ArrowLeft, RotateCcw, RotateCw, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { sfx } from "@/lib/sound";

export type DeskStrip = { id: string; img: string; x: number; y: number; rot: number; z: number };

const KEY = "ppb-desk";
const MAX_STRIPS = 8;

export function loadDesk(): DeskStrip[] {
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? "[]");
  } catch {
    return [];
  }
}

function saveDesk(strips: DeskStrip[]) {
  try {
    localStorage.setItem(KEY, JSON.stringify(strips));
  } catch {
    /* quota exceeded — keep strips in memory only. ponytail: no eviction UI */
  }
}

export function addStripToDesk(img: string) {
  const strips = loadDesk();
  const maxZ = Math.max(0, ...strips.map((s) => s.z));
  strips.push({
    id: crypto.randomUUID(),
    img,
    x: (Math.random() - 0.5) * 120,
    y: (Math.random() - 0.5) * 60,
    rot: (Math.random() - 0.5) * 16,
    z: maxZ + 1,
  });
  saveDesk(strips.slice(-MAX_STRIPS));
}

export function Desk({ onBack }: { onBack: () => void }) {
  const [strips, setStrips] = useState<DeskStrip[]>([]);
  const [selected, setSelected] = useState<string | null>(null);

  useEffect(() => setStrips(loadDesk()), []);

  const update = (id: string, patch: Partial<DeskStrip>) =>
    setStrips((all) => {
      const next = all.map((s) => (s.id === id ? { ...s, ...patch } : s));
      saveDesk(next);
      return next;
    });

  const bringToFront = (id: string) => {
    const maxZ = Math.max(0, ...strips.map((s) => s.z));
    update(id, { z: maxZ + 1 });
  };

  const remove = (id: string) => {
    sfx.click();
    setStrips((all) => {
      const next = all.filter((s) => s.id !== id);
      saveDesk(next);
      return next;
    });
    setSelected(null);
  };

  const sel = strips.find((s) => s.id === selected);

  return (
    <main className="wood-desk relative min-h-dvh overflow-hidden" onPointerDown={() => setSelected(null)}>
      {/* soft desk lamp light */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{ background: "radial-gradient(ellipse at 50% 30%, rgba(255,240,215,0.25), transparent 65%)" }}
      />

      <div className="absolute inset-x-0 top-0 z-40 flex items-center justify-between p-4">
        <Button
          variant="ghost"
          onClick={(e) => {
            e.stopPropagation();
            sfx.click();
            onBack();
          }}
          className="glass rounded-full font-semibold text-[#4b4145] hover:bg-white/80"
        >
          <ArrowLeft className="mr-1 size-4" /> Home
        </Button>
        <div className="glass rounded-full px-4 py-2 text-sm font-semibold text-[#4b4145]">My memory desk</div>
        <div className="w-20" />
      </div>

      {strips.length === 0 && (
        <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
          <motion.p
            className="text-5xl"
            animate={{ rotate: [0, 8, -8, 0] }}
            transition={{ duration: 4, repeat: Infinity }}
          >
            📭
          </motion.p>
          <p className="mt-4 text-lg font-semibold text-white/85">Your desk is empty</p>
          <p className="text-sm text-white/60">Enter the booth and print a strip to start your collection.</p>
        </div>
      )}

      {/* strips */}
      <div className="absolute inset-0 flex items-center justify-center">
        {strips.map((s) => (
          <motion.div
            key={s.id}
            className="absolute cursor-grab touch-none active:cursor-grabbing"
            style={{ zIndex: s.z, width: "min(160px, 34vw)" }}
            animate={{ x: s.x, y: s.y, rotate: s.rot }}
            initial={false}
            drag
            dragMomentum={false}
            whileDrag={{ scale: 1.05, rotate: s.rot + 2 }}
            onDragStart={() => {
              bringToFront(s.id);
              setSelected(s.id);
            }}
            onDragEnd={(_, info) => update(s.id, { x: s.x + info.offset.x, y: s.y + info.offset.y })}
            onPointerDown={(e) => {
              e.stopPropagation();
              setSelected(s.id);
              bringToFront(s.id);
            }}
          >
            <img
              src={s.img}
              alt="Saved photo strip"
              draggable={false}
              className={`w-full rounded-md shadow-[0_14px_30px_rgba(0,0,0,0.45)] ${
                selected === s.id ? "ring-4 ring-[#f5b8c8]/80" : ""
              }`}
            />
            {/* tape */}
            <span
              aria-hidden
              className="absolute -top-2 left-1/2 h-5 w-14 -translate-x-1/2 -rotate-3 rounded-sm bg-white/40 shadow-sm backdrop-blur-[1px]"
            />
          </motion.div>
        ))}
      </div>

      {/* selected strip controls */}
      {sel && (
        <motion.div
          className="glass absolute bottom-6 left-1/2 z-50 flex -translate-x-1/2 items-center gap-1 rounded-full p-1.5 shadow-lg"
          initial={{ opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          onPointerDown={(e) => e.stopPropagation()}
        >
          <Button variant="ghost" size="icon" aria-label="Rotate left" className="rounded-full" onClick={() => update(sel.id, { rot: sel.rot - 8 })}>
            <RotateCcw className="size-4" />
          </Button>
          <Button variant="ghost" size="icon" aria-label="Rotate right" className="rounded-full" onClick={() => update(sel.id, { rot: sel.rot + 8 })}>
            <RotateCw className="size-4" />
          </Button>
          <Button variant="ghost" size="icon" aria-label="Delete strip" className="rounded-full text-red-400 hover:text-red-500" onClick={() => remove(sel.id)}>
            <Trash2 className="size-4" />
          </Button>
        </motion.div>
      )}
    </main>
  );
}
