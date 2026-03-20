import Groq from "groq-sdk";
import type { Group, Link } from "@prisma/client";

const MODEL = "llama-3.3-70b-versatile";

function getGroq(): Groq | null {
  const key = process.env.GROQ_API_KEY;
  if (!key?.trim()) return null;
  return new Groq({ apiKey: key });
}

export type CategorizeResult =
  | { type: "existing"; groupId: string }
  | { type: "new"; groupName: string };

export async function categorizeLink(input: {
  url: string;
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

  const prompt = `You categorize bookmarks into existing folders or propose ONE new folder name.

Existing folders (pick by id if a good fit, else propose a new short folder name):
${groupLines || "(no folders yet — you must propose a new folder name)"}

New link:
- URL: ${input.url}
- Title: ${input.title ?? "(unknown)"}
- Description: ${input.description ?? "(none)"}

Rules:
- Prefer an existing folder when it clearly fits.
- New folder names: 2–5 words, Title Case, no quotes.
- Return ONLY valid JSON: either {"type":"existing","groupId":"<id>"} or {"type":"new","groupName":"<name>"}`;

  const completion = await groq.chat.completions.create({
    model: MODEL,
    messages: [{ role: "user", content: prompt }],
    temperature: 0.3,
    response_format: { type: "json_object" },
  });

  const raw = completion.choices[0]?.message?.content;
  if (!raw) throw new Error("Empty Groq response");

  const parsed = JSON.parse(raw) as {
    type?: string;
    groupId?: string;
    groupName?: string;
  };

  if (parsed.type === "existing" && parsed.groupId) {
    const exists = input.groups.some((g) => g.id === parsed.groupId);
    if (exists) return { type: "existing", groupId: parsed.groupId };
  }
  if (parsed.type === "new" && parsed.groupName?.trim()) {
    return { type: "new", groupName: parsed.groupName.trim() };
  }

  // Fallback: new group from title words
  return {
    type: "new",
    groupName: input.title?.slice(0, 40) || "New collection",
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

  const prompt = `Create a short folder name (2–5 words, Title Case) for this set of bookmarks:

${lines}

Return ONLY valid JSON: {"groupName":"<name>"}`;

  const completion = await groq.chat.completions.create({
    model: MODEL,
    messages: [{ role: "user", content: prompt }],
    temperature: 0.35,
    response_format: { type: "json_object" },
  });

  const raw = completion.choices[0]?.message?.content;
  if (!raw) throw new Error("Empty Groq response");
  const parsed = JSON.parse(raw) as { groupName?: string };
  const name = parsed.groupName?.trim();
  if (name) return name;
  return "New collection";
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

  const prompt = `The folder is currently named "${groupName}". Given these bookmarks, suggest a BETTER short folder name (2–5 words, Title Case) that reflects the whole set.

Bookmarks:
${lines}

Return ONLY valid JSON: {"groupName":"<name>"}`;

  const completion = await groq.chat.completions.create({
    model: MODEL,
    messages: [{ role: "user", content: prompt }],
    temperature: 0.35,
    response_format: { type: "json_object" },
  });

  const raw = completion.choices[0]?.message?.content;
  if (!raw) throw new Error("Empty Groq response");
  const parsed = JSON.parse(raw) as { groupName?: string };
  const name = parsed.groupName?.trim();
  if (name) return name;
  return groupName;
}
