import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  decryptNullable,
  decryptText,
  encryptNullable,
  encryptText,
  hashContactEmail,
} from "@/lib/contactSecurity";

function normalizeText(value: unknown) {
  if (typeof value !== "string") {
    return "";
  }

  return value.trim();
}

function decryptContact<T extends { email: string; name: string | null; company: string | null; tagsCsv: string | null }>(contact: T) {
  return {
    ...contact,
    email: decryptText(contact.email),
    name: decryptNullable(contact.name),
    company: decryptNullable(contact.company),
    tagsCsv: decryptNullable(contact.tagsCsv),
  };
}

export async function GET() {
  const contacts = await prisma.contact.findMany({
    include: {
      memberships: {
        include: {
          group: true,
        },
      },
    },
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json(contacts.map((contact) => decryptContact(contact)));
}

export async function POST(request: Request) {
  const body = await request.json();

  const email = normalizeText(body?.email).toLowerCase();
  const name = normalizeText(body?.name);
  const company = normalizeText(body?.company);
  const groupId = normalizeText(body?.groupId);

  if (!email) {
    return NextResponse.json({ error: "Email is required" }, { status: 400 });
  }

  const emailHash = hashContactEmail(email);

  const existingContact = await prisma.contact.findFirst({
    where: {
      OR: [{ emailHash }, { email }],
    },
    select: { id: true },
  });

  const writeData = {
    emailHash,
    email: encryptText(email),
    name: encryptNullable(name),
    company: encryptNullable(company),
  };

  const contact = existingContact
    ? await prisma.contact.update({
        where: { id: existingContact.id },
        data: writeData,
      })
    : await prisma.contact.create({
        data: writeData,
      });

  if (groupId) {
    const group = await prisma.contactGroup.findUnique({
      where: { id: groupId },
      select: { id: true },
    });

    if (group) {
      await prisma.groupMembership.upsert({
        where: {
          contactId_groupId: {
            contactId: contact.id,
            groupId: group.id,
          },
        },
        create: {
          contactId: contact.id,
          groupId: group.id,
        },
        update: {},
      });
    }
  }

  const savedContact = await prisma.contact.findUnique({
    where: { id: contact.id },
    include: {
      memberships: {
        include: {
          group: true,
        },
      },
    },
  });

  if (!savedContact) {
    return NextResponse.json({ error: "Contact save failed" }, { status: 500 });
  }

  return NextResponse.json(decryptContact(savedContact), { status: 201 });
}

export async function DELETE(request: Request) {
  const body = await request.json();
  const ids = Array.isArray(body?.ids)
    ? body.ids.filter((item: unknown): item is string => typeof item === "string" && item.trim().length > 0)
    : [];

  if (ids.length === 0) {
    return NextResponse.json({ error: "No contact ids provided" }, { status: 400 });
  }

  const result = await prisma.contact.deleteMany({
    where: {
      id: {
        in: ids,
      },
    },
  });

  return NextResponse.json({ deletedCount: result.count });
}
