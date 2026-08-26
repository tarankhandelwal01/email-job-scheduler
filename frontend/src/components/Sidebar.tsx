"use client";

import { signOut } from "next-auth/react";
import { Avatar } from "./ui/Avatar";
import { Button } from "./ui/Button";
import { cn } from "@/lib/utils";

export type Tab = "scheduled" | "sent";

interface SidebarProps {
  user: { name?: string | null; email?: string | null; image?: string | null };
  activeTab: Tab;
  onTabChange: (tab: Tab) => void;
  onCompose: () => void;
  scheduledCount: number;
  sentCount: number;
}

export function Sidebar({ user, activeTab, onTabChange, onCompose, scheduledCount, sentCount }: SidebarProps) {
  return (
    <aside className="flex h-screen w-60 shrink-0 flex-col border-r border-gray-100 bg-white px-4 py-5">
      <div className="px-2 text-xl font-extrabold tracking-tight text-gray-900">ReachInbox</div>

      <div className="mt-6 flex items-center gap-3 px-2">
        <Avatar src={user.image} alt={user.name ?? user.email ?? "U"} />
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-gray-900">{user.name}</p>
          <p className="truncate text-xs text-gray-400">{user.email}</p>
        </div>
      </div>

      <Button variant="outline" className="mt-4 w-full" onClick={onCompose}>
        Compose
      </Button>

      <p className="mt-6 px-2 text-xs font-medium uppercase tracking-wide text-gray-400">Core</p>
      <nav className="mt-1 flex flex-col gap-0.5">
        <NavItem
          icon={<ClockIcon />}
          label="Scheduled"
          count={scheduledCount}
          active={activeTab === "scheduled"}
          onClick={() => onTabChange("scheduled")}
        />
        <NavItem
          icon={<SendIcon />}
          label="Sent"
          count={sentCount}
          active={activeTab === "sent"}
          onClick={() => onTabChange("sent")}
        />
      </nav>

      <button
        onClick={() => signOut({ callbackUrl: "/login" })}
        className="mt-auto rounded-lg px-2 py-2 text-left text-xs text-gray-400 hover:bg-gray-50 hover:text-gray-600"
      >
        Log out
      </button>
    </aside>
  );
}

function NavItem({
  icon,
  label,
  count,
  active,
  onClick,
}: {
  icon: React.ReactNode;
  label: string;
  count: number;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "flex items-center gap-2 rounded-lg px-2 py-2 text-sm font-medium",
        active ? "bg-brand-light text-brand" : "text-gray-600 hover:bg-gray-50"
      )}
    >
      {icon}
      <span className="flex-1 text-left">{label}</span>
      <span className={cn("text-xs", active ? "text-brand" : "text-gray-400")}>{count}</span>
    </button>
  );
}

function ClockIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="shrink-0">
      <circle cx="12" cy="12" r="10" />
      <path d="M12 6v6l4 2" />
    </svg>
  );
}

function SendIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="shrink-0">
      <path d="m22 2-7 20-4-9-9-4Z" />
      <path d="M22 2 11 13" />
    </svg>
  );
}
