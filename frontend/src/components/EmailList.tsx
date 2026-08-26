"use client";

import { EmailRow } from "@/types";
import { StatusPill } from "./StatusPill";
import { EmptyState } from "./EmptyState";
import { LoadingRows } from "./LoadingRows";

interface EmailListProps {
  emails: EmailRow[];
  loading: boolean;
  emptyTitle: string;
  emptyDescription: string;
  onCancel?: (id: string) => void;
}

export function EmailList({ emails, loading, emptyTitle, emptyDescription, onCancel }: EmailListProps) {
  if (loading) return <LoadingRows />;
  if (emails.length === 0) return <EmptyState title={emptyTitle} description={emptyDescription} />;

  return (
    <div className="divide-y divide-gray-100">
      {emails.map((e) => (
        <div key={e.id} className="flex items-center gap-4 px-6 py-4 hover:bg-gray-50">
          <span className="w-48 shrink-0 truncate text-sm text-gray-500">To: {e.email}</span>
          {e.sender ? (
            <span
              title={`Sent via ${e.sender}`}
              className="hidden shrink-0 truncate rounded-full bg-gray-50 px-2 py-0.5 text-xs text-gray-400 sm:block sm:max-w-[160px]"
            >
              via {e.sender}
            </span>
          ) : null}
          <StatusPill status={e.status} time={e.status === "SENT" && e.sentTime ? e.sentTime : e.scheduledTime} />
          <span className="min-w-0 flex-1 truncate text-sm text-gray-700">
            <span className="font-medium text-gray-900">{e.subject}</span>
            {e.error ? <span className="text-red-500"> — {e.error}</span> : null}
          </span>
          {onCancel && e.status === "SCHEDULED" ? (
            <button
              onClick={() => onCancel(e.id)}
              className="shrink-0 text-xs font-medium text-red-500 hover:text-red-700 hover:underline"
            >
              Cancel
            </button>
          ) : null}
          {e.previewUrl ? (
            <a
              href={e.previewUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="shrink-0 text-xs font-medium text-brand hover:underline"
            >
              View →
            </a>
          ) : null}
          <StarIcon />
        </div>
      ))}
    </div>
  );
}

function StarIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      className="shrink-0 text-gray-300"
    >
      <polygon points="12 2 15 9 22 9.5 17 14.5 18.5 22 12 18 5.5 22 7 14.5 2 9.5 9 9" />
    </svg>
  );
}
