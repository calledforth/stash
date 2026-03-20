import { LinkBoard } from "@/components/link-board";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export default async function Home() {
  const groups = await prisma.group.findMany({
    include: {
      links: { orderBy: { createdAt: "desc" } },
    },
    orderBy: { updatedAt: "desc" },
  });

  return <LinkBoard groups={groups} />;
}
