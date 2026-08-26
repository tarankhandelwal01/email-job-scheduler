import { EmailRow, EmailStatus, ScheduleCampaignInput, ScheduleCampaignResult } from "@/types";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000/api";

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_URL}${path}`, {
    ...init,
    headers: { "Content-Type": "application/json", ...init?.headers },
  });
  if (!res.ok) {
    const errBody = await res.json().catch(() => ({}));
    throw new Error(errBody?.error ? JSON.stringify(errBody.error) : `Request failed: ${res.status}`);
  }
  return res.json();
}

export function fetchEmails(statuses: EmailStatus[]): Promise<EmailRow[]> {
  return Promise.all(statuses.map((s) => request<EmailRow[]>(`/emails?status=${s}`))).then((lists) =>
    lists.flat().sort((a, b) => new Date(b.scheduledTime).getTime() - new Date(a.scheduledTime).getTime())
  );
}

// idempotencyKey is supplied by the caller, not generated here — a retry
// needs the SAME key as the original attempt to be recognized as a replay.
export function scheduleCampaign(
  input: ScheduleCampaignInput,
  idempotencyKey: string
): Promise<ScheduleCampaignResult> {
  return request<ScheduleCampaignResult>("/campaigns", {
    method: "POST",
    body: JSON.stringify(input),
    headers: { "Idempotency-Key": idempotencyKey },
  });
}

export function retryEmail(id: string): Promise<{ ok: boolean }> {
  return request(`/emails/${id}/retry`, { method: "POST" });
}

export function cancelEmail(id: string): Promise<{ ok: boolean }> {
  return request(`/emails/${id}/cancel`, { method: "POST" });
}
