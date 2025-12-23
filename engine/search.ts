import type { BoardSize, Candidate, Difficulty, Player } from "./types";
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
  countImmediateStrongThreats,
  scanThreatRoutes
} from "./threat";
import { DIRECTIONS, THREAT_SCORES } from "./constants";

const WIN_SCORE = 1000000;
const TURN_SALT = [0x9e3779b9, 0x85ebca6b];

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
  // Returns true if placing here creates live/ rush four.
  for (const { dx, dy } of DIRECTIONS) {
    let left = 0;
    let right = 0;
    let cx = x - dx;
    let cy = y - dy;
    while (inBounds(cx, cy, size) && getCell(board, size, cx, cy) === player) {
      left += 1;
      cx -= dx;
      cy -= dy;
    }
    const leftOpen = inBounds(cx, cy, size) && getCell(board, size, cx, cy) === 0;
    cx = x + dx;
    cy = y + dy;
    while (inBounds(cx, cy, size) && getCell(board, size, cx, cy) === player) {
      right += 1;
      cx += dx;
      cy += dy;
    }
    const rightOpen = inBounds(cx, cy, size) && getCell(board, size, cx, cy) === 0;
    const total = left + right + 1;
    const opens = (leftOpen ? 1 : 0) + (rightOpen ? 1 : 0);
    if (total === 4 && opens >= 1) return true;
  }
  return false;
};

const isThreateningThree = (
  board: ArrayLike<number>,
  size: number,
  x: number,
  y: number,
  player: Player
) => {
  for (const { dx, dy } of DIRECTIONS) {
    let left = 0;
    let right = 0;
    let cx = x - dx;
    let cy = y - dy;
    while (inBounds(cx, cy, size) && getCell(board, size, cx, cy) === player) {
      left += 1;
      cx -= dx;
      cy -= dy;
    }
    const leftOpen = inBounds(cx, cy, size) && getCell(board, size, cx, cy) === 0;
    cx = x + dx;
    cy = y + dy;
    while (inBounds(cx, cy, size) && getCell(board, size, cx, cy) === player) {
      right += 1;
      cx += dx;
      cy += dy;
    }
    const rightOpen = inBounds(cx, cy, size) && getCell(board, size, cx, cy) === 0;
    const total = left + right + 1;
    const opens = (leftOpen ? 1 : 0) + (rightOpen ? 1 : 0);
    if (total === 3 && opens === 2) return true;
  }
  return false;
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
    const baseMoves = generateCandidates(board, size, currentPlayer, {
      difficulty: options.difficulty,
      limit: 12
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
      return quiescence(currentPlayer, alpha, beta, ply, currentHash, 4 - Math.min(3, ply));
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
      difficulty: options.difficulty
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
        score = -negamax(otherPlayer(currentPlayer), depth - 1, -beta, -alpha, ply + 1, nextHash).score;
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
        return { best: { ...oppLiveFourStarts[0], score: THREAT_SCORES.LIVE_FOUR - 2, reason: "block_live_four_setup" }, locked: true };
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
      if (bestDef) return { best: bestDef, locked: true };
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
    const maxDepth = 6;
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
    const maxDepth = 4;
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

      const moves = generateCandidates(board, size, current, {
        difficulty: "hard",
        limit: 12
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

  if (!forcedLocked) {
    if (options.useIterative) {
      for (let depth = 1; depth <= options.maxDepth; depth += 1) {
        runDepth(depth);
        if (aborted) break;
      }
    } else {
      runDepth(options.maxDepth);
    }
  }

  const durationMs = performance.now() - start;
  const fallback = best ?? generateCandidates(board, size, player, { difficulty: options.difficulty })[0];
  const topK = generateCandidates(board, size, player, { difficulty: options.difficulty })
    .slice(0, 8)
    .map((candidate) => ({ ...candidate }));

  return {
    bestMove: fallback,
    topK,
    depth: depthReached || options.maxDepth,
    nodes,
    durationMs
  };
};
