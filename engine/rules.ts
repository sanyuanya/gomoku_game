import type { BoardSize, Cell, Coord, GameAction, Move, Player, SwapAction } from "./types";
import { DIRECTIONS } from "./constants";

export const createBoard = (size: BoardSize) => new Int8Array(size * size);

export const indexOf = (x: number, y: number, size: number) => y * size + x;

export const coordOf = (index: number, size: number): Coord => ({
  x: index % size,
  y: Math.floor(index / size)
});

export const inBounds = (x: number, y: number, size: number) =>
  x >= 0 && y >= 0 && x < size && y < size;

export const getCell = (board: ArrayLike<number>, size: number, x: number, y: number): Cell =>
  board[indexOf(x, y, size)] as Cell;

export const setCell = (
  board: Int8Array | number[],
  size: number,
  x: number,
  y: number,
  player: Cell
) => {
  board[indexOf(x, y, size)] = player;
};

export const cloneBoard = (board: ArrayLike<number>) => Int8Array.from(board);

export const otherPlayer = (player: Player): Player => (player === 1 ? 2 : 1);

export const createMove = (
  x: number,
  y: number,
  player: Player,
  size: number,
  moveNumber: number
): Move => ({
  kind: "move",
  x,
  y,
  player,
  index: indexOf(x, y, size),
  moveNumber,
  ts: Date.now()
});

export const createSwap = (
  a: Coord,
  b: Coord,
  player: Player,
  moveNumber: number
): SwapAction => ({
  kind: "swap",
  a,
  b,
  player,
  moveNumber,
  ts: Date.now()
});

export const isBoardFull = (board: ArrayLike<number>) => {
  for (let i = 0; i < board.length; i += 1) {
    if (board[i] === 0) return false;
  }
  return true;
};

const collectLine = (
  board: ArrayLike<number>,
  size: number,
  x: number,
  y: number,
  dx: number,
  dy: number,
  player: Player
) => {
  const cells: Coord[] = [{ x, y }];
  let cx = x + dx;
  let cy = y + dy;
  while (inBounds(cx, cy, size) && getCell(board, size, cx, cy) === player) {
    cells.push({ x: cx, y: cy });
    cx += dx;
    cy += dy;
  }
  cx = x - dx;
  cy = y - dy;
  const head: Coord[] = [];
  while (inBounds(cx, cy, size) && getCell(board, size, cx, cy) === player) {
    head.push({ x: cx, y: cy });
    cx -= dx;
    cy -= dy;
  }
  head.reverse();
  return head.concat(cells);
};

export const checkWin = (
  board: ArrayLike<number>,
  size: number,
  x: number,
  y: number,
  player: Player
): { winner: boolean; line: Coord[] } => {
  // Robust detection: for each direction, extend both ways and count contiguous stones.
  for (const { dx, dy } of DIRECTIONS) {
    const cells: Coord[] = [{ x, y }];

    let cx = x + dx;
    let cy = y + dy;
    while (inBounds(cx, cy, size) && getCell(board, size, cx, cy) === player) {
      cells.push({ x: cx, y: cy });
      cx += dx;
      cy += dy;
    }

    cx = x - dx;
    cy = y - dy;
    while (inBounds(cx, cy, size) && getCell(board, size, cx, cy) === player) {
      cells.unshift({ x: cx, y: cy });
      cx -= dx;
      cy -= dy;
    }

    if (cells.length >= 5) {
      return { winner: true, line: cells };
    }
  }
  return { winner: false, line: [] };
};

export const getBoundingBox = (moves: Move[], size: number) => {
  if (!moves.length) {
    return { minX: 0, minY: 0, maxX: size - 1, maxY: size - 1 };
  }
  let minX = size - 1;
  let minY = size - 1;
  let maxX = 0;
  let maxY = 0;
  for (const move of moves) {
    if (move.x < minX) minX = move.x;
    if (move.y < minY) minY = move.y;
    if (move.x > maxX) maxX = move.x;
    if (move.y > maxY) maxY = move.y;
  }
  return { minX, minY, maxX, maxY };
};
