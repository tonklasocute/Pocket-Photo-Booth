# Pocket Photo Booth 📸

A Korean-style photo booth (Life4Cuts / Photoism vibes) in your browser.
Curtain, LED lights, countdown, flash, printer — then decorate your strip
and pin it to a virtual wooden memory desk.

## Run

```bash
npm install
npm run dev
```

Open <http://localhost:3000> and allow camera access. Deploys to Vercel as-is.

## Frame collections

12 designer templates rendered on canvas — real paper textures, print
imperfections, per-collection typography, emboss & gold foil:

Classic Korean Booth · MUJI Edition · Retro Film · Scrapbook · Museum
Collection · Travel Memories · Love Letter · Magazine Cover · Polaroid
Vintage · Cloud Dream · Dark Edition · Seasonal (auto-changes with the
calendar). Every print gets a random seed — dust, tape, doodles and ink
density differ on each strip, so no two exports are identical.

Customizable: title / subtitle / location / signature, date format, logo,
paper & frame colors, border thickness, corner radius — with a live preview.

## Features

- Curtain entrance/exit, ambient booth lighting, LED frame, voice welcome
- Front/rear camera, 2/4/6-cut strips, auto countdown with pose prompts
- 10 film filters (grain / dust / light-leak rendered on canvas)
- Realistic printing animation — drag the strip up to take it
- Stickers (drag / resize / rotate), draw (pen / marker / highlighter, undo/redo), captions
- Export PNG/JPG — re-rendered at 3× so textures stay crisp; native share, copy image/link
- Memory desk: keep, move, rotate and stack strips (persisted in localStorage)
- All sounds synthesized with Web Audio — zero binary assets

## Stack

Next.js 15 (App Router) · TypeScript · TailwindCSS 4 · Framer Motion · shadcn/ui · Lucide
