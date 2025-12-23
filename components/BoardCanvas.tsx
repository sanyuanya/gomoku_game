"use client";

import * as React from "react";
import type { Coord, Player, ThreatRoute } from "@/engine/types";
import { STAR_POINTS } from "@/engine/constants";
import { getCell } from "@/engine/rules";

const stoneColors = {
  1: { base: "#1c1b18", glow: "rgba(28, 27, 24, 0.4)" },
  2: { base: "#f9f6ef", glow: "rgba(255, 255, 255, 0.6)" }
} as const;

const routeStyles: Record<string, { dash: number[]; width: number }> = {
  FIVE: { dash: [], width: 3 },
  LIVE_FOUR: { dash: [], width: 2.6 },
  RUSH_FOUR: { dash: [6, 4], width: 2 },
  LIVE_THREE: { dash: [4, 4], width: 1.6 },
  SLEEP_THREE: { dash: [2, 4], width: 1.4 },
  LIVE_TWO: { dash: [2, 6], width: 1.2 },
  SLEEP_TWO: { dash: [1, 6], width: 1 }
};

type BoardCanvasProps = {
  size: number;
  board: ArrayLike<number>;
  currentPlayer: Player;
  lastMove: Coord | null;
  winningLine: Coord[];
  threats: ThreatRoute[];
  disabled?: boolean;
  showThreats?: boolean;
  onPlace: (x: number, y: number) => void;
  selectionMode?: "swap" | null;
  selectedCells?: Coord[];
  onSelectCell?: (coord: Coord) => void;
};

const clamp = (value: number, min: number, max: number) =>
  Math.max(min, Math.min(max, value));

