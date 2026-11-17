// Starts the media job worker inside the Node.js server process.
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs" || process.env.VELLUTO_WORKER === "0") return;
  const { drainQueue } = await import("./server/media.ts");
  const tick = () => { drainQueue().catch((e) => console.error("[media worker]", e)); };
  tick();
  setInterval(tick, 5000).unref();
}
