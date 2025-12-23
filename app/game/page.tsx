"use client";

import { Suspense } from "react";
import GameShell from "@/components/GameShell";

export default function GamePage() {
  return (
    <Suspense fallback={<div className="p-4 text-sm text-slate/70">Loading...</div>}>
      <GameShell />
    </Suspense>
  );
}
