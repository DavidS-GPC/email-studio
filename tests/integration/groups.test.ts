import { beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@/lib/prisma";
import { clearDatabase, jsonBody } from "./helpers";

describe("Groups integration flows", () => {
  beforeEach(async () => {
    await clearDatabase();
  });

  it("creates groups, assigns membership, and deletes groups with fallback move", async () => {
    const groupsRoute = await import("@/app/api/groups/route");
    const groupByIdRoute = await import("@/app/api/groups/[id]/route");
    const groupMembersRoute = await import("@/app/api/groups/[id]/members/route");
    const contactsRoute = await import("@/app/api/contacts/route");

    const groupResponse = await groupsRoute.POST(
      new Request("http://localhost/api/groups", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name: "Primary Group", description: "Primary" }),
      }),
    );
    const group = await jsonBody<{ id: string }>(groupResponse);

    const contactResponse = await contactsRoute.POST(
      new Request("http://localhost/api/contacts", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          email: "member@example.com",
          name: "Member",
          company: "Org",
        }),
      }),
    );
    const contact = await jsonBody<{ id: string }>(contactResponse);

    const addMemberResponse = await groupMembersRoute.POST(
      new Request(`http://localhost/api/groups/${group.id}/members`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ contactId: contact.id }),
      }),
      { params: Promise.resolve({ id: group.id }) },
    );

    expect(addMemberResponse.status).toBe(201);

    const deleteGroupResponse = await groupByIdRoute.DELETE(
      new Request(`http://localhost/api/groups/${group.id}`, {
        method: "DELETE",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ mode: "move-to-default" }),
      }),
      { params: Promise.resolve({ id: group.id }) },
    );

    expect(deleteGroupResponse.status).toBe(200);

    const fallbackGroup = await prisma.contactGroup.findFirst({
      where: { name: { startsWith: "Default Group" } },
      include: { memberships: true },
    });

    expect(fallbackGroup).not.toBeNull();
    expect(fallbackGroup?.memberships.length).toBe(1);
  });
});
