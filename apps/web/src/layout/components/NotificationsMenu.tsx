import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { routes } from "../../constants/routes";
import {
  getUnreadCount,
  listNotifications,
  markAllNotificationsRead,
  markNotificationRead
} from "../../services/notifications.client";
import { getImportedTransactionsPendingCount } from "../../services/transactions.client";
import type { Notification } from "../../types/notifications.types";
import { notificationTarget } from "../utils/notificationTarget";

/** Header notification bell: unread badge, imported-transactions-pending shortcut, and a dropdown listing recent notifications. */
export function NotificationsMenu() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [isOpen, setIsOpen] = useState(false);
  const unreadCountQuery = useQuery({
    queryKey: ["notifications", "unread-count"],
    queryFn: async () => (await getUnreadCount()).count,
    refetchInterval: 60_000
  });
  const pendingImportedCountQuery = useQuery({
    queryKey: ["provider-imported-transactions", "pending-count"],
    queryFn: async () => (await getImportedTransactionsPendingCount()).count,
    refetchInterval: 60_000
  });
  const notificationsQuery = useQuery({
    queryKey: ["notifications"],
    enabled: isOpen,
    queryFn: async () => (await listNotifications()).notifications
  });
  const markRead = useMutation({
    mutationFn: (notificationId: string) =>
      markNotificationRead(notificationId),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["notifications"] });
      await queryClient.invalidateQueries({
        queryKey: ["notifications", "unread-count"]
      });
    }
  });
  const markAllRead = useMutation({
    mutationFn: () => markAllNotificationsRead(),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["notifications"] });
      await queryClient.invalidateQueries({
        queryKey: ["notifications", "unread-count"]
      });
    }
  });

  const unreadCount = unreadCountQuery.data ?? 0;
  const pendingImportedCount = pendingImportedCountQuery.data ?? 0;
  const notifications = notificationsQuery.data ?? [];
  const isActing = markRead.isPending || markAllRead.isPending;

  useEffect(() => {
    if (!isOpen) return;

    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setIsOpen(false);
    };

    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [isOpen]);

  async function openNotification(notification: Notification) {
    if (!notification.readAt) {
      await markRead.mutateAsync(notification.id);
    }

    const target = notificationTarget(notification);
    if (target) {
      setIsOpen(false);
      navigate(target);
    }
  }

  return (
    <div className="relative flex items-center gap-2">
      {pendingImportedCount > 0 ? (
        <button
          type="button"
          className="hidden rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm font-semibold text-amber-900 transition hover:bg-amber-100 dark:border-amber-700 dark:bg-amber-950/40 dark:text-amber-100 dark:hover:bg-amber-900/40 sm:inline-flex"
          onClick={() =>
            navigate(`${routes.transactions}?tab=imported&status=pending`)
          }
        >
          {pendingImportedCount} imported pending
        </button>
      ) : null}
      <div className="relative">
        <button
          type="button"
          className="relative inline-flex h-10 w-10 items-center justify-center rounded-md border border-slate-200 text-slate-700 transition hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-pine focus:ring-offset-2 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800 dark:focus:ring-offset-slate-950"
          aria-label="Notifications"
          aria-expanded={isOpen}
          onClick={() => setIsOpen((current) => !current)}
        >
          <BellIcon />
          {unreadCount > 0 ? (
            <span className="absolute -right-2 -top-2 min-w-5 rounded-full bg-pine px-1.5 py-0.5 text-center text-xs font-bold text-white dark:bg-emerald-500 dark:text-slate-950">
              {unreadCount > 99 ? "99+" : unreadCount}
            </span>
          ) : null}
        </button>

        {isOpen ? (
          <div className="absolute right-0 z-20 mt-2 w-[min(22rem,calc(100vw-2rem))] rounded-md border border-slate-200 bg-white shadow-xl dark:border-slate-800 dark:bg-slate-900">
            <div className="flex items-center justify-between gap-3 border-b border-slate-200 px-4 py-3 dark:border-slate-800">
              <h2 className="text-sm font-semibold text-ink dark:text-slate-100">
                Notifications
              </h2>
              <button
                type="button"
                className="rounded-md px-2 py-1 text-xs font-semibold text-pine transition hover:bg-mint disabled:cursor-not-allowed disabled:opacity-60 dark:text-emerald-300 dark:hover:bg-emerald-950"
                disabled={unreadCount === 0 || isActing}
                onClick={() => markAllRead.mutate()}
              >
                Mark all read
              </button>
            </div>
            <div className="max-h-96 overflow-y-auto p-2">
              {notificationsQuery.isLoading ? (
                <p className="px-2 py-4 text-sm text-slate-500 dark:text-slate-400">
                  Loading notifications.
                </p>
              ) : notifications.length === 0 ? (
                <p className="px-2 py-4 text-sm text-slate-500 dark:text-slate-400">
                  No notifications yet.
                </p>
              ) : (
                <div className="grid gap-2">
                  {notifications.map((notification) => (
                    <div
                      key={notification.id}
                      role="button"
                      tabIndex={0}
                      className={`rounded-md border p-3 ${
                        notification.readAt
                          ? "border-slate-200 dark:border-slate-800"
                          : "border-pine bg-mint dark:border-emerald-600 dark:bg-emerald-950"
                      }`}
                      onClick={() => void openNotification(notification)}
                      onKeyDown={(event) => {
                        if (event.key === "Enter" || event.key === " ") {
                          event.preventDefault();
                          void openNotification(notification);
                        }
                      }}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="text-sm font-semibold text-ink dark:text-slate-100">
                            {notification.title}
                          </p>
                          <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">
                            {notification.message}
                          </p>
                          <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">
                            {new Date(notification.createdAt).toLocaleString()}
                          </p>
                        </div>
                        {!notification.readAt ? (
                          <button
                            type="button"
                            className="shrink-0 rounded-md px-2 py-1 text-xs font-semibold text-pine transition hover:bg-white/70 disabled:cursor-not-allowed disabled:opacity-60 dark:text-emerald-300 dark:hover:bg-slate-900"
                            disabled={isActing}
                            onClick={(event) => {
                              event.stopPropagation();
                              markRead.mutate(notification.id);
                            }}
                          >
                            Read
                          </button>
                        ) : null}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}

function BellIcon() {
  return (
    <svg
      aria-hidden="true"
      className="h-5 w-5"
      fill="none"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="2"
      viewBox="0 0 24 24"
    >
      <path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9" />
      <path d="M13.7 21a2 2 0 0 1-3.4 0" />
    </svg>
  );
}
