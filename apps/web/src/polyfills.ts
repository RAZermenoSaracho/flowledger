const syncfyGlobal = globalThis as typeof globalThis & {
  global?: typeof globalThis;
};

if (typeof syncfyGlobal.global === "undefined") {
  syncfyGlobal.global = globalThis;
}
