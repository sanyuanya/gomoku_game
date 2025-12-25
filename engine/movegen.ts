import { DIRECTIONS, NEAR_DISTANCE, THREAT_SCORES, TOPK_COUNT } from "./constants";
import type { Candidate, Player, ThreatType, Difficulty } from "./types";
import { getCell, inBounds, otherPlayer } from "./rules";
import {
  evaluateMovePatternScore,
  getImmediateBlocks,
  getImmediateWins,
  getMustBlockCellsForOpponentThreat,
  getLiveFourCreationPoints,
  getLiveThreeCreationPoints,
  getLiveThreeOpenEnds,
  getFourCreationPoints,
  findForkThreatMovesForOpponent,
  findForkPivotsForOpponent,
  findDoubleLiveThreePivotsForOpponent,
  findComboThreatPivots,
  findTwoStepThreatSetups,
  countImmediateStrongThreats
} from "./threat";

type PatternEval = {
  type: ThreatType | null;
  score: number;
};

const evaluatePoint = (
  board: ArrayLike<number>,
  size: number,
  x: number,
  y: number,
  player: Player
) => {
  const result = evaluateMovePatternScore(board, size, x, y, player);
  return {
    totalScore: result.totalScore,
    best: result.best,
    secondBestScore: result.secondBestScore
  };
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

const difficultyLimit = (difficulty?: Difficulty, precise?: boolean) => {
  const base =
    difficulty === "hard" ? 18 : difficulty === "normal" ? 14 : difficulty === "easy" ? 10 : 16;
  return precise ? base + 8 : base;
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
  opts?: { difficulty?: Difficulty; limit?: number; precise?: boolean }
): Candidate[] => {
  const forced: Candidate[] = [];
  const tactical: Candidate[] = [];
  const positional: Candidate[] = [];

  let hasAnyStone = false;
  let stoneCount = 0;
  for (let i = 0; i < board.length; i += 1) {
    if (board[i] !== 0) {
      hasAnyStone = true;
      stoneCount += 1;
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
  const oppComboPivots = findComboThreatPivots(board, size, otherPlayer(player));
  const selfComboPivots = findComboThreatPivots(board, size, player);
  const oppSetupMoves = findTwoStepThreatSetups(board, size, otherPlayer(player));
  const selfSetupMoves = findTwoStepThreatSetups(board, size, player);
  const quietBoard =
    countImmediateStrongThreats(board, size, player) +
      countImmediateStrongThreats(board, size, otherPlayer(player)) ===
    0;
  const openingThreshold = size === 19 ? 14 : 10;
  const useOpeningBlockBias = quietBoard && stoneCount <= openingThreshold;

  const multiLineBlockScore = (x: number, y: number, target: Player) => {
    const scores: number[] = [];
    for (const { dx, dy } of DIRECTIONS) {
      let dirScore = 0;
      for (const sign of [1, -1]) {
        for (let step = 1; step <= 4; step += 1) {
          const nx = x + dx * step * sign;
          const ny = y + dy * step * sign;
          if (!inBounds(nx, ny, size)) break;
          const val = getCell(board, size, nx, ny);
          if (val === target) {
            dirScore += 5 - step;
            continue;
          }
          if (val !== 0) break;
        }
      }
      scores.push(dirScore);
    }
    scores.sort((a, b) => b - a);
    const topA = scores[0] ?? 0;
    const topB = scores[1] ?? 0;
    let total = topA + topB;
    if (topA >= 6 && topB >= 6) total += 4;
    return total;
  };

  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      if (getCell(board, size, x, y) !== 0) continue;
      if (!hasNeighbor(board, size, x, y, NEAR_DISTANCE)) continue;

      const selfEval = evaluatePoint(board, size, x, y, player);
      const oppEval = evaluatePoint(board, size, x, y, otherPlayer(player));
      let combinedScore =
        selfEval.totalScore + oppEval.totalScore * 0.9 + selfEval.secondBestScore * 0.3;
      let reason = reasonFromPattern(selfEval.best, oppEval.best);
      const multiLineScore = useOpeningBlockBias
        ? multiLineBlockScore(x, y, otherPlayer(player))
        : 0;
      if (multiLineScore > 0) {
        combinedScore += multiLineScore * 45;
        if (!reason && multiLineScore >= 8) reason = "block_multi_line";
      }

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

      const isSelfCombo = selfComboPivots.some((c) => c.x === x && c.y === y);
      const isOppCombo = oppComboPivots.some((c) => c.x === x && c.y === y);
      if (isSelfCombo || isOppCombo) {
        forced.push({
          ...candidate,
          score: THREAT_SCORES.LIVE_FOUR + THREAT_SCORES.LIVE_THREE - (isOppCombo ? 100 : 0),
          reason: isSelfCombo ? "four_three" : "block_four_three"
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

      const isSelfSetup = selfSetupMoves.some((c) => c.x === x && c.y === y);
      const isOppSetup = oppSetupMoves.some((c) => c.x === x && c.y === y);
      if (isSelfSetup || isOppSetup) {
        const setupBonus = isSelfSetup ? 700 : 500;
        tactical.push({
          ...candidate,
          score: combinedScore + setupBonus,
          reason: isSelfSetup ? "setup_combo" : "block_setup_combo"
        });
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

      if (multiLineScore >= 8) {
        tactical.push({
          ...candidate,
          score: combinedScore + 300,
          reason: reason ?? "block_multi_line"
        });
        continue;
      }

      positional.push(candidate);
    }
  }

  if (forced.length) {
    const sortedForced = forced.sort((a, b) => b.score - a.score);
    const limit = opts?.limit ?? difficultyLimit(opts?.difficulty, opts?.precise);
    const extraLimit = opts?.precise ? Math.min(10, limit) : Math.min(6, limit);
    const extras: Candidate[] = [];
    const used = new Set(sortedForced.map((c) => `${c.x},${c.y}`));
    const addExtras = (pool: Candidate[]) => {
      for (const move of pool) {
        if (extras.length >= extraLimit) break;
        const key = `${move.x},${move.y}`;
        if (used.has(key)) continue;
        used.add(key);
        extras.push(move);
      }
    };
    addExtras(tactical.sort((a, b) => b.score - a.score));
    addExtras(positional.sort((a, b) => b.score - a.score));
    return sortedForced.concat(extras);
  }

  const limit = opts?.limit ?? difficultyLimit(opts?.difficulty, opts?.precise);
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
