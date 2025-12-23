 "use client";

"use client";

import Link from "next/link";
import { useState } from "react";
import { useLanguage } from "@/components/LanguageContext";

const templates = [
  {
    id: "classic",
    title: "Classic 15x15",
    description: "Standard board, Human vs Bot (Hard).",
    path: "/game/classic?mode=human-bot&difficulty=hard&size=15"
  },
  {
    id: "arena",
    title: "Arena 19x19",
    description: "Big board, Human vs Human.",
    path: "/game/arena?mode=human-human&size=19"
  },
  {
    id: "practice",
    title: "Practice",
    description: "Sandbox with threats on, Normal bot.",
    path: "/game/practice?mode=practice&difficulty=normal&size=15"
  }
];

export default function HomePage() {
  const { lang, setLang, t } = useLanguage();
  const [roomInput, setRoomInput] = useState("");

  const targetRoom = roomInput.trim() || "custom";

  const skillGuide =
    lang === "en"
      ? [
          "Swap stones: once per game, click button then pick any two stones (not the last move) to swap; turn ends.",
          "Hover highlights show selection; swapping re-checks win instantly.",
          "Room-based local saves; links stay offline."
        ]
      : [
          "换位技能：每局 1 次，点按钮后依次点任意两枚棋子（不能是上一手），立即交换并结束回合。",
          "选中会高亮，交换后立刻重新判胜。",
          "房间独立本地存档，链接纯本地，无联网。"
        ];

  return (
    <main className="min-h-screen bg-parchment text-slate">
      <div className="max-w-5xl mx-auto px-6 py-10">
        <header className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between mb-8">
          <div>
            <h1 className="font-display text-3xl text-ember">Gomoku Lobby</h1>
            <p className="text-slate/80">
              {lang === "en"
                ? "Create or join a room. All offline, per-room state."
                : "创建或加入房间，纯本地离线，每个房间独立存档。"}
            </p>
          </div>
          <Link
            href="/game/default"
            className="rounded-lg border border-gold/60 px-4 py-2 text-sm bg-gold/20 hover:bg-gold/30 transition"
          >
            Quick Start
          </Link>
        </header>

        <div className="flex items-center gap-3 mb-4">
          <span className="text-sm text-slate/70">Language / 语言</span>
          <div className="inline-flex rounded-lg border border-gold/50 overflow-hidden">
            <button
              className={`px-3 py-1 text-sm ${lang === "en" ? "bg-gold/30" : "bg-transparent"}`}
              onClick={() => setLang("en")}
            >
              EN
            </button>
            <button
              className={`px-3 py-1 text-sm ${lang === "zh" ? "bg-gold/30" : "bg-transparent"}`}
              onClick={() => setLang("zh")}
            >
              中文
            </button>
          </div>
        </div>

        <div className="grid gap-4 md:grid-cols-[2fr_1fr]">
          <div className="panel-surface rounded-2xl shadow-panel p-4 flex flex-col gap-4">
            <h2 className="font-display text-xl">Featured rooms</h2>
            <div className="grid gap-3 md:grid-cols-3">
              {templates.map((room) => (
                <div key={room.id} className="rounded-xl border border-gold/40 bg-white/60 p-3 shadow-sm flex flex-col gap-2">
                  <div>
                    <div className="font-semibold">{room.title}</div>
                    <div className="text-sm text-slate/80">{room.description}</div>
                  </div>
                  <Link
                    href={room.path}
                    className="mt-auto inline-flex items-center justify-center rounded-lg bg-ember text-white px-3 py-2 text-sm shadow hover:shadow-lg transition"
                  >
                    Enter
                  </Link>
                </div>
              ))}
            </div>
          </div>

          <div className="panel-surface rounded-2xl shadow-panel p-4 flex flex-col gap-3">
            <h2 className="font-display text-xl">Create / Join</h2>
            <label className="text-sm text-slate/80">Room ID</label>
            <input
              className="rounded-lg border border-gold/50 bg-white/70 px-3 py-2 text-sm"
              placeholder="e.g. team-room-1"
              value={roomInput}
              onChange={(e) => setRoomInput(e.target.value)}
            />
            <div className="grid gap-2">
              <Link
                href={`/game/${encodeURIComponent(targetRoom)}`}
                className="rounded-lg bg-ember text-white px-3 py-2 text-sm text-center shadow hover:shadow-lg transition"
              >
                Enter Room
              </Link>
              <Link
                href={`/game/${encodeURIComponent(targetRoom)}?mode=human-bot&difficulty=hard&size=15`}
                className="rounded-lg border border-gold/50 bg-gold/20 px-3 py-2 text-sm text-center hover:bg-gold/30 transition"
              >
                Enter as Classic vs Bot
              </Link>
            </div>
            <p className="text-xs text-slate/70">
              {lang === "en"
                ? "Rooms are local-only. Each room_id keeps its own save/settings; sharing the link on the same machine reopens it."
                : "房间只存本地，不联网。每个 room_id 独立存档和设置，在同一设备分享链接即可进入同房间。"}
            </p>
          </div>
        </div>

        <div className="mt-6 panel-surface rounded-2xl shadow-panel p-4">
          <h2 className="font-display text-xl mb-2">{lang === "en" ? "Skill guide" : "技能提示"}</h2>
          <ul className="list-disc list-inside text-sm text-slate/80 space-y-1">
            {skillGuide.map((line, idx) => (
              <li key={idx}>{line}</li>
            ))}
          </ul>
        </div>
      </div>
    </main>
  );
}
