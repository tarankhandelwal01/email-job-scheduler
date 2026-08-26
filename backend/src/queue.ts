import { Queue } from "bullmq";
import { connection } from "./redis";

export interface EmailJobData {
  emailId: string;
}

export const EMAIL_QUEUE = "email-queue";

export const emailQueue = new Queue<EmailJobData>(EMAIL_QUEUE, {
  connection,
  defaultJobOptions: {
    attempts: 5,
    backoff: { type: "exponential", delay: 5000 }, // 5s, 10s, 20s, 40s, 80s
    removeOnComplete: { count: 1000 }, // Postgres is the durable record; keep Redis lean
    removeOnFail: { count: 5000 },
  },
});
