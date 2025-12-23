import type { BoardSize, Direction, ThreatType } from "./types";

export const BOARD_SIZES: BoardSize[] = [15, 19];

export const DIRECTIONS: Direction[] = [
  { dx: 1, dy: 0 },
  { dx: 0, dy: 1 },
  { dx: 1, dy: 1 },
  { dx: 1, dy: -1 }
];

export const STAR_POINTS: Record<BoardSize, { x: number; y: number }[]> = {
  15: [
    { x: 3, y: 3 },
    { x: 3, y: 11 },
    { x: 7, y: 7 },
    { x: 11, y: 3 },
    { x: 11, y: 11 }
  ],
  19: [
    { x: 3, y: 3 },
    { x: 3, y: 9 },
    { x: 3, y: 15 },
    { x: 9, y: 3 },
    { x: 9, y: 9 },
    { x: 9, y: 15 },
    { x: 15, y: 3 },
    { x: 15, y: 9 },
    { x: 15, y: 15 }
  ]
};

export const THREAT_SCORES: Record<ThreatType, number> = {
  FIVE: 100000,
  LIVE_FOUR: 20000,
  RUSH_FOUR: 8000,
  LIVE_THREE: 2500,
  SLEEP_THREE: 800,
  LIVE_TWO: 200,
  SLEEP_TWO: 80
};

export const MAX_THREATS_SELF = 3;
export const MAX_THREATS_OPP = 2;

export const NEAR_DISTANCE = 2;
export const TOPK_COUNT = 7;
