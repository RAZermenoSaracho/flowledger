import { useEffect, useState } from "react";

export type MobileSidebarSide = "left" | "right";

const mobileSidebarSideKey = "flowledger.mobileSidebarSide";
const mobileSidebarSideChangeEvent = "flowledger:mobileSidebarSideChange";

function readMobileSidebarSide(): MobileSidebarSide {
  if (typeof window === "undefined") return "left";

  return window.localStorage.getItem(mobileSidebarSideKey) === "right" ? "right" : "left";
}

export function useMobileSidebarSide() {
  const [side, setSideState] = useState<MobileSidebarSide>(readMobileSidebarSide);

  useEffect(() => {
    const syncSide = () => setSideState(readMobileSidebarSide());

    window.addEventListener("storage", syncSide);
    window.addEventListener(mobileSidebarSideChangeEvent, syncSide);

    return () => {
      window.removeEventListener("storage", syncSide);
      window.removeEventListener(mobileSidebarSideChangeEvent, syncSide);
    };
  }, []);

  const setSide = (nextSide: MobileSidebarSide) => {
    setSideState(nextSide);

    if (typeof window === "undefined") return;

    window.localStorage.setItem(mobileSidebarSideKey, nextSide);
    window.dispatchEvent(new Event(mobileSidebarSideChangeEvent));
  };

  return [side, setSide] as const;
}
