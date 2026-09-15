import type { ReactNode } from "react";
import { cn } from "../../lib/utils";

/** magicui animated gradient text, used for the product wordmark. */
export function AnimatedGradientText({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "animate-gradient-flow bg-gradient-to-r from-indigo-500 via-cyan-400 to-indigo-500",
        "bg-[length:200%_auto] bg-clip-text text-transparent",
        className
      )}
    >
      {children}
    </span>
  );
}
