"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import {
  categorizeLink,
  nameNewGroupFromLinks,
  regenerateGroupTitle as aiRegenerateGroupTitle,
} from "@/lib/ai";
import { fetchLinkMetadata, normalizeUrl } from "@/lib/metadata";
import { UNCATEGORIZED_FOLDER_NAME } from "@/lib/links";

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

async function ensureInboxGroupId(): Promise<string> {
  const found = await prisma.group.findFirst({ where: { name: "Inbox" } });
  if (found) return found.id;
  const g = await prisma.group.create({ data: { name: "Inbox" } });
  return g.id;
}

export type ActionResult<T = void> =
  | { ok: true; data?: T }
  | { ok: false; error: string };

export async function addLinkAction(
  rawUrl: string,
): Promise<ActionResult<{ id: string; groupName: string }>> {
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

  if (!hasGroq) {
    groupId = await ensureInboxGroupId();
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
    } catch {
      groupId = await ensureInboxGroupId();
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
    data: { id: link.id, groupName: group?.name ?? "Folder" },
  };
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
    const msg = e instanceof Error ? e.message : "AI error";
    return { ok: false, error: msg };
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
    const msg = e instanceof Error ? e.message : "AI error";
    return { ok: false, error: msg };
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
