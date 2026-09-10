"use client";

import {
  addLinksAction,
  createGroupAndMoveLinksAction,
  deleteGroupAction,
  moveLinksToGroupAction,
  removeLinksAction,
  regenerateGroupTitleAction,
  renameGroupAction,
  reorganizeLinksAction,
} from "@/app/actions";
import { UNCATEGORIZED_FOLDER_NAME } from "@/lib/links";
import type { Group, Link } from "@prisma/client";
import { AnimatePresence } from "framer-motion";
import { AlertCircle, Check, Sparkles } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import {
  AddLinkStatusBar,
  type AddLinkBarState,
} from "@/components/AddLinkStatusBar";
import { CommandBar } from "@/components/CommandBar";
import { DockToast, type ToastState } from "@/components/DockToast";
import { FolderSidebar } from "@/components/FolderSidebar";
import { LinkCard } from "@/components/LinkCard";
import { SelectionBar } from "@/components/SelectionBar";
import { ThemeToggle } from "@/components/ThemeToggle";

export type GroupWithLinks = Group & { links: Link[] };

type Props = {
  groups: GroupWithLinks[];
};

type Row = { link: Link; group: Group };

function plural(n: number, word: string): string {
  return `${n} ${word}${n !== 1 ? "s" : ""}`;
}

