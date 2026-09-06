import Groq from "groq-sdk";
import type { Group, Link } from "@prisma/client";
import { UNCATEGORIZED_FOLDER_NAME as FALLBACK_UNSORTED } from "@/lib/links";

// llama-3.3-70b-versatile was decommissioned by Groq on 2026-08-16; requests to it
// fail with `model_decommissioned`. gpt-oss-120b is Groq's recommended replacement.
const DEFAULT_MODEL = "openai/gpt-oss-120b";

function getModel(): string {
  return process.env.GROQ_MODEL?.trim() || DEFAULT_MODEL;
}

function shouldLogModelOutput(): boolean {
  return process.env.AI_DEBUG_MODEL_OUTPUT === "1";
}

function logModelOutput(tag: string, raw: string): void {
  if (!shouldLogModelOutput()) return;
  console.log(`[ai:${tag}] model_output=${raw}`);
}

const FALLBACK_GROUP = "General Resources";

const GENERIC_TITLES = new Set([
  "home",
  "homepage",
  "docs",
  "documentation",
  "untitled",
]);

function cleanGroupName(input: string | null | undefined): string {
  if (!input) return FALLBACK_GROUP;
  const cleaned = input
    .replace(/["'`]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .split(" ")
    .slice(0, 4)
    .join(" ");
  return cleaned || FALLBACK_GROUP;
}

function cleanLinkTitle(input: string | null | undefined): string | null {
  if (!input) return null;
  const cleaned = input
    .replace(/["'`]/g, "")
    .replace(/\s+/g, " ")
    .trim();
  if (!cleaned) return null;
  if (GENERIC_TITLES.has(cleaned.toLowerCase())) return null;
  return cleaned.slice(0, 90);
}

function getGroq(): Groq | null {
  const key = process.env.GROQ_API_KEY;
  if (!key?.trim()) return null;
  return new Groq({ apiKey: key });
}

/**
 * Turn a Groq SDK failure into something a human can act on. The silent
 * `catch {}` that used to wrap these calls is why a decommissioned model went
 * unnoticed for weeks — every error now has to reach the UI.
 */
export function describeAiError(e: unknown): string {
  const err = e as {
    status?: number;
    message?: string;
    error?: { error?: { code?: string; message?: string } };
  };
  const code = err?.error?.error?.code;
  const detail = err?.error?.error?.message ?? err?.message;

  if (code === "model_decommissioned" || code === "model_not_found") {
    return `Groq model "${getModel()}" is unavailable (${code}). Set GROQ_MODEL to a supported model.`;
  }
  if (err?.status === 401) return "Groq rejected the API key (401). Check GROQ_API_KEY.";
  if (err?.status === 429) return "Groq rate limit hit (429). Try again in a moment.";
  return detail || "AI request failed";
}

export type CategorizeResult =
  | { type: "existing"; groupId: string; linkTitle: string }
  | { type: "new"; groupName: string; linkTitle: string };

export async function categorizeLink(input: {
  url: string;
  resolvedUrl: string;
  domain: string | null;
  sourceType: "youtube" | "web";
  sourceCreator: string | null;
  title: string | null;
  description: string | null;
  groups: Pick<Group, "id" | "name">[];
}): Promise<CategorizeResult> {
  const groq = getGroq();
  if (!groq) {
    throw new Error("GROQ_API_KEY is not set");
  }

  const groupLines = input.groups
    .map((g) => `- id: ${g.id} | name: ${g.name}`)
    .join("\n");

  const prompt = `You are an expert bookmark librarian.

Task: choose the nearest umbrella folder topic for this bookmark and generate a concise link title.

Existing folders:
${groupLines || "(no folders yet — you must propose a new folder name)"}

Bookmark signals:
- Original URL: ${input.url}
- Final URL after redirects: ${input.resolvedUrl}
- Domain: ${input.domain ?? "(unknown)"}
- Source type: ${input.sourceType}
- Source creator/channel: ${input.sourceCreator ?? "(unknown)"}
- Title: ${input.title ?? "(unknown)"}
- Description: ${input.description ?? "(none)"}

Rules:
- Prefer semantic umbrellas over exact literal matching.
- Prefer reusing the nearest existing folder over creating a new near-duplicate folder.
- Only create a new folder if all existing folders are clearly off-topic.
- For YouTube links, infer the real topic from title/description/creator, not the platform.
- New folder names must be 3-4 words, concise, specific, and Title Case.
- Avoid generic folder names like "YouTube", "Videos", "Links", "Stuff", "Resources".
- Generate linkTitle as the primary title for display. Keep it concise and specific.
- Return ONLY valid JSON in exactly one of these shapes:
  {"type":"existing","groupId":"<id>","linkTitle":"<title>"}
  {"type":"new","groupName":"<name>","linkTitle":"<title>"}`;

  const completion = await groq.chat.completions.create({
    model: getModel(),
    messages: [{ role: "user", content: prompt }],
    temperature: 0.3,
    response_format: { type: "json_object" },
  });

  const raw = completion.choices[0]?.message?.content;
  if (!raw) throw new Error("Empty Groq response");
  logModelOutput("categorizeLink", raw);

  const parsed = JSON.parse(raw) as {
    type?: string;
    groupId?: string;
    groupName?: string;
    linkTitle?: string;
  };

  const fallbackTitle =
    cleanLinkTitle(input.title) ?? cleanLinkTitle(input.description) ?? "Saved link";
  const linkTitle = cleanLinkTitle(parsed.linkTitle) ?? fallbackTitle;

  if (parsed.type === "existing" && parsed.groupId) {
    const exists = input.groups.some((g) => g.id === parsed.groupId);
    if (exists) return { type: "existing", groupId: parsed.groupId, linkTitle };
  }
  if (parsed.type === "new" && parsed.groupName?.trim()) {
    return {
      type: "new",
      groupName: cleanGroupName(parsed.groupName),
      linkTitle,
    };
  }

  // Fallback: new group from title words
  return {
    type: "new",
    groupName: cleanGroupName(input.title),
    linkTitle,
  };
}

export async function nameNewGroupFromLinks(
  links: Pick<Link, "url" | "title">[],
): Promise<string> {
  const groq = getGroq();
  if (!groq) throw new Error("GROQ_API_KEY is not set");

  const lines = links
    .map((l, i) => `${i + 1}. ${l.title ?? l.url} — ${l.url}`)
    .join("\n");

  const prompt = `Create a short folder name (3-4 words, Title Case) for this set of bookmarks.
Focus on the shared topic and avoid platform words like YouTube.

${lines}

Return ONLY valid JSON: {"groupName":"<name>"}`;

  const completion = await groq.chat.completions.create({
    model: getModel(),
    messages: [{ role: "user", content: prompt }],
    temperature: 0.35,
    response_format: { type: "json_object" },
  });

  const raw = completion.choices[0]?.message?.content;
  if (!raw) throw new Error("Empty Groq response");
  logModelOutput("nameNewGroupFromLinks", raw);
  const parsed = JSON.parse(raw) as { groupName?: string };
  const name = cleanGroupName(parsed.groupName);
  if (name) return name;
  return FALLBACK_GROUP;
}

export async function regenerateGroupTitle(
  groupName: string,
  links: Pick<Link, "url" | "title">[],
): Promise<string> {
  const groq = getGroq();
  if (!groq) throw new Error("GROQ_API_KEY is not set");

  const lines = links
    .map((l, i) => `${i + 1}. ${l.title ?? l.url} — ${l.url}`)
    .join("\n");

  const prompt = `The folder is currently named "${groupName}".
Given these bookmarks, suggest a better folder name that reflects the dominant shared topic.

Rules:
- 3-4 words
- Title Case
- Specific topic, not platform names
- Avoid quotes

Bookmarks:
${lines}

Return ONLY valid JSON: {"groupName":"<name>"}`;

  const completion = await groq.chat.completions.create({
    model: getModel(),
    messages: [{ role: "user", content: prompt }],
    temperature: 0.35,
    response_format: { type: "json_object" },
  });

  const raw = completion.choices[0]?.message?.content;
  if (!raw) throw new Error("Empty Groq response");
  logModelOutput("regenerateGroupTitle", raw);
  const parsed = JSON.parse(raw) as { groupName?: string };
  const name = cleanGroupName(parsed.groupName);
  if (name) return name;
  return groupName;
}

export type ReclusterFolder = { folderName: string; linkIndexes: number[] };

export type ReclusterResult = {
  folders: ReclusterFolder[];
  /**
   * 1-based link index -> AI-written display title. Only populated when
   * `withTitles` is set; otherwise always empty.
   */
  titles: Map<number, string>;
};

/**
 * Re-cluster a set of links in one shot. Links are addressed by 1-based index
 * instead of cuid so the model has far less to copy verbatim (and far less to
 * hallucinate).
 *
 * Two modes:
 * - no `existingFolders` (global recluster): design a taxonomy from scratch,
 *   ignoring whatever organization is already there.
 * - with `existingFolders` (scoped run, e.g. "organize Uncategorized"): file the
 *   links into the folders that already exist, only inventing new ones when
 *   nothing fits. Otherwise sorting 5 stray links would spawn 5 new near-
 *   duplicate folders alongside the real ones.
 *
 * `withTitles` additionally asks for a display title per link. It exists so a
 * paste of 40 URLs costs one Groq call instead of 40 `categorizeLink` calls that
 * would each see a stale folder list and race each other into near-duplicates.
 */
export async function reclusterLinks(
  links: Pick<Link, "url" | "title" | "description">[],
  options: { existingFolders?: string[]; withTitles?: boolean } = {},
): Promise<ReclusterResult> {
  const groq = getGroq();
  if (!groq) throw new Error("GROQ_API_KEY is not set");
  if (!links.length) return { folders: [], titles: new Map() };

  const existing = (options.existingFolders ?? []).filter(
    (n) => n && n !== FALLBACK_UNSORTED,
  );
  const scoped = existing.length > 0;
  const withTitles = options.withTitles === true;

  const lines = links
    .map((l, i) => {
      const title = l.title?.trim() || "(untitled)";
      const desc = l.description?.trim()?.slice(0, 160);
      const head = `${i + 1}. ${title} — ${l.url}`;
      return desc ? `${head}\n   ${desc}` : head;
    })
    .join("\n");

  const intro = scoped
    ? `You are an expert bookmark librarian filing loose bookmarks into an existing library.

These folders already exist — reuse them wherever a bookmark plausibly belongs:
${existing.map((n) => `- ${n}`).join("\n")}`
    : `You are an expert bookmark librarian reorganizing an entire library from scratch.

Design the folder structure you would use if you were starting fresh. Ignore any
existing organization — you are replacing it.`;

  const modeRules = scoped
    ? `- Strongly prefer an existing folder from the list above. Reuse its name EXACTLY.
- Only invent a new folder when a bookmark is clearly off-topic for every existing one.
- Do not create a new folder that is a near-duplicate of an existing one.`
    : `- Aim for folders of roughly 3+ bookmarks. Prefer a smaller number of meaningful
  folders over many near-duplicate ones. Merge topics that clearly overlap.`;

  const titleRules = withTitles
    ? `
- Also write a concise display title for every bookmark, keyed by its number.
  Make it specific and under 90 characters. Never just echo the bare domain.`
    : "";

  const responseShape = withTitles
    ? `{"folders":[{"folderName":"<name>","linkIndexes":[1,2,3]}],"titles":{"1":"<title>","2":"<title>"}}`
    : `{"folders":[{"folderName":"<name>","linkIndexes":[1,2,3]}]}`;

  const prompt = `${intro}

Below are ${links.length} bookmarks, numbered 1 to ${links.length}.

Bookmarks:
${lines}

Rules:
- Group by what the bookmark is ABOUT, never by the platform hosting it.
  YouTube videos about Rust belong with Rust articles, not in a "YouTube" folder.
${modeRules}
- New folder names: 2-4 words, Title Case, specific enough that someone could guess
  the contents from the name alone.
- Avoid vague names like "Resources", "Misc", "Links", "Stuff", "Reading", "Tech".
- Genuine one-offs that fit nowhere may go in a folder named "${FALLBACK_UNSORTED}".
- Every bookmark number from 1 to ${links.length} must appear EXACTLY ONCE across all folders.${titleRules}

Return ONLY valid JSON in this shape:
${responseShape}`;

  const completion = await groq.chat.completions.create({
    model: getModel(),
    messages: [{ role: "user", content: prompt }],
    temperature: 0.2,
    response_format: { type: "json_object" },
  });

  const raw = completion.choices[0]?.message?.content;
  if (!raw) throw new Error("Empty Groq response");
  logModelOutput("reclusterLinks", raw);

  const parsed = JSON.parse(raw) as {
    folders?: { folderName?: string; linkIndexes?: unknown }[];
    titles?: unknown;
  };
  if (!Array.isArray(parsed.folders)) {
    throw new Error("AI returned an unexpected shape for the re-cluster");
  }

  // Defensive pass: the model can repeat, invent, or drop indexes. Keep only
  // in-range indexes, first assignment wins, and let the caller decide what to
  // do with anything left unassigned.
  const seen = new Set<number>();
  const folders: ReclusterFolder[] = [];

  // cleanGroupName() clips to 4 words, which would mangle a longer existing
  // folder the model correctly asked to reuse. Match those verbatim first.
  const existingByKey = new Map(
    [...existing, FALLBACK_UNSORTED].map((n) => [n.trim().toLowerCase(), n]),
  );

  for (const folder of parsed.folders) {
    const proposed = folder?.folderName?.trim() ?? "";
    const name =
      existingByKey.get(proposed.toLowerCase()) ?? cleanGroupName(proposed);
    const rawIndexes = Array.isArray(folder?.linkIndexes) ? folder.linkIndexes : [];
    const linkIndexes: number[] = [];

    for (const value of rawIndexes) {
      const n = typeof value === "number" ? value : Number(value);
      if (!Number.isInteger(n) || n < 1 || n > links.length) continue;
      if (seen.has(n)) continue;
      seen.add(n);
      linkIndexes.push(n);
    }

    if (linkIndexes.length) folders.push({ folderName: name, linkIndexes });
  }

  const titles = new Map<number, string>();
  if (withTitles && parsed.titles && typeof parsed.titles === "object") {
    for (const [key, value] of Object.entries(
      parsed.titles as Record<string, unknown>,
    )) {
      const n = Number(key);
      if (!Number.isInteger(n) || n < 1 || n > links.length) continue;
      const title = cleanLinkTitle(typeof value === "string" ? value : null);
      if (title) titles.set(n, title);
    }
  }

  return { folders, titles };
}
