import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { hashPassword } from "@/lib/passwords";
import { requireAdminIdentity } from "@/lib/routeAuth";

type AppRole = "admin" | "manager" | "viewer";

function normalizeText(value: unknown) {
  if (typeof value !== "string") {
    return "";
  }

  return value.trim();
}

function normalizeUsername(value: unknown) {
  return normalizeText(value).toLowerCase();
}

function parseRole(value: unknown): AppRole {
  if (value === "admin" || value === "manager") {
    return value;
  }

  return "viewer";
}

export async function GET() {
  const admin = await requireAdminIdentity();
  if (admin.error) {
    return admin.error;
  }

  const users = await prisma.appUser.findMany({
    orderBy: [{ role: "asc" }, { username: "asc" }],
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

  return NextResponse.json(users);
}

export async function POST(request: Request) {
  const admin = await requireAdminIdentity();
  if (admin.error) {
    return admin.error;
  }

  const body = await request.json();
  const username = normalizeUsername(body?.username);
  const displayName = normalizeText(body?.displayName);
  const email = normalizeText(body?.email).toLowerCase();
  const role = parseRole(body?.role);
  const enabled = body?.enabled === false ? false : true;
  const password = normalizeText(body?.password);

  if (!username) {
    return NextResponse.json({ error: "username is required" }, { status: 400 });
  }

  const user = await prisma.appUser.create({
    data: {
      username,
      displayName: displayName || null,
      email: email || null,
      role,
      enabled,
      localPasswordHash: password ? hashPassword(password) : null,
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

  return NextResponse.json(user, { status: 201 });
}
