import { prisma } from "./prisma";
import { emailQueue } from "./queue";
import { connection } from "./redis";
import { config } from "./config";

// Postgres is the source of truth; Redis/BullMQ is disposable. Runs on worker
// boot so restarts (or a full Redis wipe) recover cleanly.
export async function reconcile(): Promise<void> {
  const lock = await connection.set("lock:reconcile", "1", "EX", 60, "NX");
  if (!lock) {
    console.log("Reconcile: another instance holds the lock, skipping.");
    return;
  }

  try {
    const pending = await prisma.email.findMany({
      where: { status: "SCHEDULED" },
      select: { id: true, scheduledTime: true },
      orderBy: { scheduledTime: "asc" },
    });

    const missing: { name: string; data: { emailId: string }; opts: { jobId: string; delay: number } }[] = [];
    for (const e of pending) {
      const existingJob = await emailQueue.getJob(e.id);
      if (!existingJob) {
        missing.push({
          name: "send-email",
          data: { emailId: e.id },
          opts: { jobId: e.id, delay: Math.max(0, e.scheduledTime.getTime() - Date.now()) },
        });
      }
    }
    if (missing.length) await emailQueue.addBulk(missing);

    // Rows orphaned in SENDING with no live job (e.g. Redis was wiped).
    const staleBefore = new Date(Date.now() - config.STALE_SENDING_MS);
    const stuck = await prisma.email.findMany({
      where: { status: "SENDING", sendStartedAt: { lt: staleBefore } },
    });

    let swept = 0;
    for (const e of stuck) {
      if (await emailQueue.getJob(e.id)) continue;

      if (e.dispatchedAt) {
        await prisma.email.update({
          where: { id: e.id },
          data: { status: "UNKNOWN", error: "Orphaned after SMTP handoff (reconcile sweep)" },
        });
      } else {
        await prisma.email.update({
          where: { id: e.id },
          data: { status: "SCHEDULED", sendStartedAt: null },
        });
        await emailQueue.add("send-email", { emailId: e.id }, { jobId: e.id, delay: 0 });
      }
      swept++;
    }

    console.log(
      `Reconcile: ${pending.length} scheduled checked, ${missing.length} re-enqueued, ${swept} stale SENDING rows swept.`
    );
  } finally {
    // Released immediately on completion — the TTL is only a crash safety net.
    await connection.del("lock:reconcile");
  }
}
