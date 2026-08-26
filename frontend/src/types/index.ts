export type EmailStatus = "SCHEDULED" | "SENDING" | "SENT" | "FAILED" | "UNKNOWN";

export interface EmailRow {
  id: string;
  email: string;
  subject: string;
  scheduledTime: string;
  sentTime: string | null;
  status: EmailStatus;
  previewUrl: string | null;
  error: string | null;
  sender: string | null;
}

export interface AttachmentInput {
  filename: string;
  contentType: string;
  contentBase64: string;
}

export interface ScheduleCampaignInput {
  subject: string;
  body: string;
  recipients: string[];
  startTime: string;
  delayMs: number;
  hourlyLimit: number;
  attachments?: AttachmentInput[];
}

export interface RejectedRecipient {
  address: string;
  reason: "invalid" | "duplicate";
}

export interface ScheduleCampaignResult {
  campaignId: string;
  scheduled: number;
  rejected: RejectedRecipient[];
  replayed?: boolean;
}
