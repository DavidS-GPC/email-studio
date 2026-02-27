import { NextResponse } from "next/server";
import Papa from "papaparse";
import * as XLSX from "xlsx";
import { prisma } from "@/lib/prisma";
import {
  encryptNullable,
  encryptText,
  hashContactEmail,
} from "@/lib/contactSecurity";

type ContactRow = {
  email?: string;
  name?: string;
  company?: string;
  tags?: string;
  group?: string;
  [key: string]: unknown;
};

function normalizeText(value: unknown) {
  if (typeof value !== "string") {
    return "";
  }
  return value.trim();
}

function parseRows(fileName: string, text: string): ContactRow[] {
  if (fileName.toLowerCase().endsWith(".csv")) {
    const parsed = Papa.parse<ContactRow>(text, {
      header: true,
      skipEmptyLines: true,
    });

    return parsed.data;
  }

  const workbook = XLSX.read(text, { type: "binary" });
  const firstSheet = workbook.SheetNames[0];
  return XLSX.utils.sheet_to_json<ContactRow>(workbook.Sheets[firstSheet]);
}

export async function POST(request: Request) {
  const formData = await request.formData();
  const file = formData.get("file") as File | null;
  const fallbackGroupName = normalizeText(formData.get("groupName"));

  if (!file) {
    return NextResponse.json({ error: "File is required" }, { status: 400 });
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  const rows = parseRows(file.name, buffer.toString("binary"));

  const importedIds: string[] = [];

  for (const row of rows) {
    const email = normalizeText(row.email || row.Email || row.EMAIL).toLowerCase();
    if (!email) {
      continue;
    }

    const emailHash = hashContactEmail(email);
    const rowName = normalizeText(row.name || row.Name);
    const rowCompany = normalizeText(row.company || row.Company);
    const rowTags = normalizeText(row.tags || row.Tags);

    const existingContact = await prisma.contact.findFirst({
      where: {
        OR: [{ emailHash }, { email }],
      },
      select: {
        id: true,
      },
    });

    const writeData = {
      emailHash,
      email: encryptText(email),
      name: encryptNullable(rowName),
      company: encryptNullable(rowCompany),
      tagsCsv: encryptNullable(rowTags),
    };

    const contact = existingContact
      ? await prisma.contact.update({
          where: { id: existingContact.id },
          data: writeData,
        })
      : await prisma.contact.create({
          data: writeData,
        });

    importedIds.push(contact.id);

    const rowGroupName = normalizeText(row.group || row.Group);
    const targetGroupName = rowGroupName || fallbackGroupName;

    if (targetGroupName) {
      const group = await prisma.contactGroup.upsert({
        where: { name: targetGroupName },
        create: { name: targetGroupName },
        update: {},
      });

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

  return NextResponse.json({
    importedCount: importedIds.length,
  });
}
