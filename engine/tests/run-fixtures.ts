import fs from "fs";
import path from "path";
import { createBoard, setCell } from "../rules";
import { searchBestMove } from "../search";
import type { Player } from "../types";

const fixtures = [
  "fixture_A_open_three_end.json",
  "fixture_B_live_four_create.json",
  "fixture_C_fork_pivot.json",
  "fixture_D_vcf.json",
  "fixture_E_double_live_three.json",
  "fixture_F_double_rush_four_block.json",
  "fixture_G_block_open_four.json",
  "fixture_H_black_defense_midgame.json",
  "fixture_I_block_center_four.json"
];

const runFixture = (file: string) => {
  const raw = fs.readFileSync(path.join(__dirname, "../fixtures", file), "utf-8");
  const data = JSON.parse(raw);
  const size = data.size as 15 | 19;
  const board = createBoard(size);
  for (const move of data.moves) {
    setCell(board, size, move.x, move.y, move.player as Player);
  }
  const result = searchBestMove(board, size, data.player as Player, {
    maxDepth: 4,
    timeBudgetMs: 800,
    useIterative: true,
    difficulty: "hard"
  });
  const hit = data.expectedAny.some((c: any) => c.x === result.bestMove.x && c.y === result.bestMove.y);
  console.log(`${data.name}: bestMove=(${result.bestMove.x},${result.bestMove.y}) hit=${hit}`);
  if (!hit) {
    throw new Error(`${data.name} expected one of ${JSON.stringify(data.expectedAny)} but got ${JSON.stringify(result.bestMove)}`);
  }
};

for (const f of fixtures) runFixture(f);
console.log("All fixture checks passed");