export function LinkBoard({ groups }: Props) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [linkAddBar, setLinkAddBar] = useState<AddLinkBarState | null>(null);
  const [activeFilter, setActiveFilter] = useState("all");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [search, setSearch] = useState("");
  const [toast, setToast] = useState<ToastState | null>(null);
  const [regeneratingFolderId, setRegeneratingFolderId] = useState<
    string | null
  >(null);
  const [organizing, setOrganizing] = useState(false);
  const [organizingFolderId, setOrganizingFolderId] = useState<string | null>(
    null,
  );
  const toastSeq = useRef(0);

  // Every notification is the same dock bar now, so one piece of state covers
  // copy confirmations, AI results, and errors alike.
  function showToast(next: Omit<ToastState, "id">) {
    toastSeq.current += 1;
    setToast({ ...next, id: toastSeq.current });
  }

  function showError(message: string) {
    // No ttl: errors are usually actionable ("GROQ_API_KEY is not set"), so they
    // wait for the close button rather than vanishing mid-read.
    showToast({ icon: AlertCircle, title: message, tone: "error" });
  }

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

  // Reorganizing can dissolve the folder being viewed, and the Uncategorized row
  // hides itself once it hits zero — either would strand the view on a filter
  // that no longer exists. Resolve it during render rather than correcting it
  // afterwards in an effect.
  const effectiveFilter = useMemo(() => {
    if (activeFilter === "all") return "all";
    const stillExists =
      activeFilter === "uncategorized"
        ? folderCounts.uncategorized > 0
        : groups.some((g) => g.id === activeFilter);
    return stillExists ? activeFilter : "all";
  }, [activeFilter, folderCounts.uncategorized, groups]);

  // Split from `rows` so the command bar can say "3 of 12 links match" — the
  // denominator is the folder you are in, not the whole library.
  const filteredRows: Row[] = useMemo(() => {
    const list: Row[] = groups.flatMap((g) =>
      g.links.map((link) => ({ link, group: g })),
    );
    if (effectiveFilter === "uncategorized") {
      if (!uncategorizedId) return [];
      return list.filter((x) => x.group.id === uncategorizedId);
    }
    if (effectiveFilter !== "all") {
      return list.filter((x) => x.group.id === effectiveFilter);
    }
    return list;
  }, [groups, effectiveFilter, uncategorizedId]);

  const rows: Row[] = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return filteredRows;
    return filteredRows.filter(
      (x) =>
        (x.link.title?.toLowerCase().includes(q) ?? false) ||
        x.link.url.toLowerCase().includes(q),
    );
  }, [filteredRows, search]);

  useEffect(() => {
    if (!linkAddBar || linkAddBar.kind === "adding") return;
    const t = window.setTimeout(() => setLinkAddBar(null), 4500);
    return () => clearTimeout(t);
  }, [linkAddBar]);

  useEffect(() => {
    if (!toast?.ttl) return;
    const id = toast.id;
    const t = window.setTimeout(() => {
      setToast((cur) => (cur?.id === id ? null : cur));
    }, toast.ttl);
    return () => clearTimeout(t);
  }, [toast]);

  function notifyLinkCopied() {
    showToast({ icon: Check, title: "Copied", ttl: 2000 });
  }

  async function handleAddLinks(urls: string[]): Promise<boolean> {
    const many = urls.length > 1;
    const preview = urls[0].length > 72 ? `${urls[0].slice(0, 72)}…` : urls[0];

    setLinkAddBar(
      many
        ? {
            kind: "adding",
            title: `Saving ${plural(urls.length, "link")}…`,
            detail: "Reading titles, then sorting them into folders",
          }
        : { kind: "adding", title: "Saving link…", detail: preview },
    );
    setToast(null);

    const res = await addLinksAction(urls);
    if (!res.ok) {
      setLinkAddBar({ kind: "error", message: res.error });
      return false;
    }

    const data = res.data;
    // The links saved either way, but if the AI leg failed say so loudly rather
    // than reporting a cheerful "Added to Uncategorized".
    if (data?.warning) {
      setLinkAddBar({ kind: "error", message: data.warning });
    } else if (data) {
      const where =
        data.folders.length === 1
          ? data.folders[0]
          : plural(data.folders.length, "folder");
      setLinkAddBar({
        kind: "success",
        title:
          data.added === 1
            ? `Added to ${where}`
            : `Added ${plural(data.added, "link")} to ${where}`,
        detail: data.skipped.length
          ? `${plural(data.skipped.length, "link")} skipped`
          : undefined,
      });
    }

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

  function runOrganize(
    options: { linkIds?: string[]; groupId?: string },
    callbacks: { onSuccess?: () => void; onSettled?: () => void } = {},
  ) {
    setToast(null);
    setOrganizing(true);
    startTransition(async () => {
      const res = await reorganizeLinksAction(options);
      setOrganizing(false);
      callbacks.onSettled?.();
      if (!res.ok) {
        showError(res.error ?? "Could not reorganize links");
        return;
      }
      const s = res.data;
      if (s) {
        const stranded = s.unassigned
          ? `${plural(s.unassigned, "link")} stayed put — nowhere obvious to file them`
          : undefined;
        showToast({
          icon: Sparkles,
          title: `Organized ${plural(s.linkCount, "link")} into ${plural(
            s.folders.length,
            "folder",
          )}`,
          detail: stranded,
          ttl: 5000,
        });
      }
      callbacks.onSuccess?.();
      router.refresh();
    });
  }

  // The sidebar addresses the inbox by its filter id; the action needs the real
  // group id behind it.
  function handleReorganizeFolder(filterId: string) {
    const groupId =
      filterId === "uncategorized" ? uncategorizedId : filterId;
    if (!groupId) return;
    setOrganizingFolderId(filterId);
    runOrganize(
      { groupId },
      { onSettled: () => setOrganizingFolderId(null) },
    );
  }

  function runAction(fn: () => Promise<{ ok: boolean; error?: string }>) {
    setToast(null);
    startTransition(async () => {
      const res = await fn();
      if (!res.ok) {
        showError(res.error ?? "Something went wrong");
        return;
      }
      router.refresh();
    });
  }

  return (
    <>
      {/* The page itself scrolls (not an inner div), so the wheel, Space and
          PageDown all work without clicking first. Rail and list are centred
          together as one block; see `.board` in globals.css for the numbers. */}
      <div className="board">
        {/* Fixed, not sticky: it is out of the list's flow entirely, so its
            position never depends on how tall the list is. */}
        <aside
          className="fixed top-0 z-10 flex h-screen flex-col overflow-y-auto pb-6 pr-8 pt-5"
          style={{ width: "var(--rail)", left: "var(--inset)" }}
        >
          <h1 className="flex h-8 shrink-0 items-center px-2.5 text-base font-semibold lowercase text-foreground">
            stash
          </h1>
          {/* Starts level with the command bar, so the first filter and the
              input read as one line across the page. */}
          <div className="mt-3">
            <FolderSidebar
              folders={sidebarFolders}
              activeFilter={effectiveFilter}
              onFilterChange={setActiveFilter}
              folderCounts={folderCounts}
              onRenameFolder={(id, name) =>
                runAction(async () => {
                  const res = await renameGroupAction(id, name);
                  return res.ok ? { ok: true } : { ok: false, error: res.error };
                })
              }
              onRegenerateFolder={(id) => {
                setToast(null);
                setRegeneratingFolderId(id);
                startTransition(async () => {
                  const res = await regenerateGroupTitleAction(id);
                  setRegeneratingFolderId(null);
                  if (!res.ok) {
                    showError(res.error ?? "Could not regenerate folder title");
                    return;
                  }
                  showToast({
                    icon: Sparkles,
                    title: "Folder title regenerated",
                    ttl: 2500,
                  });
                  router.refresh();
                });
              }}
              regeneratingFolderId={regeneratingFolderId}
              onReorganizeFolder={handleReorganizeFolder}
              organizingFolderId={organizingFolderId}
              onDeleteFolder={(id) =>
                runAction(async () => {
                  if (activeFilter === id) setActiveFilter("all");
                  const res = await deleteGroupAction(id);
                  return res.ok ? { ok: true } : { ok: false, error: res.error };
                })
              }
            />
          </div>
        </aside>

        <main
          className="pb-28"
          style={{
            width: "var(--list)",
            marginLeft: "calc(var(--inset) + var(--rail))",
          }}
        >
          {/* No shadow under the pinned bar: its solid background already
              hides the rows passing beneath, and anything more reads as
              clutter. */}
          <div className="sticky top-0 z-20 bg-background pb-2 pt-5">
            <div className="mb-3 flex h-8 items-center justify-end gap-2">
              <p className="text-xs text-muted-foreground">
                Paste, organize, find.
              </p>
              <ThemeToggle />
            </div>
            <CommandBar
              disabled={linkAddBar?.kind === "adding"}
              onAdd={handleAddLinks}
              onSearchChange={setSearch}
              resultCount={rows.length}
              filteredTotal={filteredRows.length}
            />
          </div>

          <div className="relative flex flex-col">
            {rows.map(({ link, group }, i) => {
              const selected = selectedIds.has(link.id);
              return (
                <LinkCard
                  key={link.id}
                  link={link}
                  folder={
                    uncategorizedId && group.id === uncategorizedId
                      ? undefined
                      : { id: group.id, name: group.name }
                  }
                  selected={selected}
                  joinTop={
                    selected && i > 0 && selectedIds.has(rows[i - 1].link.id)
                  }
                  joinBottom={
                    selected &&
                    i < rows.length - 1 &&
                    selectedIds.has(rows[i + 1].link.id)
                  }
                  onToggleSelect={toggleSelect}
                  onCopied={notifyLinkCopied}
                />
              );
            })}
          </div>

          {rows.length === 0 && (
            <div className="py-12 text-center text-sm text-muted-foreground">
              {totalLinkCount === 0
                ? "Paste your first link above to get started."
                : search.trim()
                  ? "No links match your search."
                  : "No links match your filter."}
            </div>
          )}
        </main>
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
                    return res.ok
                      ? { ok: true }
                      : { ok: false, error: res.error };
                  })
                }
                onCreateFolderAndMove={(name) =>
                  runAction(async () => {
                    const res = await createGroupAndMoveLinksAction(
                      name,
                      Array.from(selectedIds),
                    );
                    if (res.ok) setSelectedIds(new Set());
                    return res.ok
                      ? { ok: true }
                      : { ok: false, error: res.error };
                  })
                }
                onOrganize={() =>
                  runOrganize(
                    { linkIds: Array.from(selectedIds) },
                    { onSuccess: () => setSelectedIds(new Set()) },
                  )
                }
                organizing={organizing}
                onRemove={() =>
                  runAction(async () => {
                    const res = await removeLinksAction(Array.from(selectedIds));
                    if (res.ok) setSelectedIds(new Set());
                    return res.ok
                      ? { ok: true }
                      : { ok: false, error: res.error };
                  })
                }
                onClear={() => setSelectedIds(new Set())}
                onCopyAll={() => {
                  const urls = rows
                    .filter((r) => selectedIds.has(r.link.id))
                    .map((r) => r.link.url);
                  if (urls.length > 0) {
                    navigator.clipboard.writeText(urls.join("\n")).then(() => {
                      notifyLinkCopied();
                    });
                  }
                }}
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
            {toast && (
              <DockToast
                key={`toast-${toast.id}`}
                toast={toast}
                onDismiss={() => setToast(null)}
              />
            )}
          </AnimatePresence>
        </div>
      </div>
    </>
  );
}
