import { EmailStatus } from "@/types";

function formatTime(iso: string) {
  return new Date(iso).toLocaleString(undefined, {
    weekday: "short",
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
    hour12: true,
  });
}

export function StatusPill({ status, time }: { status: EmailStatus; time: string }) {
  if (status === "SCHEDULED" || status === "SENDING") {
    return (
      <span className="inline-flex w-fit shrink-0 items-center gap-1 whitespace-nowrap rounded-full bg-amber-50 px-2.5 py-1 text-xs font-medium text-amber-700">
        <ClockIcon /> {formatTime(time)}
      </span>
    );
  }
  if (status === "SENT") {
    return (
      <span className="inline-flex w-fit shrink-0 items-center whitespace-nowrap rounded-full bg-gray-100 px-2.5 py-1 text-xs font-medium text-gray-600">
        Sent
      </span>
    );
  }
  if (status === "UNKNOWN") {
    return (
      <span className="inline-flex w-fit shrink-0 items-center whitespace-nowrap rounded-full bg-purple-50 px-2.5 py-1 text-xs font-medium text-purple-700">
        Unknown
      </span>
    );
  }
  return (
    <span className="inline-flex w-fit shrink-0 items-center whitespace-nowrap rounded-full bg-red-50 px-2.5 py-1 text-xs font-medium text-red-700">
      Failed
    </span>
  );
}

function ClockIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <circle cx="12" cy="12" r="10" />
      <path d="M12 6v6l4 2" />
    </svg>
  );
}
