"use client";

import { dockBarShell } from "@/lib/dock-bar-surface";
import { X, type LucideIcon } from "lucide-react";
import { motion } from "framer-motion";

export type ToastTone = "neutral" | "error";

export type ToastState = {
  /** Bumped on every new toast so re-firing the same message replays it. */
  id: number;
  icon: LucideIcon;
  title: string;
  detail?: string;
  tone?: ToastTone;
  /** ms before it fades on its own; omit to leave it until dismissed. */
  ttl?: number;
};

type Props = {
  toast: ToastState;
  onDismiss: () => void;
};

/**
 * Every notification in the app is this bar: same surface, position, and motion
 * as the selection dock. Results used to land in a top-of-page banner with no
 * way to close it.
 */
export function DockToast({ toast, onDismiss }: Props) {
  const { icon: Icon, title, detail, tone = "neutral" } = toast;
  const isError = tone === "error";

  return (
    <motion.div
      layout={false}
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 10 }}
      transition={{ duration: 0.15 }}
      role="status"
      aria-live="polite"
      className={`flex max-w-[min(100vw-2rem,28rem)] items-stretch ${dockBarShell}`}
    >
      <div className="flex min-w-0 flex-1 items-center gap-2 px-3.5 py-2 text-xs text-card-foreground">
        <Icon
          className={`h-3.5 w-3.5 shrink-0 ${
            isError ? "text-destructive" : "text-foreground"
          }`}
          aria-hidden
        />
        <div className="min-w-0 flex-1">
          <p
            className={`font-medium ${
              isError ? "text-destructive" : "text-foreground"
            }`}
          >
            {title}
          </p>
          {detail && (
            <p className="truncate text-[11px] text-muted-foreground">{detail}</p>
          )}
        </div>
        <button
          type="button"
          onClick={onDismiss}
          className="shrink-0 rounded-md p-0.5 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
          aria-label="Dismiss"
        >
          <X className="h-3 w-3" />
        </button>
      </div>
    </motion.div>
  );
}
