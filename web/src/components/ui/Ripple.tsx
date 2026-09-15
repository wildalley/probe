import type { CSSProperties } from "react";
import { cn } from "../../lib/utils";

interface RippleProps {
  className?: string;
  circles?: number;
  baseSize?: number;
}

/** magicui ripple: concentric breathing rings, used behind empty states. */
export function Ripple({ className, circles = 6, baseSize = 180 }: RippleProps) {
  return (
    <div
      className={cn(
        "pointer-events-none absolute inset-0 select-none overflow-hidden",
        "[mask-image:radial-gradient(circle_at_center,white,transparent_75%)]",
        className
      )}
    >
      {Array.from({ length: circles }, (_, i) => {
        const size = baseSize + i * 90;
        return (
          <div
            key={i}
            className="absolute left-1/2 top-1/2 animate-ripple rounded-full border border-indigo-400/25 bg-indigo-500/[0.04]"
            style={
              {
                width: size,
                height: size,
                opacity: Math.max(0.04, 0.26 - i * 0.035),
                animationDelay: `${i * 0.18}s`,
              } as CSSProperties
            }
          />
        );
      })}
    </div>
  );
}
