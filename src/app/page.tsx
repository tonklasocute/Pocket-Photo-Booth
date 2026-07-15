"use client";

import { AnimatePresence, motion } from "framer-motion";
import { Volume2, VolumeX } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Booth } from "@/components/Booth";
import { Curtain, type CurtainPhase } from "@/components/Curtain";
import { addStripToDesk, Desk } from "@/components/Desk";
import { Editor } from "@/components/Editor";
import { Home } from "@/components/Home";
import { Printing } from "@/components/Printing";
import { Setup } from "@/components/Setup";
import type { PhotoCount } from "@/lib/booth";
import { DEFAULT_CUSTOM, type FrameCustom } from "@/lib/collections";
import type { LiveCapture } from "@/lib/livememory";
import type { StripRecipe } from "@/lib/strip";
import { say, setSoundEnabled, sfx, soundEnabled } from "@/lib/sound";

type Scene = "home" | "setup" | "booth" | "printing" | "editor" | "thanks" | "desk";

const fade = {
  initial: { opacity: 0 },
  animate: { opacity: 1 },
  exit: { opacity: 0 },
  transition: { duration: 0.45 },
};

export default function Page() {
  const [scene, setScene] = useState<Scene>("home");
  const [curtain, setCurtain] = useState<CurtainPhase>("hidden");
  const pendingScene = useRef<Scene | null>(null);
  const [settings, setSettings] = useState<{
    frameId: string;
    filterId: string;
    count: PhotoCount;
    custom: FrameCustom;
  }>({ frameId: "classic", filterId: "none", count: 4, custom: DEFAULT_CUSTOM });
  const [recipe, setRecipe] = useState<StripRecipe | null>(null);
  const [liveCap, setLiveCap] = useState<LiveCapture | null>(null);
  const [baseStrip, setBaseStrip] = useState<HTMLCanvasElement | null>(null);
  const [sound, setSound] = useState(true);

  useEffect(() => setSound(soundEnabled()), []);

  const goWithCurtain = (next: Scene) => {
    pendingScene.current = next;
    setCurtain("closing");
  };

  const onCurtainDone = () => {
    if (curtain === "closing") {
      if (pendingScene.current) setScene(pendingScene.current);
      pendingScene.current = null;
      setCurtain("opening");
    } else {
      setCurtain("hidden");
    }
  };

  const toggleSound = () => {
    const next = !sound;
    setSound(next);
    setSoundEnabled(next);
    if (next) sfx.click();
  };

  return (
    <>
      <Button
        variant="ghost"
        size="icon"
        aria-label={sound ? "Mute sounds" : "Unmute sounds"}
        aria-pressed={sound}
        onClick={toggleSound}
        className="glass fixed right-4 top-4 z-[70] rounded-full text-[#4b4145] shadow-md hover:bg-white/80"
      >
        {sound ? <Volume2 className="size-5" /> : <VolumeX className="size-5" />}
      </Button>

      <AnimatePresence mode="wait">
        <motion.div key={scene} {...fade}>
          {scene === "home" && (
            <Home onEnter={() => setScene("setup")} onDesk={() => setScene("desk")} />
          )}

          {scene === "setup" && (
            <Setup
              frameId={settings.frameId}
              filterId={settings.filterId}
              count={settings.count}
              custom={settings.custom}
              onChange={(patch) => setSettings((s) => ({ ...s, ...patch }))}
              onStart={() => goWithCurtain("booth")}
              onBack={() => setScene("home")}
            />
          )}

          {scene === "booth" && (
            <Booth
              count={settings.count}
              filterId={settings.filterId}
              onDone={(shots, live) => {
                // seed fixed here so the printed strip and every export share
                // the same one-of-a-kind imperfections
                setLiveCap(live ?? null);
                setRecipe({
                  photos: shots,
                  frameId: settings.frameId,
                  filterId: settings.filterId,
                  custom: settings.custom,
                  seed: Math.floor(Math.random() * 1e9),
                });
                setScene("printing");
              }}
              onExit={() => goWithCurtain("home")}
            />
          )}

          {scene === "printing" && recipe && (
            <Printing
              recipe={recipe}
              onTaken={(base) => {
                setBaseStrip(base);
                setScene("editor");
              }}
            />
          )}

          {scene === "editor" && baseStrip && recipe && (
            <Editor
              base={baseStrip}
              recipe={recipe}
              live={liveCap ?? undefined}
              onFinish={(finalUrl, extras) => {
                addStripToDesk(finalUrl, extras);
                say("See you again.");
                setScene("thanks");
                setTimeout(() => goWithCurtain("desk"), 2400);
              }}
            />
          )}

          {scene === "thanks" && (
            <main className="flex min-h-dvh flex-col items-center justify-center bg-[#221a2a] px-6 text-center">
              <motion.p
                className="text-6xl"
                initial={{ scale: 0 }}
                animate={{ scale: [0, 1.2, 1] }}
                transition={{ duration: 0.6, ease: "backOut" }}
              >
                💗
              </motion.p>
              <motion.h1
                className="mt-6 text-3xl font-bold text-white sm:text-4xl"
                initial={{ opacity: 0, y: 14 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.25 }}
              >
                See you again.
              </motion.h1>
              <motion.p
                className="mt-2 text-white/60"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.5 }}
              >
                Your strip is waiting on your memory desk.
              </motion.p>
            </main>
          )}

          {scene === "desk" && <Desk onBack={() => setScene("home")} />}
        </motion.div>
      </AnimatePresence>

      <Curtain phase={curtain} onDone={onCurtainDone} />
    </>
  );
}
