import { DIRECTIONS, MAX_THREATS_OPP, MAX_THREATS_SELF, THREAT_SCORES, NEAR_DISTANCE } from "./constants";
import type { Coord, Player, ThreatRoute, ThreatType } from "./types";
import { getCell, inBounds, otherPlayer } from "./rules";

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
  if (!inBounds(cx, cy, size)) return null;
  return getCell(board, size, cx, cy) === 0 ? { x: cx, y: cy } : null;
};

const classify = (total: number, openEnds: number): ThreatType | null => {
  if (total >= 5) return "FIVE";
  if (total === 4 && openEnds === 2) return "LIVE_FOUR";
  if (total === 4 && openEnds === 1) return "RUSH_FOUR";
  if (total === 3 && openEnds === 2) return "LIVE_THREE";
  if (total === 3 && openEnds === 1) return "SLEEP_THREE";
  if (total === 2 && openEnds === 2) return "LIVE_TWO";
  if (total === 2 && openEnds === 1) return "SLEEP_TWO";
  return null;
};

const buildLineCells = (x: number, y: number, dx: number, dy: number, size: number) => {
  const cells: Coord[] = [{ x, y }];
  for (let step = 1; step <= 4; step += 1) {
    const nx = x - dx * step;
    const ny = y - dy * step;
    if (!inBounds(nx, ny, size)) break;
    cells.unshift({ x: nx, y: ny });
  }
  for (let step = 1; step <= 4; step += 1) {
    if (cells.length >= 5) break;
    const nx = x + dx * step;
    const ny = y + dy * step;
    if (!inBounds(nx, ny, size)) break;
    cells.push({ x: nx, y: ny });
  }
  return cells;
};

const buildThreat = (
  board: ArrayLike<number>,
  size: number,
  x: number,
  y: number,
  player: Player,
  dx: number,
  dy: number
): ThreatRoute | null => {
  if (getCell(board, size, x, y) !== 0) return null;
  const left = countDir(board, size, x, y, -dx, -dy, player);
  const right = countDir(board, size, x, y, dx, dy, player);
  const total = left + right + 1;
  const leftOpen = openEnd(board, size, x, y, -dx, -dy, left);
  const rightOpen = openEnd(board, size, x, y, dx, dy, right);
  const openEnds = (leftOpen ? 1 : 0) + (rightOpen ? 1 : 0);
  const type = classify(total, openEnds);
  if (!type) return null;
  const mustBlockCells: Coord[] = [];
  if (type === "FIVE" || type === "LIVE_FOUR" || type === "RUSH_FOUR") {
    mustBlockCells.push({ x, y });
  } else if (type === "LIVE_THREE") {
    if (leftOpen) mustBlockCells.push(leftOpen);
    if (rightOpen) mustBlockCells.push(rightOpen);
  } else if (type === "SLEEP_THREE") {
    mustBlockCells.push({ x, y });
  }
  return {
    player,
    type,
    lineCells: buildLineCells(x, y, dx, dy, size),
    mustBlockCells: mustBlockCells.slice(0, 2),
    score: THREAT_SCORES[type],
    direction: { dx, dy }
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

const activeBounds = (board: ArrayLike<number>, size: number) => {
  let minX = size - 1;
  let minY = size - 1;
  let maxX = 0;
  let maxY = 0;
  let hasStone = false;
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      if (getCell(board, size, x, y) !== 0) {
        hasStone = true;
        if (x < minX) minX = x;
        if (y < minY) minY = y;
        if (x > maxX) maxX = x;
        if (y > maxY) maxY = y;
      }
    }
  }
  if (!hasStone) {
    return { minX: 0, minY: 0, maxX: size - 1, maxY: size - 1 };
  }
  return {
    minX: Math.max(0, minX - NEAR_DISTANCE),
    minY: Math.max(0, minY - NEAR_DISTANCE),
    maxX: Math.min(size - 1, maxX + NEAR_DISTANCE),
    maxY: Math.min(size - 1, maxY + NEAR_DISTANCE)
  };
};

