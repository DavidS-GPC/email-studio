import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { executeCampaignSend } from "@/lib/campaignSend";
import { ensureSafeExternalAttachmentUrl } from "@/lib/attachments";
import { decryptText } from "@/lib/contactSecurity";

type CampaignAttachment = {
  type: "upload" | "url";
  name: string;
  url: string;
};

function normalizeSendMode(value: unknown): "now" | "scheduled" | "staggered" {
  if (value === "scheduled" || value === "staggered") {
    return value;
  }

  return "now";
}

function sanitizeCampaignAttachments(value: unknown): CampaignAttachment[] {
  if (!Array.isArray(value)) {
    return [];
  }

  const output: CampaignAttachment[] = [];

  for (const item of value) {
    if (!item || typeof item !== "object") {
      continue;
    }

    const rawType = (item as Record<string, unknown>).type;
    const rawName = (item as Record<string, unknown>).name;
    const rawUrl = (item as Record<string, unknown>).url;

    const type = rawType === "upload" ? "upload" : rawType === "url" ? "url" : null;
    const name = typeof rawName === "string" ? rawName.trim().slice(0, 180) : "attachment";
    const url = typeof rawUrl === "string" ? rawUrl.trim() : "";

    if (!type || !url) {
      continue;
    }

    if (type === "upload") {
      const normalized = url.replace(/\\/g, "/");
      if (!normalized.startsWith("/uploads/") || normalized.includes("..")) {
        continue;
      }

      output.push({ type, name, url: normalized });
      continue;
    }

    try {
      const safeUrl = ensureSafeExternalAttachmentUrl(url);
      output.push({ type, name, url: safeUrl });
    } catch {
      // Skip invalid or disallowed URL attachments.
    }
  }

  return output;
}

export async function GET() {
  const campaigns = await prisma.campaign.findMany({
    include: {
      group: true,
      template: true,
      recipients: {
        orderBy: { sentAt: "desc" },
      },
    },
    orderBy: { createdAt: "desc" },
  });

  const payload = campaigns.map((campaign) => ({
    ...campaign,
    recipients: campaign.recipients.map((recipient) => ({
      ...recipient,
      email: decryptText(recipient.email),
    })),
  }));

  return NextResponse.json(payload);
}

export async function POST(request: Request) {
  const body = await request.json();
  const sendMode = normalizeSendMode(body.sendMode);
  const sendFailureReport = Boolean(body.sendFailureReport);
  const failureReportEmail =
    typeof body.failureReportEmail === "string" && body.failureReportEmail.trim().length > 0
      ? body.failureReportEmail.trim().toLowerCase()
      : null;

  const scheduledFor =
    sendMode === "scheduled" && typeof body.scheduledFor === "string" && body.scheduledFor.trim().length > 0
      ? new Date(body.scheduledFor)
      : null;

  const staggerMinutes =
    sendMode === "staggered"
      ? Math.max(1, Number.parseInt(String(body.staggerMinutes || ""), 10) || 0)
      : null;

  if (sendMode === "scheduled") {
    if (!scheduledFor || Number.isNaN(scheduledFor.getTime())) {
      return NextResponse.json({ error: "A valid scheduled date/time is required" }, { status: 400 });
    }

    if (scheduledFor.getTime() <= Date.now()) {
      return NextResponse.json({ error: "Scheduled date/time must be in the future" }, { status: 400 });
    }
  }

  if (sendMode === "staggered" && !staggerMinutes) {
    return NextResponse.json({ error: "Stagger duration must be at least 1 minute" }, { status: 400 });
  }

  if (sendFailureReport && !failureReportEmail) {
    return NextResponse.json({ error: "Failure report email is required when reporting is enabled" }, { status: 400 });
  }

  const campaign = await prisma.campaign.create({
    data: {
      name: body.name,
      subject: body.subject,
      html: body.html,
      sendMode,
      status: sendMode === "scheduled" ? "scheduled" : "draft",
      scheduledFor,
      staggerMinutes,
      sendFailureReport,
      failureReportEmail,
      groupId: body.groupId || null,
      templateId: body.templateId || null,
      attachmentRaw: JSON.stringify(sanitizeCampaignAttachments(body.attachments)),
    },
  });

  if (sendMode === "now" || sendMode === "staggered") {
    try {
      const sendResult = await executeCampaignSend(campaign.id);
      return NextResponse.json({ campaignId: campaign.id, sendMode, ...sendResult }, { status: 201 });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unexpected send error";
      return NextResponse.json({ error: message }, { status: 400 });
    }
  }

  return NextResponse.json(campaign, { status: 201 });
}
