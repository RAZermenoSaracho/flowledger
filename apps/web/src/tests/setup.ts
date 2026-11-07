export {};

// HTTP tests that start a real Vite server run in the node environment, which has no DOM to set up.
if (typeof window !== "undefined") {
  await import("./domSetup");
}
