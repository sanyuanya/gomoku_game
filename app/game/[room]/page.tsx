"use client";

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
  return <GameShell roomId={params.room} presetFromQuery={preset} />;
}
