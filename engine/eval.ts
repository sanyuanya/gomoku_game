import type { Player } from "./types";
import { scanThreatRoutes } from "./threat";
import { otherPlayer } from "./rules";

const sumScores = (routes: { score: number }[]) =>
  routes.reduce((sum, route) => sum + route.score, 0);

export const evaluateBoard = (
  board: ArrayLike<number>,
  size: number,
  player: Player
) => {
  const ownRoutes = scanThreatRoutes(board, size, player);
  const oppRoutes = scanThreatRoutes(board, size, otherPlayer(player));
  const ownScore = sumScores(ownRoutes);
  const oppScore = sumScores(oppRoutes);
  let stoneDiff = 0;
  for (let i = 0; i < board.length; i += 1) {
    if (board[i] === player) stoneDiff += 1;
    if (board[i] === otherPlayer(player)) stoneDiff -= 1;
  }
  return ownScore - oppScore * 1.05 + stoneDiff * 10;
};
