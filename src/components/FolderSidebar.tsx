"use client";

import type { Folder } from "@/lib/links-types";
import { UNCATEGORIZED_FOLDER_NAME } from "@/lib/links";
import {
  Ellipsis,
  FolderIcon,
  Inbox,
  Layers,
  Loader2,
  Pencil,
  Sparkles,
  Trash2,
  Wand2,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";

type FolderSidebarProps = {
  folders: Folder[];
  activeFilter: string;
  onFilterChange: (filter: string) => void;
  folderCounts: Record<string, number>;
  onRenameFolder: (id: string, name: string) => void;
  onRegenerateFolder: (id: string) => void;
  regeneratingFolderId?: string | null;
  /** Re-file the links inside one folder. `"uncategorized"` sorts the inbox. */
  onReorganizeFolder: (id: string) => void;
  organizingFolderId?: string | null;
  onDeleteFolder: (id: string) => void;
};

// Every row — filters and folders alike — shares one shape, so icons, labels
// and counts all fall into the same three columns.
function rowClass(active: boolean) {
  return `group flex h-8 cursor-pointer items-center gap-2.5 rounded-md px-2.5 text-[13px] outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring ${
    active
      ? "bg-secondary font-medium text-secondary-foreground"
      : "text-muted-foreground hover:bg-secondary/50 hover:text-foreground"
  }`;
}

const menuItemClass =
  "flex items-center gap-2 rounded-md px-2.5 py-1.5 text-left text-xs text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:cursor-not-allowed disabled:opacity-50";

/**
 * The count and the row's action share one slot: the count by default, the
 * action on hover. Keeps the right edge a clean column of numbers instead of
 * shuffling them sideways whenever the pointer passes over a row.
 */
function TrailingSlot({
  count,
  busy,
  pinned,
  children,
}: {
  count: number;
  /** An AI job is running on this row; a spinner replaces everything. */
  busy: boolean;
  /** Keep the action showing without hover, e.g. while its menu is open. */
  pinned?: boolean;
  children?: React.ReactNode;
}) {
  if (busy) {
    return (
      <Loader2
        className="h-3.5 w-3.5 shrink-0 animate-spin text-muted-foreground"
        aria-hidden
      />
    );
  }
  return (
    <span className="relative flex h-5 min-w-5 shrink-0 items-center justify-end">
      <span
        className={`text-xs tabular-nums ${
          pinned ? "hidden" : children ? "group-hover:hidden" : ""
        }`}
      >
        {count}
      </span>
      {children && (
        <span className={pinned ? "flex" : "hidden group-hover:flex"}>
          {children}
        </span>
      )}
    </span>
  );
}

export function FolderSidebar({
  folders,
  activeFilter,
  onFilterChange,
  folderCounts,
  onRenameFolder,
  onRegenerateFolder,
  regeneratingFolderId,
  onReorganizeFolder,
  organizingFolderId,
  onDeleteFolder,
}: FolderSidebarProps) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [menuFolderId, setMenuFolderId] = useState<string | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  // The menu can be opened by right-click, so it can outlive the hover that
  // would otherwise keep it on screen. It needs a real dismiss.
  useEffect(() => {
    if (!menuFolderId) return;
    function onDocMouseDown(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuFolderId(null);
      }
    }
    // Capture phase, and claim the key: Escape also clears the link selection,
    // and one press should only close the menu.
    function onKeyDown(e: KeyboardEvent) {
      if (e.key !== "Escape") return;
      e.preventDefault();
      setMenuFolderId(null);
    }
    document.addEventListener("mousedown", onDocMouseDown);
    document.addEventListener("keydown", onKeyDown, true);
    return () => {
      document.removeEventListener("mousedown", onDocMouseDown);
      document.removeEventListener("keydown", onKeyDown, true);
    };
  }, [menuFolderId]);

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

  function activateOnKey(id: string) {
    return (e: React.KeyboardEvent) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        onFilterChange(id);
      }
    };
  }

  // Uncategorized is a failure state, not a permanent home — everything the AI
  // touches lands in a real folder. Only surface it when something is actually
  // sitting there, instead of a row that reads 0 forever.
  const items = [
    {
      id: "all",
      label: "All links",
      icon: Layers,
      count: folderCounts.all,
    },
    ...(folderCounts.uncategorized > 0
      ? [
          {
            id: "uncategorized",
            label: UNCATEGORIZED_FOLDER_NAME,
            icon: Inbox,
            count: folderCounts.uncategorized,
          },
        ]
      : []),
  ];

  return (
    <nav className="flex flex-col gap-0.5">
      {items.map((item) => (
        <div
          key={item.id}
          role="button"
          tabIndex={0}
          onClick={() => onFilterChange(item.id)}
          onKeyDown={activateOnKey(item.id)}
          className={rowClass(activeFilter === item.id)}
        >
          <item.icon className="h-3.5 w-3.5 shrink-0" aria-hidden />
          <span className="flex-1 truncate">{item.label}</span>
          <TrailingSlot
            count={item.count}
            busy={organizingFolderId === item.id}
          >
            {/* The inbox is the one filter with an AI action of its own: empty
                it by sorting everything in it into real folders. */}
            {item.id === "uncategorized" && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onReorganizeFolder(item.id);
                }}
                className="rounded p-0.5 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                title="Sort these into folders with AI"
              >
                <Wand2 className="h-3.5 w-3.5" aria-hidden />
              </button>
            )}
          </TrailingSlot>
        </div>
      ))}

      {folders.length > 0 && (
        <span className="mb-1 mt-5 px-2.5 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
          Folders
        </span>
      )}

      {folders.map((folder) => {
        const menuOpen = menuFolderId === folder.id;
        const regenerating = regeneratingFolderId === folder.id;
        const organizing = organizingFolderId === folder.id;
        return (
          <div
            key={folder.id}
            role="button"
            tabIndex={0}
            onClick={() => onFilterChange(folder.id)}
            onKeyDown={activateOnKey(folder.id)}
            onContextMenu={(e) => {
              e.preventDefault();
              setMenuFolderId(folder.id);
            }}
            className={rowClass(activeFilter === folder.id)}
          >
            <FolderIcon className="h-3.5 w-3.5 shrink-0" aria-hidden />
            {editingId === folder.id ? (
              <input
                autoFocus
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
                onBlur={commitRename}
                onKeyDown={(e) => {
                  e.stopPropagation();
                  if (e.key === "Enter") commitRename();
                  if (e.key === "Escape") setEditingId(null);
                }}
                onClick={(e) => e.stopPropagation()}
                className="min-w-0 flex-1 bg-transparent text-foreground outline-none"
              />
            ) : (
              // Names are AI-written and can run long; the full one is a hover
              // away wherever the rail has to cut it short.
              <span className="flex-1 truncate" title={folder.name}>
                {folder.name}
              </span>
            )}
            <TrailingSlot
              count={folderCounts[folder.id] ?? 0}
              busy={regenerating || organizing}
              pinned={menuOpen}
            >
              <span className="relative">
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    setMenuFolderId((prev) =>
                      prev === folder.id ? null : folder.id,
                    );
                  }}
                  className="rounded p-0.5 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                  title="Folder actions (or right-click)"
                >
                  <Ellipsis className="h-3.5 w-3.5" aria-hidden />
                </button>
                {/* Drops below the trigger, right-aligned to it: the rail is
                    a scroll container, so anything poking out sideways gets
                    clipped. */}
                {menuOpen && (
                  <div
                    ref={menuRef}
                    className="absolute right-0 top-full z-30 mt-1 flex min-w-[168px] flex-col rounded-lg border border-border bg-popover p-1 shadow-xl"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <button
                      type="button"
                      onClick={() => {
                        setMenuFolderId(null);
                        startRename(folder);
                      }}
                      className={menuItemClass}
                    >
                      <Pencil className="h-3 w-3 shrink-0" />
                      Rename
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setMenuFolderId(null);
                        onRegenerateFolder(folder.id);
                      }}
                      className={menuItemClass}
                    >
                      <Sparkles className="h-3 w-3 shrink-0" />
                      Rename with AI
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setMenuFolderId(null);
                        onReorganizeFolder(folder.id);
                      }}
                      className={menuItemClass}
                    >
                      <Wand2 className="h-3 w-3 shrink-0" />
                      Reorganize links
                    </button>
                    <div className="my-1 h-px bg-border" />
                    <button
                      type="button"
                      onClick={() => {
                        setMenuFolderId(null);
                        onDeleteFolder(folder.id);
                      }}
                      className="flex items-center gap-2 rounded-md px-2.5 py-1.5 text-left text-xs text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
                    >
                      <Trash2 className="h-3 w-3 shrink-0" />
                      Delete folder
                    </button>
                  </div>
                )}
              </span>
            </TrailingSlot>
          </div>
        );
      })}
    </nav>
  );
}
