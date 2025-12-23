"use client";

import * as React from "react";
import { cn } from "./utils";

type SelectProps = React.SelectHTMLAttributes<HTMLSelectElement> & {
  label?: string;
};

export const Select = React.forwardRef<HTMLSelectElement, SelectProps>(
  ({ className, label, children, ...props }, ref) => (
    <label className="text-sm flex flex-col gap-1">
      {label && <span className="text-xs uppercase tracking-[0.12em] text-slate/70">{label}</span>}
      <select
        ref={ref}
        className={cn(
          "rounded-md border border-gold/40 bg-parchment px-3 py-2 text-sm shadow-sm focus:outline-none focus:ring-2 focus:ring-gold/40",
          className
        )}
        {...props}
      >
        {children}
      </select>
    </label>
  )
);

Select.displayName = "Select";
