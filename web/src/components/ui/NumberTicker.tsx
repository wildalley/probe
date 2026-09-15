import { useEffect, useRef } from "react";
import { useInView, useMotionValue, useSpring } from "framer-motion";
import { cn } from "../../lib/utils";

interface NumberTickerProps {
  value: number;
  decimals?: number;
  delay?: number;
  prefix?: string;
  suffix?: string;
  className?: string;
}

/**
 * Spring-driven counter. Unlike the stock magicui version this keeps tracking
 * `value` after the first reveal, so live websocket metrics glide instead of
 * snapping between frames.
 */
export function NumberTicker({
  value,
  decimals = 0,
  delay = 0,
  prefix = "",
  suffix = "",
  className,
}: NumberTickerProps) {
  const ref = useRef<HTMLSpanElement>(null);
  const motionValue = useMotionValue(0);
  const spring = useSpring(motionValue, { damping: 34, stiffness: 150, mass: 0.6 });
  const inView = useInView(ref, { once: true });

  // Paint a value immediately so the slot is never blank before the spring runs.
  useEffect(() => {
    if (ref.current && !ref.current.textContent) {
      ref.current.textContent = `${prefix}${(0).toFixed(decimals)}${suffix}`;
    }
  }, [decimals, prefix, suffix]);

  useEffect(() => {
    if (!inView) return;
    const timer = window.setTimeout(() => motionValue.set(value), delay * 1000);
    return () => window.clearTimeout(timer);
  }, [inView, value, delay, motionValue]);

  useEffect(
    () =>
      spring.on("change", (latest: number) => {
        if (ref.current) {
          ref.current.textContent = `${prefix}${latest.toFixed(decimals)}${suffix}`;
        }
      }),
    [spring, decimals, prefix, suffix]
  );

  return <span ref={ref} className={cn("inline-block tabular-nums", className)} />;
}
