import { beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@/lib/prisma";
import { clearDatabase, jsonBody } from "./helpers";

describe("Templates integration flows", () => {
  beforeEach(async () => {
    await clearDatabase();
  });

  it("creates, updates, and deletes templates", async () => {
    const templatesRoute = await import("@/app/api/templates/route");
    const templateByIdRoute = await import("@/app/api/templates/[id]/route");

    const createResponse = await templatesRoute.POST(
      new Request("http://localhost/api/templates", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          name: "Integration Template",
          description: "Test template",
          subject: "Hello",
          html: "<p>Hello</p>",
          designJson: "{}",
        }),
      }),
    );

    expect(createResponse.status).toBe(201);
    const created = await jsonBody<{ id: string; name: string }>(createResponse);
    expect(created.name).toBe("Integration Template");

    const updateResponse = await templateByIdRoute.PUT(
      new Request(`http://localhost/api/templates/${created.id}`, {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          name: "Updated Template",
          description: "Updated",
          subject: "Updated Subject",
          html: "<p>Updated</p>",
          designJson: "{\"v\":2}",
        }),
      }),
      { params: Promise.resolve({ id: created.id }) },
    );

    expect(updateResponse.status).toBe(200);
    const updated = await jsonBody<{ name: string; subject: string }>(updateResponse);
    expect(updated.name).toBe("Updated Template");
    expect(updated.subject).toBe("Updated Subject");

    const deleteResponse = await templateByIdRoute.DELETE(
      new Request(`http://localhost/api/templates/${created.id}`, { method: "DELETE" }),
      { params: Promise.resolve({ id: created.id }) },
    );

    expect(deleteResponse.status).toBe(200);
    expect(await prisma.emailTemplate.count()).toBe(0);
  });
});
