import type { BoardSize, Candidate, Difficulty, Player, PVStep } from "./types";
import { generateCandidates } from "./movegen";
import { evaluateBoard } from "./eval";
import { createZobrist, hashBoard, updateHash } from "./zobrist";
import { indexOf, otherPlayer, inBounds, getCell } from "./rules";
import {
  getImmediateBlocks,
  getImmediateWins,
  getMustBlockCellsForOpponentThreat,
  getLiveFourCreationPoints,
  getFourCreationPoints,
  getLiveThreeCreationPoints,
  getLiveThreeOpenEnds,
  findForkThreatMovesForOpponent,
  findForkPivotsForOpponent,
  findDoubleLiveThreePivotsForOpponent,
  findComboThreatPivots,
  findTwoStepThreatSetups,
  evaluateMovePatternScore,
  countImmediateStrongThreats,
  scanThreatRoutes
} from "./threat";
import { DIRECTIONS, THREAT_SCORES } from "./constants";

const WIN_SCORE = 1000000;
const TURN_SALT = [0x9e3779b9, 0x85ebca6b];
const ENDGAME_EMPTY_LIMIT = 10;

type TTEntry = {
  depth: number;
  score: number;
  flag: "exact" | "lower" | "upper";
  best?: Candidate;
};

type SearchOptions = {
  maxDepth: number;
  timeBudgetMs?: number;
  useIterative?: boolean;
  difficulty?: Difficulty;
  precise?: boolean;
  safetyDepth?: number;
};

const isImmediateWin = (
  board: ArrayLike<number>,
  size: number,
  x: number,
  y: number,
  player: Player
) => {
  for (const { dx, dy } of DIRECTIONS) {
    let count = 1;
    let cx = x + dx;
    let cy = y + dy;
    while (inBounds(cx, cy, size) && getCell(board, size, cx, cy) === player) {
      count += 1;
      cx += dx;
      cy += dy;
    }
    cx = x - dx;
    cy = y - dy;
    while (inBounds(cx, cy, size) && getCell(board, size, cx, cy) === player) {
      count += 1;
      cx -= dx;
      cy -= dy;
    }
    if (count >= 5) return true;
  }
  return false;
};

const classifyFour = (
  board: ArrayLike<number>,
  size: number,
  x: number,
  y: number,
  player: Player
) => {
  const result = evaluateMovePatternScore(board, size, x, y, player);
  return result.best.type === "LIVE_FOUR" || result.best.type === "RUSH_FOUR";
};

const isThreateningThree = (
  board: ArrayLike<number>,
  size: number,
  x: number,
  y: number,
  player: Player
) => {
  const result = evaluateMovePatternScore(board, size, x, y, player);
  return result.best.type === "LIVE_THREE";
};

