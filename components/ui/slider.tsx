"use client";

import * as React from "react";
import { cn } from "./utils";

type SliderProps = React.InputHTMLAttributes<HTMLInputElement> & {
  label?: string;
  valueLabel?: string;
};

export const Slider = React.forwardRef<HTMLInputElement, SliderProps>(
  ({ className, label, valueLabel, ...props }, ref) => (
    <label className="text-sm flex flex-col gap-2">
      <span className="flex items-center justify-between text-xs uppercase tracking-[0.12em] text-slate/70">
        <span>{label}</span>
        {valueLabel && <span className="font-semibold text-ink">{valueLabel}</span>}
      </span>
      <input
        ref={ref}
        type="range"
        className={cn("accent-ember", className)}
        {...props}
      />
    </label>
  )
);

Slider.displayName = "Slider";
