import { beforeEach, describe, expect, it } from "vitest";
import { clearDatabase, jsonBody } from "./helpers";

describe("Contacts integration flows", () => {
  beforeEach(async () => {
    await clearDatabase();
  });

  it("creates, updates, imports, and deletes contacts", async () => {
    const contactsRoute = await import("@/app/api/contacts/route");
    const contactByIdRoute = await import("@/app/api/contacts/[id]/route");
    const contactsImportRoute = await import("@/app/api/contacts/import/route");
    const groupsRoute = await import("@/app/api/groups/route");

    const groupCreateResponse = await groupsRoute.POST(
      new Request("http://localhost/api/groups", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name: "Customers", description: "Customer list" }),
      }),
    );
    const group = await jsonBody<{ id: string }>(groupCreateResponse);

    const createResponse = await contactsRoute.POST(
      new Request("http://localhost/api/contacts", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          email: "alice@example.com",
          name: "Alice",
          company: "Acme",
          groupId: group.id,
        }),
      }),
    );

    expect(createResponse.status).toBe(201);
    const created = await jsonBody<{ id: string; email: string }>(createResponse);
    expect(created.email).toBe("alice@example.com");

    const updateResponse = await contactByIdRoute.PUT(
      new Request(`http://localhost/api/contacts/${created.id}`, {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          email: "alice.updated@example.com",
          name: "Alice Updated",
          company: "Acme 2",
        }),
      }),
      { params: Promise.resolve({ id: created.id }) },
    );

    expect(updateResponse.status).toBe(200);
    const updated = await jsonBody<{ email: string; name: string | null }>(updateResponse);
    expect(updated.email).toBe("alice.updated@example.com");
    expect(updated.name).toBe("Alice Updated");

    const form = new FormData();
    const csv = [
      "email,name,company,tags,group",
      "bob@example.com,Bob,Globex,vip,Imported Group",
      "charlie@example.com,Charlie,Initech,trial,Imported Group",
    ].join("\n");

    form.set("file", new File([csv], "contacts.csv", { type: "text/csv" }));
    form.set("groupName", "Fallback Group");

    const importResponse = await contactsImportRoute.POST(
      new Request("http://localhost/api/contacts/import", {
        method: "POST",
        body: form,
      }),
    );

    expect(importResponse.status).toBe(200);
    const imported = await jsonBody<{ importedCount: number }>(importResponse);
    expect(imported.importedCount).toBe(2);

    const deleteResponse = await contactsRoute.DELETE(
      new Request("http://localhost/api/contacts", {
        method: "DELETE",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ ids: [created.id] }),
      }),
    );

    expect(deleteResponse.status).toBe(200);
    const deleteResult = await jsonBody<{ deletedCount: number }>(deleteResponse);
    expect(deleteResult.deletedCount).toBe(1);
  });
});
