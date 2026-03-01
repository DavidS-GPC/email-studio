import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  decryptNullable,
  decryptText,
  encryptNullable,
  encryptText,
  hashContactEmail,
  isEncryptedText,
} from "@/lib/contactSecurity";
import { requireAdminIdentity } from "@/lib/routeAuth";
import { writeAuditLog } from "@/lib/auditLog";

export async function POST() {
  const admin = await requireAdminIdentity();
  if (admin.error) {
    return admin.error;
  }

  const contacts = await prisma.contact.findMany({
    select: {
      id: true,
      email: true,
      emailHash: true,
      name: true,
      company: true,
      tagsCsv: true,
    },
  });

  let updatedContacts = 0;

  for (const contact of contacts) {
    const normalizedEmail = decryptText(contact.email).trim().toLowerCase();
    const expectedHash = hashContactEmail(normalizedEmail);

    const shouldRewrite =
      !isEncryptedText(contact.email) ||
      contact.emailHash !== expectedHash ||
      (contact.name ? !isEncryptedText(contact.name) : false) ||
      (contact.company ? !isEncryptedText(contact.company) : false) ||
      (contact.tagsCsv ? !isEncryptedText(contact.tagsCsv) : false);

    if (!shouldRewrite) {
      continue;
    }

    await prisma.contact.update({
      where: { id: contact.id },
      data: {
        email: encryptText(normalizedEmail),
        emailHash: expectedHash,
        name: encryptNullable(decryptNullable(contact.name)),
        company: encryptNullable(decryptNullable(contact.company)),
        tagsCsv: encryptNullable(decryptNullable(contact.tagsCsv)),
      },
    });

    updatedContacts += 1;
  }

  const recipients = await prisma.campaignRecipient.findMany({
    select: {
      id: true,
      email: true,
    },
  });

  let updatedRecipients = 0;

  for (const recipient of recipients) {
    if (isEncryptedText(recipient.email)) {
      continue;
    }

    await prisma.campaignRecipient.update({
      where: { id: recipient.id },
      data: {
        email: encryptText(recipient.email),
      },
    });

    updatedRecipients += 1;
  }

  await writeAuditLog({
    actorUserId: admin.identity.appUserId,
    actorUsername: admin.identity.username,
    action: "contacts_rekey",
    targetType: "contacts",
    targetId: null,
    metadata: {
      updatedContacts,
      updatedRecipients,
    },
  });

  return NextResponse.json({
    updatedContacts,
    updatedRecipients,
  });
}
