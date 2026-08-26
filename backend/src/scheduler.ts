import { prisma } from "./prisma";
import { emailQueue } from "./queue";

export interface Attachment {
  filename: string;
  contentType: string;
  contentBase64: string;
}

export interface ScheduleInput {
  subject: string;
  body: string;
  recipients: string[];
  startTime: Date;
  delayMs: number;
  hourlyLimit: number;
  userId?: string;
  idempotencyKey?: string;
  attachments?: Attachment[];
}

export interface RejectedRecipient {
  address: string;
  reason: "invalid" | "duplicate";
}

export interface ScheduleResult {
  campaignId: string;
  scheduled: number;
  rejected: RejectedRecipient[];
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function scheduleCampaign(input: ScheduleInput): Promise<ScheduleResult> {
  // De-dupe and drop malformed addresses before they ever touch the DB.
  const seen = new Set<string>();
  const valid: string[] = [];
  const rejected: RejectedRecipient[] = [];

  for (const raw of input.recipients) {
    const r = raw.trim().toLowerCase();
    if (!EMAIL_RE.test(r)) {
      rejected.push({ address: raw, reason: "invalid" });
      continue;
    }
    if (seen.has(r)) {
      rejected.push({ address: raw, reason: "duplicate" });
      continue;
    }
    seen.add(r);
    valid.push(r);
  }

  const campaign = await prisma.campaign.create({
    data: {
      subject: input.subject,
      body: input.body,
      startTime: input.startTime,
      delayMs: input.delayMs,
      hourlyLimit: input.hourlyLimit,
      userId: input.userId,
      idempotencyKey: input.idempotencyKey,
      attachments: input.attachments && input.attachments.length > 0 ? (input.attachments as any) : undefined,
      emails: {
        create: valid.map((recipient, i) => ({
          recipient,
          scheduledTime: new Date(input.startTime.getTime() + i * input.delayMs),
        })),
      },
    },
    include: { emails: true },
  });

  const now = Date.now();
  await emailQueue.addBulk(
    campaign.emails.map((email) => ({
      name: "send-email",
      data: { emailId: email.id },
      opts: {
        jobId: email.id, // idempotent enqueue: re-adding the same id is a no-op
        delay: Math.max(0, email.scheduledTime.getTime() - now),
      },
    }))
  );

  return { campaignId: campaign.id, scheduled: campaign.emails.length, rejected };
}
