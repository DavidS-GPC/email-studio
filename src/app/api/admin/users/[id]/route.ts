import { Prisma } from "@prisma/client";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { hashPassword } from "@/lib/passwords";
import { requireAdminIdentity } from "@/lib/routeAuth";

type Params = {
  params: Promise<{ id: string }>;
};

type AppRole = "admin" | "manager" | "viewer";

function normalizeText(value: unknown) {
  if (typeof value !== "string") {
    return "";
  }

  return value.trim();
}

function parseRole(value: unknown): AppRole {
  if (value === "admin" || value === "manager") {
    return value;
  }

  return "viewer";
}

export async function PATCH(request: Request, { params }: Params) {
  const admin = await requireAdminIdentity();
  if (admin.error) {
    return admin.error;
  }

  const { id } = await params;
  const body = await request.json();

  const displayName = normalizeText(body?.displayName);
  const email = normalizeText(body?.email).toLowerCase();
  const role = parseRole(body?.role);
  const enabled = body?.enabled === false ? false : true;
  const password = normalizeText(body?.password);

  try {
    const updated = await prisma.appUser.update({
      where: { id },
      data: {
        displayName: displayName || null,
        email: email || null,
        role,
        enabled,
        localPasswordHash: password ? hashPassword(password) : undefined,
      },
      select: {
        id: true,
        username: true,
        displayName: true,
        email: true,
        role: true,
        enabled: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    return NextResponse.json(updated);
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return NextResponse.json({ error: "Username or email already exists" }, { status: 409 });
    }

    throw error;
  }
}
