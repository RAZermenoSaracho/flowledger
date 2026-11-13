import { useEffect, useRef, type RefObject } from "react";

/**
 * Calls `onDismiss` when, while `enabled`, the user presses a pointer outside
 * `ref.current` or hits Escape. Listens on `document`. `onDismiss` is read
 * through a ref, so callers may pass an inline closure without re-subscribing.
 */
export function useDismiss(
  ref: RefObject<HTMLElement | null>,
  onDismiss: () => void,
  enabled: boolean
): void {
  const onDismissRef = useRef(onDismiss);
  onDismissRef.current = onDismiss;

  useEffect(() => {
    if (!enabled) return;

    const handlePointerDown = (event: PointerEvent) => {
      if (ref.current && !ref.current.contains(event.target as Node)) {
        onDismissRef.current();
      }
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onDismissRef.current();
    };

    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [ref, enabled]);
}
