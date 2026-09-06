"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import {
  categorizeLink,
  describeAiError,
  nameNewGroupFromLinks,
  reclusterLinks,
  regenerateGroupTitle as aiRegenerateGroupTitle,
} from "@/lib/ai";
import { fetchLinkMetadata, normalizeUrl } from "@/lib/metadata";
import { UNCATEGORIZED_FOLDER_NAME } from "@/lib/links";
import { reorganizeLinks, type ReorganizeSummary } from "@/lib/reorganize";

async function ensureUncategorizedGroupId(): Promise<string> {
  const found = await prisma.group.findFirst({
    where: { name: UNCATEGORIZED_FOLDER_NAME },
  });
  if (found) return found.id;
  const g = await prisma.group.create({
    data: { name: UNCATEGORIZED_FOLDER_NAME },
  });
  return g.id;
}

export type ActionResult<T = void> =
  | { ok: true; data?: T }
  | { ok: false; error: string };

export async function addLinkAction(
  rawUrl: string,
): Promise<ActionResult<{ id: string; groupName: string; warning?: string }>> {
  const url = normalizeUrl(rawUrl);
  if (!url) return { ok: false, error: "Invalid URL" };

  const dup = await prisma.link.findFirst({ where: { url } });
  if (dup) return { ok: false, error: "That URL is already saved" };

  const meta = await fetchLinkMetadata(url);
  const groups = await prisma.group.findMany({
    select: { id: true, name: true },
    orderBy: { name: "asc" },
  });

  let groupId: string;
  let decisionTitle = meta.title;
  let titleSource: "ai" | "metadata" = "metadata";

  const hasGroq = Boolean(process.env.GROQ_API_KEY?.trim());

  // When AI categorization can't run the link still gets saved — but the reason
  // rides back to the UI. This used to be a bare `catch {}` that quietly filed
  // everything under "Inbox", which is how a decommissioned model went unnoticed.
  let warning: string | undefined;

  if (!hasGroq) {
    warning = "GROQ_API_KEY is not set — saved without AI categorization.";
    groupId = await ensureUncategorizedGroupId();
  } else {
    try {
      const decision = await categorizeLink({
        url,
        resolvedUrl: meta.resolvedUrl,
        domain: meta.domain,
        sourceType: meta.sourceType,
        sourceCreator: meta.sourceCreator,
        title: meta.title,
        description: meta.description,
        groups,
      });
      if (decision.type === "existing") {
        groupId = decision.groupId;
      } else {
        const g = await prisma.group.create({
          data: { name: decision.groupName },
        });
        groupId = g.id;
      }
      decisionTitle = decision.linkTitle;
      titleSource = "ai";
    } catch (e) {
      warning = `Saved, but AI categorization failed: ${describeAiError(e)}`;
      groupId = await ensureUncategorizedGroupId();
    }
  }

  const linkBaseData = {
    url,
    title: decisionTitle,
    description: meta.description,
    faviconUrl: meta.faviconUrl,
    groupId,
  };

  let link;
  try {
    link = await prisma.link.create({
      data: {
        ...linkBaseData,
        ...(titleSource ? { titleSource } : {}),
      },
    });
  } catch {
    // Backward compatibility when Prisma client/schema is not updated yet.
    link = await prisma.link.create({ data: linkBaseData });
  }

  await prisma.group.update({
    where: { id: groupId },
    data: { updatedAt: new Date() },
  });

  revalidatePath("/");

  const group = await prisma.group.findUnique({
    where: { id: groupId },
    select: { name: true },
  });

  return {
    ok: true,
    data: { id: link.id, groupName: group?.name ?? "Folder", warning },
  };
}

export type AddLinksSummary = {
  added: number;
  /** Folder names the batch landed in, most-populated first. */
  folders: string[];
  skipped: { url: string; reason: string }[];
  warning?: string;
};