export const searchBestMove = (
  boardInput: ArrayLike<number>,
  size: BoardSize,
  player: Player,
  options: SearchOptions
) => {
  const start = performance.now();
  const board = Int8Array.from(boardInput);
  const zobrist = createZobrist(size);
  const table = new Map<number, TTEntry>();
  const killerMoves: Array<Array<Candidate | null>> = Array.from(
    { length: 32 },
    () => [null, null]
  );
  const history: number[] = new Array(size * size).fill(0);
  let hash = hashBoard(board, zobrist);
  let nodes = 0;
  let aborted = false;
  const deadline = options.timeBudgetMs ? start + options.timeBudgetMs : Infinity;
  let emptyCount = 0;
  for (let i = 0; i < board.length; i += 1) {
    if (board[i] === 0) emptyCount += 1;
  }
  const baseEndgameLimit =
    size === 19 ? Math.min(ENDGAME_EMPTY_LIMIT, 8) : ENDGAME_EMPTY_LIMIT;
  const endgameLimit = options.precise ? baseEndgameLimit + 2 : baseEndgameLimit;
  let endgameAborted = false;

  const orderMoves = (moves: Candidate[], ply: number) => {
    return moves
      .map((m) => {
        const idx = indexOf(m.x, m.y, size);
        const killerBonus =
          (killerMoves[ply]?.[0]?.x === m.x && killerMoves[ply]?.[0]?.y === m.y)
            ? 5000
            : (killerMoves[ply]?.[1]?.x === m.x && killerMoves[ply]?.[1]?.y === m.y)
              ? 3000
              : 0;
        const histBonus = history[idx] || 0;
        let tacticalBias = 0;
        if (m.reason?.includes("win") || m.reason?.includes("block_five")) tacticalBias = 900000;
        else if (m.reason?.includes("stop")) tacticalBias = 40000;
        else if (m.reason?.includes("four")) tacticalBias = 20000;
        else if (m.reason?.includes("three")) tacticalBias = 2000;
        return { move: m, key: m.score + killerBonus + histBonus + tacticalBias };
      })
      .sort((a, b) => b.key - a.key)
      .map((item) => item.move);
  };

  const listAllMoves = (currentPlayer: Player, ply: number) => {
    const moves: Candidate[] = [];
    for (let idx = 0; idx < board.length; idx += 1) {
      if (board[idx] !== 0) continue;
      const x = idx % size;
      const y = Math.floor(idx / size);
      const evalInfo = evaluateMovePatternScore(board, size, x, y, currentPlayer);
      moves.push({
        x,
        y,
        score: evalInfo.totalScore
      });
    }
    return orderMoves(moves, ply);
  };

  const solveEndgame = (
    currentPlayer: Player,
    depth: number,
    alpha: number,
    beta: number,
    ply: number,
    currentHash: number
  ): { score: number; best?: Candidate } => {
    if (performance.now() > deadline) {
      endgameAborted = true;
      return { score: evaluateBoard(board, size, currentPlayer) };
    }

    nodes += 1;
    if (depth <= 0) return { score: 0 };

    const keyedHash = (currentHash ^ TURN_SALT[currentPlayer - 1]) >>> 0;
    const entry = table.get(keyedHash);
    if (entry && entry.depth >= depth) {
      if (entry.flag === "exact") return { score: entry.score, best: entry.best };
      if (entry.flag === "lower") alpha = Math.max(alpha, entry.score);
      if (entry.flag === "upper") beta = Math.min(beta, entry.score);
      if (alpha >= beta) return { score: entry.score, best: entry.best };
    }

    const moves = listAllMoves(currentPlayer, ply);
    if (!moves.length) return { score: 0 };

    let bestScore = -Infinity;
    let bestMove: Candidate | undefined;
    const alphaOrig = alpha;

    for (const move of moves) {
      const idx = indexOf(move.x, move.y, size);
      board[idx] = currentPlayer;
      const nextHash = updateHash(currentHash, idx, currentPlayer, zobrist);
      let score: number;
      if (isImmediateWin(board, size, move.x, move.y, currentPlayer)) {
        score = WIN_SCORE - ply;
      } else {
        score = -solveEndgame(otherPlayer(currentPlayer), depth - 1, -beta, -alpha, ply + 1, nextHash).score;
      }
      board[idx] = 0;

      if (score > bestScore) {
        bestScore = score;
        bestMove = move;
      }
      alpha = Math.max(alpha, score);
      if (alpha >= beta) break;
    }

    const flag: TTEntry["flag"] =
      bestScore <= alphaOrig ? "upper" : bestScore >= beta ? "lower" : "exact";
    table.set(keyedHash, {
      depth,
      score: bestScore,
      flag,
      best: bestMove
    });

    return { score: bestScore, best: bestMove };
  };

  const quiescence = (
    currentPlayer: Player,
    alpha: number,
    beta: number,
    ply: number,
    currentHash: number,
    depth: number
  ): { score: number } => {
    if (performance.now() > deadline) {
      aborted = true;
      return { score: evaluateBoard(board, size, currentPlayer) };
    }
    nodes += 1;
    const standPat = evaluateBoard(board, size, currentPlayer);
    if (standPat >= beta) return { score: standPat };
    if (alpha < standPat) alpha = standPat;

    if (depth <= 0) return { score: standPat };

    const mustBlocks = getMustBlockCellsForOpponentThreat(board, size, currentPlayer);
    const quiescenceLimit = options.precise ? 18 : 12;
    const baseMoves = generateCandidates(board, size, currentPlayer, {
      difficulty: options.difficulty,
      limit: quiescenceLimit,
      precise: options.precise
    });
    const tacticalMoves = baseMoves.filter((m) => {
      const inMust = mustBlocks.some((c) => c.x === m.x && c.y === m.y);
      return (
        inMust ||
        (m.reason &&
          (m.reason.includes("four") ||
            m.reason.includes("three") ||
            m.reason.includes("block_five") ||
            m.reason.includes("stop")))
      );
    });

    const ordered = orderMoves(tacticalMoves, ply);
    for (const move of ordered) {
      const idx = indexOf(move.x, move.y, size);
      board[idx] = currentPlayer;
      const nextHash = updateHash(currentHash, idx, currentPlayer, zobrist);
      const score = -quiescence(otherPlayer(currentPlayer), -beta, -alpha, ply + 1, nextHash, depth - 1).score;
      board[idx] = 0;
      if (score >= beta) return { score: beta };
      if (score > alpha) alpha = score;
    }
    return { score: alpha };
  };

  const negamax = (
    currentPlayer: Player,
    depth: number,
    alpha: number,
    beta: number,
    ply: number,
    currentHash: number
  ): { score: number; best?: Candidate } => {
    if (performance.now() > deadline) {
      aborted = true;
      return { score: evaluateBoard(board, size, currentPlayer) };
    }

    nodes += 1;
    if (depth === 0) {
      const qBase = options.precise ? 6 : 4;
      const qClamp = options.precise ? 4 : 3;
      const threatBoost =
        options.precise && countImmediateStrongThreats(board, size, otherPlayer(currentPlayer)) > 0
          ? 1
          : 0;
      const qDepth = Math.max(0, qBase - Math.min(qClamp, ply) + threatBoost);
      return quiescence(currentPlayer, alpha, beta, ply, currentHash, qDepth);
    }

    const keyedHash = (currentHash ^ TURN_SALT[currentPlayer - 1]) >>> 0;
    const entry = table.get(keyedHash);
    if (entry && entry.depth >= depth) {
      if (entry.flag === "exact") return { score: entry.score, best: entry.best };
      if (entry.flag === "lower") alpha = Math.max(alpha, entry.score);
      if (entry.flag === "upper") beta = Math.min(beta, entry.score);
      if (alpha >= beta) return { score: entry.score, best: entry.best };
    }

    const candidates = generateCandidates(board, size, currentPlayer, {
      difficulty: options.difficulty,
      precise: options.precise
    });
    if (!candidates.length) {
      return { score: 0 };
    }

    let bestScore = -Infinity;
    let bestMove: Candidate | undefined;
    const alphaOrig = alpha;

    const orderedMoves = orderMoves(candidates, ply);

    for (const move of orderedMoves) {
      const idx = indexOf(move.x, move.y, size);
      board[idx] = currentPlayer;
      const nextHash = updateHash(currentHash, idx, currentPlayer, zobrist);
      let score: number;
      if (isImmediateWin(board, size, move.x, move.y, currentPlayer)) {
        score = WIN_SCORE - ply;
      } else {
        const extend =
          options.precise &&
          depth <= 2 &&
          !!move.reason &&
          (move.reason.includes("block") ||
            move.reason.includes("four") ||
            move.reason.includes("three"));
        const nextDepth = depth - 1 + (extend ? 1 : 0);
        score = -negamax(otherPlayer(currentPlayer), nextDepth, -beta, -alpha, ply + 1, nextHash).score;
      }
      board[idx] = 0;

      if (score > bestScore) {
        bestScore = score;
        bestMove = move;
      }
      alpha = Math.max(alpha, score);
      if (alpha >= beta) {
        if (move.reason && !move.reason.includes("win")) {
          // killer / history update
          if (killerMoves[ply][0]) killerMoves[ply][1] = killerMoves[ply][0];
          killerMoves[ply][0] = move;
          history[idx] += depth * depth;
        }
        break;
      }
    }

    const flag: TTEntry["flag"] =
      bestScore <= alphaOrig ? "upper" : bestScore >= beta ? "lower" : "exact";
    table.set(keyedHash, {
      depth,
      score: bestScore,
      flag,
      best: bestMove
    });

    return { score: bestScore, best: bestMove };
  };

  const preSearchForced = (): { best: Candidate | null; locked: boolean } => {
    const wins = getImmediateWins(board, size, player);
    if (wins.length) return { best: { ...wins[0], score: WIN_SCORE, reason: "win_now" }, locked: true };

    const blocks = getImmediateBlocks(board, size, player);
    if (blocks.length) return { best: { ...blocks[0], score: WIN_SCORE - 1, reason: "block_win" }, locked: true };

    const mustBlocks = getMustBlockCellsForOpponentThreat(board, size, player);
    if (mustBlocks.length) {
      if (mustBlocks.length === 1) {
        return { best: { ...mustBlocks[0], score: THREAT_SCORES.LIVE_FOUR, reason: "stop_threat" }, locked: true };
      }
      const opp = otherPlayer(player);
      const routes = scanThreatRoutes(board, size, opp);
      const scoreMap = new Map<string, { score: number; count: number }>();
      for (const route of routes) {
        const score = THREAT_SCORES[route.type] ?? 0;
        for (const cell of route.mustBlockCells) {
          const key = `${cell.x},${cell.y}`;
          const prev = scoreMap.get(key) ?? { score: 0, count: 0 };
          prev.score += score;
          prev.count += 1;
          scoreMap.set(key, prev);
        }
      }
      const comboPivots = findComboThreatPivots(board, size, opp);
      for (const cell of comboPivots) {
        const key = `${cell.x},${cell.y}`;
        const prev = scoreMap.get(key) ?? { score: 0, count: 0 };
        prev.score += THREAT_SCORES.LIVE_FOUR + THREAT_SCORES.LIVE_THREE;
        prev.count += 2;
        scoreMap.set(key, prev);
      }
      const setupMoves = findTwoStepThreatSetups(board, size, opp);
      for (const cell of setupMoves) {
        const key = `${cell.x},${cell.y}`;
        const prev = scoreMap.get(key) ?? { score: 0, count: 0 };
        prev.score += THREAT_SCORES.LIVE_THREE;
        prev.count += 1;
        scoreMap.set(key, prev);
      }
      let bestDef: Candidate | null = null;
      let bestScore = -Infinity;
      let bestCount = -Infinity;
      const center = (size - 1) / 2;
      let bestDist = Infinity;
      for (const cell of mustBlocks) {
        const idx = indexOf(cell.x, cell.y, size);
        if (board[idx] !== 0) continue;
        const key = `${cell.x},${cell.y}`;
        const info = scoreMap.get(key) ?? { score: 0, count: 0 };
        // One-ply defensive lookahead: simulate our block and measure opponent's immediate threat strength
        board[idx] = player;
        const oppWins = getImmediateWins(board, size, opp).length;
        const oppStrong = countImmediateStrongThreats(board, size, opp);
        const oppScore = oppWins * WIN_SCORE + oppStrong * 1000;
        board[idx] = 0;
        const defensiveScore = info.score - oppScore; // higher is better for us
        const dist = Math.abs(cell.x - center) + Math.abs(cell.y - center);
        if (
          defensiveScore > bestScore ||
          (defensiveScore === bestScore && info.count > bestCount) ||
          (defensiveScore === bestScore && info.count === bestCount && dist < bestDist)
        ) {
          bestScore = defensiveScore;
          bestCount = info.count;
          bestDist = dist;
          bestDef = { x: cell.x, y: cell.y, score: THREAT_SCORES.LIVE_FOUR, reason: "stop_threat" };
        }
      }
      if (bestDef) return { best: bestDef, locked: true };
    }

    const oppLiveFourStarts = getLiveFourCreationPoints(board, size, otherPlayer(player));
    if (oppLiveFourStarts.length) {
      if (oppLiveFourStarts.length === 1) {
        return { best: { ...oppLiveFourStarts[0], score: THREAT_SCORES.LIVE_FOUR - 2, reason: "block_live_four_setup" }, locked: false };
      }
      let bestDef: Candidate | null = null;
      let bestScore = Infinity;
      for (const cell of oppLiveFourStarts) {
        const idx = indexOf(cell.x, cell.y, size);
        if (board[idx] !== 0) continue;
        board[idx] = player;
        const threats = countImmediateStrongThreats(board, size, otherPlayer(player));
        board[idx] = 0;
        if (threats < bestScore) {
          bestScore = threats;
          bestDef = { x: cell.x, y: cell.y, score: THREAT_SCORES.LIVE_FOUR - 2, reason: "block_live_four_setup" };
        }
      }
      if (bestDef) return { best: bestDef, locked: false };
    }

    const vcfAttack = runVCF(player);
    if (vcfAttack) return { best: { ...vcfAttack, reason: vcfAttack.reason ?? "vcf_start" }, locked: true };

    if (options.difficulty !== "hard") {
      const oppVCF = runVCF(otherPlayer(player));
      if (oppVCF) {
        // Preempt opponent's forcing start by occupying its first move
        return {
          best: {
            x: oppVCF.x,
            y: oppVCF.y,
            score: THREAT_SCORES.LIVE_FOUR,
            reason: "stop_vcf"
          },
          locked: true
        };
      }
    }

    const dblLiveThreePivots = findDoubleLiveThreePivotsForOpponent(board, size, player);
    if (dblLiveThreePivots.length) {
      const center = (size - 1) / 2;
      const sorted = dblLiveThreePivots.slice().sort((a, b) => {
        const da = Math.abs(a.x - center) + Math.abs(a.y - center);
        const db = Math.abs(b.x - center) + Math.abs(b.y - center);
        return da - db;
      });
      return { best: { ...sorted[0], score: THREAT_SCORES.LIVE_THREE + 50, reason: "block_double_live_three_pivot" }, locked: false };
    }

    const oppLiveThreeEnds = getLiveThreeOpenEnds(board, size, otherPlayer(player));
    const forkStops = findForkThreatMovesForOpponent(board, size, player);
    const forkPivots = findForkPivotsForOpponent(board, size, player);
    const oppFourStarts = getFourCreationPoints(board, size, otherPlayer(player));
    const oppLiveThreeStarts = getLiveThreeCreationPoints(board, size, otherPlayer(player));
    const oppSetupMoves = findTwoStepThreatSetups(board, size, otherPlayer(player));

    if (options.difficulty !== "hard") {
      // Multi-threat minimization: try defensive candidates that reduce opponent strong threats the most.
      const defensePool: Candidate[] = [];
      for (const c of dblLiveThreePivots) defensePool.push({ x: c.x, y: c.y, score: THREAT_SCORES.LIVE_THREE + 50, reason: "block_double_live_three_pivot" });
      for (const c of forkStops) defensePool.push({ x: c.x, y: c.y, score: THREAT_SCORES.LIVE_FOUR, reason: "fork_block" });
      for (const c of forkPivots) defensePool.push({ x: c.x, y: c.y, score: THREAT_SCORES.LIVE_FOUR, reason: "fork_pivot_block" });
      for (const c of oppLiveFourStarts) defensePool.push({ x: c.x, y: c.y, score: THREAT_SCORES.LIVE_FOUR, reason: "block_live_four_setup" });
      for (const c of oppLiveThreeEnds) defensePool.push({ x: c.x, y: c.y, score: THREAT_SCORES.LIVE_THREE, reason: "block_live_three_end" });
      for (const c of oppFourStarts) defensePool.push({ x: c.x, y: c.y, score: THREAT_SCORES.RUSH_FOUR, reason: "block_four_setup" });
      for (const c of oppLiveThreeStarts) defensePool.push({ x: c.x, y: c.y, score: THREAT_SCORES.LIVE_THREE, reason: "block_live_three_setup" });
      for (const c of oppSetupMoves) defensePool.push({ x: c.x, y: c.y, score: THREAT_SCORES.LIVE_THREE - 50, reason: "block_setup_combo" });
      const unique = new Map<string, Candidate>();
      for (const d of defensePool) {
        unique.set(`${d.x},${d.y}`, { ...d, score: d.score ?? THREAT_SCORES.LIVE_THREE });
      }
      if (unique.size) {
        let bestDef: Candidate | null = null;
        let bestScore = Infinity;
        const center = (size - 1) / 2;
        let bestDist = Infinity;
        for (const cand of unique.values()) {
          const idx = indexOf(cand.x, cand.y, size);
          if (board[idx] !== 0) continue;
          board[idx] = player;
          const threats = countImmediateStrongThreats(board, size, otherPlayer(player));
          board[idx] = 0;
          const dist = Math.abs(cand.x - center) + Math.abs(cand.y - center);
          if (threats < bestScore || (threats === bestScore && dist < bestDist)) {
            bestScore = threats;
            bestDist = dist;
            bestDef = { ...cand, reason: cand.reason ?? "min_threat" };
          }
        }
        if (bestDef) return { best: bestDef, locked: true };
      }
    }

    return { best: null as Candidate | null, locked: false };
  };

  const runVCF = (attacker: Player) => {
    const maxDepth = options.safetyDepth
      ? Math.max(4, Math.min(12, options.safetyDepth))
      : options.precise
        ? 8
        : 6;
    const defender = otherPlayer(attacker);

    const defenseMoves = (): Candidate[] => {
      const blocks: Candidate[] = [];
      for (let y = 0; y < size; y += 1) {
        for (let x = 0; x < size; x += 1) {
          const idx = indexOf(x, y, size);
          if (board[idx] !== 0) continue;
          if (isImmediateWin(board, size, x, y, attacker)) {
            blocks.push({ x, y, score: WIN_SCORE - 1, reason: "vcf_block_win" });
            continue;
          }
          if (classifyFour(board, size, x, y, attacker)) {
            blocks.push({ x, y, score: THREAT_SCORES.LIVE_FOUR - 5, reason: "vcf_block_four" });
          }
        }
      }
      return blocks;
    };

    const attackMoves = (): Candidate[] => {
      const moves: Candidate[] = [];
      for (let y = 0; y < size; y += 1) {
        for (let x = 0; x < size; x += 1) {
          const idx = indexOf(x, y, size);
          if (board[idx] !== 0) continue;
          if (isImmediateWin(board, size, x, y, attacker)) {
            moves.push({ x, y, score: WIN_SCORE, reason: "vcf_win" });
            continue;
          }
          if (classifyFour(board, size, x, y, attacker)) {
            moves.push({ x, y, score: THREAT_SCORES.LIVE_FOUR, reason: "vcf_four" });
            continue;
          }
          if (isThreateningThree(board, size, x, y, attacker)) {
            moves.push({ x, y, score: THREAT_SCORES.LIVE_THREE, reason: "vcf_three" });
          }
        }
      }
      return moves.sort((a, b) => b.score - a.score);
    };

    const vcfSearch = (
      depth: number,
      firstMove: Candidate | null,
      currentHash: number
    ): Candidate | null => {
      if (performance.now() > deadline) {
        aborted = true;
        return null;
      }
      if (depth <= 0) return null;

      const moves = attackMoves();
      for (const move of moves) {
        const idx = indexOf(move.x, move.y, size);
        board[idx] = attacker;
        const nextHash = updateHash(currentHash, idx, attacker, zobrist);

        const winNow = isImmediateWin(board, size, move.x, move.y, attacker);
        const first = firstMove ?? { ...move, reason: "vcf_start" };
        if (winNow) {
          board[idx] = 0;
          return first;
        }

        const blocks = defenseMoves();
        if (blocks.length === 0) {
          board[idx] = 0;
          return first;
        }

        let allHold = true;
        for (const block of blocks) {
          const bIdx = indexOf(block.x, block.y, size);
          board[bIdx] = defender;
          const res = vcfSearch(depth - 1, first, updateHash(nextHash, bIdx, defender, zobrist));
          board[bIdx] = 0;
          if (!res) {
            allHold = false;
            break;
          }
        }

        board[idx] = 0;
        if (allHold) return first;
      }
      return null;
    };

    return vcfSearch(maxDepth, null, hash);
  };

  const runVCT = (attacker: Player) => {
    const maxDepth = options.safetyDepth
      ? Math.max(4, Math.min(8, Math.floor(options.safetyDepth * 0.6)))
      : options.precise
        ? 5
        : 4;
    const defender = otherPlayer(attacker);
    const vctSearch = (
      current: Player,
      depth: number,
      currentHash: number
    ): boolean => {
      if (performance.now() > deadline) {
        aborted = true;
        return false;
      }
      if (depth <= 0) return false;

      const vctLimit = options.precise ? 18 : 12;
      const moves = generateCandidates(board, size, current, {
        difficulty: "hard",
        limit: vctLimit,
        precise: options.precise
      }).filter((m) => {
        return (
          m.reason?.includes("live_three") ||
          m.reason?.includes("four") ||
          m.reason?.includes("win")
        );
      });

      for (const move of moves) {
        const idx = indexOf(move.x, move.y, size);
        if (board[idx] !== 0) continue;
        board[idx] = current;
        const nextHash = updateHash(currentHash, idx, current, zobrist);
        const winNow = isImmediateWin(board, size, move.x, move.y, current);
        let success = false;
        if (winNow) {
          success = current === attacker;
        } else if (current === attacker) {
          success = vctSearch(defender, depth - 1, nextHash);
        } else {
          // defender: only block immediate wins or four setups
          const oppWins = getImmediateWins(board, size, attacker);
          const oppLiveFour = getLiveFourCreationPoints(board, size, attacker);
          success = !(oppWins.length || oppLiveFour.length);
        }
        board[idx] = 0;
        if (success) {
          if (current === attacker) {
            bestVCFStart = bestVCFStart ?? { ...move, reason: "vct_try" };
          }
          return true;
        }
      }
      return false;
    };

    let bestVCFStart: Candidate | null = null;
    const ok = vctSearch(attacker, maxDepth, hash);
    return ok ? bestVCFStart : null;
  };

  const extractPV = (startPlayer: Player, startHash: number, maxPlies: number, firstMove?: Candidate) => {
    const pv: PVStep[] = [];
    const applied: number[] = [];
    let currentPlayer = startPlayer;
    let currentHash = startHash;
    for (let ply = 0; ply < maxPlies; ply += 1) {
      let move: Candidate | undefined;
      if (ply === 0 && firstMove) {
        move = firstMove;
      } else {
        const keyedHash = (currentHash ^ TURN_SALT[currentPlayer - 1]) >>> 0;
        const entry = table.get(keyedHash);
        if (!entry?.best) break;
        move = entry.best;
      }
      const idx = indexOf(move.x, move.y, size);
      if (board[idx] !== 0) break;
      pv.push({ x: move.x, y: move.y, player: currentPlayer });
      board[idx] = currentPlayer;
      applied.push(idx);
      currentHash = updateHash(currentHash, idx, currentPlayer, zobrist);
      currentPlayer = otherPlayer(currentPlayer);
    }
    for (const idx of applied) {
      board[idx] = 0;
    }
    return pv;
  };

  if (emptyCount <= endgameLimit) {
    const result = solveEndgame(player, emptyCount, -Infinity, Infinity, 0, hash);
    if (!endgameAborted && result.best) {
      const durationMs = performance.now() - start;
      const topK = generateCandidates(board, size, player, {
        difficulty: options.difficulty,
        precise: options.precise
      })
        .slice(0, 8)
        .map((candidate) => ({ ...candidate }));
      const pvLimit = options.precise ? 8 : 4;
      const pv = extractPV(player, hash, pvLimit, result.best);
      return {
        bestMove: result.best,
        topK,
        pv,
        depth: emptyCount,
        nodes,
        durationMs
      };
    }
  }

  let best: Candidate | undefined;
  let depthReached = 0;
  let forcedLocked = false;

  const forced = preSearchForced();
  if (forced.best) {
    best = forced.best;
    depthReached = 1;
    forcedLocked = forced.locked;
  }

  if (!best && options.difficulty === "hard") {
    const vcfMove = runVCF(player);
    if (vcfMove) {
      best = vcfMove;
      depthReached = 2;
    }
    if (!best) {
      const vctMove = runVCT(player);
      if (vctMove) {
        best = vctMove;
        depthReached = 2;
      }
    }
  }

  const shouldOverride = (candidate: Candidate) => {
    if (!best) return true;
    if (forcedLocked) return false;
    const reason = candidate.reason ?? "";
    return reason.includes("win") || reason.includes("vcf") || reason.includes("stop_vcf");
  };

  const runDepth = (depth: number) => {
    const result = negamax(player, depth, -Infinity, Infinity, 0, hash);
    if (!aborted && result.best && shouldOverride(result.best)) {
      best = result.best;
      depthReached = depth;
    }
  };

  const allowPvSearch = forcedLocked && options.precise;
  if (!forcedLocked || allowPvSearch) {
    if (options.useIterative) {
      for (let depth = 1; depth <= options.maxDepth; depth += 1) {
        runDepth(depth);
        if (aborted) break;
      }
    } else {
      runDepth(options.maxDepth);
    }
  }

  const fallback =
    best ??
    generateCandidates(board, size, player, {
      difficulty: options.difficulty,
      precise: options.precise
    })[0];
  const topK = generateCandidates(board, size, player, {
    difficulty: options.difficulty,
    precise: options.precise
  })
    .slice(0, 8)
    .map((candidate) => ({ ...candidate }));

  const pickSafeMove = (primary: Candidate, candidates: Candidate[]) => {
    if (!options.precise || options.difficulty !== "hard") return primary;
    const safetyCache = new Map<string, boolean>();
    const opponent = otherPlayer(player);
    const isUnsafe = (cand: Candidate) => {
      if (performance.now() > deadline) return false;
      const key = `${cand.x},${cand.y}`;
      const cached = safetyCache.get(key);
      if (cached !== undefined) return cached;
      const idx = indexOf(cand.x, cand.y, size);
      if (board[idx] !== 0) {
        safetyCache.set(key, false);
        return false;
      }
      board[idx] = player;
      const vcfThreat = runVCF(opponent);
      let unsafe = !!vcfThreat;
      if (!unsafe) {
        const vctThreat = runVCT(opponent);
        unsafe = !!vctThreat;
      }
      board[idx] = 0;
      safetyCache.set(key, unsafe);
      return unsafe;
    };

    if (!isUnsafe(primary)) return primary;
    for (const cand of candidates.slice(0, 6)) {
      if (!isUnsafe(cand)) {
        return { ...cand, reason: cand.reason ?? "avoid_loss" };
      }
    }
    return primary;
  };

  const bestMove = pickSafeMove(fallback, topK);
  const pvLimit = options.precise ? 8 : 4;
  const pv = extractPV(player, hash, pvLimit, bestMove);
  const durationMs = performance.now() - start;

  return {
    bestMove,
    topK,
    pv,
    depth: depthReached || options.maxDepth,
    nodes,
    durationMs
  };
};
