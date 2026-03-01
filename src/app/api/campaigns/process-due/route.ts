import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { executeCampaignSend } from "@/lib/campaignSend";
import { requireSessionIdentity } from "@/lib/routeAuth";

export async function POST(request: Request) {
  const configuredSecret = process.env.CAMPAIGN_PROCESS_SECRET?.trim();
  const providedSecret = request.headers.get("x-campaign-cron-secret")?.trim();
  const hasValidSecret = Boolean(configuredSecret) && Boolean(providedSecret) && providedSecret === configuredSecret;

  if (!hasValidSecret) {
    const auth = await requireSessionIdentity();
    if (auth.error) {
      return auth.error;
    }
  }

  const now = new Date();

  const dueCampaigns = await prisma.campaign.findMany({
    where: {
      status: "scheduled",
      sendMode: {
        in: ["scheduled", "staggered"],
      },
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
