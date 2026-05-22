export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;

  const { ensureAutoReplenishScheduler } = await import(
    "./lib/server/auto-replenish"
  );
  const { ensureAccountCheckScheduler } = await import(
    "./lib/server/account-check"
  );
  ensureAutoReplenishScheduler();
  ensureAccountCheckScheduler();
}
