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

const LINE_RADIUS = 4;

type PatternMatch = {
  type: ThreatType;
  score: number;
  start: number;
  end: number;
  pattern: string;
};

const GAP_PATTERNS: Array<{ pattern: string; type: ThreatType }> = [
  { pattern: "0101110", type: "RUSH_FOUR" },
  { pattern: "0111010", type: "RUSH_FOUR" },
  { pattern: "0110110", type: "RUSH_FOUR" },
  { pattern: "010110", type: "LIVE_THREE" },
  { pattern: "011010", type: "LIVE_THREE" }
];

const buildLineWindow = (
  board: ArrayLike<number>,
  size: number,
  x: number,
  y: number,
  player: Player,
  dx: number,
  dy: number
) => {
  const coords: Array<Coord | null> = [];
  let line = "";
  for (let offset = -LINE_RADIUS; offset <= LINE_RADIUS; offset += 1) {
    const cx = x + dx * offset;
    const cy = y + dy * offset;
    if (!inBounds(cx, cy, size)) {
      line += "2";
      coords.push(null);
      continue;
    }
    if (offset === 0) {
      line += "1";
      coords.push({ x: cx, y: cy });
      continue;
    }
    const val = getCell(board, size, cx, cy);
    if (val === 0) line += "0";
    else if (val === player) line += "1";
    else line += "2";
    coords.push({ x: cx, y: cy });
  }
  return { line, coords };
};

const findBestPatternMatch = (line: string, centerIndex: number): PatternMatch | null => {
  let best: PatternMatch | null = null;
  for (const def of GAP_PATTERNS) {
    const pattern = def.pattern;
    let start = line.indexOf(pattern);
    while (start !== -1) {
      const end = start + pattern.length - 1;
      if (centerIndex >= start && centerIndex <= end) {
        const centerChar = pattern[centerIndex - start];
        if (centerChar === "1") {
          const score = THREAT_SCORES[def.type];
          if (!best || score > best.score) {
            best = { type: def.type, score, start, end, pattern };
          }
        }
      }
      start = line.indexOf(pattern, start + 1);
    }
  }
  return best;
};

type LineThreat = {
  type: ThreatType | null;
  score: number;
  openEnds: Coord[];
};

const analyzeLineThreat = (
  board: ArrayLike<number>,
  size: number,
  x: number,
  y: number,
  player: Player,
  dx: number,
  dy: number
): LineThreat => {
  const left = countDir(board, size, x, y, -dx, -dy, player);
  const right = countDir(board, size, x, y, dx, dy, player);
  const total = left + right + 1;
  const leftOpen = openEnd(board, size, x, y, -dx, -dy, left);
  const rightOpen = openEnd(board, size, x, y, dx, dy, right);
  const openEnds = (leftOpen ? 1 : 0) + (rightOpen ? 1 : 0);
  const contigType = classify(total, openEnds);
  let bestType = contigType;
  let bestScore = contigType ? THREAT_SCORES[contigType] : 0;
  let bestOpenEnds: Coord[] = [];
  if (contigType === "LIVE_THREE") {
    if (leftOpen) bestOpenEnds.push(leftOpen);
    if (rightOpen) bestOpenEnds.push(rightOpen);
  }

  const { line, coords } = buildLineWindow(board, size, x, y, player, dx, dy);
  const match = findBestPatternMatch(line, LINE_RADIUS);
  if (match && match.score > bestScore) {
    bestType = match.type;
    bestScore = match.score;
    bestOpenEnds = [];
    if (bestType === "LIVE_THREE") {
      const startCoord = coords[match.start];
      const endCoord = coords[match.end];
      if (startCoord && line[match.start] === "0") bestOpenEnds.push(startCoord);
      if (endCoord && line[match.end] === "0") bestOpenEnds.push(endCoord);
    }
  }

  return { type: bestType, score: bestScore, openEnds: bestOpenEnds };
};

