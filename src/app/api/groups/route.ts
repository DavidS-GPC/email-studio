import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const groups = await prisma.contactGroup.findMany({
    include: {
      _count: {
        select: {
          memberships: true,
        },
      },
    },
    orderBy: { name: "asc" },
  });

  return NextResponse.json(groups);
}

export async function POST(request: Request) {
  const body = await request.json();
  const group = await prisma.contactGroup.create({
    data: {
      name: body.name,
      description: body.description || null,
    },
  });

  return NextResponse.json(group, { status: 201 });
}
