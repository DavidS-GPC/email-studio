import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { executeCampaignSend } from "@/lib/campaignSend";

export async function POST() {
  const now = new Date();

  const dueCampaigns = await prisma.campaign.findMany({
    where: {
      status: "scheduled",
      sendMode: "scheduled",
      scheduledFor: {
        lte: now,
      },
    },
    select: {
      id: true,
    },
    orderBy: { scheduledFor: "asc" },
  });

  let processedCount = 0;
  let failedCount = 0;

  for (const campaign of dueCampaigns) {
    try {
      await executeCampaignSend(campaign.id);
      processedCount += 1;
    } catch {
      failedCount += 1;
    }
  }

  return NextResponse.json({ processedCount, failedCount });
}
