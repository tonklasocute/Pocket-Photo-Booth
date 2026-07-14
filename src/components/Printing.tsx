"use client";

import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { ArrowUp } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { renderStrip } from "@/lib/collections";
import type { StripRecipe } from "@/lib/strip";
import { sfx, startPrinter } from "@/lib/sound";

export function Printing(props: { recipe: StripRecipe; onTaken: (base: HTMLCanvasElement) => void }) {
  const [stripUrl, setStripUrl] = useState<string | null>(null);
  const [size, setSize] = useState({ w: 200, h: 600 });
  const [printed, setPrinted] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const stopSoundRef = useRef<(() => void) | null>(null);
  const reduced = useReducedMotion();
  const duration = reduced ? 0.3 : 4.5 + props.recipe.photos.length * 0.7;

  useEffect(() => {
    let alive = true;
    (async () => {
      await document.fonts.ready;
      const canvas = await renderStrip(props.recipe);
      if (!alive) return;
      canvasRef.current = canvas;
      const ratio = canvas.height / canvas.width;
      const h = Math.min(window.innerHeight * 0.62, 620);
      setSize({ w: Math.min(h / ratio, 230), h: Math.min(h, 230 * ratio) });
      setStripUrl(canvas.toDataURL("image/jpeg", 0.9));
      stopSoundRef.current = startPrinter();
      sfx.paper();
    })();
    return () => {
      alive = false;
      stopSoundRef.current?.();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!stripUrl) return;
    const t = setTimeout(() => {
      setPrinted(true);
      stopSoundRef.current?.();
      sfx.chime();
    }, duration * 1000 + 400);
    return () => clearTimeout(t);
  }, [stripUrl, duration]);

  return (
    <main className="vignette relative flex min-h-dvh flex-col items-center justify-end overflow-hidden bg-[#221a2a] pb-10">
      {/* header */}
      <div className="absolute top-10 z-10 text-center sm:top-14">
        <AnimatePresence mode="wait">
          <motion.h1
            key={printed ? "done" : "printing"}
            className="text-2xl font-bold text-white sm:text-3xl"
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -12 }}
          >
            {printed ? "Your strip is ready! 🎉" : "Printing…"}
          </motion.h1>
        </AnimatePresence>
        {!printed && (
          <div className="mx-auto mt-4 h-2 w-56 overflow-hidden rounded-full bg-white/10">
            <motion.div
              className="h-full rounded-full bg-gradient-to-r from-[#f5a8be] to-[#e88ea9]"
              initial={{ width: "0%" }}
              animate={{ width: "100%" }}
              transition={{ duration, ease: "linear" }}
            />
          </div>
        )}
        {printed && (
          <motion.p
            className="mt-3 flex items-center justify-center gap-2 text-white/70"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.4 }}
          >
            <motion.span animate={{ y: [0, -6, 0] }} transition={{ duration: 1.2, repeat: Infinity }}>
              <ArrowUp className="size-5" />
            </motion.span>
            Drag your strip up to take it
          </motion.p>
        )}
      </div>

      {/* strip emerging above the printer */}
      <div className="relative z-0 overflow-hidden" style={{ width: size.w + 40, height: size.h + 8 }}>
        {stripUrl && (
          <motion.div
            className="absolute inset-x-0 bottom-0 mx-auto"
            style={{ width: size.w, touchAction: "none" }}
            initial={{ y: "102%" }}
            animate={{ y: "0%" }}
            transition={{ duration, ease: "linear" }}
          >
            <motion.img
              src={stripUrl}
              alt="Your photo strip"
              draggable={false}
              className="w-full rounded-lg shadow-2xl shadow-black/50"
              initial={{ filter: "brightness(1.7) saturate(0.25)" }}
              animate={{ filter: "brightness(1) saturate(1)" }}
              transition={{ duration: duration * 0.9, delay: duration * 0.2, ease: "easeOut" }}
              drag={printed ? "y" : false}
              dragConstraints={{ top: -260, bottom: 0 }}
              dragElastic={0.15}
              whileDrag={{ rotate: 1.5, cursor: "grabbing" }}
              onDragEnd={(_, info) => {
                if (info.offset.y < -120) {
                  sfx.pop();
                  if (canvasRef.current) props.onTaken(canvasRef.current);
                }
              }}
              style={{ cursor: printed ? "grab" : undefined }}
            />
          </motion.div>
        )}
      </div>

      {/* printer body */}
      <div className="relative z-10 w-full max-w-md px-6">
        <div className="rounded-t-3xl border border-white/10 bg-gradient-to-b from-[#3a3144] to-[#2b2334] px-8 pb-8 pt-5 shadow-[0_-18px_50px_rgba(0,0,0,0.5)]">
          <div className="mx-auto h-3 w-[70%] rounded-full bg-black/70 shadow-[inset_0_2px_6px_rgba(0,0,0,0.9)]" />
          <div className="mt-5 flex items-center justify-between">
            <span className="text-xs font-semibold tracking-[0.25em] text-white/40">POCKET LAB</span>
            <motion.span
              className="size-2.5 rounded-full"
              animate={{ backgroundColor: printed ? "#7ee2a0" : ["#f5a8be", "#5c4a66", "#f5a8be"] }}
              transition={printed ? {} : { duration: 0.8, repeat: Infinity }}
            />
          </div>
        </div>
      </div>
    </main>
  );
}