export default function BoardCanvas({
  size,
  board,
  currentPlayer,
  lastMove,
  winningLine,
  threats,
  disabled,
  showThreats,
  onPlace,
  selectionMode,
  selectedCells = [],
  onSelectCell
}: BoardCanvasProps) {
  const containerRef = React.useRef<HTMLDivElement>(null);
  const canvasRef = React.useRef<HTMLCanvasElement>(null);
  const [canvasSize, setCanvasSize] = React.useState(600);
  const [hoverCell, setHoverCell] = React.useState<Coord | null>(null);

  React.useEffect(() => {
    if (!containerRef.current) return;
    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (!entry) return;
      const nextSize = Math.floor(
        Math.min(entry.contentRect.width, entry.contentRect.height)
      );
      setCanvasSize(nextSize);
    });
    observer.observe(containerRef.current);
    return () => observer.disconnect();
  }, []);

  React.useEffect(() => {
    if (disabled) setHoverCell(null);
  }, [disabled]);

  React.useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const context = canvas.getContext("2d");
    if (!context) return;

    const dpr = window.devicePixelRatio || 1;
    canvas.width = canvasSize * dpr;
    canvas.height = canvasSize * dpr;
    canvas.style.width = `${canvasSize}px`;
    canvas.style.height = `${canvasSize}px`;
    context.setTransform(dpr, 0, 0, dpr, 0, 0);

    context.clearRect(0, 0, canvasSize, canvasSize);

    const margin = canvasSize * 0.06;
    const gridSize = canvasSize - margin * 2;
    const cell = gridSize / (size - 1);

    const toCanvas = (x: number, y: number) => ({
      cx: margin + x * cell,
      cy: margin + y * cell
    });

    context.strokeStyle = "rgba(60, 72, 86, 0.6)";
    context.lineWidth = 1;

    for (let i = 0; i < size; i += 1) {
      const pos = margin + i * cell;
      context.beginPath();
      context.moveTo(margin, pos);
      context.lineTo(margin + gridSize, pos);
      context.stroke();

      context.beginPath();
      context.moveTo(pos, margin);
      context.lineTo(pos, margin + gridSize);
      context.stroke();

      // axis labels
      context.fillStyle = "rgba(60, 72, 86, 0.9)";
      context.font = `${Math.max(10, cell * 0.24)}px sans-serif`;
      context.textAlign = "center";
      context.textBaseline = "middle";
      context.fillText(String(i + 1), pos, margin * 0.4); // top numbers (x-axis)
      context.textAlign = "right";
      context.fillText(String(i + 1), margin * 0.5, pos); // left numbers (y-axis)
    }

    const stars = STAR_POINTS[size as 15 | 19] ?? [];
    context.fillStyle = "rgba(28, 27, 24, 0.55)";
    for (const star of stars) {
      const { cx, cy } = toCanvas(star.x, star.y);
      context.beginPath();
      context.arc(cx, cy, cell * 0.12, 0, Math.PI * 2);
      context.fill();
    }

    if (showThreats) {
      for (const route of threats) {
        if (route.lineCells.length < 2) continue;
        const first = route.lineCells[0];
        const last = route.lineCells[route.lineCells.length - 1];
        const { cx: sx, cy: sy } = toCanvas(first.x, first.y);
        const { cx: ex, cy: ey } = toCanvas(last.x, last.y);
        const color = route.player === 1 ? "rgba(42, 92, 75, 0.65)" : "rgba(214, 90, 49, 0.65)";
        const style = routeStyles[route.type] ?? routeStyles.LIVE_TWO;
        context.save();
        context.strokeStyle = color;
        context.lineWidth = style.width;
        context.setLineDash(style.dash);
        context.beginPath();
        context.moveTo(sx, sy);
        context.lineTo(ex, ey);
        context.stroke();
        context.restore();
      }
    }

    for (let y = 0; y < size; y += 1) {
      for (let x = 0; x < size; x += 1) {
        const cellValue = getCell(board, size, x, y);
        if (cellValue === 0) continue;
        const { cx, cy } = toCanvas(x, y);
        const radius = cell * 0.42;
        const gradient = context.createRadialGradient(
          cx - radius * 0.3,
          cy - radius * 0.3,
          radius * 0.2,
          cx,
          cy,
          radius
        );
        const palette = stoneColors[cellValue as 1 | 2];
        gradient.addColorStop(0, palette.base);
        gradient.addColorStop(1, palette.glow);
        context.fillStyle = gradient;
        context.beginPath();
        context.arc(cx, cy, radius, 0, Math.PI * 2);
        context.fill();
      }
    }

    if (lastMove) {
      const { cx, cy } = toCanvas(lastMove.x, lastMove.y);
      context.strokeStyle = "rgba(214, 90, 49, 0.9)";
      context.lineWidth = 2;
      context.beginPath();
      context.arc(cx, cy, cell * 0.16, 0, Math.PI * 2);
      context.stroke();
    }

    if (winningLine.length >= 2) {
      const first = winningLine[0];
      const last = winningLine[winningLine.length - 1];
      const { cx: sx, cy: sy } = toCanvas(first.x, first.y);
      const { cx: ex, cy: ey } = toCanvas(last.x, last.y);
      context.strokeStyle = "rgba(214, 90, 49, 0.85)";
      context.lineWidth = 4;
      context.beginPath();
      context.moveTo(sx, sy);
      context.lineTo(ex, ey);
      context.stroke();
    }

    if (showThreats) {
      for (const route of threats) {
        for (const block of route.mustBlockCells) {
          const { cx, cy } = toCanvas(block.x, block.y);
          context.fillStyle = "rgba(200, 163, 95, 0.75)";
          context.beginPath();
          context.arc(cx, cy, cell * 0.1, 0, Math.PI * 2);
          context.fill();
        }
      }
    }

    if (hoverCell && !disabled && selectionMode !== "swap") {
      const { cx, cy } = toCanvas(hoverCell.x, hoverCell.y);
      const radius = cell * 0.42;
      context.fillStyle =
        currentPlayer === 1
          ? "rgba(28, 27, 24, 0.4)"
          : "rgba(255, 255, 255, 0.6)";
      context.beginPath();
      context.arc(cx, cy, radius, 0, Math.PI * 2);
      context.fill();
    }

    if (selectionMode === "swap" && selectedCells.length) {
      context.strokeStyle = "rgba(91, 138, 255, 0.8)";
      context.lineWidth = 3;
      for (const c of selectedCells) {
        const { cx, cy } = toCanvas(c.x, c.y);
        const radius = cell * 0.5;
        context.beginPath();
        context.arc(cx, cy, radius, 0, Math.PI * 2);
        context.stroke();
      }
    }
  }, [
    board,
    canvasSize,
    currentPlayer,
    hoverCell,
    lastMove,
    selectionMode,
    selectedCells,
    showThreats,
    size,
    threats,
    disabled,
    winningLine
  ]);

  const getCellFromEvent = (event: React.PointerEvent) => {
    const rect = event.currentTarget.getBoundingClientRect();
    const offsetX = event.clientX - rect.left;
    const offsetY = event.clientY - rect.top;
    const margin = canvasSize * 0.06;
    const gridSize = canvasSize - margin * 2;
    const cell = gridSize / (size - 1);
    const x = Math.round((offsetX - margin) / cell);
    const y = Math.round((offsetY - margin) / cell);
    const clampedX = clamp(x, 0, size - 1);
    const clampedY = clamp(y, 0, size - 1);
    if (
      Math.abs(offsetX - (margin + clampedX * cell)) > cell * 0.6 ||
      Math.abs(offsetY - (margin + clampedY * cell)) > cell * 0.6
    ) {
      return null;
    }
    return { x: clampedX, y: clampedY } as Coord;
  };

  const handlePointerMove = (event: React.PointerEvent) => {
    if (disabled) return;
    const cell = getCellFromEvent(event);
    if (!cell) {
      setHoverCell(null);
      return;
    }
    if (selectionMode !== "swap" && getCell(board, size, cell.x, cell.y) !== 0) {
      setHoverCell(null);
      return;
    }
    setHoverCell(cell);
  };

  const handlePointerLeave = () => {
    setHoverCell(null);
  };

  const handleClick = (event: React.PointerEvent) => {
    if (disabled) return;
    const cell = getCellFromEvent(event);
    if (!cell) return;
    if (selectionMode === "swap" && onSelectCell) {
      onSelectCell(cell);
      return;
    }
    if (getCell(board, size, cell.x, cell.y) !== 0) return;
    onPlace(cell.x, cell.y);
  };

  return (
    <div ref={containerRef} className="w-full h-full">
      <canvas
        ref={canvasRef}
        className="canvas-frame rounded-2xl w-full h-full touch-none"
        onPointerMove={handlePointerMove}
        onPointerLeave={handlePointerLeave}
        onPointerDown={handleClick}
      />
    </div>
  );
}