export const scanThreatRoutes = (
  board: ArrayLike<number>,
  size: number,
  player: Player
): ThreatRoute[] => {
  const routes: ThreatRoute[] = [];
  const seen = new Set<string>();
  const bounds = activeBounds(board, size);
  for (let y = bounds.minY; y <= bounds.maxY; y += 1) {
    for (let x = bounds.minX; x <= bounds.maxX; x += 1) {
      if (getCell(board, size, x, y) !== 0) continue;
      if (!hasNeighbor(board, size, x, y, NEAR_DISTANCE)) continue;
      for (const { dx, dy } of DIRECTIONS) {
        const threat = buildThreat(board, size, x, y, player, dx, dy);
        if (!threat) continue;
        const key = `${player}:${threat.type}:${dx},${dy}:${threat.lineCells
          .map((c) => `${c.x},${c.y}`)
          .join("|")}`;
        if (seen.has(key)) continue;
        seen.add(key);
        routes.push(threat);
      }
    }
  }
  return routes.sort((a, b) => b.score - a.score);
};

export const getThreatOverview = (
  board: ArrayLike<number>,
  size: number,
  currentPlayer: Player
) => {
  const selfRoutes = scanThreatRoutes(board, size, currentPlayer).slice(
    0,
    MAX_THREATS_SELF
  );
  const oppRoutes = scanThreatRoutes(board, size, otherPlayer(currentPlayer)).slice(
    0,
    MAX_THREATS_OPP
  );
  return { selfRoutes, oppRoutes };
};

export const getImmediateWins = (board: ArrayLike<number>, size: number, player: Player) => {
  const wins: Coord[] = [];
  const bounds = activeBounds(board, size);
  for (let y = bounds.minY; y <= bounds.maxY; y += 1) {
    for (let x = bounds.minX; x <= bounds.maxX; x += 1) {
      if (getCell(board, size, x, y) !== 0) continue;
      if (!hasNeighbor(board, size, x, y, NEAR_DISTANCE)) continue;
      for (const { dx, dy } of DIRECTIONS) {
        const left = countDir(board, size, x, y, -dx, -dy, player);
        const right = countDir(board, size, x, y, dx, dy, player);
        if (left + right + 1 >= 5) {
          wins.push({ x, y });
          break;
        }
      }
    }
  }
  return wins;
};

export const getImmediateBlocks = (board: ArrayLike<number>, size: number, player: Player) =>
  getImmediateWins(board, size, otherPlayer(player));

const isLiveFourIfPlaced = (
  board: ArrayLike<number>,
  size: number,
  x: number,
  y: number,
  player: Player
) => {
  let found = false;
  for (const { dx, dy } of DIRECTIONS) {
    const left = countDir(board, size, x, y, -dx, -dy, player);
    const right = countDir(board, size, x, y, dx, dy, player);
    const total = left + right + 1;
    if (total !== 4) continue;
    const leftOpen = inBounds(x - (left + 1) * dx, y - (left + 1) * dy, size)
      ? getCell(board, size, x - (left + 1) * dx, y - (left + 1) * dy) === 0
      : false;
    const rightOpen = inBounds(x + (right + 1) * dx, y + (right + 1) * dy, size)
      ? getCell(board, size, x + (right + 1) * dx, y + (right + 1) * dy) === 0
      : false;
    if (leftOpen && rightOpen) {
      found = true;
      break;
    }
  }
  return found;
};

export const getLiveFourCreationPoints = (
  board: ArrayLike<number>,
  size: number,
  player: Player
) => {
  const points: Coord[] = [];
  const bounds = activeBounds(board, size);
  for (let y = bounds.minY; y <= bounds.maxY; y += 1) {
    for (let x = bounds.minX; x <= bounds.maxX; x += 1) {
      if (getCell(board, size, x, y) !== 0) continue;
      if (!hasNeighbor(board, size, x, y, NEAR_DISTANCE)) continue;
      if (isLiveFourIfPlaced(board, size, x, y, player)) {
        points.push({ x, y });
      }
    }
  }
  return points;
};

export const getLiveThreeOpenEnds = (
  board: ArrayLike<number>,
  size: number,
  player: Player
) => {
  const ends: Coord[] = [];
  const bounds = activeBounds(board, size);
  for (let y = bounds.minY; y <= bounds.maxY; y += 1) {
    for (let x = bounds.minX; x <= bounds.maxX; x += 1) {
      if (getCell(board, size, x, y) !== player) continue;
      for (const { dx, dy } of DIRECTIONS) {
        let cx = x;
        let cy = y;
        let count = 0;
        const line: Coord[] = [];
        while (inBounds(cx, cy, size) && getCell(board, size, cx, cy) === player) {
          line.push({ x: cx, y: cy });
          count += 1;
          cx += dx;
          cy += dy;
        }
        if (count !== 3) continue;
        const headX = x - dx;
        const headY = y - dy;
        const tailX = cx;
        const tailY = cy;
        const headEmpty = inBounds(headX, headY, size) && getCell(board, size, headX, headY) === 0;
        const tailEmpty = inBounds(tailX, tailY, size) && getCell(board, size, tailX, tailY) === 0;
        if (headEmpty && tailEmpty) {
          const keyHead = `${headX},${headY}`;
          const keyTail = `${tailX},${tailY}`;
          if (!ends.some((c) => `${c.x},${c.y}` === keyHead)) ends.push({ x: headX, y: headY });
          if (!ends.some((c) => `${c.x},${c.y}` === keyTail)) ends.push({ x: tailX, y: tailY });
        }
      }
    }
  }
  return ends;
};

