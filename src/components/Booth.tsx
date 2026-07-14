"use client";

import { AnimatePresence, motion } from "framer-motion";
import { CameraOff, Lock, RefreshCw, SwitchCamera, X } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { useCamera } from "@/hooks/useCamera";
import { filterById, randomPoses, type PhotoCount, type Pose } from "@/lib/booth";
import { say, sfx } from "@/lib/sound";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

type Phase = "warmup" | "ready" | "session" | "processing";

function LedRow({ counting }: { counting: boolean }) {
  const dots: { style: React.CSSProperties; i: number }[] = [];
  let i = 0;
  const colors = ["#ffd9e4", "#ffeccf", "#d6e9ff", "#fff6d6"];
  for (let n = 0; n < 10; n++) {
    dots.push({ i: i++, style: { top: -7, left: `${4 + n * 10.2}%` } });
    dots.push({ i: i++, style: { bottom: -7, left: `${4 + n * 10.2}%` } });
  }
  for (let n = 0; n < 6; n++) {
    dots.push({ i: i++, style: { left: -7, top: `${8 + n * 15.5}%` } });
    dots.push({ i: i++, style: { right: -7, top: `${8 + n * 15.5}%` } });
  }
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0">
      {dots.map((d) => (
        <span
          key={d.i}
          className="absolute size-2.5 rounded-full"
          style={{
            ...d.style,
            color: counting ? "#fff" : colors[d.i % colors.length],
            backgroundColor: "currentcolor",
            animation: `led-twinkle ${counting ? 0.35 : 1.8}s ease-in-out infinite`,
            animationDelay: `${(d.i % 8) * (counting ? 0.04 : 0.18)}s`,
          }}
        />
      ))}
    </div>
  );
}

