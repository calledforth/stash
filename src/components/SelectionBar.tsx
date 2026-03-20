"use client";

import type { Folder } from "@/lib/links-types";
import { dockBarShell, dockDropdownSurface } from "@/lib/dock-bar-surface";
import { FolderInput, FolderPlus, Trash2, X } from "lucide-react";
import { motion } from "framer-motion";
import { useEffect, useRef, useState } from "react";

type SelectionBarProps = {
  count: number;
  folders: Folder[];
  onMoveToFolder: (folderId: string) => void;
  onCreateFolderAndMove: (name: string) => void;
  onRemove: () => void;
  onClear: () => void;
};

export function SelectionBar({
  count,
  folders,
  onMoveToFolder,
  onCreateFolderAndMove,
  onRemove,
  onClear,
}: SelectionBarProps) {
  const [showNewFolder, setShowNewFolder] = useState(false);
  const [showMoveMenu, setShowMoveMenu] = useState(false);
  const [newFolderName, setNewFolderName] = useState("");
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onDocMouseDown(e: MouseEvent) {
      if (!rootRef.current?.contains(e.target as Node)) {
        setShowNewFolder(false);
        setShowMoveMenu(false);
      }
    }
    document.addEventListener("mousedown", onDocMouseDown);
    return () => document.removeEventListener("mousedown", onDocMouseDown);
  }, []);

  function handleCreateFolder() {
    if (newFolderName.trim()) {
      onCreateFolderAndMove(newFolderName.trim());
      setNewFolderName("");
      setShowNewFolder(false);
    }
  }

  return (
    <motion.div
      ref={rootRef}
      layout={false}
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 10 }}
      transition={{ duration: 0.15 }}
      className="flex justify-center"
    >
      <div className={dockBarShell}>
        <div className="flex items-center gap-2 px-3.5 py-2 text-xs text-card-foreground">
        <span className="font-medium tabular-nums">{count} selected</span>
        <div className="h-3.5 w-px bg-border" />
        <div className="relative">
          <button
            type="button"
            onClick={() => {
              setShowMoveMenu(!showMoveMenu);
              setShowNewFolder(false);
            }}
            className="flex items-center gap-1 transition-colors hover:text-foreground"
          >
            <FolderInput className="h-3 w-3" />
            Move to
          </button>
          {showMoveMenu && (
            <div
              className={`absolute bottom-full left-0 mb-2 min-w-[180px] ${dockDropdownSurface}`}
            >
              {folders.map((f) => (
                <button
                  key={f.id}
                  type="button"
                  onClick={() => {
                    onMoveToFolder(f.id);
                    setShowMoveMenu(false);
                  }}
                  className="w-full px-3 py-1.5 text-left text-xs transition-colors hover:bg-accent"
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
                className="w-full px-3 py-1.5 text-left text-xs text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
              >
                Uncategorized
              </button>
            </div>
          )}
        </div>
        <div className="relative">
          <button
            type="button"
            onClick={() => {
              setShowNewFolder(!showNewFolder);
              setShowMoveMenu(false);
            }}
            className="flex items-center gap-1 transition-colors hover:text-foreground"
          >
            <FolderPlus className="h-3 w-3" />
            New folder
          </button>
          {showNewFolder && (
            <div
              className={`absolute bottom-full left-0 mb-2 min-w-[200px] p-1.5 ${dockDropdownSurface}`}
            >
              <input
                autoFocus
                value={newFolderName}
                onChange={(e) => setNewFolderName(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleCreateFolder()}
                placeholder="Folder name..."
                className="w-full rounded-md bg-secondary px-2 py-1.5 text-xs outline-none placeholder:text-muted-foreground"
              />
              <button
                type="button"
                onClick={handleCreateFolder}
                disabled={!newFolderName.trim()}
                className="mt-1.5 w-full rounded-md bg-accent px-2 py-1.5 text-xs text-accent-foreground transition-colors hover:bg-accent/90 disabled:opacity-40"
              >
                Create & move
              </button>
            </div>
          )}
        </div>
        <div className="h-3.5 w-px bg-border" />
        <button
          type="button"
          onClick={onRemove}
          className="flex items-center gap-1 transition-colors hover:text-destructive"
        >
          <Trash2 className="h-3 w-3" />
        </button>
        <button
          type="button"
          onClick={onClear}
          className="rounded-md p-0.5 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
        >
          <X className="h-3 w-3" />
        </button>
        </div>
      </div>
    </motion.div>
  );
}
