import type { BotRequest, BotResult, Candidate } from "../engine/types";
import { generateCandidates } from "../engine/movegen";
import { searchBestMove } from "../engine/search";
import { getThreatOverview } from "../engine/threat";

const pickEasy = (
  board: ArrayLike<number>,
  size: BotRequest["size"],
  player: BotRequest["player"]
) => {
  const candidates = generateCandidates(board, size, player, { difficulty: "easy", limit: 10 });
  const topK = candidates.slice(0, 8);
  const best = topK[0];
  return {
    bestMove: best,
    topK
  };
};

self.onmessage = (event: MessageEvent<BotRequest & { requestId?: string }>) => {
  const data = event.data;
  const {
    board,
    size,
    player,
    difficulty,
    timeBudgetMs,
    precisionMode,
    precisionDepth,
    safetyDepth
  } = data;
  let result: { bestMove: Candidate; topK: Candidate[]; depth?: number; nodes?: number; durationMs?: number };
  const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));
  const depthBounds = size === 19 ? { min: 6, max: 12 } : { min: 8, max: 14 };
  const safeBounds = { min: 4, max: 12 };
  const effectiveDepth = precisionMode ? clamp(precisionDepth, depthBounds.min, depthBounds.max) : undefined;
  const effectiveSafety = precisionMode ? clamp(safetyDepth, safeBounds.min, safeBounds.max) : undefined;

  if (difficulty === "easy") {
    result = pickEasy(board, size, player);
  } else if (difficulty === "normal") {
    result = searchBestMove(board, size, player, {
      maxDepth: precisionMode ? effectiveDepth ?? 5 : size === 15 ? 3 : 2,
      difficulty: "normal",
      timeBudgetMs: precisionMode ? Math.max(timeBudgetMs, 1200) : timeBudgetMs,
      useIterative: precisionMode,
      precise: precisionMode,
      safetyDepth: effectiveSafety
    });
  } else {
    result = searchBestMove(board, size, player, {
      maxDepth: precisionMode ? effectiveDepth ?? (size === 15 ? 10 : 7) : size === 15 ? 6 : 4,
      timeBudgetMs: Math.max(timeBudgetMs, precisionMode ? 2400 : 600),
      useIterative: true,
      difficulty: "hard",
      precise: precisionMode,
      safetyDepth: effectiveSafety
    });
  }

  const threats = getThreatOverview(board, size, player);

  const payload: BotResult = {
    bestMove: result.bestMove,
    topK: result.topK,
    keyThreats: [...threats.selfRoutes, ...threats.oppRoutes],
    pv: result.pv,
    depth: result.depth ?? 0,
    nodes: result.nodes ?? 0,
    durationMs: result.durationMs ?? 0
  };

  (self as any).postMessage({
    type: "bot-result",
    requestId: data.requestId,
    payload
  });
};
