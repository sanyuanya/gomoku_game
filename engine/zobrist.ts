import type { BoardSize, Player } from "./types";

const xorshift32 = (seed: number) => {
  let x = seed >>> 0;
  return () => {
    x ^= x << 13;
    x ^= x >>> 17;
    x ^= x << 5;
    return x >>> 0;
  };
};

export type ZobristTable = {
  size: BoardSize;
  table: number[][];
};

export const createZobrist = (size: BoardSize, seed = 0x9e3779b9) => {
  const rand = xorshift32(seed + size);
  const table: number[][] = Array.from({ length: size * size }, () => [0, 0]);
  for (let i = 0; i < table.length; i += 1) {
    table[i][0] = rand();
    table[i][1] = rand();
  }
  return { size, table } as ZobristTable;
};

export const hashBoard = (
  board: ArrayLike<number>,
  zobrist: ZobristTable
) => {
  let hash = 0;
  for (let i = 0; i < board.length; i += 1) {
    const cell = board[i];
    if (cell === 1) hash ^= zobrist.table[i][0];
    if (cell === 2) hash ^= zobrist.table[i][1];
  }
  return hash >>> 0;
};

export const updateHash = (
  hash: number,
  index: number,
  player: Player,
  zobrist: ZobristTable
) => {
  return (hash ^ zobrist.table[index][player - 1]) >>> 0;
};
