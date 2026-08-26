"use client";

import { useRef, useState } from "react";
import { Button } from "./ui/Button";
import { Input } from "./ui/Input";
import { RichTextEditor } from "./RichTextEditor";
import { SendLaterPopover } from "./SendLaterPopover";
import { scheduleCampaign } from "@/lib/api";
import { AttachmentInput } from "@/types";

const EMAIL_RE = /[^\s,;<>]+@[^\s,;<>]+\.[^\s,;<>]+/g;
const MAX_ATTACHMENTS = 10;
const MAX_ATTACHMENT_BYTES = 5 * 1024 * 1024; // 5MB/file
const MAX_TOTAL_ATTACHMENT_BYTES = 8 * 1024 * 1024; // 8MB combined, safely under the backend's 15MB request limit

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve((reader.result as string).split(",")[1] ?? "");
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

export function ComposeView({ onClose, onScheduled }: { onClose: () => void; onScheduled: () => void }) {
  // One key per compose session, reused across retries so a double-click
  // replays instead of creating a second campaign.
  const idempotencyKeyRef = useRef(crypto.randomUUID());

  const [recipients, setRecipients] = useState<string[]>([]);
  const [recipientInput, setRecipientInput] = useState("");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [delaySeconds, setDelaySeconds] = useState(2);
  const [hourlyLimit, setHourlyLimit] = useState(200);
  const [scheduledAt, setScheduledAt] = useState<Date | null>(null);
  const [showSendLater, setShowSendLater] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [warning, setWarning] = useState<string | null>(null);
  const [attachments, setAttachments] = useState<AttachmentInput[]>([]);
  const fileRef = useRef<HTMLInputElement>(null);
  const attachRef = useRef<HTMLInputElement>(null);

  async function handleAttachmentFiles(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);
    e.target.value = "";
    if (files.length === 0) return;

    if (attachments.length + files.length > MAX_ATTACHMENTS) {
      return setError(`Maximum ${MAX_ATTACHMENTS} attachments per email.`);
    }
    const tooLarge = files.find((f) => f.size > MAX_ATTACHMENT_BYTES);
    if (tooLarge) {
      return setError(`"${tooLarge.name}" is too large — max 5MB per attachment.`);
    }

    // Approximate existing total from base64 length (~4/3 the raw size);
    // new files' sizes are exact, from the File objects themselves.
    const existingBytes = attachments.reduce((sum, a) => sum + a.contentBase64.length * 0.75, 0);
    const newBytes = files.reduce((sum, f) => sum + f.size, 0);
    if (existingBytes + newBytes > MAX_TOTAL_ATTACHMENT_BYTES) {
      return setError(
        `Attachments too large combined — max ${(MAX_TOTAL_ATTACHMENT_BYTES / 1024 / 1024).toFixed(0)}MB total per email.`
      );
    }

    setError(null);
    const encoded = await Promise.all(
      files.map(async (f) => ({
        filename: f.name,
        contentType: f.type || "application/octet-stream",
        contentBase64: await fileToBase64(f),
      }))
    );
    setAttachments((prev) => [...prev, ...encoded]);
  }

  function addRecipientsFromText(text: string) {
    const found = text.match(EMAIL_RE) ?? [];
    if (found.length === 0) return;
    setRecipients((prev) => Array.from(new Set([...prev, ...found.map((e) => e.toLowerCase())])));
  }

  function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    file.text().then(addRecipientsFromText);
    e.target.value = "";
  }

  function commitTypedRecipient() {
    if (recipientInput.trim()) {
      addRecipientsFromText(recipientInput);
      setRecipientInput("");
    }
  }

  async function handleSchedule() {
    setError(null);
    if (recipients.length === 0) return setError("Add at least one recipient.");
    if (!subject.trim()) return setError("Subject is required.");

    const startTime = (scheduledAt ?? new Date()).toISOString();

    setSubmitting(true);
    try {
      const result = await scheduleCampaign(
        {
          subject,
          body,
          recipients,
          startTime,
          delayMs: Math.max(0, delaySeconds) * 1000,
          hourlyLimit: Math.max(1, hourlyLimit),
          attachments: attachments.length > 0 ? attachments : undefined,
        },
        idempotencyKeyRef.current
      );

      if (result.rejected.length > 0) {
        const invalid = result.rejected.filter((r) => r.reason === "invalid");
        const duplicate = result.rejected.filter((r) => r.reason === "duplicate");
        const parts: string[] = [];
        if (invalid.length) parts.push(`${invalid.length} invalid (${invalid.map((r) => r.address).join(", ")})`);
        if (duplicate.length)
          parts.push(`${duplicate.length} duplicate (${duplicate.map((r) => r.address).join(", ")})`);
        setWarning(`Scheduled ${result.scheduled}. Skipped: ${parts.join(" · ")}`);
      } else {
        onScheduled();
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to schedule.");
    } finally {
      setSubmitting(false);
    }
  }

  const visibleChips = recipients.slice(0, 3);
  const overflow = recipients.length - visibleChips.length;

  return (
    <div className="flex h-screen flex-col bg-white">
      <div className="relative flex items-center justify-between border-b border-gray-100 px-6 py-4">
        <button onClick={onClose} className="flex items-center gap-2 text-sm font-medium text-gray-700 hover:text-gray-900">
          ← Compose New Email
        </button>
        <div className="flex items-center gap-3">
          <button
            type="button"
            title="Attach files"
            onClick={() => attachRef.current?.click()}
            className={`relative flex h-8 w-8 items-center justify-center rounded-full ${
              attachments.length > 0 ? "text-brand" : "text-gray-400 hover:text-gray-600"
            }`}
          >
            <PaperclipIcon />
            {attachments.length > 0 ? (
              <span className="absolute -right-1 -top-1 flex h-4 w-4 items-center justify-center rounded-full bg-brand text-[10px] font-medium text-white">
                {attachments.length}
              </span>
            ) : null}
          </button>
          <input ref={attachRef} type="file" multiple onChange={handleAttachmentFiles} className="hidden" />
          <button
            type="button"
            title="Schedule for later"
            onClick={() => setShowSendLater((v) => !v)}
            className={`flex h-8 w-8 items-center justify-center rounded-full ${
              scheduledAt ? "text-brand" : "text-gray-400 hover:text-gray-600"
            }`}
          >
            <ClockIcon />
          </button>
          <Button onClick={handleSchedule} disabled={submitting}>
            {submitting ? "Scheduling…" : scheduledAt ? "Send Later" : "Send"}
          </Button>

          {showSendLater ? (
            <SendLaterPopover
              onCancel={() => setShowSendLater(false)}
              onDone={(date) => {
                setScheduledAt(date);
                setShowSendLater(false);
              }}
            />
          ) : null}
        </div>
      </div>

      {scheduledAt ? (
        <div className="border-b border-gray-100 bg-brand-light px-6 py-2 text-xs text-brand">
          Scheduled for {scheduledAt.toLocaleString()} —{" "}
          <button className="underline" onClick={() => setScheduledAt(null)}>
            clear
          </button>
        </div>
      ) : null}

      <div className="mx-auto w-full max-w-3xl flex-1 space-y-4 overflow-y-auto px-6 py-6">
        <Field label="From">
          <div className="rounded-lg bg-gray-50 px-3 py-2 text-sm text-gray-500">
            Auto-selected from configured senders (rotates by rate-limit availability)
          </div>
        </Field>

        <Field label="To">
          <div className="flex flex-wrap items-center gap-2 rounded-lg border border-gray-200 px-3 py-2">
            {visibleChips.map((r) => (
              <Chip key={r} label={r} onRemove={() => setRecipients((prev) => prev.filter((x) => x !== r))} />
            ))}
            {overflow > 0 ? (
              <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs text-gray-500">+{overflow}</span>
            ) : null}
            <input
              value={recipientInput}
              onChange={(e) => setRecipientInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === ",") {
                  e.preventDefault();
                  commitTypedRecipient();
                }
              }}
              onBlur={commitTypedRecipient}
              placeholder={recipients.length ? "" : "recipient@example.com"}
              className="min-w-[160px] flex-1 border-none bg-transparent text-sm outline-none"
            />
            <button
              onClick={() => fileRef.current?.click()}
              className="ml-auto flex items-center gap-1 whitespace-nowrap text-xs font-medium text-brand"
            >
              ↑ Upload List
            </button>
            <input ref={fileRef} type="file" accept=".csv,.txt" onChange={handleFile} className="hidden" />
          </div>
          {recipients.length > 0 ? (
            <p className="mt-1 text-xs text-gray-400">
              {recipients.length} address{recipients.length === 1 ? "" : "es"} detected
            </p>
          ) : null}
        </Field>

        <Field label="Subject">
          <input
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            placeholder="Subject"
            className="w-full border-b border-gray-200 pb-2 text-sm outline-none focus:border-brand"
          />
        </Field>

        <div className="flex gap-6">
          <Field label="Delay between emails (seconds)">
            <Input
              type="number"
              min={0}
              value={delaySeconds}
              onChange={(e) => setDelaySeconds(Number(e.target.value))}
              className="w-28"
            />
          </Field>
          <Field label="Hourly limit per sender">
            <Input
              type="number"
              min={1}
              value={hourlyLimit}
              onChange={(e) => setHourlyLimit(Number(e.target.value))}
              className="w-28"
            />
          </Field>
        </div>

        <Field label="Body">
          <RichTextEditor onChange={setBody} placeholder="Type Your Reply..." />
        </Field>

        {attachments.length > 0 ? (
          <div className="flex flex-wrap gap-2">
            {attachments.map((a, i) => (
              <span
                key={`${a.filename}-${i}`}
                className="flex items-center gap-1.5 rounded-lg border border-gray-200 bg-gray-50 px-2.5 py-1.5 text-xs text-gray-700"
              >
                <PaperclipIcon size={12} />
                <span className="max-w-[160px] truncate">{a.filename}</span>
                <button
                  onClick={() => setAttachments((prev) => prev.filter((_, idx) => idx !== i))}
                  className="text-gray-400 hover:text-gray-600"
                  aria-label={`Remove ${a.filename}`}
                >
                  ×
                </button>
              </span>
            ))}
          </div>
        ) : null}

        {error ? <p className="text-sm text-red-600">{error}</p> : null}

        {warning ? (
          <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
            <p>{warning}</p>
            <button onClick={onScheduled} className="mt-2 text-xs font-medium underline">
              Got it, close
            </button>
          </div>
        ) : null}
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      {label ? <label className="mb-1 block text-xs font-medium text-gray-500">{label}</label> : null}
      {children}
    </div>
  );
}

function Chip({ label, onRemove }: { label: string; onRemove: () => void }) {
  return (
    <span className="flex items-center gap-1 rounded-full bg-brand-light px-2.5 py-1 text-xs text-brand">
      {label}
      <button onClick={onRemove} className="text-brand/60 hover:text-brand" aria-label={`Remove ${label}`}>
        ×
      </button>
    </span>
  );
}

function ClockIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <circle cx="12" cy="12" r="10" />
      <path d="M12 6v6l4 2" />
    </svg>
  );
}

function PaperclipIcon({ size = 18 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M21.44 11.05 12.25 20.24a5 5 0 0 1-7.07-7.07l9.19-9.19a3.5 3.5 0 0 1 4.95 4.95L9.64 17.61a2 2 0 0 1-2.83-2.83l8.49-8.48" />
    </svg>
  );
}
