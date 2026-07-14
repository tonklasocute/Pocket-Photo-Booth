export type PhotoCount = 2 | 4 | 6;

export type Filter = {
  id: string;
  name: string;
  /** CSS/canvas filter string — used for live preview and strip render */
  css: string;
  /** 0..1 monochrome noise strength */
  grain?: number;
  dust?: boolean;
  lightLeak?: boolean;
};

export type Pose = { label: string; emoji: string };

export const FILTERS: Filter[] = [
  { id: "none", name: "Original", css: "none" },
  { id: "vintage", name: "Vintage", css: "sepia(0.35) contrast(1.05) saturate(0.85) brightness(1.02)", grain: 0.07, dust: true },
  { id: "kodak", name: "Kodak", css: "contrast(1.12) saturate(1.3) brightness(1.03) sepia(0.14) hue-rotate(-8deg)", grain: 0.04 },
  { id: "fuji", name: "Fuji", css: "saturate(1.12) contrast(0.98) brightness(1.06) hue-rotate(6deg)", grain: 0.03 },
  { id: "warm", name: "Warm", css: "sepia(0.28) saturate(1.15) brightness(1.06)" },
  { id: "dream", name: "Dream", css: "brightness(1.1) contrast(0.88) saturate(1.08) blur(0.6px)" },
  { id: "bw", name: "B & W", css: "grayscale(1) contrast(1.1)" },
  { id: "grain", name: "Grain", css: "contrast(1.04) brightness(1.02)", grain: 0.16 },
  { id: "dust", name: "Dust", css: "sepia(0.2) contrast(1.02)", grain: 0.05, dust: true },
  { id: "leak", name: "Light Leak", css: "saturate(1.1) brightness(1.04) sepia(0.1)", lightLeak: true },
];

export const POSES: Pose[] = [
  { label: "Smile!", emoji: "😊" },
  { label: "Peace!", emoji: "✌️" },
  { label: "Heart!", emoji: "❤️" },
  { label: "Funny face!", emoji: "🤪" },
  { label: "Look left!", emoji: "👈" },
  { label: "Look right!", emoji: "👉" },
  { label: "Hands up!", emoji: "🙌" },
  { label: "Wink!", emoji: "😉" },
  { label: "Blow a kiss!", emoji: "😘" },
];

export const STICKERS = ["❤️", "🎀", "✨", "🌸", "🐱", "⭐", "☁️", "🍓", "🐻", "💖", "🌈", "🫧"];

export const CAPTION_FONTS = [
  { id: "cute", name: "Cute", css: "var(--font-cute)" },
  { id: "hand", name: "Handwritten", css: "var(--font-hand)" },
  { id: "serif", name: "Serif", css: "var(--font-serif)" },
  { id: "type", name: "Typewriter", css: "var(--font-type)" },
];

export const filterById = (id: string) => FILTERS.find((f) => f.id === id) ?? FILTERS[0];

export function randomPoses(count: number): Pose[] {
  const pool = [...POSES];
  const out: Pose[] = [];
  for (let i = 0; i < count; i++) {
    if (pool.length === 0) pool.push(...POSES);
    out.push(pool.splice(Math.floor(Math.random() * pool.length), 1)[0]);
  }
  return out;
}
