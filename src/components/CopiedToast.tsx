"use client";

import { dockBarShell } from "@/lib/dock-bar-surface";
import { Check } from "lucide-react";
import { motion } from "framer-motion";

export function CopiedToast() {
  return (
    <motion.div
      layout={false}
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 10 }}
      transition={{ duration: 0.15 }}
      role="status"
      aria-live="polite"
      className={`flex items-center gap-2 px-3.5 py-2 text-xs text-card-foreground ${dockBarShell}`}
    >
      <Check className="h-3.5 w-3.5 shrink-0 text-foreground" aria-hidden />
      <span className="font-medium">Copied</span>
    </motion.div>
  );
}
