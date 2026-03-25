import Groq from "groq-sdk";
import type { Group, Link } from "@prisma/client";

const DEFAULT_MODEL = "llama-3.3-70b-versatile";

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
