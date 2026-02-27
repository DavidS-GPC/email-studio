import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

type Params = {
  params: Promise<{ id: string }>;
};

function normalizeText(value: unknown) {
  if (typeof value !== "string") {
    return "";
  }

  return value.trim();
}

export async function POST(request: Request, { params }: Params) {
  const { id: groupId } = await params;
  const body = await request.json();
  const contactId = normalizeText(body?.contactId);

  if (!contactId) {
    return NextResponse.json({ error: "contactId is required" }, { status: 400 });
  }

  const group = await prisma.contactGroup.findUnique({
    where: { id: groupId },
    select: { id: true },
  });

  if (!group) {
    return NextResponse.json({ error: "Group not found" }, { status: 404 });
  }

  const contact = await prisma.contact.findUnique({
    where: { id: contactId },
    select: { id: true },
  });

  if (!contact) {
    return NextResponse.json({ error: "Contact not found" }, { status: 404 });
  }

  await prisma.groupMembership.upsert({
    where: {
      contactId_groupId: {
        contactId,
        groupId,
      },
    },
    create: {
      contactId,
      groupId,
    },
    update: {},
  });

  return NextResponse.json({ ok: true }, { status: 201 });
}
