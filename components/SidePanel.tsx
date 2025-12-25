"use client";

import type { Player, Settings } from "@/engine/types";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Slider } from "@/components/ui/slider";
import { useLanguage } from "@/components/LanguageContext";

const playerLabel = (player: Player) => (player === 1 ? "Black" : "White");

type SidePanelProps = {
  settings: Settings;
  status: {
    currentPlayer: Player;
    winner: Player | 0;
    isDraw: boolean;
    botThinking: boolean;
    movesCount: number;
  };
  canUndo: boolean;
  isReplayMode: boolean;
  swapInfo?: {
    used: boolean;
    selecting: boolean;
  };
  onSettingsChange: (settings: Settings) => void;
  onRestart: () => void;
  onUndo: () => void;
  onSwapSides: () => void;
  onSwapSkill?: () => void;
};

export default function SidePanel({
  settings,
  status,
  canUndo,
  isReplayMode,
  swapInfo,
  onSettingsChange,
  onRestart,
  onUndo,
  onSwapSides,
  onSwapSkill
}: SidePanelProps) {
  const { t } = useLanguage();
  const playerLabelLocalized = (p: Player) =>
    t("language") === "语言" ? (p === 1 ? "黑" : "白") : playerLabel(p);
  const statusLabel = (winner: Player | 0, isDraw: boolean) => {
    if (winner) return `${playerLabelLocalized(winner)} ${t("status") === "状态" ? "胜" : "wins"}`;
    if (isDraw) return t("draw");
    return t("inPlay");
  };
  const precisionDepthRange = settings.boardSize === 19 ? { min: 6, max: 12 } : { min: 8, max: 14 };
  const safetyDepthRange = { min: 4, max: 12 };

  return (
    <div className="panel-surface rounded-2xl shadow-panel p-4 flex flex-col gap-4">
      <div className="flex flex-col gap-2">
        <h2 className="font-display text-xl">{t("title")}</h2>
        <div className="text-sm text-slate/80">
          <div>{t("mode")}: {settings.mode === "human-bot" ? t("humanBot") : settings.mode === "human-human" ? t("humanHuman") : t("practice")}</div>
          <div>{t("status")}: {statusLabel(status.winner, status.isDraw)}</div>
          <div>{t("turn")}: {playerLabelLocalized(status.currentPlayer)}</div>
          <div>{t("moves")}: {status.movesCount}</div>
          {status.botThinking && (
            <div className="text-ember font-semibold animate-pulseSoft">{t("botThinking")}</div>
          )}
          {isReplayMode && (
            <div className="text-ember font-semibold">{t("replayMode")}</div>
          )}
        </div>
      </div>

      <div className="grid gap-3">
        <Select
          label={t("mode")}
          value={settings.mode}
          onChange={(event) =>
            onSettingsChange({ ...settings, mode: event.target.value as Settings["mode"] })
          }
        >
          <option value="human-bot">{t("humanBot")}</option>
          <option value="human-human">{t("humanHuman")}</option>
          <option value="practice">{t("practice")}</option>
        </Select>

        {settings.mode === "human-bot" && (
          <Select
            label={t("difficulty")}
            value={settings.difficulty}
            onChange={(event) =>
              onSettingsChange({
                ...settings,
                difficulty: event.target.value as Settings["difficulty"]
              })
            }
          >
            <option value="easy">Easy</option>
            <option value="normal">Normal</option>
            <option value="hard">Hard</option>
          </Select>
        )}

        {settings.mode === "human-bot" && settings.difficulty === "hard" && (
          <Slider
            label={t("timeBudget")}
            min={400}
            max={1200}
            step={100}
            value={settings.timeBudgetMs}
            valueLabel={`${settings.timeBudgetMs}ms`}
            onChange={(event) =>
              onSettingsChange({
                ...settings,
                timeBudgetMs: Number(event.target.value)
              })
            }
          />
        )}

        {settings.mode === "human-bot" && (
          <Switch
            label={t("precision")}
            checked={settings.precisionMode}
            onChange={(event) =>
              onSettingsChange({
                ...settings,
                precisionMode: event.target.checked
              })
            }
          />
        )}

        {settings.mode === "human-bot" && settings.precisionMode && (
          <Slider
            label={t("precisionDepth")}
            min={precisionDepthRange.min}
            max={precisionDepthRange.max}
            step={1}
            value={settings.precisionDepth}
            valueLabel={`${settings.precisionDepth}`}
            onChange={(event) =>
              onSettingsChange({
                ...settings,
                precisionDepth: Number(event.target.value)
              })
            }
          />
        )}

        {settings.mode === "human-bot" && settings.precisionMode && (
          <Slider
            label={t("safetyDepth")}
            min={safetyDepthRange.min}
            max={safetyDepthRange.max}
            step={1}
            value={settings.safetyDepth}
            valueLabel={`${settings.safetyDepth}`}
            onChange={(event) =>
              onSettingsChange({
                ...settings,
                safetyDepth: Number(event.target.value)
              })
            }
          />
        )}

        <Select
          label={t("boardSize")}
          value={String(settings.boardSize)}
          onChange={(event) =>
            onSettingsChange({
              ...settings,
              boardSize: Number(event.target.value) as Settings["boardSize"]
            })
          }
        >
          <option value="15">15 x 15</option>
          <option value="19">19 x 19</option>
        </Select>

        {settings.mode === "human-bot" ? (
          <Select
            label={t("humanPlays")}
            value={String(settings.humanPlayer)}
            onChange={(event) =>
              onSettingsChange({
                ...settings,
                humanPlayer: Number(event.target.value) as Player
              })
            }
          >
            <option value="1">Black (first)</option>
            <option value="2">White (second)</option>
          </Select>
        ) : (
          <Select
            label={t("firstPlayer")}
            value={String(settings.firstPlayer)}
            onChange={(event) =>
              onSettingsChange({
                ...settings,
                firstPlayer: Number(event.target.value) as Player
              })
            }
          >
            <option value="1">Black</option>
            <option value="2">White</option>
          </Select>
        )}

        <Switch
          label={t("showThreats")}
          checked={settings.showThreats}
          onChange={(event) =>
            onSettingsChange({
              ...settings,
              showThreats: event.target.checked
            })
          }
        />

        <Switch
          label={t("forbidden")}
          checked={settings.forbiddenMoves}
          disabled
          onChange={() => null}
        />
      </div>

      <div className="grid gap-2">
        <Button variant="primary" onClick={onRestart}>
          {t("restart")}
        </Button>
        <div className="grid grid-cols-2 gap-2">
          <Button variant="secondary" onClick={onUndo} disabled={!canUndo}>
            {t("undo")}
          </Button>
          <Button variant="secondary" onClick={onSwapSides}>
            {t("swapSides")}
          </Button>
        </div>
        {onSwapSkill && (
          <Button
            variant="primary"
            onClick={onSwapSkill}
            disabled={!!swapInfo?.used || isReplayMode}
          >
            {swapInfo?.used
              ? t("skillSwapUsed")
              : swapInfo?.selecting
                ? t("skillSwapSelecting")
                : t("skillSwap")}
          </Button>
        )}
      </div>

      <div className="text-xs text-slate/70">
        {t("shortcuts")}
      </div>
    </div>
  );
}
