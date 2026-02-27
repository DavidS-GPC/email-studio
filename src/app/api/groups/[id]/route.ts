import { Prisma } from "@prisma/client";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

type Params = {
  params: Promise<{ id: string }>;
};

const DEFAULT_GROUP_NAME = "Default Group";

function normalizeText(value: unknown) {
  if (typeof value !== "string") {
    return "";
  }

  return value.trim();
}

export async function PUT(request: Request, { params }: Params) {
  const { id } = await params;
  const body = await request.json();

  const name = normalizeText(body?.name);
  const description = normalizeText(body?.description);

  if (!name) {
    return NextResponse.json({ error: "Group name is required" }, { status: 400 });
  }

  try {
    const group = await prisma.contactGroup.update({
      where: { id },
      data: {
        name,
        description: description || null,
      },
      include: {
        _count: {
          select: {
            memberships: true,
          },
        },
      },
    });

    return NextResponse.json(group);
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return NextResponse.json({ error: "Group name already exists" }, { status: 409 });
    }

    throw error;
  }
}

export async function DELETE(request: Request, { params }: Params) {
  const { id } = await params;
  const body = await request.json().catch(() => ({}));
  const mode = body?.mode === "delete-members" ? "delete-members" : "move-to-default";

  await prisma.$transaction(async (tx) => {
    const memberships = await tx.groupMembership.findMany({
      where: { groupId: id },
      select: { contactId: true },
    });

    const memberContactIds = [...new Set(memberships.map((membership) => membership.contactId))];

    if (mode === "delete-members" && memberContactIds.length > 0) {
      await tx.contact.deleteMany({
        where: {
          id: {
            in: memberContactIds,
          },
        },
      });
    }

    if (mode === "move-to-default" && memberContactIds.length > 0) {
      let defaultGroup = await tx.contactGroup.findUnique({
        where: { name: DEFAULT_GROUP_NAME },
        select: { id: true },
      });

      if (!defaultGroup || defaultGroup.id === id) {
        defaultGroup = await tx.contactGroup.create({
          data: {
            name: defaultGroup?.id === id ? `${DEFAULT_GROUP_NAME} (Auto)` : DEFAULT_GROUP_NAME,
            description: "Auto-created fallback group",
          },
          select: { id: true },
        });
      }

      for (const contactId of memberContactIds) {
        await tx.groupMembership.upsert({
          where: {
            contactId_groupId: {
              contactId,
              groupId: defaultGroup.id,
            },
          },
          create: {
            contactId,
            groupId: defaultGroup.id,
          },
          update: {},
        });
      }
    }

    await tx.contactGroup.delete({ where: { id } });
  });

  return NextResponse.json({ ok: true });
}
