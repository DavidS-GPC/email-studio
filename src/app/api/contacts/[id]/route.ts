import { Prisma } from "@prisma/client";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  decryptNullable,
  decryptText,
  encryptNullable,
  encryptText,
  hashContactEmail,
} from "@/lib/contactSecurity";

type Params = {
  params: Promise<{ id: string }>;
};

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

export async function PUT(request: Request, { params }: Params) {
  const { id } = await params;
  const body = await request.json();

  const email = normalizeText(body?.email).toLowerCase();
  const name = normalizeText(body?.name);
  const company = normalizeText(body?.company);

  if (!email) {
    return NextResponse.json({ error: "Email is required" }, { status: 400 });
  }

  try {
    const updated = await prisma.contact.update({
      where: { id },
      data: {
        emailHash: hashContactEmail(email),
        email: encryptText(email),
        name: encryptNullable(name),
        company: encryptNullable(company),
      },
      include: {
        memberships: {
          include: {
            group: true,
          },
        },
      },
    });

    return NextResponse.json(decryptContact(updated));
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return NextResponse.json({ error: "Email already exists" }, { status: 409 });
    }

    throw error;
  }
}
