"use client";

import * as React from "react";
import { cn } from "./utils";

type SwitchProps = React.InputHTMLAttributes<HTMLInputElement> & {
  label?: string;
};

export const Switch = React.forwardRef<HTMLInputElement, SwitchProps>(
  ({ className, label, ...props }, ref) => (
    <label className="flex items-center gap-2 text-sm">
      <span className="relative inline-flex items-center">
        <input
          ref={ref}
          type="checkbox"
          className={cn("peer sr-only", className)}
          {...props}
        />
        <span className="h-5 w-9 rounded-full bg-slate/20 border border-slate/30 peer-checked:bg-moss transition" />
        <span className="absolute left-1 h-3.5 w-3.5 rounded-full bg-white shadow transition peer-checked:translate-x-4" />
      </span>
      {label && <span>{label}</span>}
    </label>
  )
);

Switch.displayName = "Switch";