/** Pasting a wall of URLs still has to finish inside the function timeout. */
const MAX_BATCH = 50;
const METADATA_CONCURRENCY = 12;
// Tighter than the 12s single-link budget: one slow site shouldn't eat the
// whole batch's time while 40 others wait behind it.
const BATCH_METADATA_TIMEOUT_MS = 6_000;

async function mapWithConcurrency<T, R>(
  items: T[],
  limit: number,
  fn: (item: T) => Promise<R>,
): Promise<R[]> {
  const out = new Array<R>(items.length);
  let cursor = 0;
  const workers = Array.from(
    { length: Math.min(limit, items.length) },
    async () => {
      while (cursor < items.length) {
        const i = cursor++;
        out[i] = await fn(items[i]);
      }
    },
  );
  await Promise.all(workers);
  return out;
}

/**
 * Add several links at once.
 *
 * A single URL keeps the existing one-link path, which sees every folder id and
 * can pick or invent precisely. Beyond that it saves all the links first, then
 * files them with ONE re-cluster call — running `categorizeLink` per URL would
 * mean N round trips, each judging against a folder list the others are
 * concurrently changing, which reliably spawns near-duplicate folders.
 */
export async function addLinksAction(
  rawUrls: string[],
): Promise<ActionResult<AddLinksSummary>> {
  const skipped: { url: string; reason: string }[] = [];
  const seen = new Set<string>();
  const urls: string[] = [];

  for (const raw of rawUrls) {
    const url = normalizeUrl(raw);
    if (!url) {
      skipped.push({ url: raw, reason: "Invalid URL" });
      continue;
    }
    // A duplicate inside one paste is a typo, not something worth reporting.
    if (seen.has(url)) continue;
    seen.add(url);
    urls.push(url);
  }

  if (!urls.length) {
    return {
      ok: false,
      error: skipped.length ? "No valid URLs found" : "Nothing to add",
    };
  }
  if (urls.length > MAX_BATCH) {
    return {
      ok: false,
      error: `Too many links at once (${urls.length}). Add up to ${MAX_BATCH} at a time.`,
    };
  }

  if (urls.length === 1) {
    const res = await addLinkAction(urls[0]);
    if (!res.ok) return { ok: false, error: res.error };
    return {
      ok: true,
      data: {
        added: 1,
        folders: [res.data?.groupName ?? "Folder"],
        skipped,
        warning: res.data?.warning,
      },
    };
  }

  const existingLinks = await prisma.link.findMany({
    where: { url: { in: urls } },
    select: { url: true },
  });
  const alreadySaved = new Set(existingLinks.map((l) => l.url));
  const fresh = urls.filter((u) => {
    if (!alreadySaved.has(u)) return true;
    skipped.push({ url: u, reason: "Already saved" });
    return false;
  });

  if (!fresh.length) {
    return { ok: false, error: "All of those links are already saved" };
  }

  const metas = await mapWithConcurrency(fresh, METADATA_CONCURRENCY, (url) =>
    fetchLinkMetadata(url, { timeoutMs: BATCH_METADATA_TIMEOUT_MS }),
  );

  // Land everything in Uncategorized first. If the AI leg then fails the links
  // are still saved and "Categorize all" can finish the job — nothing is lost.
  const landingGroupId = await ensureUncategorizedGroupId();
  const created = await mapWithConcurrency(
    fresh.map((url, i) => ({ url, meta: metas[i] })),
    METADATA_CONCURRENCY,
    async ({ url, meta }) =>
      prisma.link.create({
        data: {
          url,
          title: meta.title,
          description: meta.description,
          faviconUrl: meta.faviconUrl,
          groupId: landingGroupId,
          titleSource: "metadata",
        },
        select: { id: true, url: true, title: true, description: true },
      }),
  );

  let warning: string | undefined;
  const folderCounts = new Map<string, number>();

  if (!process.env.GROQ_API_KEY?.trim()) {
    warning = "GROQ_API_KEY is not set — saved without AI categorization.";
  } else {
    try {
      const groups = await prisma.group.findMany({
        select: { id: true, name: true },
      });
      const existingFolders = groups
        .filter((g) => g.name !== UNCATEGORIZED_FOLDER_NAME)
        .map((g) => g.name);

      const { folders, titles } = await reclusterLinks(created, {
        existingFolders,
        withTitles: true,
      });

      const byName = new Map(groups.map((g) => [g.name.toLowerCase(), g]));
      for (const folder of folders) {
        const ids = folder.linkIndexes
          .map((n) => created[n - 1]?.id)
          .filter((id): id is string => Boolean(id));
        if (!ids.length) continue;

        const key = folder.folderName.toLowerCase();
        let group = byName.get(key);
        if (!group) {
          group = await prisma.group.create({
            data: { name: folder.folderName },
            select: { id: true, name: true },
          });
          byName.set(key, group);
        }

        await prisma.link.updateMany({
          where: { id: { in: ids } },
          data: { groupId: group.id },
        });
        await prisma.group.update({
          where: { id: group.id },
          data: { updatedAt: new Date() },
        });
        folderCounts.set(
          group.name,
          (folderCounts.get(group.name) ?? 0) + ids.length,
        );
      }

      // Titles ride back on the same completion, so AI-named links are free.
      await Promise.all(
        [...titles].map(([index, title]) => {
          const link = created[index - 1];
          if (!link) return null;
          return prisma.link.update({
            where: { id: link.id },
            data: { title, titleSource: "ai" },
          });
        }),
      );
    } catch (e) {
      warning = `Saved, but AI categorization failed: ${describeAiError(e)}`;
    }
  }

  revalidatePath("/");

  const folderNames = [...folderCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([name]) => name);

  return {
    ok: true,
    data: {
      added: created.length,
      folders: folderNames.length ? folderNames : [UNCATEGORIZED_FOLDER_NAME],
      skipped,
      warning,
    },
  };
}

