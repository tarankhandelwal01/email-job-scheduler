import { Router, Request, Response, NextFunction } from "express";
import { z } from "zod";
import { prisma } from "../prisma";
import { scheduleCampaign } from "../scheduler";
import { emailQueue } from "../queue";
import { config } from "../config";

export const router = Router();

// Express 4 doesn't catch rejected promises from async handlers — this
// forwards any rejection to the error middleware in app.ts instead of
// crashing the process.
function asyncHandler(fn: (req: Request, res: Response) => Promise<void | Response>) {
  return (req: Request, res: Response, next: NextFunction) => {
    fn(req, res).catch(next);
  };
}

const scheduleSchema = z.object({
  subject: z.string().min(1),
  body: z.string().min(1),
  recipients: z
    .array(z.string())
    .min(1)
    .max(
      config.MAX_RECIPIENTS_PER_CAMPAIGN,
      `Maximum ${config.MAX_RECIPIENTS_PER_CAMPAIGN} recipients per campaign — split larger lists into multiple campaigns.`
    ),
  startTime: z.coerce.date(),
  delayMs: z.coerce.number().min(0),
  hourlyLimit: z.coerce.number().min(1),
  attachments: z
    .array(
      z.object({
        filename: z.string().min(1),
        contentType: z.string().min(1),
        contentBase64: z.string().min(1),
      })
    )
    .max(10, "Maximum 10 attachments per email")
    .optional(),
});

router.post("/campaigns", asyncHandler(async (req, res) => {
  const parsed = scheduleSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.flatten() });
  }

  // Replaying the same key returns the original campaign instead of scheduling twice.
  const idempotencyKey = req.header("Idempotency-Key") ?? undefined;
  if (idempotencyKey) {
    const existing = await prisma.campaign.findUnique({
      where: { idempotencyKey },
      include: { _count: { select: { emails: true } } },
    });
    if (existing) {
      return res.status(200).json({
        campaignId: existing.id,
        scheduled: existing._count.emails,
        rejected: [],
        replayed: true,
      });
    }
  }

  const result = await scheduleCampaign({ ...parsed.data, idempotencyKey });
  res.status(201).json(result);
}));

// Powers both dashboard tables: ?status=SCHEDULED or ?status=SENT
router.get("/emails", asyncHandler(async (req, res) => {
  const status = typeof req.query.status === "string" ? req.query.status.toUpperCase() : undefined;
  const emails = await prisma.email.findMany({
    where: status ? { status: status as any } : undefined,
    orderBy: { scheduledTime: "asc" },
    include: { campaign: { select: { subject: true } } },
  });

  res.json(
    emails.map((e) => ({
      id: e.id,
      email: e.recipient,
      subject: e.campaign.subject,
      scheduledTime: e.scheduledTime,
      sentTime: e.sentTime,
      status: e.status,
      previewUrl: e.previewUrl,
      error: e.error,
      sender: e.senderEmail, // null until dispatch time
    }))
  );
}));

// Manual recovery for FAILED / UNKNOWN emails — the operational "DLQ retry" action.
router.post("/emails/:id/retry", asyncHandler(async (req, res) => {
  const email = await prisma.email.findUnique({ where: { id: req.params.id } });
  if (!email) return res.status(404).json({ error: "Not found" });
  if (email.status !== "FAILED" && email.status !== "UNKNOWN") {
    return res.status(409).json({ error: `Cannot retry from status ${email.status}` });
  }

  await prisma.email.update({
    where: { id: email.id },
    data: {
      status: "SCHEDULED",
      error: null,
      dispatchedAt: null,
      sendStartedAt: null,
      scheduledTime: new Date(), // reset so it doesn't immediately re-expire as overdue
    },
  });

  // Original jobId is consumed; suffix keeps this enqueue deterministic and unique.
  await emailQueue.add(
    "send-email",
    { emailId: email.id },
    { jobId: `${email.id}:retry:${email.attempts}`, delay: 0 }
  );

  res.json({ ok: true, emailId: email.id });
}));

// Cancel a not-yet-sent email. Only SCHEDULED is cancelable — once a worker
// has claimed the row (SENDING) it's too late to safely pull back, since it
// may already be mid-handoff to SMTP.
router.post("/emails/:id/cancel", asyncHandler(async (req, res) => {
  const email = await prisma.email.findUnique({ where: { id: req.params.id } });
  if (!email) return res.status(404).json({ error: "Not found" });
  if (email.status !== "SCHEDULED") {
    return res.status(409).json({ error: `Cannot cancel from status ${email.status}` });
  }

  const job = await emailQueue.getJob(email.id);
  if (job) await job.remove();

  await prisma.email.update({
    where: { id: email.id },
    data: { status: "FAILED", error: "Canceled by user" },
  });

  res.json({ ok: true, emailId: email.id });
}));
