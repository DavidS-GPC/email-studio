import { Resend } from "resend";
import { prisma } from "@/lib/prisma";
import { toResendAttachments } from "@/lib/attachments";
import { decryptNullable, decryptText, encryptText } from "@/lib/contactSecurity";

type SendResultItem = {
  id: string;
  email: string;
  status: string;
  error: string | null;
};

export type CampaignSendResult = {
  sent: number;
  failed: number;
  results: SendResultItem[];
};

function sleep(ms: number) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

export async function executeCampaignSend(campaignId: string): Promise<CampaignSendResult> {
  const campaign = await prisma.campaign.findUnique({
    where: { id: campaignId },
    include: {
      group: {
        include: {
          memberships: {
            include: {
              contact: true,
            },
          },
        },
      },
    },
  });

  if (!campaign) {
    throw new Error("Campaign not found");
  }

  const campaignSendMode = (campaign as { sendMode?: string }).sendMode || "now";
  const campaignStaggerMinutes = (campaign as { staggerMinutes?: number | null }).staggerMinutes || null;
  const campaignSendFailureReport = (campaign as { sendFailureReport?: boolean }).sendFailureReport || false;
  const campaignFailureReportEmail = (campaign as { failureReportEmail?: string | null }).failureReportEmail || null;

  if (!campaign.group) {
    throw new Error("Campaign is missing a target group");
  }

  const apiKey = process.env.RESEND_API_KEY;
  const fromEmail = process.env.RESEND_FROM_EMAIL;
  if (!apiKey || !fromEmail) {
    throw new Error("RESEND_API_KEY and RESEND_FROM_EMAIL must be configured");
  }

  const resend = new Resend(apiKey);
  const attachments = await toResendAttachments(campaign.attachmentRaw);

  const memberships = campaign.group.memberships;

  await prisma.campaign.update({
    where: { id: campaign.id },
    data: {
      status: "sending",
      processingStartedAt: new Date(),
    } as never,
  });

  await prisma.campaignRecipient.deleteMany({ where: { campaignId: campaign.id } });

  const delayMs =
    campaignSendMode === "staggered" && campaignStaggerMinutes && campaignStaggerMinutes > 0 && memberships.length > 1
      ? Math.floor((campaignStaggerMinutes * 60_000) / (memberships.length - 1))
      : 0;

  const results: SendResultItem[] = [];

  for (let index = 0; index < memberships.length; index += 1) {
    const membership = memberships[index];
    const contact = membership.contact;
    const contactEmail = decryptText(contact.email);
    const contactName = decryptNullable(contact.name);

    if (!contactEmail) {
      continue;
    }

    const personalizedHtml = campaign.html.replaceAll("{{name}}", contactName || "there");

    try {
      const res = await resend.emails.send({
        from: fromEmail,
        to: contactEmail,
        subject: campaign.subject,
        html: personalizedHtml,
        attachments,
      });

      const recipient = await prisma.campaignRecipient.create({
        data: {
          campaignId: campaign.id,
          contactId: contact.id,
          email: encryptText(contactEmail),
          status: "sent",
          messageId: res.data?.id || null,
          sentAt: new Date(),
        },
      });

      results.push({
        id: recipient.id,
        email: contactEmail,
        status: recipient.status,
        error: recipient.error,
      });
    } catch (error) {
      const recipient = await prisma.campaignRecipient.create({
        data: {
          campaignId: campaign.id,
          contactId: contact.id,
          email: encryptText(contactEmail),
          status: "failed",
          error: error instanceof Error ? error.message : "Unknown error",
        },
      });

      results.push({
        id: recipient.id,
        email: contactEmail,
        status: recipient.status,
        error: recipient.error,
      });
    }

    if (delayMs > 0 && index < memberships.length - 1) {
      await sleep(delayMs);
    }
  }

  await prisma.campaign.update({
    where: { id: campaign.id },
    data: {
      status: "sent",
      sentAt: new Date(),
      processingStartedAt: null,
    } as never,
  });

  if (campaignSendFailureReport && campaignFailureReportEmail) {
    const failedItems = results.filter((item) => item.status === "failed");

    const reportRows =
      failedItems.length > 0
        ? failedItems
            .map(
              (item) =>
                `<tr><td style="padding:8px 10px;border-bottom:1px solid #e2e8f0;">${escapeHtml(item.email)}</td><td style="padding:8px 10px;border-bottom:1px solid #e2e8f0;">${escapeHtml(item.error || "Unknown error")}</td></tr>`,
            )
            .join("")
        : `<tr><td colspan="2" style="padding:10px;">No failures were recorded.</td></tr>`;

    const reportHtml = `
      <div style="font-family:Segoe UI,Arial,sans-serif;padding:16px;background:#f8fafc;color:#0f172a;">
        <h2 style="margin:0 0 10px;">Campaign delivery report</h2>
        <p style="margin:0 0 10px;">Campaign: <strong>${escapeHtml(campaign.name)}</strong></p>
        <p style="margin:0 0 14px;">Sent: <strong>${results.filter((item) => item.status === "sent").length}</strong> • Failed: <strong>${failedItems.length}</strong></p>
        <table style="width:100%;border-collapse:collapse;background:#fff;border:1px solid #e2e8f0;">
          <thead>
            <tr>
              <th style="text-align:left;padding:8px 10px;background:#f1f5f9;border-bottom:1px solid #e2e8f0;">Recipient</th>
              <th style="text-align:left;padding:8px 10px;background:#f1f5f9;border-bottom:1px solid #e2e8f0;">Failure reason</th>
            </tr>
          </thead>
          <tbody>${reportRows}</tbody>
        </table>
      </div>
    `;

    try {
      await resend.emails.send({
        from: fromEmail,
        to: campaignFailureReportEmail,
        subject: `Campaign failure report: ${campaign.name}`,
        html: reportHtml,
      });
    } catch {
      // ignore report email errors so campaign send result is preserved
    }
  }

  return {
    sent: results.filter((item) => item.status === "sent").length,
    failed: results.filter((item) => item.status === "failed").length,
    results,
  };
}
