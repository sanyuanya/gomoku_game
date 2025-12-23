# AGENTS.md — Offline Gomoku (Five-in-a-row) + Agent Bot + Threat Lines

## 0) Role
You are a senior full-stack engineer focusing on frontend game architecture, AI search, and clean UI/UX.
Goal: generate a complete, runnable, offline web game project: Gomoku with an Agent Bot, threat-line overlays, hints, replay, and responsive UI.

## 1) Hard Constraints
- NO network required at runtime. No external APIs. No remote assets. No CDN.
- Must run locally with `npm install && npm run dev` (or `pnpm` equivalent).
- Use Next.js (App Router) + React + TypeScript.
- Rendering: Canvas 2D (single canvas) + overlay UI.
- Bot runs in Web Worker to keep UI smooth.
- Provide a clear README with run steps.
- Code must be complete and consistent; avoid placeholders.

## 2) Target Experience
A polished Gomoku game that feels “smart”:
- Modes: Human vs Bot, Human vs Human (local), Practice.
- Board: 15x15 default; optional 19x19 toggle.
- Visual aids:
  - grid + star points (15x15 common star points)
  - hover ghost piece
  - last-move marker
  - winning line highlight (when game ends)
  - “Possible win routes” overlay: show top threats lines for both sides (limited count to avoid clutter)
- Analysis panel:
  - Bot Top-K candidate moves with scores
  - Threat list (e.g., live-four, rush-four, live-three)
- Replay:
  - move list
  - step forward/back
  - autoplay replay
  - export/import JSON (offline)

## 3) Tech Stack
- Next.js (latest stable) + React + TypeScript
- TailwindCSS + shadcn/ui (bundled locally)
- Canvas 2D for board
- Web Worker for AI
- No backend

## 4) Project Structure (must match)
.
├─ app/
│  ├─ layout.tsx
│  ├─ page.tsx                 # routes to /game
│  └─ game/
│     └─ page.tsx              # main game page
├─ components/
│  ├─ GameShell.tsx            # layout: board + panels
│  ├─ BoardCanvas.tsx          # canvas rendering & pointer handling
│  ├─ SidePanel.tsx            # controls, status, toggles
│  ├─ AnalysisPanel.tsx        # bot candidates, threat list
│  ├─ ReplayPanel.tsx          # move list, scrubber
│  └─ ui/                      # shadcn components used (local)
├─ engine/
│  ├─ types.ts                 # core types
│  ├─ constants.ts             # board size, directions, patterns
│  ├─ rules.ts                 # place/undo, win detect
│  ├─ threat.ts                # pattern scan -> threat routes
│  ├─ eval.ts                  # evaluation scoring
│  ├─ movegen.ts               # candidate generation & pruning
│  ├─ zobrist.ts               # hashing for transposition table
│  ├─ search.ts                # alpha-beta + iterative deepening
│  └─ replay.ts                # export/import, replay utils
├─ worker/
│  └─ ai.worker.ts             # bot worker entry
├─ public/
│  └─ (no remote assets)
├─ styles/
│  └─ globals.css
├─ README.md
├─ package.json
├─ tsconfig.json
└─ tailwind.config.ts

## 5) Game Rules
- Standard Gomoku: first to make 5 in a row wins.
- Provide an option toggle for “Renju-like forbidden moves (optional)”:
  - if enabled: Black forbidden patterns (double-three / double-four / overline)
  - Implement as a feature flag; default OFF (standard Gomoku).
If forbidden moves are too heavy, implement only standard Gomoku, but keep the UI toggle stubbed OFF with explanation in README.

## 6) Bot Requirements (Agent Bot)
- Must support difficulty levels:
  - Easy: rule-based + immediate win/block + shallow score
  - Normal: alpha-beta depth 2–3
  - Hard: alpha-beta depth 4–6 with iterative deepening within a time budget
- Must run inside Web Worker.
- Must return:
  - bestMove: {x,y}
  - topK: list of {x,y,score,reason?}
  - keyThreats: list of threat routes for overlay
- Must include candidate pruning:
  - only consider empty cells within distance <=2 from existing stones
  - always include forced moves: immediate win, must-block opponent win, creating live-four/rush-four
- Must use:
  - evaluation patterns weights (live-four > rush-four > live-three > sleep-three > live-two)
  - transposition table (Zobrist hash)

## 7) Threat Lines / “Possible Winning Routes”
Implement `threat.ts` that scans:
- 4 directions (horizontal, vertical, diag, anti-diag)
- For each empty cell, evaluate pattern impact for both sides
- Output `ThreatRoute` objects:
  - player, type (FIVE/LIVE_FOUR/RUSH_FOUR/LIVE_THREE/SLEEP_THREE/…)
  - lineCells: coordinates list
  - mustBlockCells: coordinates list (0–2 points)
  - score
UI display rules:
- Show max 3 routes for current player and 2 routes for opponent.
- Use different line styles for route types (solid vs dashed).
- Mark must-block cells with small markers.
- Never clutter the board.

## 8) UI / UX Requirements
- Responsive:
  - Desktop: left controls + center board + right analysis/replay collapsible
  - Mobile: top bar + full board + bottom controls; analysis/replay in drawer
- Interaction:
  - Click/tap to place stone
  - Hover ghost on desktop
  - Pinch/zoom optional (nice-to-have). If too complex, support drag-to-pan + zoom slider.
- States:
  - current turn, winner, draw, bot thinking indicator
  - disable input while bot thinking (except pause/cancel)
- Provide keyboard shortcuts on desktop:
  - R: restart
  - U: undo (if allowed)
  - Space: toggle analysis panel

## 9) Persistence (Offline)
- Save last game and settings in localStorage.
- Replay export/import as JSON.

## 10) Deliverables Checklist (must complete)
- [ ] Working game with all modes
- [ ] Bot in worker with difficulty
- [ ] Threat overlay lines + must-block markers
- [ ] Replay controls + export/import
- [ ] Clean UI + responsive layout
- [ ] README with setup + how AI works (brief) + known limits
- [ ] No runtime network usage

## 11) Implementation Notes
- Keep engine pure and testable (no DOM in engine).
- Avoid heavy dependencies; prefer simple utilities.
- Keep performance: scanning should be incremental where possible; if not, optimize with bounding box of active area.
- Ensure TypeScript strict mode passes.

## 12) Output Rules
- Provide full source code for all files in the specified structure.
- Do not omit files that are referenced.
- Ensure it compiles and runs.
