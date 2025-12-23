import fs from "fs";
import path from "path";
import { createBoard, setCell } from "../rules";
import type { Player } from "../types";
import { getLiveFourCreationPoints } from "../threat";
import { generateCandidates } from "../movegen";

const run = () => {
  const raw = fs.readFileSync(path.join(__dirname, "../fixtures/livefour_miss.json"), "utf-8");
  const fixture = JSON.parse(raw);
  const size = fixture.size as 15 | 19;
  const board = createBoard(size);
  for (const move of fixture.moves) {
    setCell(board, size, move.x, move.y, move.player as Player);
  }
  const liveFours = getLiveFourCreationPoints(board, size, 1 as Player);
  const hasExpected = liveFours.some((c) => c.x === fixture.expectedDefense.x && c.y === fixture.expectedDefense.y);
  console.log("live four creation points", liveFours, "has expected", hasExpected);

  const forced = generateCandidates(board, size, fixture.player as Player, { difficulty: "hard" }).filter((c) => c.reason?.includes("live_four"));
  const forcedHas = forced.some((c) => c.x === fixture.expectedDefense.x && c.y === fixture.expectedDefense.y);
  console.log("forced candidates (live_four*)", forced, "contains expected", forcedHas);
};

run();