export const evaluateMovePatternScore = (
  board: ArrayLike<number>,
  size: number,
  x: number,
  y: number,
  player: Player
) => {
  let totalScore = 0;
  let best: { type: ThreatType | null; score: number } = { type: null, score: 0 };
  let secondBestScore = 0;
  for (const { dx, dy } of DIRECTIONS) {
    const info = analyzeLineThreat(board, size, x, y, player, dx, dy);
    totalScore += info.score;
    if (info.score > best.score) {
      secondBestScore = best.score;
      best = { type: info.type, score: info.score };
    } else if (info.score > secondBestScore) {
      secondBestScore = info.score;
    }
  }
  return { totalScore, best, secondBestScore };
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
  const info = analyzeLineThreat(board, size, x, y, player, dx, dy);
  const type = info.type;
  if (!type) return null;
  const mustBlockCells: Coord[] = [];
  if (type === "FIVE" || type === "LIVE_FOUR" || type === "RUSH_FOUR") {
    mustBlockCells.push({ x, y });
  } else if (type === "LIVE_THREE") {
    mustBlockCells.push(...info.openEnds);
  } else if (type === "SLEEP_THREE") {
    mustBlockCells.push({ x, y });
  }
  return {
    player,
    type,
    lineCells: buildLineCells(x, y, dx, dy, size),
    mustBlockCells: mustBlockCells.slice(0, 2),
    score: info.score,
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
      for (const { dx, dy } of DIRECTIONS) {
        const info = analyzeLineThreat(board, size, x, y, player, dx, dy);
        if (info.type === "LIVE_FOUR") {
          points.push({ x, y });
          break;
        }
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
        const info = analyzeLineThreat(board, size, x, y, player, dx, dy);
        if (info.type === "LIVE_THREE") {
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
        const info = analyzeLineThreat(board, size, x, y, player, dx, dy);
        if (info.type === "LIVE_FOUR" || info.type === "RUSH_FOUR") {
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
      const info = analyzeLineThreat(board, size, x, y, opp, dx, dy);
      if (info.type === "FIVE") return 2;
      if (info.type === "LIVE_FOUR" || info.type === "RUSH_FOUR") strong += 1;
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
      let liveThreeCount = 0;
      for (const { dx, dy } of DIRECTIONS) {
        const info = analyzeLineThreat(board, size, x, y, opp, dx, dy);
        if (info.type === "LIVE_THREE") {
          liveThreeCount += 1;
          if (liveThreeCount >= 2) break;
        }
      }
      if (liveThreeCount >= 2) {
        pivots.push({ x, y });
      }
    }
  }
  return pivots;
};

const countDirectionalThreatsAt = (
  board: ArrayLike<number>,
  size: number,
  x: number,
  y: number,
  player: Player
) => {
  let liveThree = 0;
  let strongFour = 0;
  for (const { dx, dy } of DIRECTIONS) {
    const info = analyzeLineThreat(board, size, x, y, player, dx, dy);
    if (!info.type) continue;
    if (info.type === "FIVE") continue;
    if (info.type === "LIVE_FOUR" || info.type === "RUSH_FOUR") {
      strongFour += 1;
      continue;
    }
    if (info.type === "LIVE_THREE") {
      liveThree += 1;
    }
  }
  return { liveThree, strongFour };
};

export const findComboThreatPivots = (
  board: ArrayLike<number>,
  size: number,
  player: Player
) => {
  const bounds = activeBounds(board, size);
  const pivots: Coord[] = [];
  for (let y = bounds.minY; y <= bounds.maxY; y += 1) {
    for (let x = bounds.minX; x <= bounds.maxX; x += 1) {
      if (getCell(board, size, x, y) !== 0) continue;
      if (!hasNeighbor(board, size, x, y, NEAR_DISTANCE)) continue;
      const { liveThree, strongFour } = countDirectionalThreatsAt(board, size, x, y, player);
      if ((strongFour >= 1 && liveThree >= 1) || liveThree >= 2) {
        pivots.push({ x, y });
      }
    }
  }
  return pivots;
};

const hasComboOrForkPivot = (
  board: ArrayLike<number>,
  size: number,
  player: Player
) => {
  const bounds = activeBounds(board, size);
  for (let y = bounds.minY; y <= bounds.maxY; y += 1) {
    for (let x = bounds.minX; x <= bounds.maxX; x += 1) {
      if (getCell(board, size, x, y) !== 0) continue;
      if (!hasNeighbor(board, size, x, y, NEAR_DISTANCE)) continue;
      const { liveThree, strongFour } = countDirectionalThreatsAt(board, size, x, y, player);
      if (strongFour >= 2) return true;
      if (strongFour >= 1 && liveThree >= 1) return true;
      if (liveThree >= 2) return true;
    }
  }
  return false;
};

export const findTwoStepThreatSetups = (
  board: ArrayLike<number>,
  size: number,
  player: Player
) => {
  const bounds = activeBounds(board, size);
  const setups: Coord[] = [];
  const baseWins = getImmediateWins(board, size, player).length;
  const baseLiveFour = getLiveFourCreationPoints(board, size, player).length;
  const baseCombos = findComboThreatPivots(board, size, player).length;
  const baseForks = findForkThreatMovesForOpponent(board, size, otherPlayer(player)).length;
  for (let y = bounds.minY; y <= bounds.maxY; y += 1) {
    for (let x = bounds.minX; x <= bounds.maxX; x += 1) {
      if (getCell(board, size, x, y) !== 0) continue;
      if (!hasNeighbor(board, size, x, y, NEAR_DISTANCE)) continue;
      const idx = y * size + x;
      (board as any)[idx] = player;
      const wins = getImmediateWins(board, size, player).length;
      const liveFour = getLiveFourCreationPoints(board, size, player).length;
      const combos = findComboThreatPivots(board, size, player).length;
      const forks = findForkThreatMovesForOpponent(board, size, otherPlayer(player)).length;
      (board as any)[idx] = 0;
      if (wins > baseWins || liveFour > baseLiveFour || combos > baseCombos || forks > baseForks) {
        setups.push({ x, y });
      }
    }
  }
  return setups;
};

export const countImmediateStrongThreats = (
  board: ArrayLike<number>,
  size: number,
  player: Player
) => {
  const wins = getImmediateWins(board, size, player);
  const liveFour = getLiveFourCreationPoints(board, size, player);
  const forks = findForkThreatMovesForOpponent(board, size, otherPlayer(player));
  const combos = findComboThreatPivots(board, size, player);
  const setups = findTwoStepThreatSetups(board, size, player);
  return wins.length + liveFour.length + forks.length + combos.length + setups.length;
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

  const comboPivots = findComboThreatPivots(board, size, opp);
  for (const cell of comboPivots) {
    const key = `${cell.x},${cell.y}`;
    if (!seen.has(key)) {
      seen.add(key);
      cells.push(cell);
    }
  }

  const setupMoves = findTwoStepThreatSetups(board, size, opp);
  for (const cell of setupMoves) {
    const key = `${cell.x},${cell.y}`;
    if (!seen.has(key)) {
      seen.add(key);
      cells.push(cell);
    }
  }
  return cells;
};
