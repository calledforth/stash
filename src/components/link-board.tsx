"use client";

import {
  addLinkAction,
  createGroupAndMoveLinksAction,
  deleteGroupAction,
  moveLinksToGroupAction,
  removeLinksAction,
  renameGroupAction,
} from "@/app/actions";
import { UNCATEGORIZED_FOLDER_NAME } from "@/lib/links";
import type { Group, Link } from "@prisma/client";
import { AnimatePresence, motion } from "framer-motion";
import { Search } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { AddLinkInput } from "@/components/AddLinkInput";
import {
  AddLinkStatusBar,
  type AddLinkBarState,
} from "@/components/AddLinkStatusBar";
import { CopiedToast } from "@/components/CopiedToast";
import { FolderSidebar } from "@/components/FolderSidebar";
import { LinkCard } from "@/components/LinkCard";
import { SelectionBar } from "@/components/SelectionBar";

export type GroupWithLinks = Group & { links: Link[] };

type Props = {
  groups: GroupWithLinks[];
};

type Row = { link: Link; group: Group };

export function LinkBoard({ groups }: Props) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [linkAddBar, setLinkAddBar] = useState<AddLinkBarState | null>(null);
  const [copiedToast, setCopiedToast] = useState(false);
  const copiedToastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [activeFilter, setActiveFilter] = useState("all");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [search, setSearch] = useState("");
  const [banner, setBanner] = useState<string | null>(null);

  const uncategorizedId = useMemo(
    () => groups.find((g) => g.name === UNCATEGORIZED_FOLDER_NAME)?.id,
    [groups],
  );

  const sidebarFolders = useMemo(
    () =>
      groups
        .filter((g) => g.name !== UNCATEGORIZED_FOLDER_NAME)
        .map((g) => ({ id: g.id, name: g.name })),
    [groups],
  );

  const totalLinkCount = useMemo(
    () => groups.reduce((s, g) => s + g.links.length, 0),
    [groups],
  );

  const folderCounts = useMemo(() => {
    const counts: Record<string, number> = {
      all: totalLinkCount,
      uncategorized: 0,
    };
    if (uncategorizedId) {
      const ug = groups.find((g) => g.id === uncategorizedId);
      counts.uncategorized = ug?.links.length ?? 0;
    }
    for (const g of groups) {
      if (g.name !== UNCATEGORIZED_FOLDER_NAME) {
        counts[g.id] = g.links.length;
      }
    }
    return counts;
  }, [groups, totalLinkCount, uncategorizedId]);

  const rows: Row[] = useMemo(() => {
    let list: Row[] = groups.flatMap((g) =>
      g.links.map((link) => ({ link, group: g })),
    );
    if (activeFilter === "uncategorized") {
      if (!uncategorizedId) list = [];
      else list = list.filter((x) => x.group.id === uncategorizedId);
    } else if (activeFilter !== "all") {
      list = list.filter((x) => x.group.id === activeFilter);
    }
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      list = list.filter(
        (x) =>
          (x.link.title?.toLowerCase().includes(q) ?? false) ||
          x.link.url.toLowerCase().includes(q),
      );
    }
    return list;
  }, [groups, activeFilter, search, uncategorizedId]);

  const [emptyVisible, setEmptyVisible] = useState(() => rows.length === 0);
  const rowsLengthRef = useRef(rows.length);

  useEffect(() => {
    rowsLengthRef.current = rows.length;
    if (rows.length === 0) return;

    const frame = requestAnimationFrame(() => {
      setEmptyVisible(false);
    });

    return () => cancelAnimationFrame(frame);
  }, [rows.length]);

  useEffect(() => {
    if (!linkAddBar || linkAddBar.kind === "adding") return;
    const t = window.setTimeout(() => setLinkAddBar(null), 4500);
    return () => clearTimeout(t);
  }, [linkAddBar]);

  useEffect(() => {
    return () => {
      if (copiedToastTimerRef.current) clearTimeout(copiedToastTimerRef.current);
    };
  }, []);

  function notifyLinkCopied() {
    setCopiedToast(true);
    if (copiedToastTimerRef.current) clearTimeout(copiedToastTimerRef.current);
    copiedToastTimerRef.current = setTimeout(() => setCopiedToast(false), 2000);
  }

  async function handleAddLink(url: string): Promise<boolean> {
    const preview = url.length > 72 ? `${url.slice(0, 72)}…` : url;
    setLinkAddBar({ kind: "adding", url: preview });
    setBanner(null);
    const res = await addLinkAction(url);
    if (!res.ok) {
      setLinkAddBar({ kind: "error", message: res.error });
      return false;
    }
    setLinkAddBar({ kind: "success", folderName: res.data.groupName });
    startTransition(() => {
      router.refresh();
    });
    return true;
  }

  function toggleSelect(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function runAction(fn: () => Promise<{ ok: boolean; error?: string }>) {
    setBanner(null);
    startTransition(async () => {
      const res = await fn();
      if (!res.ok) {
        setBanner("error" in res ? res.error ?? "Something went wrong" : "Something went wrong");
        return;
      }
      router.refresh();
    });
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="mx-auto max-w-6xl px-6 py-6">
        <div className="mb-5 flex items-baseline justify-between">
          <h1 className="text-base font-semibold text-foreground lowercase">
            stash
          </h1>
          <p className="text-xs text-muted-foreground">Paste, organize, find.</p>
        </div>

        {banner && (
          <div
            className="mb-4 rounded-md border border-border bg-card px-3 py-2 text-sm text-muted-foreground"
            role="alert"
          >
            {banner}
          </div>
        )}

        <div className="mb-5">
          <AddLinkInput
            disabled={linkAddBar?.kind === "adding"}
            onAdd={handleAddLink}
          />
        </div>

        <div className="flex gap-6">
          <div className="w-56 shrink-0">
            <FolderSidebar
              folders={sidebarFolders}
              activeFilter={activeFilter}
              onFilterChange={setActiveFilter}
              folderCounts={folderCounts}
              onRenameFolder={(id, name) =>
                runAction(async () => {
                  const res = await renameGroupAction(id, name);
                  return res.ok ? { ok: true } : { ok: false, error: res.error };
                })
              }
              onDeleteFolder={(id) =>
                runAction(async () => {
                  if (activeFilter === id) setActiveFilter("all");
                  const res = await deleteGroupAction(id);
                  return res.ok ? { ok: true } : { ok: false, error: res.error };
                })
              }
            />
          </div>

          <div className="min-w-0 flex-1">
            <div className="mb-3 flex items-center gap-2 border-b border-border pb-2">
              <Search className="h-3.5 w-3.5 text-muted-foreground" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search links..."
                className="flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
              />
              <span className="text-xs tabular-nums text-muted-foreground">
                {rows.length} link{rows.length !== 1 ? "s" : ""}
              </span>
            </div>

            <div className="relative flex flex-col">
              <AnimatePresence
                initial={false}
                mode="popLayout"
                onExitComplete={() => {
                  if (rowsLengthRef.current === 0) setEmptyVisible(true);
                }}
              >
                {rows.map(({ link, group }) => (
                  <LinkCard
                    key={link.id}
                    link={link}
                    folder={
                      uncategorizedId && group.id === uncategorizedId
                        ? undefined
                        : { id: group.id, name: group.name }
                    }
                    selected={selectedIds.has(link.id)}
                    onToggleSelect={toggleSelect}
                    onCopied={notifyLinkCopied}
                  />
                ))}
              </AnimatePresence>
            </div>

            <AnimatePresence>
              {emptyVisible && (
                <motion.div
                  key="empty"
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -6 }}
                  transition={{ duration: 0.15 }}
                  className="py-12 text-center text-sm text-muted-foreground"
                >
                  {totalLinkCount === 0
                    ? "Paste your first link above to get started."
                    : "No links match your filter."}
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>
      </div>

      <div className="pointer-events-none fixed bottom-6 left-1/2 z-50 w-full max-w-6xl -translate-x-1/2 px-4">
        <div className="pointer-events-auto flex flex-col-reverse items-center gap-2">
          <AnimatePresence>
            {selectedIds.size > 0 && (
              <SelectionBar
                key="selection-bar"
                count={selectedIds.size}
                folders={sidebarFolders}
                onMoveToFolder={(folderId) =>
                  runAction(async () => {
                    const res = await moveLinksToGroupAction(
                      Array.from(selectedIds),
                      folderId || null,
                    );
                    if (res.ok) setSelectedIds(new Set());
                    return res.ok ? { ok: true } : { ok: false, error: res.error };
                  })
                }
                onCreateFolderAndMove={(name) =>
                  runAction(async () => {
                    const res = await createGroupAndMoveLinksAction(
                      name,
                      Array.from(selectedIds),
                    );
                    if (res.ok) setSelectedIds(new Set());
                    return res.ok ? { ok: true } : { ok: false, error: res.error };
                  })
                }
                onRemove={() =>
                  runAction(async () => {
                    const res = await removeLinksAction(Array.from(selectedIds));
                    if (res.ok) setSelectedIds(new Set());
                    return res.ok ? { ok: true } : { ok: false, error: res.error };
                  })
                }
                onClear={() => setSelectedIds(new Set())}
              />
            )}
          </AnimatePresence>
          <AnimatePresence>
            {linkAddBar && (
              <AddLinkStatusBar
                key="add-link-status"
                state={linkAddBar}
                onDismiss={() => setLinkAddBar(null)}
              />
            )}
          </AnimatePresence>
          <AnimatePresence>
            {copiedToast && <CopiedToast key="copied-toast" />}
          </AnimatePresence>
        </div>
      </div>
    </div>
  );
}
