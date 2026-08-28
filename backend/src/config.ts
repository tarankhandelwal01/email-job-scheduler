import "dotenv/config";
import { z } from "zod";

const senderSchema = z.object({ user: z.string(), pass: z.string() });

const schema = z.object({
  PORT: z.coerce.number().default(4000),
  DATABASE_URL: z.string(),
  REDIS_HOST: z.string().default("127.0.0.1"),
  REDIS_PORT: z.coerce.number().default(6379),
  REDIS_URL: z.string().optional(), // hosted providers (Railway, etc.) give one connection string instead of separate host/port
  // Some networks block 465, others block 587 — no single port works everywhere.
  SMTP_PORT: z.coerce.number().default(587),
  WORKER_CONCURRENCY: z.coerce.number().default(5),
  MIN_DELAY_BETWEEN_SENDS_MS: z.coerce.number().default(2000),
  MAX_EMAILS_PER_HOUR_PER_SENDER: z.coerce.number().default(200),
  MAX_LATENESS_MS: z.coerce.number().default(3_600_000),
  STALE_SENDING_MS: z.coerce.number().default(120_000),
  // A size cap, not a rate limit — protects against one request creating an
  // unbounded number of DB rows + jobs synchronously.
  MAX_RECIPIENTS_PER_CAMPAIGN: z.coerce.number().default(10_000),
  ETHEREAL_SENDERS: z.string().transform((s, ctx) => {
    try {
      const parsed = z.array(senderSchema).min(1).parse(JSON.parse(s));
      return parsed;
    } catch {
      ctx.addIssue({ code: "custom", message: "ETHEREAL_SENDERS must be a JSON array of {user,pass}" });
      return z.NEVER;
    }
  }),
});

export const config = schema.parse(process.env);
export type Sender = z.infer<typeof senderSchema>;
