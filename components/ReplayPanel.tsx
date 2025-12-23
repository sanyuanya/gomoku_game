"use client";

import * as React from "react";
import type { GameAction, Move, ReplayState, SwapAction } from "@/engine/types";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";

const coordLabel = (x: number, y: number) => `(${x + 1}, ${y + 1})`;

const playerLabel = (player: number) => (player === 1 ? "B" : "W");

type ReplayPanelProps = {
  moves: GameAction[];
  replay: ReplayState;
  onSetPointer: (pointer: number) => void;
  onToggleAuto: () => void;
  onSpeedChange: (speedMs: number) => void;
  onExport: () => string;
  onImport: (raw: string) => void;
};

export default function ReplayPanel({
  moves,
  replay,
  onSetPointer,
  onToggleAuto,
  onSpeedChange,
  onExport,
  onImport
}: ReplayPanelProps) {
  const [importText, setImportText] = React.useState("");
  const [exportText, setExportText] = React.useState("");

  const handleExport = () => {
    const json = onExport();
    setExportText(json);
  };

  const handleImport = () => {
    if (!importText.trim()) return;
    onImport(importText.trim());
    setImportText("");
  };

  return (
    <div className="panel-surface rounded-2xl shadow-panel p-4 flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h3 className="font-display text-lg">Replay</h3>
        <div className="text-xs text-slate/70">{replay.pointer} / {moves.length}</div>
      </div>

      <div className="grid grid-cols-5 gap-2">
        <Button variant="secondary" size="sm" onClick={() => onSetPointer(0)}>
          |&lt;
        </Button>
        <Button
          variant="secondary"
          size="sm"
          onClick={() => onSetPointer(Math.max(0, replay.pointer - 1))}
        >
          &lt;
        </Button>
        <Button variant="primary" size="sm" onClick={onToggleAuto}>
          {replay.isAuto ? "Pause" : "Play"}
        </Button>
        <Button
          variant="secondary"
          size="sm"
          onClick={() => onSetPointer(Math.min(moves.length, replay.pointer + 1))}
        >
          &gt;
        </Button>
        <Button
          variant="secondary"
          size="sm"
          onClick={() => onSetPointer(moves.length)}
        >
          &gt;|
        </Button>
      </div>

      <Slider
        label="Replay speed"
        min={300}
        max={1500}
        step={100}
        value={replay.speedMs}
        valueLabel={`${replay.speedMs}ms`}
        onChange={(event) => onSpeedChange(Number(event.target.value))}
      />

      <div className="max-h-40 overflow-auto rounded-lg border border-gold/30 bg-parchment/50 p-2 text-sm">
        {moves.length === 0 && <div className="text-slate/70">No moves yet.</div>}
        {moves.map((move, idx) => {
          const isActive = idx + 1 === replay.pointer;
          const kind = (move as any).kind === "swap" ? "swap" : "move";
          const label =
            kind === "swap"
              ? `Swap (${(move as SwapAction).a.x + 1},${(move as SwapAction).a.y + 1}) ↔ (${(move as SwapAction).b.x + 1},${(move as SwapAction).b.y + 1})`
              : `${playerLabel((move as Move).player)} ${coordLabel((move as Move).x, (move as Move).y)}`;
          const ts = (move as any).ts;
          const player = kind === "swap" ? (move as SwapAction).player : (move as Move).player;
          return (
            <div
              key={`action-${idx}`}
              className={`flex items-center justify-between py-1 ${
                isActive ? "text-ember font-semibold" : "text-slate"
              }`}
            >
              <span>
                {idx + 1}. {label}
              </span>
              <span className="text-xs text-slate/60">
                {playerLabel(player)} · {new Date(ts).toLocaleTimeString()}
              </span>
            </div>
          );
        })}
      </div>

      <div className="grid gap-2">
        <Button variant="secondary" onClick={handleExport}>
          Export JSON
        </Button>
        {exportText && (
          <textarea
            className="h-24 rounded-md border border-gold/30 bg-white/70 p-2 text-xs"
            value={exportText}
            readOnly
          />
        )}
        <textarea
          className="h-24 rounded-md border border-gold/30 bg-white/70 p-2 text-xs"
          placeholder="Paste replay JSON here"
          value={importText}
          onChange={(event) => setImportText(event.target.value)}
        />
        <Button variant="primary" onClick={handleImport}>
          Import JSON
        </Button>
      </div>
    </div>
  );
}
