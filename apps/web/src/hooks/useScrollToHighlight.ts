import { useEffect } from "react";

/**
 * Smoothly scrolls the element with id `targetId` to the viewport centre once
 * `isLoading` is false. Does nothing without a target or when no element has
 * that id. `rerunKey` re-triggers the scroll when it changes (e.g. a tab
 * switch that re-mounts the target).
 */
export function useScrollToHighlight(
  targetId: string | null,
  isLoading: boolean,
  rerunKey?: string
): void {
  useEffect(() => {
    if (!targetId || isLoading) return;

    window.requestAnimationFrame(() => {
      document
        .getElementById(targetId)
        ?.scrollIntoView({ block: "center", behavior: "smooth" });
    });
  }, [targetId, isLoading, rerunKey]);
}
