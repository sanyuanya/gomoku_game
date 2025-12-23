"use client";

import React from "react";

type Lang = "en" | "zh";

const STORAGE_KEY = "gomoku:lang";

const defaultLang: Lang = "en";

const translations: Record<Lang, Record<string, string>> = {
  en: {
    title: "Offline Gomoku",
    panel: "Panel",
    restart: "Restart",
    status: "Status",
    inPlay: "In play",
    draw: "Draw",
    turn: "Turn",
    moves: "Moves",
    botThinking: "Bot thinking...",
    replayMode: "Replay mode",
    mode: "Mode",
    humanBot: "Human vs Bot",
    humanHuman: "Human vs Human",
    practice: "Practice",
    difficulty: "Difficulty",
    timeBudget: "Time budget",
    boardSize: "Board size",
    humanPlays: "Human plays",
    firstPlayer: "First player",
    showThreats: "Show threat routes",
    forbidden: "Renju forbidden (stub)",
    undo: "Undo",
    swapSides: "Swap sides",
    skillSwap: "Skill: Swap stones",
    skillSwapUsed: "Swap used",
    skillSwapSelecting: "Pick 2 stones…",
    replay: "Replay",
    analysis: "Analysis",
    replaySpeed: "Replay speed",
    noMoves: "No moves yet.",
    shortcuts: "Shortcut: R restart, U undo, Space toggle panel",
    language: "Language"
  },
  zh: {
    title: "离线五子棋",
    panel: "面板",
    restart: "重新开始",
    status: "状态",
    inPlay: "进行中",
    draw: "和棋",
    turn: "轮到",
    moves: "步数",
    botThinking: "机器人思考中…",
    replayMode: "回放模式",
    mode: "模式",
    humanBot: "人机对战",
    humanHuman: "人人对战",
    practice: "练习",
    difficulty: "难度",
    timeBudget: "思考时间",
    boardSize: "棋盘大小",
    humanPlays: "人类执子",
    firstPlayer: "先手",
    showThreats: "显示威胁线",
    forbidden: "连珠禁手（占位）",
    undo: "悔棋",
    swapSides: "换边",
    skillSwap: "技能：换位",
    skillSwapUsed: "换位已用",
    skillSwapSelecting: "选择两子…",
    replay: "回放",
    analysis: "分析",
    replaySpeed: "回放速度",
    noMoves: "还没有落子",
    shortcuts: "快捷键：R 重开，U 悔棋，空格切换面板",
    language: "语言"
  }
};

type LanguageContextType = {
  lang: Lang;
  setLang: (lang: Lang) => void;
  t: (key: string) => string;
};

export const LanguageContext = React.createContext<LanguageContextType>({
  lang: "en",
  setLang: () => {},
  t: (key: string) => translations.en[key] ?? key
});

export const LanguageProvider = ({ children }: { children: React.ReactNode }) => {
  const [lang, setLangState] = React.useState<Lang>(defaultLang);

  const setLang = (next: Lang) => {
    setLangState(next);
    if (typeof window !== "undefined") {
      localStorage.setItem(STORAGE_KEY, next);
      document.documentElement.lang = next;
    }
  };

  // Load persisted language on mount to avoid SSR/CSR mismatch.
  React.useEffect(() => {
    if (typeof window === "undefined") return;
    const stored = localStorage.getItem(STORAGE_KEY) as Lang | null;
    if (stored && (stored === "en" || stored === "zh")) {
      setLangState(stored);
      document.documentElement.lang = stored;
    }
  }, []);

  React.useEffect(() => {
    if (typeof window !== "undefined") {
      document.documentElement.lang = lang;
    }
  }, [lang]);

  const value = React.useMemo(
    () => ({
      lang,
      setLang,
      t: (key: string) => translations[lang][key] ?? translations.en[key] ?? key
    }),
    [lang]
  );

  return <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>;
};

export const useLanguage = () => React.useContext(LanguageContext);