export const getLiveThreeCreationPoints = (
  board: ArrayLike<number>,
  size: number,
  player: Player
) => {
  const points: Coord[] = [];
  const bounds = activeBounds(board, size);
  for (let y = bounds.minY; y <= bounds.maxY; y += 1) {
    for (let x = bounds.minX; x <= bounds.maxX; x += 1) {
      if (getCell(board, size, x, y) !== 0) continue;
      if (!hasNeighbor(board, size, x, y, NEAR_DISTANCE)) continue;
      for (const { dx, dy } of DIRECTIONS) {
        const left = countDir(board, size, x, y, -dx, -dy, player);
        const right = countDir(board, size, x, y, dx, dy, player);
        const total = left + right + 1;
        if (total !== 3) continue;
        const leftOpen = inBounds(x - (left + 1) * dx, y - (left + 1) * dy, size)
          ? getCell(board, size, x - (left + 1) * dx, y - (left + 1) * dy) === 0
          : false;
        const rightOpen = inBounds(x + (right + 1) * dx, y + (right + 1) * dy, size)
          ? getCell(board, size, x + (right + 1) * dx, y + (right + 1) * dy) === 0
          : false;
        if (leftOpen && rightOpen) {
          points.push({ x, y });
          break;
        }
      }
    }
  }
  return points;
};

export const getFourCreationPoints = (
  board: ArrayLike<number>,
  size: number,
  player: Player
) => {
  const points: Coord[] = [];
  const bounds = activeBounds(board, size);
  for (let y = bounds.minY; y <= bounds.maxY; y += 1) {
    for (let x = bounds.minX; x <= bounds.maxX; x += 1) {
      if (getCell(board, size, x, y) !== 0) continue;
      if (!hasNeighbor(board, size, x, y, NEAR_DISTANCE)) continue;
      for (const { dx, dy } of DIRECTIONS) {
        const left = countDir(board, size, x, y, -dx, -dy, player);
        const right = countDir(board, size, x, y, dx, dy, player);
        const total = left + right + 1;
        if (total !== 4) continue;
        const leftOpen = inBounds(x - (left + 1) * dx, y - (left + 1) * dy, size)
          ? getCell(board, size, x - (left + 1) * dx, y - (left + 1) * dy) === 0
          : false;
        const rightOpen = inBounds(x + (right + 1) * dx, y + (right + 1) * dy, size)
          ? getCell(board, size, x + (right + 1) * dx, y + (right + 1) * dy) === 0
          : false;
        if (leftOpen || rightOpen) {
          points.push({ x, y });
          break;
        }
      }
    }
  }
  return points;
};

export const findForkThreatMovesForOpponent = (
  board: ArrayLike<number>,
  size: number,
  playerToMove: Player
) => {
  // Evaluate opponent's moves that create multiple strong four threats from the placed stone.
  const opp = otherPlayer(playerToMove);
  const bounds = activeBounds(board, size);
  const forkSources: Coord[] = [];

  const countStrongFoursAt = (x: number, y: number) => {
    let strong = 0;
    for (const { dx, dy } of DIRECTIONS) {
      const left = countDir(board, size, x, y, -dx, -dy, opp);
      const right = countDir(board, size, x, y, dx, dy, opp);
      const total = left + right + 1;
      if (total >= 5) return 2;
      if (total !== 4) continue;
      const leftOpen = inBounds(x - (left + 1) * dx, y - (left + 1) * dy, size)
        ? getCell(board, size, x - (left + 1) * dx, y - (left + 1) * dy) === 0
        : false;
      const rightOpen = inBounds(x + (right + 1) * dx, y + (right + 1) * dy, size)
        ? getCell(board, size, x + (right + 1) * dx, y + (right + 1) * dy) === 0
        : false;
      if (leftOpen || rightOpen) strong += 1;
      if (strong >= 2) return strong;
    }
    return strong;
  };

  for (let y = bounds.minY; y <= bounds.maxY; y += 1) {
    for (let x = bounds.minX; x <= bounds.maxX; x += 1) {
      if (getCell(board, size, x, y) !== 0) continue;
      if (!hasNeighbor(board, size, x, y, NEAR_DISTANCE)) continue;

      const strong = countStrongFoursAt(x, y);
      if (strong >= 2) {
        forkSources.push({ x, y });
      }
    }
  }
  return forkSources;
};

