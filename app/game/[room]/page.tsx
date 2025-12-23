"use client";

import { Suspense } from "react";
import GameShell from "@/components/GameShell";

export default function GameRoomPage({
  params,
  searchParams
}: {
  params: { room: string };
  searchParams: Record<string, string | string[] | undefined>;
}) {
  const preset = {
    size: typeof searchParams.size === "string" ? searchParams.size : undefined,
    mode: typeof searchParams.mode === "string" ? searchParams.mode : undefined,
    difficulty: typeof searchParams.difficulty === "string" ? searchParams.difficulty : undefined
  };
  return (
    <Suspense fallback={<div className="p-4 text-sm text-slate/70">Loading...</div>}>
      <GameShell roomId={params.room} presetFromQuery={preset} />
    </Suspense>
  );
}
