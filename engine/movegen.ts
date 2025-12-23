import { DIRECTIONS, NEAR_DISTANCE, THREAT_SCORES, TOPK_COUNT } from "./constants";
import type { Candidate, Player, ThreatType, Difficulty } from "./types";
import { getCell, inBounds, otherPlayer } from "./rules";
import {
  getImmediateBlocks,
  getImmediateWins,
  getMustBlockCellsForOpponentThreat,
  getLiveFourCreationPoints,
  getLiveThreeCreationPoints,
  getLiveThreeOpenEnds,
  getFourCreationPoints,
  findForkThreatMovesForOpponent,
  findForkPivotsForOpponent,
  findDoubleLiveThreePivotsForOpponent
} from "./threat";

const countDir = (
  board: ArrayLike<number>,
  size: number,
  x: number,
  y: number,
  dx: number,
  dy: number,
  player: Player
) => {
  let count = 0;
  let cx = x + dx;
  let cy = y + dy;
  while (inBounds(cx, cy, size) && getCell(board, size, cx, cy) === player) {
    count += 1;
    cx += dx;
    cy += dy;
  }
  return count;
};

const openEnd = (
  board: ArrayLike<number>,
  size: number,
  x: number,
  y: number,
  dx: number,
  dy: number,
  count: number
) => {
  const cx = x + (count + 1) * dx;
  const cy = y + (count + 1) * dy;
  if (!inBounds(cx, cy, size)) return false;
  return getCell(board, size, cx, cy) === 0;
};

const classify = (
  total: number,
  openEnds: number
): ThreatType | null => {
  if (total >= 5) return "FIVE";
  if (total === 4 && openEnds === 2) return "LIVE_FOUR";
  if (total === 4 && openEnds === 1) return "RUSH_FOUR";
  if (total === 3 && openEnds === 2) return "LIVE_THREE";
  if (total === 3 && openEnds === 1) return "SLEEP_THREE";
  if (total === 2 && openEnds === 2) return "LIVE_TWO";
  if (total === 2 && openEnds === 1) return "SLEEP_TWO";
  return null;
};

type PatternEval = {
  type: ThreatType | null;
  score: number;
  openEnds: number;
  total: number;
};

const evaluatePoint = (
  board: ArrayLike<number>,
  size: number,
  x: number,
  y: number,
  player: Player
) => {
  let totalScore = 0;
  let best: PatternEval = { type: null, score: 0, openEnds: 0, total: 0 };
  let secondBestScore = 0;
  for (const { dx, dy } of DIRECTIONS) {
    const left = countDir(board, size, x, y, -dx, -dy, player);
    const right = countDir(board, size, x, y, dx, dy, player);
    const total = left + right + 1;
    const openEnds =
      (openEnd(board, size, x, y, -dx, -dy, left) ? 1 : 0) +
      (openEnd(board, size, x, y, dx, dy, right) ? 1 : 0);
    const type = classify(total, openEnds);
    const score = type ? THREAT_SCORES[type] : 0;
    totalScore += score;
    if (score > best.score) {
      secondBestScore = best.score;
      best = { type, score, openEnds, total };
    } else if (score > secondBestScore) {
      secondBestScore = score;
    }
  }
  return { totalScore, best, secondBestScore };
};

const hasNeighbor = (
  board: ArrayLike<number>,
  size: number,
  x: number,
  y: number,
  distance: number
) => {
  for (let dy = -distance; dy <= distance; dy += 1) {
    for (let dx = -distance; dx <= distance; dx += 1) {
      if (dx === 0 && dy === 0) continue;
      const nx = x + dx;
      const ny = y + dy;
      if (!inBounds(nx, ny, size)) continue;
      if (getCell(board, size, nx, ny) !== 0) return true;
    }
  }
  return false;
};

const difficultyLimit = (difficulty?: Difficulty) => {
  if (difficulty === "hard") return 18;
  if (difficulty === "normal") return 14;
  if (difficulty === "easy") return 10;
  return 16;
};

