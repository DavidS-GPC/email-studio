import { prisma } from "@/lib/prisma";

export async function jsonBody<T>(response: Response): Promise<T> {
  return (await response.json()) as T;
}

export async function clearDatabase() {
  await prisma.campaignRecipient.deleteMany();
  await prisma.campaign.deleteMany();
  await prisma.groupMembership.deleteMany();
  await prisma.contact.deleteMany();
  await prisma.contactGroup.deleteMany();
  await prisma.emailTemplate.deleteMany();
  await prisma.appUser.deleteMany();
  await prisma.appSetting.deleteMany();
}
