import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

type Params = {
  params: Promise<{ id: string }>;
};

export async function PUT(request: Request, { params }: Params) {
  const { id } = await params;
  const body = await request.json();

  const updated = await prisma.emailTemplate.update({
    where: { id },
    data: {
      name: body.name,
      description: body.description || null,
      subject: body.subject,
      html: body.html,
      designJson: body.designJson || null,
    },
  });

  return NextResponse.json(updated);
}

export async function DELETE(_: Request, { params }: Params) {
  const { id } = await params;
  await prisma.emailTemplate.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
