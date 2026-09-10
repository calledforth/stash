"use client";

import type { Folder } from "@/lib/links-types";
import { dockBarShell, dockDropdownSurface } from "@/lib/dock-bar-surface";
import {
  ClipboardCopy,
  FolderInput,
  FolderPlus,
  Loader2,
  Sparkles,
  Trash2,
  X,
} from "lucide-react";
import { motion } from "framer-motion";
import { useEffect, useRef, useState } from "react";

type SelectionBarProps = {
  count: number;
  folders: Folder[];
  onMoveToFolder: (folderId: string) => void;
  onCreateFolderAndMove: (name: string) => void;
  onOrganize: () => void;
  organizing?: boolean;
  onRemove: () => void;
  onClear: () => void;
  onCopyAll?: () => void;
};

// Every dock action is a pill that fills in under the pointer. A colour-only
// hover did nothing here: `card-foreground` and `foreground` are the same ink.
// `active` holds the fill while the action's own menu is open.
function actionClass(active = false) {
  return `flex items-center gap-1.5 rounded-md px-2 py-1 outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50 ${
    active ? "bg-accent text-foreground" : "enabled:hover:bg-accent"
  }`;
}

const menuItemClass =
  "flex w-full items-center rounded-md px-2.5 py-1.5 text-left transition-colors hover:bg-accent hover:text-foreground";

export function SelectionBar({
  count,
  folders,
  onMoveToFolder,
  onCreateFolderAndMove,
  onOrganize,
  organizing,
  onRemove,
  onClear,
  onCopyAll,
}: SelectionBarProps) {
  const [showNewFolder, setShowNewFolder] = useState(false);
  const [showMoveMenu, setShowMoveMenu] = useState(false);
  const [newFolderName, setNewFolderName] = useState("");
  const moveMenuRef = useRef<HTMLDivElement>(null);
  const newFolderRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onDocMouseDown(e: MouseEvent) {
      if (
        showMoveMenu &&
        moveMenuRef.current &&
        !moveMenuRef.current.contains(e.target as Node)
      ) {
        setShowMoveMenu(false);
      }
      if (
        showNewFolder &&
        newFolderRef.current &&
        !newFolderRef.current.contains(e.target as Node)
      ) {
        setShowNewFolder(false);
      }
    }
    // Escape peels back one layer at a time: an open menu first, then the
    // selection itself. Anything that already used the key — the command bar
    // clearing its text, the folder menu closing — marks it handled.
    function onKeyDown(e: KeyboardEvent) {
      if (e.key !== "Escape" || e.defaultPrevented) return;
      if (showMoveMenu || showNewFolder) {
        setShowMoveMenu(false);
        setShowNewFolder(false);
      } else {
        onClear();
      }
    }
    document.addEventListener("mousedown", onDocMouseDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onDocMouseDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [showMoveMenu, showNewFolder, onClear]);

  function handleCreateFolder() {
    if (newFolderName.trim()) {
      onCreateFolderAndMove(newFolderName.trim());
      setNewFolderName("");
      setShowNewFolder(false);
    }
  }

  return (
    <motion.div
      layout={false}
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 10 }}
      transition={{ duration: 0.15 }}
      className="flex justify-center"
    >
      <div className={dockBarShell}>
        <div className="flex items-center gap-0.5 p-1 text-[13px] text-card-foreground">
          <span className="px-2 font-medium tabular-nums">
            {count} selected
          </span>
          <div className="mx-1 h-4 w-px bg-border" />

          {/* Move to */}
          <div className="relative" ref={moveMenuRef}>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setShowMoveMenu((v) => !v);
                setShowNewFolder(false);
              }}
              aria-expanded={showMoveMenu}
              className={actionClass(showMoveMenu)}
            >
              <FolderInput className="h-3.5 w-3.5" />
              Move to
            </button>
            {showMoveMenu && (
              <div
                className={`absolute bottom-full left-0 z-50 mb-3 min-w-[200px] ${dockDropdownSurface}`}
                onClick={(e) => e.stopPropagation()}
              >
                {folders.length === 0 && (
                  <div className="px-2.5 py-1.5 text-muted-foreground italic">
                    No folders yet
                  </div>
                )}
                {folders.map((f) => (
                  <button
                    key={f.id}
                    type="button"
                    onClick={() => {
                      onMoveToFolder(f.id);
                      setShowMoveMenu(false);
                    }}
                    className={menuItemClass}
                  >
                    {f.name}
                  </button>
                ))}
                {folders.length > 0 && <div className="my-1 h-px bg-border" />}
                <button
                  type="button"
                  onClick={() => {
                    onMoveToFolder("");
                    setShowMoveMenu(false);
                  }}
                  className={`${menuItemClass} text-muted-foreground`}
                >
                  Uncategorized
                </button>
              </div>
            )}
          </div>

          {/* Let AI organize */}
          <button
            type="button"
            disabled={organizing}
            onClick={(e) => {
              e.stopPropagation();
              setShowMoveMenu(false);
              setShowNewFolder(false);
              onOrganize();
            }}
            className={actionClass()}
            title="Let the AI file these into folders"
          >
            {organizing ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
            ) : (
              <Sparkles className="h-3.5 w-3.5" aria-hidden />
            )}
            {organizing ? "Organizing…" : "Let AI organize"}
          </button>

          {/* New folder */}
          <div className="relative" ref={newFolderRef}>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setShowNewFolder((v) => !v);
                setShowMoveMenu(false);
              }}
              aria-expanded={showNewFolder}
              className={actionClass(showNewFolder)}
            >
              <FolderPlus className="h-3.5 w-3.5" />
              New folder
            </button>
            {showNewFolder && (
              <div
                className={`absolute bottom-full left-0 z-50 mb-3 min-w-[240px] ${dockDropdownSurface}`}
                onClick={(e) => e.stopPropagation()}
              >
                <input
                  autoFocus
                  value={newFolderName}
                  onChange={(e) => setNewFolderName(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleCreateFolder()}
                  placeholder="Folder name…"
                  className="w-full rounded-md border border-border bg-transparent px-2.5 py-1.5 outline-none transition-colors placeholder:text-muted-foreground focus:border-ring"
                />
                <button
                  type="button"
                  onClick={handleCreateFolder}
                  disabled={!newFolderName.trim()}
                  className="mt-1 w-full rounded-md bg-primary px-2.5 py-1.5 font-medium text-primary-foreground transition-colors enabled:hover:bg-primary/85 disabled:opacity-40"
                >
                  Create & move
                </button>
              </div>
            )}
          </div>

          <div className="mx-1 h-4 w-px bg-border" />

          {/* Copy all links */}
          {onCopyAll && (
            <button
              type="button"
              onClick={onCopyAll}
              className={actionClass()}
              title="Copy selected links"
            >
              <ClipboardCopy className="h-3.5 w-3.5" />
              Copy
            </button>
          )}

          {/* Delete */}
          <button
            type="button"
            onClick={onRemove}
            className="rounded-md p-1.5 outline-none transition-colors hover:bg-destructive/10 hover:text-destructive focus-visible:ring-2 focus-visible:ring-ring"
            title="Delete selected"
            aria-label="Delete selected"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>

          {/* Close */}
          <button
            type="button"
            onClick={onClear}
            className="rounded-md p-1.5 text-muted-foreground outline-none transition-colors hover:bg-accent hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
            title="Clear selection (Esc)"
            aria-label="Clear selection"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>
    </motion.div>
  );
}
