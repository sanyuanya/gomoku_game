import { findForkThreatMovesForOpponent, getLiveFourCreationPoints } from "../threat";
import { createBoard, setCell } from "../rules";
import type { Player } from "../types";
import fs from "fs";
import path from "path";

const run = () => {
  const raw = fs.readFileSync(path.join(__dirname, "../fixtures/fork_regression.json"), "utf-8");
  const fixture = JSON.parse(raw);
  const size = fixture.size as 15 | 19;
  const board = createBoard(size);
  for (const move of fixture.moves) {
    setCell(board, size, move.x, move.y, move.player as Player);
  }
  const forkMoves = findForkThreatMovesForOpponent(board, size, fixture.player as Player);
  const forkHit = forkMoves.some((c) => c.x === fixture.forkPoint.x && c.y === fixture.forkPoint.y);
  console.log("fork detection", forkMoves, "hit", forkHit);

  // simulate opponent placing fork point
  setCell(board, size, fixture.forkPoint.x, fixture.forkPoint.y, (fixture.player === 1 ? 2 : 1) as Player);
  const liveFourPoints = getLiveFourCreationPoints(board, size, (fixture.player === 1 ? 2 : 1) as Player);
  const expectedAllFound = fixture.expectedLiveFourPoints.every((p: any) =>
    liveFourPoints.some((c) => c.x === p.x && c.y === p.y)
  );
  console.log("live four points", liveFourPoints, "expected found", expectedAllFound);
};

run();
