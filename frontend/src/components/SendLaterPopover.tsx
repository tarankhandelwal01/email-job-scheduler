"use client";

import { useState } from "react";
import { Button } from "./ui/Button";

interface SendLaterPopoverProps {
  onCancel: () => void;
  onDone: (date: Date) => void;
}

export function SendLaterPopover({ onCancel, onDone }: SendLaterPopoverProps) {
  const [customDate, setCustomDate] = useState("");

  function quickPick(offsetDays: number, hour?: number, minute = 0) {
    const d = new Date();
    d.setDate(d.getDate() + offsetDays);
    if (hour !== undefined) d.setHours(hour, minute, 0, 0);
    onDone(d);
  }

  function quickPickHoursFromNow(hours: number) {
    onDone(new Date(Date.now() + hours * 3_600_000));
  }

  return (
    <div className="absolute right-0 top-11 z-20 w-72 rounded-xl border border-gray-100 bg-white p-4 shadow-lg">
      <p className="text-sm font-semibold text-gray-900">Send Later</p>

      <input
        type="datetime-local"
        value={customDate}
        onChange={(e) => setCustomDate(e.target.value)}
        className="mt-3 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-700 outline-none focus:border-brand"
      />

      <div className="mt-2 border-t border-gray-100 pt-1">
        <QuickOption label="In 1 hour" onClick={() => quickPickHoursFromNow(1)} />
        <QuickOption label="In 2 hours" onClick={() => quickPickHoursFromNow(2)} />
        <QuickOption label="In 3 hours" onClick={() => quickPickHoursFromNow(3)} />
      </div>
      <div className="border-t border-gray-100 pt-1">
        <QuickOption label="Tomorrow" onClick={() => quickPick(1)} />
        <QuickOption label="Tomorrow, 10:00 AM" onClick={() => quickPick(1, 10)} />
        <QuickOption label="Tomorrow, 11:00 AM" onClick={() => quickPick(1, 11)} />
        <QuickOption label="Tomorrow, 3:00 PM" onClick={() => quickPick(1, 15)} />
      </div>

      <div className="mt-2 flex justify-end gap-4 border-t border-gray-100 pt-3">
        <button onClick={onCancel} className="text-sm text-gray-500 hover:text-gray-700">
          Cancel
        </button>
        <Button
          onClick={() => customDate && onDone(new Date(customDate))}
          disabled={!customDate}
          className="px-5 py-1.5"
        >
          Done
        </Button>
      </div>
    </div>
  );
}

function QuickOption({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="block w-full rounded-lg px-2 py-2 text-left text-sm text-gray-700 hover:bg-gray-50"
    >
      {label}
    </button>
  );
}
