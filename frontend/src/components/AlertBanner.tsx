interface AlertBannerProps {
  failedCount: number;
  unknownCount: number;
  onView: () => void;
}

// Persistent, not a one-off toast — stays visible until the count is zero.
export function AlertBanner({ failedCount, unknownCount, onView }: AlertBannerProps) {
  if (failedCount === 0 && unknownCount === 0) return null;

  return (
    <div className="flex flex-col gap-1 border-b border-amber-100 bg-amber-50 px-6 py-2 text-sm text-amber-800">
      {failedCount > 0 ? (
        <button onClick={onView} className="flex items-center gap-2 text-left hover:underline">
          <span>
            ⚠️ {failedCount} email{failedCount === 1 ? "" : "s"} failed
          </span>
          <span className="text-xs font-medium">View failed emails →</span>
        </button>
      ) : null}
      {unknownCount > 0 ? (
        <button onClick={onView} className="flex items-center gap-2 text-left hover:underline">
          <span>
            ⚠️ {unknownCount} email{unknownCount === 1 ? "" : "s"} require attention
          </span>
          <span className="text-xs">Some deliveries have an unknown SMTP outcome.</span>
        </button>
      ) : null}
    </div>
  );
}
