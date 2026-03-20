"use client";

import { dockBarShell } from "@/lib/dock-bar-surface";
import { AlertCircle, Check, Loader2, X } from "lucide-react";
import { motion } from "framer-motion";

export type AddLinkBarState =
  | { kind: "adding"; url: string }
  | { kind: "success"; folderName: string }
  | { kind: "error"; message: string };

type Props = {
  state: AddLinkBarState;
  onDismiss: () => void;
};

export function AddLinkStatusBar({ state, onDismiss }: Props) {
  return (
    <motion.div
      layout={false}
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 10 }}
      transition={{ duration: 0.15 }}
      role="status"
      aria-live="polite"
      className={`flex max-w-[min(100vw-2rem,26rem)] items-stretch ${dockBarShell}`}
    >
      <div className="flex min-w-0 flex-1 items-center gap-2 px-3.5 py-2 text-xs text-card-foreground">
      {state.kind === "adding" && (
        <>
          <Loader2
            className="h-3.5 w-3.5 shrink-0 animate-spin text-muted-foreground"
            aria-hidden
          />
          <div className="min-w-0 flex-1">
            <p className="font-medium text-foreground">Saving link…</p>
            <p className="truncate text-[11px] text-muted-foreground">{state.url}</p>
          </div>
        </>
      )}
      {state.kind === "success" && (
        <>
          <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-secondary">
            <Check className="h-3.5 w-3.5 text-foreground" aria-hidden />
          </span>
          <p className="min-w-0 flex-1 leading-snug">
            <span className="text-muted-foreground">Added to </span>
            <span className="font-medium text-foreground">{state.folderName}</span>
          </p>
        </>
      )}
      {state.kind === "error" && (
        <>
          <AlertCircle
            className="h-3.5 w-3.5 shrink-0 text-destructive"
            aria-hidden
          />
          <p className="min-w-0 flex-1 text-destructive">{state.message}</p>
        </>
      )}
      {state.kind !== "adding" && (
        <button
          type="button"
          onClick={onDismiss}
          className="shrink-0 rounded-md p-0.5 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
          aria-label="Dismiss"
        >
          <X className="h-3 w-3" />
        </button>
      )}
      </div>
    </motion.div>
  );
}