/**
 * Re-run AI organization. No `linkIds`/`groupId` means a full re-cluster of the
 * whole library; either one scopes it to those links.
 */
export async function reorganizeLinksAction(
  options: { linkIds?: string[]; groupId?: string } = {},
): Promise<ActionResult<ReorganizeSummary>> {
  try {
    const summary = await reorganizeLinks(options);
    if (summary.linkCount === 0) {
      return { ok: false, error: "No links to organize" };
    }
    revalidatePath("/");
    return { ok: true, data: summary };
  } catch (e) {
    return { ok: false, error: describeAiError(e) };
  }
}

export async function moveLinksToNewGroupAction(
  linkIds: string[],
): Promise<ActionResult<{ groupId: string }>> {
  if (!linkIds.length) return { ok: false, error: "No links selected" };

  const links = await prisma.link.findMany({
    where: { id: { in: linkIds } },
    select: { id: true, url: true, title: true },
  });

  if (links.length !== linkIds.length) {
    return { ok: false, error: "Some links were not found" };
  }

  if (!process.env.GROQ_API_KEY?.trim()) {
    return { ok: false, error: "GROQ_API_KEY is required for AI folder naming" };
  }

  let name: string;
  try {
    name = await nameNewGroupFromLinks(links);
  } catch (e) {
    return { ok: false, error: describeAiError(e) };
  }

  const group = await prisma.group.create({ data: { name } });

  await prisma.link.updateMany({
    where: { id: { in: linkIds } },
    data: { groupId: group.id },
  });

  revalidatePath("/");
  return { ok: true, data: { groupId: group.id } };
}

export async function regenerateGroupTitleAction(
  groupId: string,
): Promise<ActionResult> {
  const group = await prisma.group.findUnique({
    where: { id: groupId },
    include: {
      links: { select: { url: true, title: true }, orderBy: { createdAt: "asc" } },
    },
  });

  if (!group) return { ok: false, error: "Folder not found" };
  if (!group.links.length) return { ok: false, error: "No links in this folder" };

  if (!process.env.GROQ_API_KEY?.trim()) {
    return { ok: false, error: "GROQ_API_KEY is required" };
  }

  let name: string;
  try {
    name = await aiRegenerateGroupTitle(group.name, group.links);
  } catch (e) {
    return { ok: false, error: describeAiError(e) };
  }

  await prisma.group.update({
    where: { id: groupId },
    data: { name },
  });

  revalidatePath("/");
  return { ok: true };
}

