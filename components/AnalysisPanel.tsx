"use client";

import type { Candidate, Player, ThreatRoute } from "@/engine/types";
import { useLanguage } from "@/components/LanguageContext";

const coordLabel = (x: number, y: number) => `(${x + 1}, ${y + 1})`;
const playerLabel = (player: Player) => (player === 1 ? "Black" : "White");

const typeLabel: Record<string, string> = {
  FIVE: "Five",
  LIVE_FOUR: "Live four",
  RUSH_FOUR: "Rush four",
  LIVE_THREE: "Live three",
  SLEEP_THREE: "Sleep three",
  LIVE_TWO: "Live two",
  SLEEP_TWO: "Sleep two"
};

type AnalysisPanelProps = {
  topK: Candidate[];
  threats: { selfRoutes: ThreatRoute[]; oppRoutes: ThreatRoute[] } | null;
  currentPlayer: Player;
  pv?: { x: number; y: number; player: Player }[];
};

export default function AnalysisPanel({
  topK,
  threats,
  currentPlayer,
  pv
}: AnalysisPanelProps) {
  const { t } = useLanguage();
  const pvLabel = (step: { x: number; y: number; player: Player }) =>
    `${step.player === 1 ? "B" : "W"}${coordLabel(step.x, step.y)}`;
  return (
    <div className="panel-surface rounded-2xl shadow-panel p-4 flex flex-col gap-4">
      <div>
        <h3 className="font-display text-lg">Bot Candidates</h3>
        <div className="text-xs text-slate/70">
          Top moves (score = heuristic / search)
        </div>
      </div>

      <div className="space-y-2">
        {topK.length === 0 && <div className="text-sm">No suggestions yet.</div>}
        {topK.map((candidate, idx) => (
          <div
            key={`${candidate.x}-${candidate.y}-${idx}`}
            className="flex items-center justify-between text-sm"
          >
            <span>
              {idx + 1}. {coordLabel(candidate.x, candidate.y)}
              {candidate.reason ? ` - ${candidate.reason}` : ""}
            </span>
            <span className="text-slate/70">{Math.round(candidate.score)}</span>
          </div>
        ))}
      </div>

      {pv && pv.length > 0 && (
        <div className="border-t border-gold/30 pt-3">
          <h3 className="font-display text-lg">{t("mainLine")}</h3>
          <div className="text-xs text-slate/70">{t("mainLineHint")}</div>
          <div className="text-sm mt-2">{pv.map((step) => pvLabel(step)).join("  ")}</div>
        </div>
      )}

      <div className="border-t border-gold/30 pt-3">
        <h3 className="font-display text-lg">Threat Routes</h3>
        {threats ? (
          <div className="space-y-3 text-sm">
            <div>
              <div className="text-xs uppercase tracking-[0.12em] text-slate/60">
                {playerLabel(currentPlayer)} (max 3)
              </div>
              {threats.selfRoutes.length === 0 && (
                <div className="text-slate/70">No clear threats.</div>
              )}
              {threats.selfRoutes.map((route, idx) => (
                <div key={`self-${idx}`}>
                  {typeLabel[route.type]} - {coordLabel(route.lineCells[0].x, route.lineCells[0].y)}
                  {" -> "}
                  {coordLabel(
                    route.lineCells[route.lineCells.length - 1].x,
                    route.lineCells[route.lineCells.length - 1].y
                  )}
                </div>
              ))}
            </div>
            <div>
              <div className="text-xs uppercase tracking-[0.12em] text-slate/60">
                {playerLabel(currentPlayer === 1 ? 2 : 1)} (max 2)
              </div>
              {threats.oppRoutes.length === 0 && (
                <div className="text-slate/70">No urgent threats.</div>
              )}
              {threats.oppRoutes.map((route, idx) => (
                <div key={`opp-${idx}`}>
                  {typeLabel[route.type]} - {coordLabel(route.lineCells[0].x, route.lineCells[0].y)}
                  {" -> "}
                  {coordLabel(
                    route.lineCells[route.lineCells.length - 1].x,
                    route.lineCells[route.lineCells.length - 1].y
                  )}
                </div>
              ))}
            </div>
          </div>
        ) : (
          <div className="text-sm text-slate/70">No threat scan yet.</div>
        )}
      </div>
    </div>
  );
}
