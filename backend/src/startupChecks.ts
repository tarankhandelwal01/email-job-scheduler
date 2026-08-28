import { prisma } from "./prisma";
import { connection } from "./redis";
import { senderEmails } from "./mailer";

// Diagnostic only, not a gate — a brief outage at boot shouldn't be fatal.
export async function runStartupChecks(processName: string): Promise<void> {
  try {
    await prisma.$queryRaw`SELECT 1`;
    console.log(`[${processName}] Postgres: connected`);
  } catch (err) {
    console.error(`[${processName}] Postgres: NOT connected — ${err instanceof Error ? err.message : err}`);
  }

  try {
    const pong = await connection.ping();
    console.log(`[${processName}] Redis: connected (${pong})`);
  } catch (err) {
    console.error(`[${processName}] Redis: NOT connected — ${err instanceof Error ? err.message : err}`);
  }

  console.log(`[${processName}] Ethereal senders configured: ${senderEmails.join(", ") || "(none)"}`);
}