export const findForkPivotsForOpponent = (
  board: ArrayLike<number>,
  size: number,
  playerToMove: Player
) => findForkThreatMovesForOpponent(board, size, playerToMove);

export const findDoubleLiveThreePivotsForOpponent = (
  board: ArrayLike<number>,
  size: number,
  playerToMove: Player
) => {
  const opp = otherPlayer(playerToMove);
  const bounds = activeBounds(board, size);
  const pivots: Coord[] = [];
  for (let y = bounds.minY; y <= bounds.maxY; y += 1) {
    for (let x = bounds.minX; x <= bounds.maxX; x += 1) {
      if (getCell(board, size, x, y) !== 0) continue;
      if (!hasNeighbor(board, size, x, y, NEAR_DISTANCE)) continue;
      (board as any)[y * size + x] = opp;
      let liveThreeCount = 0;
      for (const { dx, dy } of DIRECTIONS) {
        const left = countDir(board, size, x, y, -dx, -dy, opp);
        const right = countDir(board, size, x, y, dx, dy, opp);
        const total = left + right + 1;
        if (total !== 3) continue;
        const leftOpen = inBounds(x - (left + 1) * dx, y - (left + 1) * dy, size)
          ? getCell(board, size, x - (left + 1) * dx, y - (left + 1) * dy) === 0
          : false;
        const rightOpen = inBounds(x + (right + 1) * dx, y + (right + 1) * dy, size)
          ? getCell(board, size, x + (right + 1) * dx, y + (right + 1) * dy) === 0
          : false;
        if (leftOpen && rightOpen) {
          liveThreeCount += 1;
          if (liveThreeCount >= 2) break;
        }
      }
      (board as any)[y * size + x] = 0;
      if (liveThreeCount >= 2) {
        pivots.push({ x, y });
      }
    }
  }
  return pivots;
};

export const countImmediateStrongThreats = (
  board: ArrayLike<number>,
  size: number,
  player: Player
) => {
  const wins = getImmediateWins(board, size, player);
  const liveFour = getLiveFourCreationPoints(board, size, player);
  const forks = findForkThreatMovesForOpponent(board, size, otherPlayer(player));
  return wins.length + liveFour.length + forks.length;
};

export const getTopThreatRoutes = (
  board: ArrayLike<number>,
  size: number,
  player: Player,
  limit: number
) => scanThreatRoutes(board, size, player).slice(0, limit);

export const getMustBlockCellsForOpponentThreat = (
  board: ArrayLike<number>,
  size: number,
  player: Player
) => {
  const opp = otherPlayer(player);
  const threats = scanThreatRoutes(board, size, opp);
  const cells: Coord[] = [];
  const seen = new Set<string>();
  for (const route of threats) {
    if (route.type === "FIVE" || route.type === "LIVE_FOUR" || route.type === "RUSH_FOUR") {
      for (const cell of route.mustBlockCells) {
        const key = `${cell.x},${cell.y}`;
        if (!seen.has(key)) {
          seen.add(key);
          cells.push(cell);
        }
      }
    }
  }

  // One-ply defensive lookahead to catch broken shapes (jump three/four) and multi-branch threats.
  // For each empty cell near active area, simulate opponent move and see if it creates immediate win
  // or multiple strong threats that must be answered.
  const bounds = activeBounds(board, size);
  for (let y = bounds.minY; y <= bounds.maxY; y += 1) {
    for (let x = bounds.minX; x <= bounds.maxX; x += 1) {
      if (getCell(board, size, x, y) !== 0) continue;
      if (!hasNeighbor(board, size, x, y, NEAR_DISTANCE)) continue;
      // simulate opponent move
      (board as any)[y * size + x] = opp;
      const wins = getImmediateWins(board, size, opp);
      const liveFour = getLiveFourCreationPoints(board, size, opp);
      const strongCount = countImmediateStrongThreats(board, size, opp);
      (board as any)[y * size + x] = 0;
      if (wins.length > 0 || liveFour.length > 0 || strongCount >= 2) {
        const key = `${x},${y}`;
        if (!seen.has(key)) {
          seen.add(key);
          cells.push({ x, y });
        }
      }
    }
  }
  return cells;
};
