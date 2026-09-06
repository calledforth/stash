import { LinkBoard } from "@/components/link-board";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

// Server Actions inherit their timeout from the page they're called on, and the
// AI organize actions on this page issue a single long Groq call. Without this
// the "Categorize all" / "Reorganize" / "Let AI organize" buttons hit the
// default serverless limit even though the API route sets its own maxDuration.
export const maxDuration = 60;

export default async function Home() {
  const groups = await prisma.group.findMany({
    include: {
      links: { orderBy: { createdAt: "desc" } },
    },
    orderBy: { updatedAt: "desc" },
  });

  return <LinkBoard groups={groups} />;
}
