import { prisma } from "@/lib/prisma";
import { DEFAULT_TIMEZONE } from "@/lib/constants";

const DEFAULT_TIMEZONE_KEY = "defaultTimezone";

export function isValidTimeZone(value: string): boolean {
  try {
    Intl.DateTimeFormat("en-US", { timeZone: value }).format(new Date());
    return true;
  } catch {
    return false;
  }
}

export async function getDefaultTimezone(): Promise<string> {
  const rows = await prisma.$queryRaw<Array<{ value: string }>>`
    SELECT "value"
    FROM "AppSetting"
    WHERE "key" = ${DEFAULT_TIMEZONE_KEY}
    LIMIT 1
  `;

  const setting = rows[0] || null;

  if (!setting?.value || !isValidTimeZone(setting.value)) {
    return DEFAULT_TIMEZONE;
  }

  return setting.value;
}

export async function setDefaultTimezone(timeZone: string): Promise<string> {
  const normalized = timeZone.trim();
  if (!normalized || !isValidTimeZone(normalized)) {
    throw new Error("Invalid IANA timezone");
  }

  await prisma.$executeRaw`
    INSERT INTO "AppSetting" ("key", "value", "updatedAt")
    VALUES (${DEFAULT_TIMEZONE_KEY}, ${normalized}, CURRENT_TIMESTAMP)
    ON CONFLICT("key") DO UPDATE SET
      "value" = excluded."value",
      "updatedAt" = CURRENT_TIMESTAMP
  `;

  const rows = await prisma.$queryRaw<Array<{ value: string }>>`
    SELECT "value"
    FROM "AppSetting"
    WHERE "key" = ${DEFAULT_TIMEZONE_KEY}
    LIMIT 1
  `;

  const updated = rows[0];
  if (!updated?.value) {
    throw new Error("Failed to persist timezone setting");
  }

  return updated.value;
}
