# Offline Gomoku

An offline, self-contained Gomoku (five-in-a-row) web app built with Next.js App Router, TypeScript, Tailwind, Canvas2D, and a Web Worker bot. No runtime network access, no external APIs, and no CDN assets.

## Setup

```bash
npm install
npm run dev
```

Open `http://localhost:3000`.

## Offline Guarantee

- All assets are local.
- No external APIs or CDN calls at runtime.
- The AI runs fully in a Web Worker.

## AI Overview

- **Easy**: rule-based top picks with forced win/block pre-check.
- **Normal**: alpha-beta (depth 2-3) + forced tactics pre-search.
- **Hard**: iterative deepening alpha-beta with time budget (slider), killer/history ordering, quiescence, VCF rush-four probe, Zobrist TT, and exact endgame search when few empties remain.
- **Precise mode (toggle)**: deeper/wider search, threat-line extensions near the horizon, a defensive VCF/VCT safety scan, larger quiescence set, and a slightly larger exact-endgame window. It increases thinking time and is still bounded (not full-board exhaustive).
- **Precision depth + Safety scan depth sliders** (shown when Precise mode is on) let you raise search depth and how far the bot looks for forced losses (e.g. 10 = ~5-ply defensive scan).
- Candidate generation is layered: forced (win/block/four), tactical (live/jump three, combo setups), then best-scored within distance ≤2. In quiet openings it adds a small bias to block multi-direction lines.

The bot returns bestMove, topK (with reasons like `block_five`, `create_live_four`, `vcf_four`), key threat routes, and an approximate main line shown in the Analysis panel.

## Controls

- Click/tap to place stones.
- **R**: restart
- **U**: undo
- **Space**: toggle right panel

## Replay & JSON

- Export: generate JSON from the Replay panel.
- Import: paste JSON to load a replay.
- Supports step-by-step playback and autoplay.

## Known Limitations

- Renju-style forbidden moves are **not enforced**. The toggle is present but intentionally disabled.
- Threat routes are heuristic and optimized for clarity, not a full tactical proof search.
- The evaluation is tuned for speed, not tournament strength.
- VCT search is simplified (VCF + four-three awareness); pathological ladder traps may still slip through.
- Precise mode expands search but does not brute-force the full early game tree.

## Regression snippets (manual)

See `engine/fixtures/regressions.json` for 6 frozen scenarios (win-in-one, block-five, block live-four, rush-four VCF start, four-three defense, four-three pivot). Load moves manually via Replay import/export or code to ensure the bot chooses any in `expectedAny`.
