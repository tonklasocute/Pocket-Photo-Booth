"use client";

import { motion } from "framer-motion";
import { useEffect } from "react";
import { sfx } from "@/lib/sound";

export type CurtainPhase = "hidden" | "opening" | "closing";

const DRAPE =
  "repeating-linear-gradient(90deg, #e75480 0px, #f27ea3 26px, #d94a75 52px, #ef6f97 80px)";

function Panel({ side, phase }: { side: "left" | "right"; phase: CurtainPhase }) {
  const closedX = "0%";
  const openX = side === "left" ? "-104%" : "104%";
  return (
    <motion.div
      className="absolute top-0 h-full w-[52%]"
      style={{
        [side]: 0,
        background: DRAPE,
        boxShadow: "inset 0 -40px 60px rgba(0,0,0,0.25), inset 0 40px 60px rgba(0,0,0,0.18)",
      }}
      initial={{ x: phase === "opening" ? closedX : openX }}
      animate={{ x: phase === "opening" ? openX : closedX }}
      transition={{ duration: 1.7, ease: [0.65, 0, 0.35, 1] }}
    />
  );
}

export function Curtain({ phase, onDone }: { phase: CurtainPhase; onDone: () => void }) {
  useEffect(() => {
    if (phase === "hidden") return;
    sfx.curtain();
    const t = setTimeout(onDone, 1800);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase]);

  if (phase === "hidden") return null;

  return (
    <div aria-hidden className="fixed inset-0 z-[80] overflow-hidden">
      <Panel side="left" phase={phase} />
      <Panel side="right" phase={phase} />
      {/* valance */}
      <div
        className="absolute inset-x-0 top-0 h-10"
        style={{ background: DRAPE, boxShadow: "0 6px 14px rgba(0,0,0,0.35)" }}
      />
    </div>
  );
}
