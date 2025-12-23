export type Player = 1 | 2;
export type Cell = 0 | Player;
export type BoardSize = 15 | 19;

export type Coord = { x: number; y: number };

export type Move = {
  kind?: "move";
  x: number;
  y: number;
  player: Player;
  index: number;
  moveNumber: number;
  ts: number;
};

export type MoveAction = Move & { kind?: "move" };

export type SwapAction = {
  kind: "swap";
  a: Coord;
  b: Coord;
  player: Player;
  moveNumber: number;
  ts: number;
};

export type GameAction = MoveAction | SwapAction;

export type GameMode = "human-bot" | "human-human" | "practice";
export type Difficulty = "easy" | "normal" | "hard";

export type ThreatType =
  | "FIVE"
  | "LIVE_FOUR"
  | "RUSH_FOUR"
  | "LIVE_THREE"
  | "SLEEP_THREE"
  | "LIVE_TWO"
  | "SLEEP_TWO";

export type ThreatRoute = {
  player: Player;
  type: ThreatType;
  lineCells: Coord[];
  mustBlockCells: Coord[];
  score: number;
  direction: Direction;
};

export type Direction = { dx: number; dy: number };

export type Candidate = {
  x: number;
  y: number;
  score: number;
  reason?: string;
};

export type BotResult = {
  bestMove: Candidate;
  topK: Candidate[];
  keyThreats: ThreatRoute[];
  depth: number;
  nodes: number;
  durationMs: number;
};

export type Settings = {
  boardSize: BoardSize;
  mode: GameMode;
  difficulty: Difficulty;
  firstPlayer: Player;
  humanPlayer: Player;
  forbiddenMoves: boolean;
  showThreats: boolean;
  timeBudgetMs: number;
};

export type ReplaySnapshot = {
  size: BoardSize;
  moves: GameAction[];
  startPlayer: Player;
};

export type ReplayState = {
  pointer: number;
  isAuto: boolean;
  speedMs: number;
};

export type BotRequest = {
  board: number[];
  size: BoardSize;
  player: Player;
  difficulty: Difficulty;
  timeBudgetMs: number;
};
