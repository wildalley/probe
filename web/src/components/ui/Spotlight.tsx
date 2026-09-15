import React, { useCallback, useRef, useState } from "react";

/**
 * Aceternity-style cursor spotlight. Spread `bind` on the card, attach `ref`,
 * and render `overlay` as the first child (the card needs `relative`).
 */
export function useSpotlight(color = "rgba(120, 119, 198, 0.16)", size = 350) {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState({ x: 0, y: 0 });
  const [active, setActive] = useState(false);

  const onMouseMove = useCallback((e: React.MouseEvent<HTMLElement>) => {
    const el = ref.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    setPos({ x: e.clientX - rect.left, y: e.clientY - rect.top });
  }, []);

  const bind = {
    onMouseMove,
    onMouseEnter: () => setActive(true),
    onMouseLeave: () => setActive(false),
  };

  const overlay = (
    <div
      className="pointer-events-none absolute -inset-px rounded-[inherit] transition-opacity duration-300"
      style={{
        opacity: active ? 1 : 0,
        background: `radial-gradient(${size}px circle at ${pos.x}px ${pos.y}px, ${color}, transparent 80%)`,
      }}
    />
  );

  return { ref, bind, active, overlay };
}
