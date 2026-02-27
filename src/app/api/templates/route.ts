import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { ensureDefaultTemplates } from "@/lib/defaultTemplates";

export async function GET() {
  await ensureDefaultTemplates();
  const templates = await prisma.emailTemplate.findMany({
    orderBy: { createdAt: "desc" },
  });
  return NextResponse.json(templates);
}

export async function POST(request: Request) {
  const body = await request.json();
  const template = await prisma.emailTemplate.create({
    data: {
      name: body.name,
      description: body.description || null,
      subject: body.subject,
      html: body.html,
      designJson: body.designJson || null,
    },
  });

  return NextResponse.json(template, { status: 201 });
}