const reasonFromPattern = (
  self: PatternEval,
  opp: PatternEval
) => {
  if (self.type === "FIVE") return "win_now";
  if (opp.type === "FIVE") return "block_five";
  if (self.type === "LIVE_FOUR") return "create_live_four";
  if (self.type === "RUSH_FOUR") return "create_rush_four";
  if (opp.type === "LIVE_FOUR") return "block_live_four";
  if (opp.type === "RUSH_FOUR") return "block_rush_four";
  if (self.type === "LIVE_THREE") return "live_three";
  if (self.type === "SLEEP_THREE") return "jump_three";
  if (opp.type === "LIVE_THREE") return "block_live_three";
  if (opp.type === "SLEEP_THREE") return "block_jump_three";
  return undefined;
};

export const generateCandidates = (
  board: ArrayLike<number>,
  size: number,
  player: Player,
  opts?: { difficulty?: Difficulty; limit?: number }
): Candidate[] => {
  const forced: Candidate[] = [];
  const tactical: Candidate[] = [];
  const positional: Candidate[] = [];

  let hasAnyStone = false;
  for (let i = 0; i < board.length; i += 1) {
    if (board[i] !== 0) {
      hasAnyStone = true;
      break;
    }
  }

  if (!hasAnyStone) {
    const mid = Math.floor(size / 2);
    const openings: Candidate[] = [];
    for (let dy = -1; dy <= 1; dy += 1) {
      for (let dx = -1; dx <= 1; dx += 1) {
        const x = mid + dx;
        const y = mid + dy;
        if (!inBounds(x, y, size)) continue;
        openings.push({ x, y, score: 0, reason: "opening" });
      }
    }
    return openings;
  }

  const immediateWins = getImmediateWins(board, size, player);
  const immediateBlocks = getImmediateBlocks(board, size, player);
  const mustBlocks = getMustBlockCellsForOpponentThreat(board, size, player);
  const oppLiveFourStarts = getLiveFourCreationPoints(board, size, otherPlayer(player));
  const oppFourStarts = getFourCreationPoints(board, size, otherPlayer(player));
  const oppLiveThreeStarts = getLiveThreeCreationPoints(board, size, otherPlayer(player));
  const oppLiveThreeEnds = getLiveThreeOpenEnds(board, size, otherPlayer(player));
  const forkBlocks = findForkThreatMovesForOpponent(board, size, player);
  const forkPivots = findForkPivotsForOpponent(board, size, player);
  const doubleLiveThreePivots = findDoubleLiveThreePivotsForOpponent(board, size, player);

  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      if (getCell(board, size, x, y) !== 0) continue;
      if (!hasNeighbor(board, size, x, y, NEAR_DISTANCE)) continue;

      const selfEval = evaluatePoint(board, size, x, y, player);
      const oppEval = evaluatePoint(board, size, x, y, otherPlayer(player));
      const combinedScore =
        selfEval.totalScore + oppEval.totalScore * 0.9 + selfEval.secondBestScore * 0.3;
      const reason = reasonFromPattern(selfEval.best, oppEval.best);

      const candidate: Candidate = {
        x,
        y,
        score: combinedScore,
        reason
      };

      const selfType = selfEval.best.type;
      const oppType = oppEval.best.type;
      const isImmediateWinCell = immediateWins.some((c) => c.x === x && c.y === y);
      const isImmediateBlockCell = immediateBlocks.some((c) => c.x === x && c.y === y);

      if (isImmediateWinCell || selfType === "FIVE") {
        forced.push({ ...candidate, score: THREAT_SCORES.FIVE, reason: "win_now" });
        continue;
      }
      if (isImmediateBlockCell || oppType === "FIVE") {
        forced.push({ ...candidate, score: THREAT_SCORES.FIVE - 1, reason: "block_five" });
        continue;
      }

      const isSelfFour = selfType === "LIVE_FOUR" || selfType === "RUSH_FOUR";
      const isOppFour = oppType === "LIVE_FOUR" || oppType === "RUSH_FOUR";
      if (isSelfFour || isOppFour) {
        forced.push({
          ...candidate,
          score: isSelfFour ? THREAT_SCORES.LIVE_FOUR : THREAT_SCORES.LIVE_FOUR - 10,
          reason: isSelfFour ? (selfType === "LIVE_FOUR" ? "create_live_four" : "create_rush_four") : oppType === "LIVE_FOUR" ? "block_live_four" : "block_rush_four"
        });
        continue;
      }

      if (mustBlocks.some((c) => c.x === x && c.y === y)) {
        forced.push({ ...candidate, score: THREAT_SCORES.LIVE_FOUR - 5, reason: "must_block" });
        continue;
      }

      if (oppLiveFourStarts.some((c) => c.x === x && c.y === y)) {
        forced.push({ ...candidate, score: THREAT_SCORES.LIVE_FOUR - 6, reason: "block_live_four_setup" });
        continue;
      }

      if (oppFourStarts.some((c) => c.x === x && c.y === y)) {
        forced.push({ ...candidate, score: THREAT_SCORES.RUSH_FOUR, reason: "block_four_setup" });
        continue;
      }

      if (oppLiveThreeEnds.some((c) => c.x === x && c.y === y)) {
        forced.push({ ...candidate, score: THREAT_SCORES.LIVE_THREE, reason: "block_live_three_end" });
        continue;
      }

      if (oppLiveThreeStarts.length && oppLiveThreeStarts.some((c) => c.x === x && c.y === y)) {
        forced.push({ ...candidate, score: THREAT_SCORES.LIVE_THREE, reason: "block_live_three_setup" });
        continue;
      }

      if (forkBlocks.some((c) => c.x === x && c.y === y)) {
        forced.push({ ...candidate, score: THREAT_SCORES.LIVE_FOUR - 8, reason: "fork_block" });
        continue;
      }

      if (forkPivots.some((c) => c.x === x && c.y === y)) {
        forced.push({ ...candidate, score: THREAT_SCORES.LIVE_FOUR - 9, reason: "fork_pivot_block" });
        continue;
      }

      if (doubleLiveThreePivots.some((c) => c.x === x && c.y === y)) {
        forced.push({ ...candidate, score: THREAT_SCORES.LIVE_THREE + 100, reason: "block_double_live_three_pivot" });
        continue;
      }

      const isTacticalSelf = selfType === "LIVE_THREE" || selfType === "SLEEP_THREE";
      const isTacticalOpp = oppType === "LIVE_THREE" || oppType === "SLEEP_THREE";
      const hasDoubleThreat = selfEval.secondBestScore >= THREAT_SCORES.SLEEP_THREE;
      if (isTacticalSelf || isTacticalOpp || hasDoubleThreat) {
        tactical.push({
          ...candidate,
          score: combinedScore + (hasDoubleThreat ? 400 : 0),
          reason: reason ?? (hasDoubleThreat ? "four_three" : isTacticalSelf ? "live_three" : "block_live_three")
        });
        continue;
      }

      positional.push(candidate);
    }
  }

  if (forced.length) {
    return forced.sort((a, b) => b.score - a.score);
  }

  const limit = opts?.limit ?? difficultyLimit(opts?.difficulty);
  const sortedTactical = tactical.sort((a, b) => b.score - a.score);
  const sortedPositional = positional.sort((a, b) => b.score - a.score);

  const final: Candidate[] = [];
  for (const move of sortedTactical) {
    if (final.length >= limit) break;
    final.push(move);
  }
  for (const move of sortedPositional) {
    if (final.length >= limit) break;
    final.push(move);
  }

  const needed = Math.max(limit, TOPK_COUNT);
  if (final.length < needed && sortedPositional.length > final.length) {
    return final.concat(sortedPositional.slice(final.length, needed));
  }
  return final;
};
