import { timingSafeEqual } from "node:crypto";
import { revalidatePath } from "next/cache";
import { describeAiError } from "@/lib/ai";
import { reorganizeLinks } from "@/lib/reorganize";

/**
 * POST /api/reorganize
 *
 * Re-runs AI organization. With no body it re-clusters the entire library from
 * scratch; pass `linkIds` or `groupId` to scope it.
 *
 *   curl -X POST https://<host>/api/reorganize \
 *     -H "Authorization: Bearer $REORGANIZE_SECRET"
 *
 *   curl -X POST https://<host>/api/reorganize \
 *     -H "Authorization: Bearer $REORGANIZE_SECRET" \
 *     -H "Content-Type: application/json" \
 *     -d '{"groupId":"<id>"}'
 *
 * This rewrites every link's folder and costs Groq tokens, so it requires
 * REORGANIZE_SECRET to be set — the rest of the app has no auth, and an
 * unauthenticated "reshuffle everything" URL is not something to leave open.
 */

// A full re-cluster is one Groq call covering the whole library, against a
// reasoning model — comfortably past the default serverless timeout. 60s is the
// ceiling on Vercel's Hobby plan; raise it if you're on Pro and still hit 504s.
export const maxDuration = 60;

function isAuthorized(request: Request): boolean {
  const secret = process.env.REORGANIZE_SECRET?.trim();
  if (!secret) return false;

  const header = request.headers.get("authorization");
  const presented =
    header?.replace(/^Bearer\s+/i, "").trim() ||
    request.headers.get("x-reorganize-secret")?.trim() ||
    "";
  if (!presented) return false;

  const a = Buffer.from(presented);
  const b = Buffer.from(secret);
  return a.length === b.length && timingSafeEqual(a, b);
}

export async function POST(request: Request) {
  if (!process.env.REORGANIZE_SECRET?.trim()) {
    return Response.json(
      { error: "REORGANIZE_SECRET is not configured on the server" },
      { status: 503 },
    );
  }
  if (!isAuthorized(request)) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: { linkIds?: unknown; groupId?: unknown } = {};
  if (request.headers.get("content-type")?.includes("application/json")) {
    try {
      body = (await request.json()) as typeof body;
    } catch {
      return Response.json({ error: "Invalid JSON body" }, { status: 400 });
    }
  }

  const linkIds = Array.isArray(body.linkIds)
    ? body.linkIds.filter((id): id is string => typeof id === "string")
    : undefined;
  const groupId = typeof body.groupId === "string" ? body.groupId : undefined;

  try {
    const summary = await reorganizeLinks({ linkIds, groupId });
    revalidatePath("/");
    return Response.json({ ok: true, ...summary });
  } catch (e) {
    return Response.json({ ok: false, error: describeAiError(e) }, { status: 502 });
  }
}
