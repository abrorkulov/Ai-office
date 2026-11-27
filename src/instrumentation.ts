export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const { env } = await import("./server/env");
  if (!env().workerInline) return;
  const { startWorker } = await import("./server/agent/worker");
  startWorker();
}