export function Booth(props: {
  count: PhotoCount;
  filterId: string;
  onDone: (photos: string[]) => void;
  onExit: () => void;
}) {
  const { videoRef, status, facing, canFlip, start, stop, flip, capture } = useCamera();
  const [phase, setPhase] = useState<Phase>("warmup");
  const [lightsOn, setLightsOn] = useState(false);
  const [screenOn, setScreenOn] = useState(false);
  const [countdown, setCountdown] = useState<number | null>(null);
  const [pose, setPose] = useState<Pose | null>(null);
  const [flash, setFlash] = useState(false);
  const [photos, setPhotos] = useState<string[]>([]);
  const [message, setMessage] = useState("Get ready!");
  const cancelled = useRef(false);
  const welcomed = useRef(false);
  const filter = filterById(props.filterId);

  useEffect(() => {
    cancelled.current = false;
    start();
    return () => {
      cancelled.current = true;
      stop();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // power-up sequence once the camera is live
  useEffect(() => {
    if (status !== "ready" || welcomed.current) return;
    welcomed.current = true;
    (async () => {
      await sleep(300);
      if (cancelled.current) return;
      setLightsOn(true);
      await sleep(700);
      if (cancelled.current) return;
      setScreenOn(true);
      sfx.pop();
      await sleep(900);
      if (cancelled.current) return;
      say("Welcome. Let's make some memories.");
      setPhase("ready");
    })();
  }, [status]);

  // instruction ticker while waiting
  useEffect(() => {
    if (phase !== "ready") return;
    const msgs = ["Get ready!", "Strike your pose.", "Smile!"];
    let i = 0;
    setMessage(msgs[0]);
    const t = setInterval(() => setMessage(msgs[(i = (i + 1) % msgs.length)]), 2400);
    return () => clearInterval(t);
  }, [phase]);

  const runSession = useCallback(async () => {
    setPhase("session");
    const poses = randomPoses(props.count);
    const shots: string[] = [];
    for (let i = 0; i < props.count; i++) {
      setMessage(`Photo ${i + 1} of ${props.count}`);
      setPose(poses[i]);
      await sleep(2000);
      if (cancelled.current) return;
      setPose(null);
      for (let n = 3; n >= 1; n--) {
        setCountdown(n);
        if (n === 1) sfx.beepFinal();
        else sfx.beep();
        await sleep(1000);
        if (cancelled.current) return;
      }
      setCountdown(null);
      setFlash(true);
      sfx.shutter();
      sfx.flash();
      await sleep(130);
      if (cancelled.current) return;
      const shot = capture();
      if (shot) {
        shots.push(shot);
        setPhotos([...shots]);
        sfx.pop();
      }
      await sleep(280);
      setFlash(false);
      await sleep(720);
      if (cancelled.current) return;
    }
    setPhase("processing");
    setMessage("Processing your memories...");
    sfx.chime();
    await sleep(2400);
    if (cancelled.current) return;
    props.onDone(shots);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [props.count, capture, props.onDone]);

  const counting = countdown !== null;

  return (
    <main className="vignette relative flex min-h-dvh flex-col items-center justify-center overflow-hidden bg-[#221a2a] px-4 py-6">
      {/* ambient booth light */}
      <motion.div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 h-72"
        style={{ background: "radial-gradient(ellipse at 50% -20%, rgba(255,214,190,0.55), transparent 70%)" }}
        initial={{ opacity: 0 }}
        animate={{ opacity: lightsOn ? 1 : 0 }}
        transition={{ duration: 1.4 }}
      />
      <motion.div
        aria-hidden
        className="pointer-events-none absolute inset-0"
        initial={{ opacity: 0 }}
        animate={{ opacity: lightsOn ? 1 : 0 }}
        transition={{ duration: 1.4 }}
        style={{ background: "radial-gradient(ellipse at 50% 55%, rgba(255,190,205,0.12), transparent 65%)" }}
      />

      <Button
        variant="ghost"
        size="icon"
        aria-label="Leave the booth"
        onClick={() => {
          sfx.click();
          props.onExit();
        }}
        className="absolute left-4 top-4 z-20 rounded-full text-white/70 hover:bg-white/10 hover:text-white"
      >
        <X className="size-5" />
      </Button>

      {/* camera screen */}
      <div className="relative z-10 w-full max-w-xl">
        <LedRow counting={counting} />
        <motion.div
          className="relative aspect-[4/3] w-full overflow-hidden rounded-3xl bg-black shadow-2xl shadow-black/60"
          initial={{ opacity: 0.25, scaleY: 0.03 }}
          animate={
            screenOn
              ? { opacity: [0.25, 1, 0.5, 1], scaleY: [0.03, 0.03, 1, 1] }
              : { opacity: 0.25, scaleY: 0.03 }
          }
          transition={{ duration: 0.9, times: [0, 0.25, 0.6, 1] }}
        >
          <video
            ref={videoRef}
            playsInline
            muted
            autoPlay
            className="size-full object-cover transition-transform duration-1000"
            style={{
              transform: `${facing === "user" ? "scaleX(-1)" : ""} scale(${counting ? 1.07 : 1})`,
              filter: filter.css === "none" ? undefined : filter.css,
            }}
          />

          {/* HUD */}
          {status === "ready" && screenOn && (
            <div className="absolute inset-x-0 top-0 flex items-center justify-between p-3 text-[11px] font-semibold tracking-widest text-white/80">
              <span className="flex items-center gap-1.5 rounded-full bg-black/35 px-2.5 py-1">
                <motion.span
                  className="size-2 rounded-full bg-red-400"
                  animate={{ opacity: [1, 0.2, 1] }}
                  transition={{ duration: 1.4, repeat: Infinity }}
                />
                LIVE
              </span>
              <span className="rounded-full bg-black/35 px-2.5 py-1">
                {photos.length}/{props.count}
              </span>
            </div>
          )}

          {/* camera state panels */}
          {status === "requesting" && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 text-white/70">
              <motion.div
                className="size-14 rounded-full border-4 border-white/20 border-t-white/70"
                animate={{ rotate: 360 }}
                transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
              />
              <p className="text-sm">Warming up the camera…</p>
            </div>
          )}
          {status === "denied" && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 p-6 text-center text-white/85">
              <Lock className="size-10 text-pink-200" />
              <p className="font-semibold">Camera permission needed</p>
              <p className="max-w-xs text-sm text-white/60">
                The booth needs your camera to take photos. Allow camera access in your browser, then try again.
              </p>
              <Button onClick={() => start()} className="mt-1 rounded-full bg-white/15 text-white hover:bg-white/25">
                <RefreshCw className="mr-1 size-4" /> Try again
              </Button>
            </div>
          )}
          {status === "unavailable" && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 p-6 text-center text-white/85">
              <CameraOff className="size-10 text-pink-200" />
              <p className="font-semibold">No camera found</p>
              <p className="max-w-xs text-sm text-white/60">
                We couldn&apos;t reach a camera on this device. Plug one in or switch devices, then retry.
              </p>
              <Button onClick={() => start()} className="mt-1 rounded-full bg-white/15 text-white hover:bg-white/25">
                <RefreshCw className="mr-1 size-4" /> Retry
              </Button>
            </div>
          )}

          {/* pose prompt */}
          <AnimatePresence>
            {pose && (
              <motion.div
                key={pose.label}
                className="absolute inset-0 flex flex-col items-center justify-center bg-black/25"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
              >
                <motion.span
                  className="text-7xl drop-shadow-lg"
                  initial={{ scale: 0, rotate: -20 }}
                  animate={{ scale: [0, 1.25, 1], rotate: [0, 8, -8, 0] }}
                  transition={{ duration: 0.8, ease: "easeOut" }}
                >
                  {pose.emoji}
                </motion.span>
                <motion.p
                  className="mt-3 text-3xl font-bold text-white drop-shadow"
                  initial={{ y: 16, opacity: 0 }}
                  animate={{ y: 0, opacity: 1 }}
                  transition={{ delay: 0.15 }}
                >
                  {pose.label}
                </motion.p>
              </motion.div>
            )}
          </AnimatePresence>

          {/* countdown */}
          <AnimatePresence>
            {counting && (
              <motion.div
                key={countdown}
                className="absolute inset-0 flex items-center justify-center"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0, scale: 1.6 }}
                transition={{ duration: 0.25 }}
              >
                <motion.span
                  className="text-[10rem] font-bold leading-none text-white drop-shadow-[0_4px_24px_rgba(0,0,0,0.5)]"
                  initial={{ scale: 0.2 }}
                  animate={{ scale: [0.2, 1.15, 1] }}
                  transition={{ duration: 0.5, ease: "backOut" }}
                >
                  {countdown}
                </motion.span>
              </motion.div>
            )}
          </AnimatePresence>

          {/* processing */}
          {phase === "processing" && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 bg-black/60">
              <motion.div
                className="size-12 rounded-full border-4 border-pink-200/30 border-t-pink-200"
                animate={{ rotate: 360 }}
                transition={{ duration: 0.9, repeat: Infinity, ease: "linear" }}
              />
              <p className="text-lg font-semibold text-white">Processing your memories…</p>
            </div>
          )}

          {/* flash */}
          <AnimatePresence>
            {flash && (
              <motion.div
                className="absolute inset-0 bg-white"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.12 }}
              />
            )}
          </AnimatePresence>
        </motion.div>

        {/* progress thumbnails */}
        <div className="mt-5 flex justify-center gap-3" aria-label="Captured photos">
          {Array.from({ length: props.count }, (_, i) => (
            <div
              key={i}
              className="relative aspect-[4/3] w-16 overflow-hidden rounded-lg border border-white/15 bg-white/5 sm:w-20"
            >
              {photos[i] ? (
                <motion.img
                  src={photos[i]}
                  alt={`Photo ${i + 1}`}
                  className="size-full object-cover"
                  style={{ filter: filter.css === "none" ? undefined : filter.css }}
                  initial={{ scale: 1.6, opacity: 0, y: -10 }}
                  animate={{ scale: 1, opacity: 1, y: 0 }}
                  transition={{ type: "spring", stiffness: 300, damping: 20 }}
                />
              ) : (
                <span className="absolute inset-0 flex items-center justify-center text-xs text-white/30">{i + 1}</span>
              )}
            </div>
          ))}
        </div>

        {/* instruction panel + controls */}
        <div className="mt-5 flex flex-col items-center gap-4">
          <div className="glass-dark rounded-2xl px-6 py-3 text-center">
            <AnimatePresence mode="wait">
              <motion.p
                key={message}
                className="text-base font-semibold text-white/90"
                initial={{ y: 10, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                exit={{ y: -10, opacity: 0 }}
                transition={{ duration: 0.25 }}
              >
                {message}
              </motion.p>
            </AnimatePresence>
          </div>

          {phase === "ready" && (
            <motion.div
              className="flex items-center gap-3"
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
            >
              {canFlip && (
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label="Switch camera"
                  onClick={() => {
                    sfx.click();
                    flip();
                  }}
                  className="rounded-full text-white/80 hover:bg-white/10 hover:text-white"
                >
                  <SwitchCamera className="size-5" />
                </Button>
              )}
              <motion.div whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.94 }}>
                <Button
                  size="lg"
                  onClick={() => {
                    sfx.click();
                    runSession();
                  }}
                  className="h-14 rounded-full bg-gradient-to-r from-[#f5a8be] to-[#e88ea9] px-10 text-lg font-semibold text-white shadow-lg shadow-pink-500/25"
                >
                  Start shooting
                </Button>
              </motion.div>
            </motion.div>
          )}
        </div>
      </div>
    </main>
  );
}
