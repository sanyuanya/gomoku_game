import { createBoard, setCell, otherPlayer } from '../rules';
import { searchBestMove } from '../search';
import type { Player } from '../types';

const moves = [
  { x: 7, y: 7, player: 1 },
  { x: 6, y: 6, player: 2 },
  { x: 6, y: 5, player: 1 },
  { x: 7, y: 5, player: 2 },
  { x: 8, y: 4, player: 1 },
  { x: 8, y: 6, player: 2 },
  { x: 9, y: 7, player: 1 },
  { x: 8, y: 7, player: 2 },
  { x: 8, y: 9, player: 1 },
  { x: 7, y: 8, player: 2 },
  { x: 9, y: 6, player: 1 },
  { x: 9, y: 8, player: 2 },
  { x: 6, y: 8, player: 1 },
  { x: 11, y: 8, player: 2 },
  { x: 8, y: 8, player: 1 },
  { x: 10, y: 6, player: 2 },
  { x: 11, y: 10, player: 1 },
  { x: 12, y: 8, player: 2 },
  { x: 10, y: 8, player: 1 },
  { x: 12, y: 7, player: 2 },
  { x: 10, y: 9, player: 1 },
  { x: 11, y: 7, player: 2 },
  { x: 13, y: 9, player: 1 },
  { x: 13, y: 7, player: 2 },
  { x: 14, y: 7, player: 1 },
  { x: 11, y: 9, player: 2 },
  { x: 10, y: 10, player: 1 },
  { x: 11, y: 6, player: 2 },
  { x: 11, y: 5, player: 1 },
  { x: 14, y: 6, player: 2 },
  { x: 15, y: 5, player: 1 },
  { x: 12, y: 6, player: 2 },
  { x: 13, y: 6, player: 1 },
  { x: 12, y: 9, player: 2 },
  { x: 12, y: 5, player: 1 }
];

const checkpoints = [18, 20, 22, 24, 26, 28, 30, 32, 34];

for (const cp of checkpoints) {
  const board = createBoard(15);
  for (let i = 0; i < cp; i++) {
    const m = moves[i];
    setCell(board, 15, m.x, m.y, m.player as Player);
  }
  const lastPlayer = moves[cp - 1].player as Player;
  const toMove = otherPlayer(lastPlayer);
  const res = searchBestMove(board, 15, toMove, { maxDepth: 4, timeBudgetMs: 1200, useIterative: true, difficulty: 'hard' });
  console.log(`After move ${cp}, toMove=${toMove}: best=(${res.bestMove.x},${res.bestMove.y}) reason=${res.bestMove.reason}`);
}
