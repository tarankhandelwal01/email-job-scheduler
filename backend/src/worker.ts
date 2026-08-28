import http from "http";
import { Worker, Job, DelayedError, UnrecoverableError } from "bullmq";
import { connection } from "./redis";
import { EMAIL_QUEUE, EmailJobData } from "./queue";
import { config } from "./config";
import { prisma } from "./prisma";
import { sendEmail, senderEmails } from "./mailer";
import { pickAvailableSender, release, nextHourBoundary } from "./rateLimiter";
import { isPermanent } from "./smtpErrors";
import { reconcile } from "./reconcile";
import { runStartupChecks } from "./startupChecks";

async function processEmail(job: Job<EmailJobData>, token?: string) {
  const { emailId } = job.data;

  const email = await prisma.email.findUnique({
    where: { id: emailId },
    include: { campaign: true },
  });
  if (!email) return;

  if (email.status === "SENT" || email.status === "FAILED" || email.status === "UNKNOWN") {
    return;
  }

  // A previous attempt claimed this row and died mid-flight.
  if (email.status === "SENDING") {
    if (!email.dispatchedAt) {
      // Died before contacting SMTP — nothing was sent, safe to reclaim.
      await prisma.email.update({
        where: { id: emailId },
        data: { status: "SCHEDULED", sendStartedAt: null },
      });
    } else {
      // Died after SMTP handoff — delivery unverifiable, so mark UNKNOWN
      // rather than risk a duplicate send.
      await prisma.email.update({
        where: { id: emailId },
        data: { status: "UNKNOWN", error: "Worker died after SMTP handoff; delivery unverifiable" },
      });
      return;
    }
  }

  const lateness = Date.now() - email.scheduledTime.getTime();
  if (lateness > config.MAX_LATENESS_MS) {
    await prisma.email.update({
      where: { id: emailId },
      data: { status: "FAILED", error: `Expired: ${Math.round(lateness / 60000)}min overdue` },
    });
    return;
  }

  // Checked before claiming the row, so a capped email never gets stuck in SENDING.
  const sender = await pickAvailableSender(senderEmails, email.campaign.hourlyLimit);
  if (!sender) {
    const deferredTo = nextHourBoundary();
    await prisma.email.update({ where: { id: emailId }, data: { scheduledTime: new Date(deferredTo) } });
    console.log(`RATE-LIMITED ${email.recipient} — deferred to ${new Date(deferredTo).toISOString()}`);
    await job.moveToDelayed(deferredTo, token);
    throw new DelayedError();
  }

  // Only succeeds if the row is still SCHEDULED — safe under worker concurrency.
  const claim = await prisma.email.updateMany({
    where: { id: emailId, status: "SCHEDULED" },
    data: { status: "SENDING", senderEmail: sender, sendStartedAt: new Date(), attempts: { increment: 1 } },
  });
  if (claim.count === 0) {
    await release(sender);
    return;
  }

  // Marked before the SMTP call so a crash can be classified pre/post-dispatch.
  await prisma.email.update({ where: { id: emailId }, data: { dispatchedAt: new Date() } });

  try {
    const { messageId, previewUrl } = await sendEmail({
      from: sender,
      to: email.recipient,
      subject: email.campaign.subject,
      body: email.campaign.body,
      attachments: (email.campaign.attachments as any) ?? undefined,
    });
    await prisma.email.update({
      where: { id: emailId },
      data: { status: "SENT", sentTime: new Date(), messageId, previewUrl, error: null },
    });
    console.log(`SENT ${email.recipient} via ${sender} — ${previewUrl}`);
  } catch (err: any) {
    await release(sender);

    if (isPermanent(err)) {
      await prisma.email.update({
        where: { id: emailId },
        data: { status: "FAILED", error: `Permanent: ${err.message}` },
      });
      throw new UnrecoverableError(err.message);
    }

    // job.attemptsMade is the count BEFORE this attempt (0 on the first run),
    // so the true attempt number is +1. The 'failed' handler below is the
    // authoritative backstop if this in-flight guess is ever wrong.
    const maxAttempts = job.opts.attempts ?? 1;
    const attemptNumber = job.attemptsMade + 1;
    const isFinalAttempt = attemptNumber >= maxAttempts;

    await prisma.email.update({
      where: { id: emailId },
      data: isFinalAttempt
        ? { status: "FAILED", error: `Exhausted ${maxAttempts} attempts: ${err.message}` }
        : { status: "SCHEDULED", error: `Transient (attempt ${attemptNumber}/${maxAttempts}): ${err.message}` },
    });
    throw err;
  }
}

const worker = new Worker<EmailJobData>(EMAIL_QUEUE, processEmail, {
  connection,
  concurrency: config.WORKER_CONCURRENCY,
  limiter: { max: 1, duration: config.MIN_DELAY_BETWEEN_SENDS_MS },
});

worker.on("failed", (job, err) => {
  console.error(`FAILED ${job?.id}: ${err?.message}`);
  if (!job) return;

  // Fires after BullMQ's own bookkeeping, so attemptsMade is exact here.
  const maxAttempts = job.opts.attempts ?? 1;
  if (job.attemptsMade >= maxAttempts) {
    prisma.email
      .updateMany({
        where: { id: job.data.emailId, status: "SCHEDULED" },
        data: { status: "FAILED", error: `Exhausted ${maxAttempts} attempts: ${err?.message ?? "unknown error"}` },
      })
      .catch((e) => console.error("Failed to correct exhausted-retry status:", e));
  }
});
worker.on("error", (err) => console.error("Worker error:", err));


// Gated on RENDER (set automatically by Render), not PORT — PORT is also
// set locally for the API's own use and would collide with it here.
if (process.env.RENDER) {
  http.createServer((_req, res) => res.end("worker ok")).listen(process.env.PORT);
}

process.on("unhandledRejection", (reason) => {
  console.error("Unhandled rejection:", reason);
});

runStartupChecks("Worker")
  .then(reconcile)
  .then(() => console.log(`Worker up. concurrency=${config.WORKER_CONCURRENCY}`))
  .catch((err) => console.error("Reconcile failed:", err));