export async function deleteLinkAction(linkId: string): Promise<ActionResult> {
  await prisma.link.delete({ where: { id: linkId } });
  revalidatePath("/");
  return { ok: true };
}

export async function removeLinksAction(linkIds: string[]): Promise<ActionResult> {
  if (!linkIds.length) return { ok: false, error: "No links selected" };
  await prisma.link.deleteMany({ where: { id: { in: linkIds } } });
  revalidatePath("/");
  return { ok: true };
}

export async function moveLinksToGroupAction(
  linkIds: string[],
  groupId: string | null,
): Promise<ActionResult> {
  if (!linkIds.length) return { ok: false, error: "No links selected" };
  const targetId =
    groupId ?? (await ensureUncategorizedGroupId());
  const g = await prisma.group.findUnique({ where: { id: targetId } });
  if (!g) return { ok: false, error: "Folder not found" };

  await prisma.link.updateMany({
    where: { id: { in: linkIds } },
    data: { groupId: targetId },
  });
  await prisma.group.update({
    where: { id: targetId },
    data: { updatedAt: new Date() },
  });
  revalidatePath("/");
  return { ok: true };
}

export async function createGroupAndMoveLinksAction(
  name: string,
  linkIds: string[],
): Promise<ActionResult<{ groupId: string }>> {
  const trimmed = name.trim();
  if (!trimmed) return { ok: false, error: "Folder name is required" };
  if (!linkIds.length) return { ok: false, error: "No links selected" };
  if (trimmed === UNCATEGORIZED_FOLDER_NAME) {
    return { ok: false, error: "That name is reserved" };
  }

  const existing = await prisma.group.findFirst({ where: { name: trimmed } });
  if (existing) return { ok: false, error: "A folder with that name already exists" };

  const group = await prisma.group.create({ data: { name: trimmed } });
  await prisma.link.updateMany({
    where: { id: { in: linkIds } },
    data: { groupId: group.id },
  });
  revalidatePath("/");
  return { ok: true, data: { groupId: group.id } };
}

export async function renameGroupAction(
  id: string,
  name: string,
): Promise<ActionResult> {
  const trimmed = name.trim();
  if (!trimmed) return { ok: false, error: "Name is required" };
  if (trimmed === UNCATEGORIZED_FOLDER_NAME) {
    return { ok: false, error: "That name is reserved" };
  }

  const group = await prisma.group.findUnique({ where: { id } });
  if (!group) return { ok: false, error: "Folder not found" };
  if (group.name === UNCATEGORIZED_FOLDER_NAME) {
    return { ok: false, error: "Cannot rename this folder" };
  }

  const dup = await prisma.group.findFirst({
    where: { name: trimmed, NOT: { id } },
  });
  if (dup) return { ok: false, error: "A folder with that name already exists" };

  await prisma.group.update({ where: { id }, data: { name: trimmed } });
  revalidatePath("/");
  return { ok: true };
}

export async function deleteGroupAction(groupId: string): Promise<ActionResult> {
  const group = await prisma.group.findUnique({
    where: { id: groupId },
    include: { _count: { select: { links: true } } },
  });
  if (!group) return { ok: false, error: "Folder not found" };
  if (group.name === UNCATEGORIZED_FOLDER_NAME) {
    return { ok: false, error: "Cannot delete this folder" };
  }

  const uncategorizedId = await ensureUncategorizedGroupId();

  await prisma.link.updateMany({
    where: { groupId },
    data: { groupId: uncategorizedId },
  });
  await prisma.group.delete({ where: { id: groupId } });
  revalidatePath("/");
  return { ok: true };
}
