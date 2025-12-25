import { createBoard, setCell, getCell } from "../rules";
import { searchBestMove } from "../search";
import type { Player } from "../types";

const size = 15;
const moves: Array<{ x: number; y: number; player: Player }> = [
  { x: 8, y: 8, player: 1 },
  { x: 7, y: 6, player: 2 },
  { x: 7, y: 7, player: 1 },
  { x: 9, y: 9, player: 2 },
  { x: 8, y: 6, player: 1 },
  { x: 8, y: 9, player: 2 },
  { x: 7, y: 9, player: 1 },
  { x: 9, y: 7, player: 2 },
  { x: 6, y: 8, player: 1 },
  { x: 9, y: 5, player: 2 },
  { x: 9, y: 8, player: 1 },
  { x: 7, y: 8, player: 2 },
  { x: 5, y: 7, player: 1 },
  { x: 8, y: 10, player: 2 },
  { x: 6, y: 7, player: 1 },
  { x: 4, y: 7, player: 2 },
  { x: 5, y: 6, player: 1 },
  { x: 5, y: 9, player: 2 },
  { x: 6, y: 6, player: 1 },
  { x: 5, y: 5, player: 2 },
  { x: 6, y: 9, player: 1 },
  { x: 6, y: 5, player: 2 },
  { x: 6, y: 10, player: 1 }
];

const SEARCH_OPTS = {
  maxDepth: 10,
  timeBudgetMs: 3000,
  useIterative: true,
  difficulty: "hard" as const,
  precise: true,
  safetyDepth: 10
};

const analyzeWhiteMoves = () => {
  const board = createBoard(size);
  let firstDeviation: { moveNumber: number; actual: string; best: string } | null = null;
  for (let i = 0; i < moves.length; i += 1) {
    const move = moves[i];
    if (move.player === 2) {
      const result = searchBestMove(board, size, 2, SEARCH_OPTS);
      const rank = result.topK.findIndex((m) => m.x === move.x && m.y === move.y);
      const rankLabel = rank === -1 ? "not in topK" : `#${rank + 1}`;
      const topK = result.topK
        .slice(0, 6)
        .map((m) => `(${m.x},${m.y})${m.reason ? ":" + m.reason : ""}`);
      const pv = result.pv ? result.pv.map((s) => `${s.player === 1 ? "B" : "W"}(${s.x},${s.y})`).join(" ") : "";
      const isDeviation = move.x !== result.bestMove.x || move.y !== result.bestMove.y;
      if (!firstDeviation && isDeviation) {
        firstDeviation = {
          moveNumber: i + 1,
          actual: `(${move.x},${move.y})`,
          best: `(${result.bestMove.x},${result.bestMove.y})`
        };
      }
      console.log(
        `[white move ${i + 1}] actual=(${move.x},${move.y}) rank=${rankLabel} best=(${result.bestMove.x},${result.bestMove.y}) ${result.bestMove.reason ?? ""}`
      );
      console.log(`  topK: ${topK.join(" ")}`);
      if (pv) console.log(`  pv: ${pv}`);
    }
    setCell(board, size, move.x, move.y, move.player);
  }
  if (firstDeviation) {
    console.log(
      `\n[first deviation] move ${firstDeviation.moveNumber}: actual=${firstDeviation.actual} best=${firstDeviation.best}\n`
    );
  } else {
    console.log("\n[first deviation] none within topK\n");
  }
};

analyzeWhiteMoves();
