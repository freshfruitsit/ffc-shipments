"use client";

import { useState, useEffect, useRef } from "react";
import Link from "next/link";
import { Bell } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { formatDubaiDateTime } from "@/lib/dates";

type Notification = {
  id: string;
  title: string;
  message: string;
  is_read: boolean;
  created_at: string;
  link_target: string | null;
};

export function NotificationBell({ initialUnreadCount }: { initialUnreadCount: number }) {
  const [open, setOpen] = useState(false);
  const [notifications, setNotifications] = useState<Notification[] | null>(null);
  const [unreadCount, setUnreadCount] = useState(initialUnreadCount);
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  async function handleToggle() {
    const next = !open;
    setOpen(next);
    if (next && notifications === null) {
      const supabase = createClient();
      const { data } = await supabase
        .from("notifications")
        .select("id, title, message, is_read, created_at, link_target")
        .order("created_at", { ascending: false })
        .limit(15);
      setNotifications(data ?? []);
    }
  }

  async function markAsRead(id: string) {
    const supabase = createClient();
    await supabase.from("notifications").update({ is_read: true, read_at: new Date().toISOString() }).eq("id", id);
    setNotifications((list) => list?.map((n) => (n.id === id ? { ...n, is_read: true } : n)) ?? null);
    setUnreadCount((c) => Math.max(0, c - 1));
  }

  return (
    <div className="relative" ref={panelRef}>
      <button
        onClick={handleToggle}
        title="Notifications"
        className="relative flex h-9 w-9 items-center justify-center rounded-md text-ink-muted transition hover:bg-surface-muted hover:text-ink"
      >
        <Bell className="h-4.5 w-4.5" strokeWidth={2} />
        {unreadCount > 0 && (
          <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-danger px-1 text-[10px] font-bold text-white">
            {unreadCount > 9 ? "9+" : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 z-20 mt-2 w-80 rounded-lg border border-border bg-surface shadow-lg">
          <div className="border-b border-border px-4 py-2.5 text-sm font-semibold text-ink">Notifications</div>
          <div className="max-h-96 overflow-y-auto">
            {notifications === null && (
              <p className="px-4 py-6 text-center text-sm text-ink-muted">Loading…</p>
            )}
            {notifications?.length === 0 && (
              <p className="px-4 py-6 text-center text-sm text-ink-muted">No notifications yet.</p>
            )}
            {notifications?.map((n) => {
              const content = (
                <div className={`px-4 py-3 text-sm ${n.is_read ? "" : "bg-primary-light/40"}`}>
                  <p className="font-medium text-ink">{n.title}</p>
                  <p className="mt-0.5 text-xs text-ink-muted">{n.message}</p>
                  <p className="mt-1 text-[11px] text-ink-muted">{formatDubaiDateTime(n.created_at)}</p>
                </div>
              );
              return (
                <div key={n.id} className="border-b border-border last:border-0 hover:bg-surface-muted/60">
                  {n.link_target ? (
                    <Link href={n.link_target} onClick={() => !n.is_read && markAsRead(n.id)}>
                      {content}
                    </Link>
                  ) : (
                    <button className="w-full text-left" onClick={() => !n.is_read && markAsRead(n.id)}>
                      {content}
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
