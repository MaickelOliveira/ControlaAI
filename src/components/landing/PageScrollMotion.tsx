"use client";
import { useEffect, type RefObject } from "react";
import { usePresentationMotion } from "./PresentationMotion";

/** One passive listener drives section-specific transforms; native scrolling is preserved. */
export function usePageScrollMotion(root: RefObject<HTMLElement | null>) {
  const { running } = usePresentationMotion();
  useEffect(() => {
    const container = root.current;
    if (!container) return;
    const nodes = [
      ...container.querySelectorAll<HTMLElement>("[data-scroll-scene]"),
    ];
    let frame = 0;
    const update = () => {
      frame = 0;
      const values = nodes.map((node) => {
        const box = node.getBoundingClientRect();
        const progress = Math.max(
          0,
          Math.min(1, (innerHeight - box.top) / (innerHeight * 0.85)),
        );
        return {
          node,
          progress: running ? progress : 1,
          visible: box.top < innerHeight && box.bottom > 0,
        };
      });
      values.forEach(({ node, progress, visible }) => {
        node.style.setProperty("--entry", String(progress));
        node.style.setProperty("--entry-y", `${(1 - progress) * 95}px`);
        node.style.setProperty("--entry-x", `${(1 - progress) * 120}px`);
        node.style.setProperty("--entry-angle", `${(1 - progress) * 12}deg`);
        node.style.setProperty("--entry-scale", String(0.86 + progress * 0.14));
        node.dataset.inview = String(visible);
      });
    };
    const schedule = () => {
      if (!frame) frame = requestAnimationFrame(update);
    };
    schedule();
    addEventListener("scroll", schedule, { passive: true });
    addEventListener("resize", schedule);
    return () => {
      cancelAnimationFrame(frame);
      removeEventListener("scroll", schedule);
      removeEventListener("resize", schedule);
    };
  }, [root, running]);
}
