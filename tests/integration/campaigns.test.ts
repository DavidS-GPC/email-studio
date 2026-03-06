import { beforeEach, describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/prisma";
import { clearDatabase, jsonBody } from "./helpers";

const { resendSendMock } = vi.hoisted(() => {
  return {
    resendSendMock: vi.fn(),
  };
});

vi.mock("resend", () => {
  class MockResend {
    emails = {
      send: resendSendMock,
    };
  }

  return {
    Resend: MockResend,
  };
});

describe("Campaign integration flows", () => {
  beforeEach(async () => {
    await clearDatabase();
    resendSendMock.mockReset();
    resendSendMock.mockResolvedValue({ data: { id: "msg_test_123" } });
  });

  it("sends a campaign using mocked Resend client", async () => {
    const contactsRoute = await import("@/app/api/contacts/route");
    const campaignSendRoute = await import("@/app/api/campaigns/[id]/send/route");

    const group = await prisma.contactGroup.create({
      data: { name: "Send Group", description: "Campaign targets" },
    });

    const contactResponse = await contactsRoute.POST(
      new Request("http://localhost/api/contacts", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          email: "send-target@example.com",
          name: "Target",
          company: "Delivery Co",
          groupId: group.id,
        }),
      }),
    );

    expect(contactResponse.status).toBe(201);

    const campaign = await prisma.campaign.create({
      data: {
        name: "Integration Send",
        subject: "Hello {{name}}",
        html: "<p>Hi {{name}}</p>",
        status: "draft",
        sendMode: "now",
        groupId: group.id,
      },
    });

    const sendResponse = await campaignSendRoute.POST(
      new Request(`http://localhost/api/campaigns/${campaign.id}/send`, { method: "POST" }),
      { params: Promise.resolve({ id: campaign.id }) },
    );

    expect(sendResponse.status).toBe(200);
    const sendResult = await jsonBody<{ sent: number; failed: number }>(sendResponse);

    expect(sendResult.sent).toBe(1);
    expect(sendResult.failed).toBe(0);
    expect(resendSendMock).toHaveBeenCalledTimes(1);
  });
});
