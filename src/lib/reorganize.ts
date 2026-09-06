import { prisma } from "@/lib/prisma";
import { reclusterLinks } from "@/lib/ai";
import { UNCATEGORIZED_FOLDER_NAME } from "@/lib/links";

export type ReorganizeSummary = {
  /** Links considered by this run. */
  linkCount: number;
  /** Links the model failed to place; these keep their current folder. */
  unassigned: number;
  folders: { name: string; count: number; created: boolean }[];
  /** Folders this run emptied out and therefore deleted. */
  removedFolders: string[];
};

export type ReorganizeOptions = {
  /** Restrict to these links. Omit to reorganize the whole library. */
  linkIds?: string[];
  /**
   * Restrict to one folder's links. Ignored when `linkIds` is given.
   */
  groupId?: string;
};

/**
 * Re-run AI organization over some or all links.
 *
 * Scope drives the strategy. A whole-library run designs a folder taxonomy from
 * scratch; a scoped run (a single folder, or a hand-picked selection) files its
 * links into the folders that already exist so it can't shred the rest of the
 * library.
 */
export async function reorganizeLinks(
  options: ReorganizeOptions = {},
): Promise<ReorganizeSummary> {
  if (!process.env.GROQ_API_KEY?.trim()) {
    throw new Error("GROQ_API_KEY is not set");
  }

  const { linkIds, groupId } = options;
  const scoped = Boolean(linkIds?.length || groupId);

  const links = await prisma.link.findMany({
    where: linkIds?.length
      ? { id: { in: linkIds } }
      : groupId
        ? { groupId }
        : undefined,
    select: {
      id: true,
      url: true,
      title: true,
      description: true,
      groupId: true,
    },
    orderBy: { createdAt: "asc" },
  });

  const empty: ReorganizeSummary = {
    linkCount: 0,
    unassigned: 0,
    folders: [],
    removedFolders: [],
  };
  if (!links.length) return empty;

  const allGroups = await prisma.group.findMany({ select: { id: true, name: true } });

  // A scoped run files into what already exists. Exclude the folder being
  // emptied from that list, otherwise the model just puts everything back.
  const existingFolders = scoped
    ? allGroups
        .filter((g) => g.name !== UNCATEGORIZED_FOLDER_NAME && g.id !== groupId)
        .map((g) => g.name)
    : [];

  const { folders: proposals } = await reclusterLinks(links, {
    existingFolders,
  });

  const byName = new Map(allGroups.map((g) => [g.name.toLowerCase(), g]));
  const sourceGroupIds = new Set(links.map((l) => l.groupId));
  const assigned = new Set<string>();
  const folders: ReorganizeSummary["folders"] = [];
  const now = new Date();

  for (const proposal of proposals) {
    const ids = proposal.linkIndexes
      .map((n) => links[n - 1]?.id)
      .filter((id): id is string => Boolean(id));
    if (!ids.length) continue;

    const key = proposal.folderName.toLowerCase();
    let group = byName.get(key);
    let created = false;

    if (!group) {
      group = await prisma.group.create({
        data: { name: proposal.folderName },
        select: { id: true, name: true },
      });
      byName.set(key, group);
      created = true;
    }

    await prisma.link.updateMany({
      where: { id: { in: ids } },
      data: { groupId: group.id },
    });
    await prisma.group.update({
      where: { id: group.id },
      data: { updatedAt: now },
    });

    for (const id of ids) assigned.add(id);
    folders.push({ name: group.name, count: ids.length, created });
  }

  // Delete only the folders this run drained, so a freshly-made empty folder
  // the user is about to fill doesn't vanish under them.
  const removedFolders: string[] = [];
  const drained = [...sourceGroupIds];
  if (drained.length) {
    const emptied = await prisma.group.findMany({
      where: { id: { in: drained }, links: { none: {} } },
      select: { id: true, name: true },
    });
    if (emptied.length) {
      await prisma.group.deleteMany({
        where: { id: { in: emptied.map((g) => g.id) } },
      });
      removedFolders.push(...emptied.map((g) => g.name));
    }
  }

  return {
    linkCount: links.length,
    unassigned: links.length - assigned.size,
    folders,
    removedFolders,
  };
}
