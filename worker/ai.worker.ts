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
  const { board, size, player, difficulty, timeBudgetMs } = data;
  let result: { bestMove: Candidate; topK: Candidate[]; depth?: number; nodes?: number; durationMs?: number };

  if (difficulty === "easy") {
    result = pickEasy(board, size, player);
  } else if (difficulty === "normal") {
    result = searchBestMove(board, size, player, {
      maxDepth: size === 15 ? 3 : 2,
      difficulty: "normal",
      timeBudgetMs
    });
  } else {
    result = searchBestMove(board, size, player, {
      maxDepth: size === 15 ? 6 : 4,
      timeBudgetMs: Math.max(timeBudgetMs, 600),
      useIterative: true,
      difficulty: "hard"
    });
  }

  const threats = getThreatOverview(board, size, player);

  const payload: BotResult = {
    bestMove: result.bestMove,
    topK: result.topK,
    keyThreats: [...threats.selfRoutes, ...threats.oppRoutes],
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
