"use client";

import type { Folder } from "@/lib/links-types";
import { FolderIcon, Inbox, Layers, Pencil, Sparkles, Trash2 } from "lucide-react";
import { useState } from "react";

type FolderSidebarProps = {
  folders: Folder[];
  activeFilter: string;
  onFilterChange: (filter: string) => void;
  folderCounts: Record<string, number>;
  onRenameFolder: (id: string, name: string) => void;
  onRegenerateFolder: (id: string) => void;
  regeneratingFolderId?: string | null;
  onDeleteFolder: (id: string) => void;
};

export function FolderSidebar({
  folders,
  activeFilter,
  onFilterChange,
  folderCounts,
  onRenameFolder,
  onRegenerateFolder,
  regeneratingFolderId,
  onDeleteFolder,
}: FolderSidebarProps) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [menuFolderId, setMenuFolderId] = useState<string | null>(null);

  function startRename(folder: Folder) {
    setEditingId(folder.id);
    setEditName(folder.name);
  }

  function commitRename() {
    if (editingId && editName.trim()) {
      onRenameFolder(editingId, editName.trim());
    }
    setEditingId(null);
  }

  const items = [
    {
      id: "all",
      label: "All links",
      icon: Layers,
      count: folderCounts.all,
    },
    {
      id: "uncategorized",
      label: "Uncategorized",
      icon: Inbox,
      count: folderCounts.uncategorized,
    },
  ];

  return (
    <div className="flex flex-col gap-1">
      <span className="mb-1 px-2 text-xs font-medium uppercase tracking-wider text-muted-foreground">
        Filter
      </span>
      {items.map((item) => (
        <button
          key={item.id}
          type="button"
          onClick={() => onFilterChange(item.id)}
          className={`flex items-center gap-2 rounded-md px-2 py-1.5 text-xs transition-colors ${
            activeFilter === item.id
              ? "bg-secondary font-medium text-secondary-foreground"
              : "text-muted-foreground hover:bg-secondary/50 hover:text-foreground"
          }`}
        >
          <item.icon className="h-3.5 w-3.5" />
          <span className="flex-1 text-left">{item.label}</span>
          <span className="text-xs tabular-nums">{item.count}</span>
        </button>
      ))}
      {folders.length > 0 && (
        <>
          <div className="my-2 h-px bg-border" />
          <span className="mb-1 px-2 text-xs font-medium uppercase tracking-wider text-muted-foreground">
            Folders
          </span>
        </>
      )}
      {folders.map((folder) => (
        <div
          key={folder.id}
          role="button"
          tabIndex={0}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              onFilterChange(folder.id);
            }
          }}
          className={`group flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-xs transition-colors ${
            activeFilter === folder.id
              ? "bg-secondary font-medium text-secondary-foreground"
              : "text-muted-foreground hover:bg-secondary/50 hover:text-foreground"
          }`}
          onClick={() => onFilterChange(folder.id)}
        >
          <span className="relative inline-flex h-5 w-5 shrink-0 items-center justify-center">
            <FolderIcon
              className="h-[1.125rem] w-[1.125rem] text-foreground/90"
              strokeWidth={2}
              aria-hidden
            />
            <span
              className="pointer-events-none absolute bottom-0 right-0 flex min-h-[14px] min-w-[14px] translate-x-1/4 translate-y-1/4 items-center justify-center rounded-full bg-background px-1 py-0.5 text-[9px] font-semibold leading-none tabular-nums text-foreground shadow-sm"
              aria-hidden
            >
              {folderCounts[folder.id] ?? 0}
            </span>
          </span>
          {editingId === folder.id ? (
            <input
              autoFocus
              value={editName}
              onChange={(e) => setEditName(e.target.value)}
              onBlur={commitRename}
              onKeyDown={(e) => {
                if (e.key === "Enter") commitRename();
                if (e.key === "Escape") setEditingId(null);
              }}
              onClick={(e) => e.stopPropagation()}
              className="flex-1 bg-transparent text-xs text-foreground outline-none"
            />
          ) : (
            <span className="flex-1 truncate text-left">{folder.name}</span>
          )}
          <div className="relative hidden items-center gap-0.5 group-hover:flex">
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setMenuFolderId((prev) => (prev === folder.id ? null : folder.id));
              }}
              className="rounded p-0.5 text-muted-foreground transition-colors hover:bg-white/[0.06] hover:text-foreground"
              title="Folder actions"
            >
              <Pencil className="h-3 w-3" />
            </button>
            {menuFolderId === folder.id && (
              <div
                className="absolute right-8 top-0 z-20 flex min-w-[120px] flex-col rounded-lg border border-white/10 bg-neutral-800/95 p-1 shadow-xl backdrop-blur-md"
                onClick={(e) => e.stopPropagation()}
              >
                <button
                  type="button"
                  onClick={() => {
                    setMenuFolderId(null);
                    startRename(folder);
                  }}
                  className="flex items-center gap-2 rounded-md px-2.5 py-1.5 text-left text-xs text-neutral-300 transition-colors hover:bg-white/[0.06] hover:text-foreground"
                >
                  <Pencil className="h-3 w-3" />
                  Manual
                </button>
                <button
                  type="button"
                  disabled={regeneratingFolderId === folder.id}
                  onClick={() => {
                    setMenuFolderId(null);
                    onRegenerateFolder(folder.id);
                  }}
                  className="flex items-center gap-2 rounded-md px-2.5 py-1.5 text-left text-xs text-neutral-300 transition-colors hover:bg-white/[0.06] hover:text-foreground disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <Sparkles
                    className={`h-3 w-3 ${
                      regeneratingFolderId === folder.id ? "animate-spin" : ""
                    }`}
                  />
                  {regeneratingFolderId === folder.id
                    ? "Working…"
                    : "Use AI"}
                </button>
              </div>
            )}
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setMenuFolderId(null);
                onDeleteFolder(folder.id);
              }}
              className="rounded p-0.5 text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
            >
              <Trash2 className="h-3 w-3" />
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}
