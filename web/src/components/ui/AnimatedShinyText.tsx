import type { CSSProperties, ReactNode } from "react";
import { cn } from "../../lib/utils";

interface AnimatedShinyTextProps {
  children: ReactNode;
  className?: string;
  shimmerWidth?: number;
}

/**
 * magicui shiny text. The gradient is clipped to the glyphs, so the caller's
 * own `text-*` color stays visible as the base and the highlight sweeps over it.
 */
export function AnimatedShinyText({ children, className, shimmerWidth = 80 }: AnimatedShinyTextProps) {
  return (
    <span
      style={{ "--shiny-width": `${shimmerWidth}px` } as CSSProperties}
      className={cn(
        "animate-shiny-text bg-clip-text bg-no-repeat [background-position:0_0] [background-size:var(--shiny-width)_100%]",
        "bg-gradient-to-r from-transparent via-white/85 via-50% to-transparent",
        className
      )}
    >
      {children}
    </span>
  );
}
