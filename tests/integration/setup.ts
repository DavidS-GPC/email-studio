import path from "node:path";
import { afterAll } from "vitest";
import { prisma } from "@/lib/prisma";

const defaultDbPath = path.resolve(process.cwd(), "prisma", "test-integration.db").replace(/\\/g, "/");

process.env.NODE_ENV = "test";
process.env.DATABASE_URL = process.env.DATABASE_URL || `file:${defaultDbPath}`;
process.env.CONTACT_DATA_ENCRYPTION_KEY =
  process.env.CONTACT_DATA_ENCRYPTION_KEY || "MDEyMzQ1Njc4OWFiY2RlZjAxMjM0NTY3ODlhYmNkZWY=";
process.env.CONTACT_DATA_HASH_PEPPER = process.env.CONTACT_DATA_HASH_PEPPER || "integration-test-pepper";
process.env.RESEND_API_KEY = process.env.RESEND_API_KEY || "re_test_dummy";
process.env.RESEND_FROM_EMAIL = process.env.RESEND_FROM_EMAIL || "noreply@example.test";
process.env.AUTH_SECRET = process.env.AUTH_SECRET || "integration-test-secret";
process.env.CAMPAIGN_PROCESS_SECRET = process.env.CAMPAIGN_PROCESS_SECRET || "integration-cron-secret";

afterAll(async () => {
  await prisma.$disconnect();
});
