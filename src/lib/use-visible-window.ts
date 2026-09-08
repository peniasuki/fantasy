"use client";

import { useEffect, useRef, useState } from "react";

/** Ventana visible + sentinel para cargar más al llegar al final del scroll. */
export function useVisibleWindow(total: number, resetKey: string, pageSize = 80) {
  const [visible, setVisible] = useState(pageSize);
  const sentinelRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    setVisible(pageSize);
  }, [resetKey, pageSize]);

  useEffect(() => {
    const el = sentinelRef.current;
    if (!el || visible >= total) return;
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setVisible((v) => Math.min(v + pageSize, total));
        }
      },
      { rootMargin: "320px 0px" },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [total, pageSize, visible]);

  return {
    visibleCount: Math.min(visible, total),
    sentinelRef,
    hasMore: visible < total,
  };
}
