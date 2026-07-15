"use client";

import { useCallback, useEffect, useRef, useState } from "react";

export type CameraStatus = "idle" | "requesting" | "ready" | "denied" | "unavailable";
export type Facing = "user" | "environment";

export function useCamera() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [status, setStatus] = useState<CameraStatus>("idle");
  const [facing, setFacing] = useState<Facing>("user");
  const [canFlip, setCanFlip] = useState(false);

  const stop = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
  }, []);

  const start = useCallback(
    async (face: Facing = facing) => {
      stop();
      setStatus("requesting");
      if (!navigator.mediaDevices?.getUserMedia) {
        setStatus("unavailable");
        return;
      }
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: face, width: { ideal: 1280 }, height: { ideal: 960 } },
          audio: false,
        });
        streamRef.current = stream;
        setFacing(face);
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play().catch(() => {});
        }
        setStatus("ready");
        const devices = await navigator.mediaDevices.enumerateDevices();
        setCanFlip(devices.filter((d) => d.kind === "videoinput").length > 1);
      } catch (e) {
        const err = e as DOMException;
        setStatus(err.name === "NotAllowedError" || err.name === "SecurityError" ? "denied" : "unavailable");
      }
    },
    [facing, stop]
  );

  const flip = useCallback(() => start(facing === "user" ? "environment" : "user"), [facing, start]);

  useEffect(() => stop, [stop]);

  /** Grab a mirrored-if-front 4:3 JPEG frame from the live video. */
  const capture = useCallback((): string | null => {
    const video = videoRef.current;
    if (!video || video.videoWidth === 0) return null;
    const vw = video.videoWidth;
    const vh = video.videoHeight;
    const targetRatio = 4 / 3;
    let cw = vw;
    let ch = vh;
    if (vw / vh > targetRatio) cw = vh * targetRatio;
    else ch = vw / targetRatio;
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(cw);
    canvas.height = Math.round(ch);
    const ctx = canvas.getContext("2d")!;
    if (facing === "user") {
      ctx.translate(canvas.width, 0);
      ctx.scale(-1, 1);
    }
    ctx.drawImage(video, (vw - cw) / 2, (vh - ch) / 2, cw, ch, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL("image/jpeg", 0.92);
  }, [facing]);

  const getStream = useCallback(() => streamRef.current, []);

  return { videoRef, status, facing, canFlip, start, stop, flip, capture, getStream };
}
