"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { Sidebar, Tab } from "./Sidebar";
import { SearchBar } from "./SearchBar";
import { AlertBanner } from "./AlertBanner";
import { EmailList } from "./EmailList";
import { ComposeView } from "./ComposeView";
import { fetchEmails, cancelEmail } from "@/lib/api";
import { EmailRow } from "@/types";

interface DashboardUser {
  name?: string | null;
  email?: string | null;
  image?: string | null;
}

export function Dashboard({ user }: { user: DashboardUser }) {
  const [tab, setTab] = useState<Tab>("scheduled");
  const [composing, setComposing] = useState(false);
  const [scheduled, setScheduled] = useState<EmailRow[]>([]);
  const [sent, setSent] = useState<EmailRow[]>([]);
  const [loading, setLoading] = useState(true);
  const hasLoadedOnce = useRef(false);

  const load = useCallback(async () => {
    // Skeleton only on first load — background polls shouldn't blank the list.
    if (!hasLoadedOnce.current) setLoading(true);
    try {
      const [s, sn] = await Promise.all([
        fetchEmails(["SCHEDULED", "SENDING"]),
        fetchEmails(["SENT", "FAILED", "UNKNOWN"]),
      ]);
      setScheduled(s);
      setSent(sn);
    } finally {
      setLoading(false);
      hasLoadedOnce.current = true;
    }
  }, []);

  useEffect(() => {
    load();
    // Light polling so newly-sent/rate-limited emails show up without a manual refresh.
    const interval = setInterval(load, 10000);
    return () => clearInterval(interval);
  }, [load]);

  if (composing) {
    return (
      <ComposeView
        onClose={() => setComposing(false)}
        onScheduled={() => {
          setComposing(false);
          load();
        }}
      />
    );
  }

  const failedCount = sent.filter((e) => e.status === "FAILED").length;
  const unknownCount = sent.filter((e) => e.status === "UNKNOWN").length;

  return (
    <div className="flex h-screen bg-white">
      <Sidebar
        user={user}
        activeTab={tab}
        onTabChange={setTab}
        onCompose={() => setComposing(true)}
        scheduledCount={scheduled.length}
        sentCount={sent.length}
      />
      <main className="flex-1 overflow-y-auto">
        <AlertBanner failedCount={failedCount} unknownCount={unknownCount} onView={() => setTab("sent")} />
        <SearchBar />
        {tab === "scheduled" ? (
          <EmailList
            emails={scheduled}
            loading={loading}
            emptyTitle="No scheduled emails"
            emptyDescription="Compose a new email to schedule your first send."
            onCancel={(id) => cancelEmail(id).then(load)}
          />
        ) : (
          <EmailList
            emails={sent}
            loading={loading}
            emptyTitle="No sent emails yet"
            emptyDescription="Emails will show up here once they've gone out."
          />
        )}
      </main>
    </div>
  );
}
