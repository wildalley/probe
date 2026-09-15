import type { CSSProperties, ReactNode } from "react";
import { cn } from "../../lib/utils";

interface AnimatedShinyTextProps {
  children: ReactNode;
  className?: string;
  shimmerWidth?: number;
  /** One sweep cycle, e.g. "3s". Most of the cycle is idle; the sweep itself
      occupies the middle third of it. Defaults to the 8s ambient pace. */
  duration?: string;
  /** Tailwind `via-*` class for the highlight. The default white only reads on a
      dark ground, so light themes should pass a dark one (e.g.
      `via-slate-900/40`). */
  shimmerColor?: string;
}

/**
 * magicui shiny text. The gradient is clipped to the glyphs, so the caller's
 * own `text-*` color stays visible as the base and the highlight sweeps over it.
 */
export function AnimatedShinyText({
  children,
  className,
  shimmerWidth = 80,
  duration,
  shimmerColor = "via-white/85",
}: AnimatedShinyTextProps) {
  return (
    <span
      style={
        {
          "--shiny-width": `${shimmerWidth}px`,
          ...(duration ? { "--shiny-speed": duration } : {}),
        } as CSSProperties
      }
      className={cn(
        "animate-shiny-text bg-clip-text bg-no-repeat [background-position:0_0] [background-size:var(--shiny-width)_100%]",
        "bg-gradient-to-r from-transparent via-50% to-transparent",
        shimmerColor,
        className
      )}
    >
      {children}
    </span>
  );
}
