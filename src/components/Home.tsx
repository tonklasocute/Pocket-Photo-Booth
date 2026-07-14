"use client";

import { motion } from "framer-motion";
import { Camera, Images } from "lucide-react";
import { Button } from "@/components/ui/button";
import { sfx } from "@/lib/sound";

const FLOATIES = [
  { e: "🌸", x: "12%", y: "18%", d: 0 },
  { e: "✨", x: "82%", y: "14%", d: 0.6 },
  { e: "☁️", x: "8%", y: "68%", d: 1.1 },
  { e: "🎀", x: "88%", y: "62%", d: 0.3 },
  { e: "💖", x: "20%", y: "86%", d: 0.9 },
  { e: "⭐", x: "74%", y: "84%", d: 1.4 },
];

export function Home({ onEnter, onDesk }: { onEnter: () => void; onDesk: () => void }) {
  return (
    <main className="relative flex min-h-dvh flex-col items-center justify-center overflow-hidden px-6">
      {/* pastel blobs */}
      <div aria-hidden className="pointer-events-none absolute inset-0">
        <div className="absolute -left-24 -top-24 size-96 rounded-full bg-[#fbe3ea] blur-3xl" />
        <div className="absolute -bottom-32 -right-20 size-[28rem] rounded-full bg-[#dcecfd] blur-3xl" />
        <div className="absolute left-1/2 top-1/3 size-72 -translate-x-1/2 rounded-full bg-[#fdf3d9] blur-3xl" />
        {FLOATIES.map((f) => (
          <motion.span
            key={f.e + f.x}
            className="absolute text-3xl sm:text-4xl"
            style={{ left: f.x, top: f.y }}
            animate={{ y: [0, -14, 0], rotate: [0, 6, -6, 0] }}
            transition={{ duration: 5, delay: f.d, repeat: Infinity, ease: "easeInOut" }}
          >
            {f.e}
          </motion.span>
        ))}
      </div>

      <motion.div
        className="relative z-10 flex flex-col items-center text-center"
        initial={{ opacity: 0, y: 24 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.7, ease: "easeOut" }}
      >
        <motion.div
          className="glass mb-8 flex size-24 items-center justify-center rounded-[2rem] shadow-lg shadow-pink-200/50"
          animate={{ rotate: [0, -4, 4, 0] }}
          transition={{ duration: 6, repeat: Infinity, ease: "easeInOut" }}
        >
          <Camera className="size-11 text-[#e88ea9]" strokeWidth={1.8} />
        </motion.div>

        <h1 className="text-5xl font-bold tracking-tight text-[#4b4145] sm:text-6xl">
          Pocket <span className="text-[#e88ea9]">Photo Booth</span>
        </h1>
        <p className="mt-4 text-lg text-[#9a8d90] sm:text-xl">
          Create memories, one strip at a time.
        </p>

        <motion.div whileHover={{ scale: 1.04 }} whileTap={{ scale: 0.96 }} className="mt-10">
          <Button
            size="lg"
            onClick={() => {
              sfx.click();
              onEnter();
            }}
            className="h-16 rounded-full bg-gradient-to-r from-[#f5a8be] to-[#e88ea9] px-12 text-xl font-semibold text-white shadow-xl shadow-pink-300/40 hover:from-[#f39cb5] hover:to-[#e37f9d]"
          >
            Enter Booth
          </Button>
        </motion.div>

        <motion.div whileHover={{ scale: 1.04 }} whileTap={{ scale: 0.96 }} className="mt-4">
          <Button
            variant="ghost"
            onClick={() => {
              sfx.click();
              onDesk();
            }}
            className="rounded-full text-base text-[#9a8d90] hover:bg-white/60 hover:text-[#4b4145]"
          >
            <Images className="mr-1 size-4" />
            My memory desk
          </Button>
        </motion.div>
      </motion.div>
    </main>
  );
}
