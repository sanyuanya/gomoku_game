"use client";

import * as React from "react";
import BoardCanvas from "@/components/BoardCanvas";
import SidePanel from "@/components/SidePanel";
import AnalysisPanel from "@/components/AnalysisPanel";
import ReplayPanel from "@/components/ReplayPanel";
import type {
  Candidate,
  Coord,
  GameAction,
  Move,
  Player,
  ReplayState,
  Settings,
  ThreatRoute
} from "@/engine/types";
import {
  checkWin,
  cloneBoard,
  createBoard,
  createMove,
  createSwap,
  getCell,
  isBoardFull,
  otherPlayer
} from "@/engine/rules";
import { buildBoardFromMoves, buildSnapshot, decodeSnapshot, encodeSnapshot } from "@/engine/replay";
import { generateCandidates } from "@/engine/movegen";
import { getThreatOverview } from "@/engine/threat";
import { useSearchParams } from "next/navigation";
import { useLanguage } from "@/components/LanguageContext";

type GameShellProps = {
  roomId?: string;
  presetFromQuery?: {
    size?: string;
    mode?: string;
    difficulty?: string;
  };
};

const DEFAULT_SETTINGS: Settings = {
  boardSize: 15,
  mode: "human-bot",
  difficulty: "normal",
  firstPlayer: 1,
  humanPlayer: 1,
  forbiddenMoves: false,
  showThreats: true,
  timeBudgetMs: 800,
  precisionMode: false,
  precisionDepth: 10,
  safetyDepth: 8
};

const isEditableElement = (target: EventTarget | null) => {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName.toLowerCase();
  return tag === "input" || tag === "textarea" || tag === "select" || target.isContentEditable;
};

