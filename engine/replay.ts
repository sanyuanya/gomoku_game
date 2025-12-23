import type { BoardSize, GameAction, Move, Player, ReplaySnapshot, SwapAction } from "./types";
import { checkWin, createBoard, getCell, indexOf, otherPlayer, setCell } from "./rules";

const toOneBased = (actions: GameAction[]) =>
  actions.map((a) => {
    if (a.kind === "swap") {
      return {
        ...a,
        a: { x: a.a.x + 1, y: a.a.y + 1 },
        b: { x: a.b.x + 1, y: a.b.y + 1 }
      } as GameAction;
    }
    return {
      ...a,
      x: a.x + 1,
      y: a.y + 1
    } as GameAction;
  });

const toZeroBased = (actions: GameAction[]) =>
  actions.map((a) => {
    if ((a as any).kind === "swap") {
      const s = a as SwapAction;
      return {
        ...s,
        a: { x: s.a.x - 1, y: s.a.y - 1 },
        b: { x: s.b.x - 1, y: s.b.y - 1 }
      } as GameAction;
    }
    const m = a as Move;
    return {
      ...m,
      x: m.x - 1,
      y: m.y - 1,
      index: m.index
    } as GameAction;
  });

export const buildSnapshot = (
  size: BoardSize,
  moves: GameAction[],
  startPlayer: Player
): ReplaySnapshot => ({
  size,
  moves: toOneBased(moves),
  startPlayer
});

export const encodeSnapshot = (snapshot: ReplaySnapshot) =>
  JSON.stringify(snapshot, null, 2);

export const decodeSnapshot = (raw: string): ReplaySnapshot => {
  const parsed = JSON.parse(raw) as ReplaySnapshot;
  if (!parsed || !parsed.size || !Array.isArray(parsed.moves)) {
    throw new Error("Invalid replay data");
  }
  return {
    size: parsed.size,
    moves: toZeroBased(parsed.moves as any),
    startPlayer: parsed.startPlayer ?? 1
  };
};

export const buildBoardFromMoves = (
  size: BoardSize,
  moves: GameAction[],
  upTo: number,
  startPlayer: Player
) => {
  const board = createBoard(size);
  let currentPlayer: Player = startPlayer;
  let lastMove: Move | null = null;
  let lastSwap: SwapAction | null = null;
  for (let i = 0; i < moves.length && i < upTo; i += 1) {
    const action = moves[i];
    if (action.kind === "swap") {
      const aIdx = indexOf(action.a.x, action.a.y, size);
      const bIdx = indexOf(action.b.x, action.b.y, size);
      const aVal = getCell(board, size, action.a.x, action.a.y);
      const bVal = getCell(board, size, action.b.x, action.b.y);
      (board as any)[aIdx] = bVal;
      (board as any)[bIdx] = aVal;
      lastSwap = action;
      lastMove = null;
      currentPlayer = otherPlayer(action.player);
      continue;
    }
    const move = action as Move;
    setCell(board, size, move.x, move.y, move.player);
    lastMove = move;
    lastSwap = null;
    currentPlayer = otherPlayer(move.player);
  }

  // If the last action was a swap, we still need to surface a winner if any.
  if (lastSwap) {
    const coords = [lastSwap.a, lastSwap.b];
    for (const coord of coords) {
      const cell = getCell(board, size, coord.x, coord.y);
      if (cell === 0) continue;
      const res = checkWin(board, size, coord.x, coord.y, cell as Player);
      if (res.winner) {
        lastMove = {
          kind: "move",
          x: coord.x,
          y: coord.y,
          player: cell as Player,
          index: indexOf(coord.x, coord.y, size),
          moveNumber: lastSwap.moveNumber,
          ts: lastSwap.ts
        };
        break;
      }
    }
  }

  return { board, currentPlayer, lastMove };
};
