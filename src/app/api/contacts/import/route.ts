import { NextResponse } from "next/server";
import Papa from "papaparse";
import ExcelJS from "exceljs";
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

function cellToText(value: ExcelJS.CellValue | null | undefined): string {
  if (typeof value === "string") {
    return value;
  }

  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }

  if (value instanceof Date) {
    return value.toISOString();
  }

  if (!value || typeof value !== "object") {
    return "";
  }

  if ("text" in value && typeof value.text === "string") {
    return value.text;
  }

  if ("result" in value && (typeof value.result === "string" || typeof value.result === "number")) {
    return String(value.result);
  }

  if ("richText" in value && Array.isArray(value.richText)) {
    return value.richText.map((item) => item.text || "").join("");
  }

  if ("hyperlink" in value && typeof value.hyperlink === "string") {
    return value.hyperlink;
  }

  return "";
}

async function parseRows(fileName: string, fileBytes: ArrayBuffer): Promise<ContactRow[]> {
  if (fileName.toLowerCase().endsWith(".csv")) {
    const parsed = Papa.parse<ContactRow>(Buffer.from(fileBytes).toString("utf8"), {
      header: true,
      skipEmptyLines: true,
    });

    return parsed.data;
  }

  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(fileBytes);

  const worksheet = workbook.worksheets[0];
  if (!worksheet) {
    return [];
  }

  const headers: string[] = [];
  worksheet.getRow(1).eachCell({ includeEmpty: false }, (cell, colNumber) => {
    headers[colNumber - 1] = normalizeText(cellToText(cell.value));
  });

  const rows: ContactRow[] = [];

  for (let rowIndex = 2; rowIndex <= worksheet.rowCount; rowIndex += 1) {
    const row = worksheet.getRow(rowIndex);
    const item: ContactRow = {};

    headers.forEach((header, index) => {
      if (!header) {
        return;
      }

      const value = normalizeText(cellToText(row.getCell(index + 1).value));
      if (value) {
        item[header] = value;
      }
    });

    if (Object.keys(item).length > 0) {
      rows.push(item);
    }
  }

  return rows;
}

export async function POST(request: Request) {
  const formData = await request.formData();
  const file = formData.get("file") as File | null;
  const fallbackGroupName = normalizeText(formData.get("groupName"));

  if (!file) {
    return NextResponse.json({ error: "File is required" }, { status: 400 });
  }

  const fileBytes = await file.arrayBuffer();
  const rows = await parseRows(file.name, fileBytes);

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