export default function GameShell(props: GameShellProps = {}) {
  const { t } = useLanguage();
  const [settings, setSettings] = React.useState<Settings>(DEFAULT_SETTINGS);
  const [board, setBoard] = React.useState(() => createBoard(DEFAULT_SETTINGS.boardSize));
  const [moves, setMoves] = React.useState<GameAction[]>([]);
  const [currentPlayer, setCurrentPlayer] = React.useState<Player>(1);
  const [winner, setWinner] = React.useState<Player | 0>(0);
  const [winningLine, setWinningLine] = React.useState<Coord[]>([]);
  const [lastMove, setLastMove] = React.useState<Coord | null>(null);
  const [isDraw, setIsDraw] = React.useState(false);
  const [botThinking, setBotThinking] = React.useState(false);
  const [botAnalysis, setBotAnalysis] = React.useState<{
    topK: Candidate[];
    player: Player;
    threats?: ThreatRoute[];
    pv?: { x: number; y: number; player: Player }[];
  } | null>(null);

  const [rightPanelOpen, setRightPanelOpen] = React.useState(true);
  const [rightPanelTab, setRightPanelTab] = React.useState<"analysis" | "replay">("analysis");
  const [mobileDrawerOpen, setMobileDrawerOpen] = React.useState(false);

  const [replay, setReplay] = React.useState<ReplayState>({
    pointer: 0,
    isAuto: false,
    speedMs: 800
  });
  const [hydrated, setHydrated] = React.useState(false);
  const [swapUsed, setSwapUsed] = React.useState(false);
  const [swapSelecting, setSwapSelecting] = React.useState(false);
  const [swapSelection, setSwapSelection] = React.useState<Coord[]>([]);
  const searchParams = useSearchParams();

  const derivedPreset = React.useMemo(() => {
    const sizeParam = props?.presetFromQuery?.size ?? searchParams?.get("size");
    const modeParam = props?.presetFromQuery?.mode ?? searchParams?.get("mode");
    const diffParam =
      props?.presetFromQuery?.difficulty ?? searchParams?.get("difficulty");
    const boardSize = sizeParam === "19" ? 19 : sizeParam === "15" ? 15 : undefined;
    const mode =
      modeParam === "human-human" || modeParam === "practice"
        ? modeParam
        : modeParam === "human-bot"
          ? "human-bot"
          : undefined;
    const difficulty =
      diffParam === "easy" || diffParam === "hard"
        ? diffParam
        : diffParam === "normal"
          ? "normal"
          : undefined;
    return { boardSize, mode, difficulty };
  }, [props?.presetFromQuery?.difficulty, props?.presetFromQuery?.mode, props?.presetFromQuery?.size, searchParams]);

  const roomId = props?.roomId || searchParams?.get("room") || "default";

  const storageKeys = React.useMemo(
    () => ({
      settings: `gomoku:${roomId}:settings`,
      game: `gomoku:${roomId}:game`
    }),
    [roomId]
  );

  const workerRef = React.useRef<Worker | null>(null);
  const requestIdRef = React.useRef(0);

  const startPlayer = settings.mode === "human-bot" ? 1 : settings.firstPlayer;
  const botPlayer = settings.humanPlayer === 1 ? 2 : 1;
  const isHumanTurn =
    settings.mode !== "human-bot" || currentPlayer === settings.humanPlayer;
  const canUseSwapSkill =
    !swapUsed &&
    !winner &&
    !isDraw &&
    !botThinking &&
    replay.pointer === moves.length &&
    (settings.mode !== "human-bot" || isHumanTurn);

  const resetGame = React.useCallback(
    (nextSettings: Settings) => {
      setBoard(createBoard(nextSettings.boardSize));
      setMoves([]);
      setCurrentPlayer(nextSettings.mode === "human-bot" ? 1 : nextSettings.firstPlayer);
      setWinner(0);
      setWinningLine([]);
      setLastMove(null);
      setIsDraw(false);
      setBotThinking(false);
      setBotAnalysis(null);
      setReplay((prev) => ({
        pointer: 0,
        isAuto: false,
        speedMs: prev.speedMs
      }));
      setSwapUsed(false);
      setSwapSelecting(false);
      setSwapSelection([]);
      requestIdRef.current += 1;
    },
    []
  );

  const rebuildFromMoves = React.useCallback(
    (nextSettings: Settings, nextMoves: GameAction[]) => {
      const nextStartPlayer =
        nextSettings.mode === "human-bot" ? 1 : nextSettings.firstPlayer;
      const { board: nextBoard, currentPlayer: nextPlayer, lastMove: replayLast } =
        buildBoardFromMoves(
          nextSettings.boardSize,
          nextMoves,
          nextMoves.length,
          nextStartPlayer
        );
      setBoard(nextBoard);
      setMoves(nextMoves);
      setCurrentPlayer(nextPlayer || nextStartPlayer);
      setLastMove(replayLast ? { x: replayLast.x, y: replayLast.y } : null);
      if (replayLast) {
        const res = checkWin(nextBoard, nextSettings.boardSize, replayLast.x, replayLast.y, replayLast.player);
        const hasWinner = res.winner;
        setWinner(hasWinner ? replayLast.player : 0);
        setWinningLine(hasWinner ? res.line : []);
        setIsDraw(isBoardFull(nextBoard) && !hasWinner);
      } else {
        setWinner(0);
        setWinningLine([]);
        setIsDraw(false);
      }
      setReplay((prev) => ({
        pointer: nextMoves.length,
        isAuto: false,
        speedMs: prev.speedMs
      }));
      setSwapUsed(nextMoves.some((a) => (a as any).kind === "swap"));
      setSwapSelecting(false);
      setSwapSelection([]);
    },
    []
  );

  React.useEffect(() => {
    if (typeof window === "undefined") return;

    const storedSettings = localStorage.getItem(storageKeys.settings);
    const storedGame = localStorage.getItem(storageKeys.game);

    if (storedGame) {
      try {
        const parsed = JSON.parse(storedGame) as {
          settings: Settings;
          moves: GameAction[];
        };
        if (parsed?.settings) {
          const merged = { ...DEFAULT_SETTINGS, ...parsed.settings };
          setSettings(merged);
          rebuildFromMoves(merged, parsed.moves || []);
          setHydrated(true);
          return;
        }
      } catch {
        // fall back
      }
    }

    if (storedSettings) {
      try {
        const parsed = JSON.parse(storedSettings) as Settings;
        setSettings({ ...DEFAULT_SETTINGS, ...parsed });
        setHydrated(true);
        return;
      } catch {
        // fall back
      }
    }

    // apply preset from query if no stored data
    const initial: Settings = {
      ...DEFAULT_SETTINGS,
      ...(derivedPreset.boardSize ? { boardSize: derivedPreset.boardSize as any } : {}),
      ...(derivedPreset.mode ? { mode: derivedPreset.mode as any } : {}),
      ...(derivedPreset.difficulty ? { difficulty: derivedPreset.difficulty as any } : {})
    };
    setSettings(initial);
    resetGame(initial);
    setHydrated(true);
  }, [derivedPreset.boardSize, derivedPreset.difficulty, derivedPreset.mode, rebuildFromMoves, resetGame, storageKeys.game, storageKeys.settings]);

  React.useEffect(() => {
    if (!hydrated) return;
    localStorage.setItem(storageKeys.settings, JSON.stringify(settings));
    localStorage.setItem(
      storageKeys.game,
      JSON.stringify({
        settings,
        moves
      })
    );
  }, [hydrated, settings, moves, storageKeys.game, storageKeys.settings]);

  React.useEffect(() => {
    if (typeof window === "undefined") return;
    const worker = new Worker(new URL("../worker/ai.worker.ts", import.meta.url), {
      type: "module"
    });
    workerRef.current = worker;
    return () => worker.terminate();
  }, []);

  const handleSettingsChange = (nextSettings: Settings) => {
    const clamp = (value: number, min: number, max: number) =>
      Math.min(max, Math.max(min, value));
    const depthBounds =
      nextSettings.boardSize === 19 ? { min: 6, max: 12 } : { min: 8, max: 14 };
    const safeBounds = { min: 4, max: 12 };
    const normalized: Settings = {
      ...nextSettings,
      precisionDepth: clamp(nextSettings.precisionDepth, depthBounds.min, depthBounds.max),
      safetyDepth: clamp(nextSettings.safetyDepth, safeBounds.min, safeBounds.max)
    };
    const shouldReset =
      normalized.boardSize !== settings.boardSize ||
      normalized.mode !== settings.mode ||
      normalized.firstPlayer !== settings.firstPlayer ||
      normalized.humanPlayer !== settings.humanPlayer;
    setSettings(normalized);
    if (shouldReset) resetGame(normalized);
  };

  const handlePlace = React.useCallback(
    (x: number, y: number, fromBot = false) => {
      if (winner || isDraw) return;
      if (botThinking && !fromBot) return;
      if (settings.mode === "human-bot" && !fromBot && !isHumanTurn) return;
      if (getCell(board, settings.boardSize, x, y) !== 0) return;
      if (replay.pointer !== moves.length) return;
      if (swapSelecting) return;

      const nextBoard = cloneBoard(board);
      nextBoard[y * settings.boardSize + x] = currentPlayer;
      const nextMove = createMove(x, y, currentPlayer, settings.boardSize, moves.length + 1);
      const nextMoves: GameAction[] = [...moves, nextMove];

      setBoard(nextBoard);
      setMoves(nextMoves);
      setLastMove({ x, y });
      setReplay((prev) => ({
        ...prev,
        pointer: nextMoves.length,
        isAuto: false
      }));

      const result = checkWin(nextBoard, settings.boardSize, x, y, currentPlayer);
      if (result.winner) {
        setWinner(currentPlayer);
        setWinningLine(result.line);
        return;
      }

      if (isBoardFull(nextBoard)) {
        setIsDraw(true);
        return;
      }

      setCurrentPlayer(otherPlayer(currentPlayer));
      setBotAnalysis(null);
      setSwapSelecting(false);
      setSwapSelection([]);
    },
    [
      board,
      botThinking,
      currentPlayer,
      isDraw,
      isHumanTurn,
      moves,
      replay.pointer,
      settings.boardSize,
      settings.mode,
      winner
    ]
  );

  const handleSwapStart = React.useCallback(() => {
    if (swapSelecting) {
      setSwapSelecting(false);
      setSwapSelection([]);
      return;
    }
    if (swapUsed || winner || isDraw) return;
    if (settings.mode === "human-bot" && !isHumanTurn) return;
    if (botThinking) return;
    if (replay.pointer !== moves.length) return;
    setSwapSelecting(true);
    setSwapSelection([]);
  }, [
    botThinking,
    isDraw,
    isHumanTurn,
    moves.length,
    replay.pointer,
    settings.mode,
    swapSelecting,
    swapUsed,
    winner
  ]);

  const lastPlaced = React.useMemo(() => {
    for (let i = moves.length - 1; i >= 0; i -= 1) {
      const m = moves[i] as any;
      if (!m || m.kind === "swap") continue;
      return { x: (m as Move).x, y: (m as Move).y };
    }
    return null;
  }, [moves]);

  const handleSwapSelect = React.useCallback(
    (coord: Coord) => {
      if (!swapSelecting) return;
      if (getCell(board, settings.boardSize, coord.x, coord.y) === 0) return;
      if (lastPlaced && coord.x === lastPlaced.x && coord.y === lastPlaced.y) return;

      if (swapSelection.length === 0) {
        setSwapSelection([coord]);
        return;
      }
      if (swapSelection.length === 1) {
        const first = swapSelection[0];
        if (first.x === coord.x && first.y === coord.y) return;

        const second = coord;
        if (lastPlaced && second.x === lastPlaced.x && second.y === lastPlaced.y) return;

        const nextBoard = cloneBoard(board);
        const idxA = first.y * settings.boardSize + first.x;
        const idxB = second.y * settings.boardSize + second.x;
        const valA = nextBoard[idxA];
        const valB = nextBoard[idxB];
        nextBoard[idxA] = valB;
        nextBoard[idxB] = valA;

        const swapAction = createSwap(first, second, currentPlayer, moves.length + 1);
        const nextMoves: GameAction[] = [...moves, swapAction];

        let nextWinner: Player | 0 = 0;
        let nextWinningLine: Coord[] = [];
        const spots = [first, second];
        for (const spot of spots) {
          const cellVal = getCell(nextBoard, settings.boardSize, spot.x, spot.y);
          if (cellVal === 0) continue;
          const res = checkWin(nextBoard, settings.boardSize, spot.x, spot.y, cellVal as Player);
          if (res.winner) {
            nextWinner = cellVal as Player;
            nextWinningLine = res.line;
            break;
          }
        }

        setBoard(nextBoard);
        setMoves(nextMoves);
        setSwapUsed(true);
        setSwapSelecting(false);
        setSwapSelection([]);
        setLastMove(null);
        setWinningLine(nextWinningLine);
        setWinner(nextWinner);
        setIsDraw(isBoardFull(nextBoard) && !nextWinner);
        setBotAnalysis(null);
        setCurrentPlayer(otherPlayer(currentPlayer));
        setReplay((prev) => ({
          ...prev,
          pointer: nextMoves.length,
          isAuto: false
        }));
      }
    },
    [
      board,
      currentPlayer,
      lastPlaced,
      moves,
      settings.boardSize,
      swapSelecting,
      swapSelection
    ]
  );

  React.useEffect(() => {
    const worker = workerRef.current;
    if (!worker) return;
    worker.onmessage = (event) => {
      const { type, requestId, payload } = event.data as {
        type: string;
        requestId?: number;
        payload?: {
          bestMove: Coord;
          topK: Candidate[];
          keyThreats: ThreatRoute[];
          pv?: { x: number; y: number; player: Player }[];
        };
      };
      if (type !== "bot-result" || requestId !== requestIdRef.current || !payload) return;
      setBotThinking(false);
      setBotAnalysis({
        topK: payload.topK,
        player: currentPlayer,
        threats: payload.keyThreats,
        pv: payload.pv
      });

      if (winner || isDraw) return;
      if (settings.mode !== "human-bot") return;
      if (currentPlayer !== botPlayer) return;

      const { x, y } = payload.bestMove;
      handlePlace(x, y, true);
    };
    return () => {
      worker.onmessage = null;
    };
  }, [botPlayer, currentPlayer, handlePlace, isDraw, settings.mode, winner]);

  const handleRestart = React.useCallback(() => {
    resetGame(settings);
  }, [resetGame, settings]);

  const handleUndo = React.useCallback(() => {
    if (moves.length === 0) return;
    const removeCount = settings.mode === "human-bot" ? Math.min(2, moves.length) : 1;
    const nextMoves = moves.slice(0, moves.length - removeCount);
    rebuildFromMoves(settings, nextMoves);
    setWinner(0);
    setWinningLine([]);
    setIsDraw(false);
    setBotThinking(false);
    setBotAnalysis(null);
    requestIdRef.current += 1;
  }, [moves, rebuildFromMoves, settings]);

  const handleSwapSides = React.useCallback(() => {
    if (settings.mode === "human-bot") {
      const nextSettings: Settings = {
        ...settings,
        humanPlayer: settings.humanPlayer === 1 ? 2 : 1
      };
      setSettings(nextSettings);
      resetGame(nextSettings);
    } else {
      const nextSettings: Settings = {
        ...settings,
        firstPlayer: settings.firstPlayer === 1 ? 2 : 1
      };
      setSettings(nextSettings);
      resetGame(nextSettings);
    }
  }, [resetGame, settings]);

  const handleBotMove = React.useCallback(() => {
    if (!workerRef.current) return;
    if (botThinking) return;
    if (winner || isDraw) return;
    if (settings.mode !== "human-bot") return;
    if (currentPlayer !== botPlayer) return;
    if (replay.pointer !== moves.length) return;

    requestIdRef.current += 1;
    const requestId = requestIdRef.current;
    setBotThinking(true);
    workerRef.current.postMessage({
      requestId,
      board: Array.from(board),
      size: settings.boardSize,
      player: currentPlayer,
      difficulty: settings.difficulty,
      timeBudgetMs: settings.timeBudgetMs,
      precisionMode: settings.precisionMode,
      precisionDepth: settings.precisionDepth,
      safetyDepth: settings.safetyDepth
    });
  }, [
    board,
    botPlayer,
    botThinking,
    currentPlayer,
    isDraw,
    moves.length,
    replay.pointer,
    settings.boardSize,
    settings.difficulty,
    settings.mode,
    settings.precisionDepth,
    settings.precisionMode,
    settings.safetyDepth,
    settings.timeBudgetMs,
    winner
  ]);

  React.useEffect(() => {
    handleBotMove();
  }, [handleBotMove]);

  React.useEffect(() => {
    if (!replay.isAuto) return;
    const timer = window.setInterval(() => {
      setReplay((prev) => {
        if (prev.pointer >= moves.length) {
          return { ...prev, isAuto: false };
        }
        return { ...prev, pointer: prev.pointer + 1 };
      });
    }, replay.speedMs);

    return () => window.clearInterval(timer);
  }, [moves.length, replay.isAuto, replay.speedMs]);

  React.useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if (isEditableElement(event.target)) return;
      if (event.key === "r" || event.key === "R") {
        handleRestart();
      }
      if (event.key === "u" || event.key === "U") {
        handleUndo();
      }
      if (event.key === " ") {
        event.preventDefault();
        setRightPanelOpen((prev) => !prev);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [handleRestart, handleUndo]);

  const displayState = React.useMemo(() => {
    if (replay.pointer === moves.length) {
      return { board, currentPlayer, lastMove, winningLine };
    }
    const { board: replayBoard, currentPlayer: replayPlayer, lastMove: replayLast } =
      buildBoardFromMoves(settings.boardSize, moves, replay.pointer, startPlayer);
    let replayLine: Coord[] = [];
    if (replayLast) {
      const res = checkWin(replayBoard, settings.boardSize, replayLast.x, replayLast.y, replayLast.player);
      if (res.winner) replayLine = res.line;
    }
    return {
      board: replayBoard,
      currentPlayer: replayPlayer,
      lastMove: replayLast ? { x: replayLast.x, y: replayLast.y } : null,
      winningLine: replayLine
    };
  }, [
    board,
    currentPlayer,
    lastMove,
    moves,
    replay.pointer,
    settings.boardSize,
    winningLine
  ]);

  const threatOverview = React.useMemo(() => {
    if (!settings.showThreats) {
      return { selfRoutes: [], oppRoutes: [] };
    }
    if (botAnalysis?.threats && botAnalysis.player === displayState.currentPlayer) {
      const selfRoutes = botAnalysis.threats
        .filter((route) => route.player === displayState.currentPlayer)
        .slice(0, 3);
      const oppRoutes = botAnalysis.threats
        .filter((route) => route.player !== displayState.currentPlayer)
        .slice(0, 2);
      return { selfRoutes, oppRoutes };
    }
    return getThreatOverview(displayState.board, settings.boardSize, displayState.currentPlayer);
  }, [
    botAnalysis,
    displayState.board,
    displayState.currentPlayer,
    settings.boardSize,
    settings.showThreats
  ]);

  const analysisCandidates = React.useMemo(() => {
    if (botAnalysis && botAnalysis.player === displayState.currentPlayer) {
      return botAnalysis.topK;
    }
    return generateCandidates(displayState.board, settings.boardSize, displayState.currentPlayer, {
      difficulty: settings.difficulty,
      precise: settings.precisionMode
    }).slice(0, 7);
  }, [
    botAnalysis,
    displayState.board,
    displayState.currentPlayer,
    settings.boardSize,
    settings.difficulty,
    settings.precisionMode
  ]);

  const replayState = replay.pointer < moves.length;

  const handleExport = () => {
    const snapshot = buildSnapshot(settings.boardSize, moves, startPlayer);
    return encodeSnapshot(snapshot);
  };

  const handleImport = (raw: string) => {
    try {
      const snapshot = decodeSnapshot(raw);
      const nextSettings = {
        ...settings,
        boardSize: snapshot.size,
        firstPlayer: snapshot.startPlayer
      };
      setSettings(nextSettings);
      rebuildFromMoves(nextSettings, snapshot.moves);
    } catch {
      alert("Invalid replay JSON");
    }
  };

  const gridCols = rightPanelOpen
    ? "md:grid-cols-[280px_minmax(0,1fr)_320px]"
    : "md:grid-cols-[280px_minmax(0,1fr)_0px]";

  return (
    <div className="min-h-screen flex flex-col">
      <header className="px-4 py-3 flex items-center justify-between md:hidden">
        <div className="font-display text-lg">{t("title")}</div>
        <div className="flex items-center gap-2">
          <button
            className="rounded-md border border-gold/40 px-3 py-1 text-sm"
            onClick={() => setMobileDrawerOpen(true)}
          >
            {t("panel")}
          </button>
          <button
            className="rounded-md border border-gold/40 px-3 py-1 text-sm"
            onClick={() => handleRestart()}
          >
            {t("restart")}
          </button>
        </div>
      </header>

      <div className={`flex-1 grid gap-4 p-4 ${gridCols}`}>
        <aside className="hidden md:block">
          <SidePanel
            settings={settings}
            status={{
              currentPlayer,
              winner,
              isDraw,
              botThinking,
              movesCount: moves.length
            }}
            canUndo={moves.length > 0}
            isReplayMode={replayState}
            swapInfo={{ used: swapUsed, selecting: swapSelecting }}
            onSettingsChange={handleSettingsChange}
            onRestart={handleRestart}
            onUndo={handleUndo}
            onSwapSides={handleSwapSides}
            onSwapSkill={canUseSwapSkill ? handleSwapStart : undefined}
          />
        </aside>

        <section className="flex flex-col items-center">
          <div className="w-full max-w-[720px] aspect-square">
            <BoardCanvas
              size={settings.boardSize}
              board={displayState.board}
              currentPlayer={displayState.currentPlayer}
              lastMove={displayState.lastMove}
              winningLine={displayState.winningLine}
            threats={[...threatOverview.selfRoutes, ...threatOverview.oppRoutes]}
            showThreats={settings.showThreats}
            disabled={
              botThinking ||
              !isHumanTurn ||
              winner !== 0 ||
              isDraw ||
              replayState
            }
            onPlace={handlePlace}
            selectionMode={swapSelecting ? "swap" : null}
            selectedCells={swapSelection}
            onSelectCell={handleSwapSelect}
          />
        </div>
          <div className="mt-4 text-sm text-slate/70 md:hidden">
            {winner
              ? `${winner === 1 ? "Black" : "White"} wins`
              : isDraw
              ? "Draw"
              : `${displayState.currentPlayer === 1 ? "Black" : "White"} to move`}
          </div>
        </section>

        <aside className={`hidden md:block transition ${rightPanelOpen ? "opacity-100" : "opacity-0 pointer-events-none"}`}>
          <div className="flex items-center gap-2 mb-3">
            <button
              className={`px-3 py-1 rounded-md text-sm border border-gold/40 ${
                rightPanelTab === "analysis" ? "bg-gold/30" : "bg-transparent"
              }`}
              onClick={() => setRightPanelTab("analysis")}
            >
              Analysis
            </button>
            <button
              className={`px-3 py-1 rounded-md text-sm border border-gold/40 ${
                rightPanelTab === "replay" ? "bg-gold/30" : "bg-transparent"
              }`}
              onClick={() => setRightPanelTab("replay")}
            >
              Replay
            </button>
            <button
              className="ml-auto text-xs text-slate/60"
              onClick={() => setRightPanelOpen((prev) => !prev)}
            >
              {rightPanelOpen ? "Hide" : "Show"}
            </button>
          </div>
          {rightPanelTab === "analysis" ? (
            <AnalysisPanel
              topK={analysisCandidates}
              threats={threatOverview}
              currentPlayer={displayState.currentPlayer}
              pv={botAnalysis?.player === displayState.currentPlayer ? botAnalysis?.pv : undefined}
            />
          ) : (
            <ReplayPanel
              moves={moves}
              replay={replay}
              onSetPointer={(pointer) =>
                setReplay((prev) => ({ ...prev, pointer, isAuto: false }))
              }
              onToggleAuto={() =>
                setReplay((prev) => ({ ...prev, isAuto: !prev.isAuto }))
              }
              onSpeedChange={(speedMs) =>
                setReplay((prev) => ({ ...prev, speedMs }))
              }
              onExport={handleExport}
              onImport={handleImport}
            />
          )}
        </aside>
      </div>

      {mobileDrawerOpen && (
        <div className="fixed inset-0 z-50 flex">
          <div className="flex-1 drawer-overlay" onClick={() => setMobileDrawerOpen(false)} />
          <div className="w-[320px] bg-parchment p-4 overflow-auto">
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-display text-lg">Panels</h3>
              <button
                className="text-sm text-slate/60"
                onClick={() => setMobileDrawerOpen(false)}
              >
                Close
              </button>
            </div>
            <div className="flex gap-2 mb-3">
              <button
                className={`px-3 py-1 rounded-md text-sm border border-gold/40 ${
                  rightPanelTab === "analysis" ? "bg-gold/30" : "bg-transparent"
                }`}
                onClick={() => setRightPanelTab("analysis")}
              >
                Analysis
              </button>
              <button
                className={`px-3 py-1 rounded-md text-sm border border-gold/40 ${
                  rightPanelTab === "replay" ? "bg-gold/30" : "bg-transparent"
                }`}
                onClick={() => setRightPanelTab("replay")}
              >
                Replay
              </button>
            </div>
            <SidePanel
              settings={settings}
              status={{
                currentPlayer,
                winner,
                isDraw,
                botThinking,
                movesCount: moves.length
              }}
              canUndo={moves.length > 0}
              isReplayMode={replayState}
              swapInfo={{ used: swapUsed, selecting: swapSelecting }}
              onSettingsChange={handleSettingsChange}
              onRestart={handleRestart}
              onUndo={handleUndo}
              onSwapSides={handleSwapSides}
              onSwapSkill={canUseSwapSkill ? handleSwapStart : undefined}
            />
            <div className="mt-4">
              {rightPanelTab === "analysis" ? (
                <AnalysisPanel
                  topK={analysisCandidates}
                  threats={threatOverview}
                  currentPlayer={displayState.currentPlayer}
                  pv={botAnalysis?.player === displayState.currentPlayer ? botAnalysis?.pv : undefined}
                />
              ) : (
                <ReplayPanel
                  moves={moves}
                  replay={replay}
                  onSetPointer={(pointer) =>
                    setReplay((prev) => ({ ...prev, pointer, isAuto: false }))
                  }
                  onToggleAuto={() =>
                    setReplay((prev) => ({ ...prev, isAuto: !prev.isAuto }))
                  }
                  onSpeedChange={(speedMs) =>
                    setReplay((prev) => ({ ...prev, speedMs }))
                  }
                  onExport={handleExport}
                  onImport={handleImport}
                />
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
