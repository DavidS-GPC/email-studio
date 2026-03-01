import { NextResponse } from "next/server";
import { getDefaultTimezone, isValidTimeZone, setDefaultTimezone } from "@/lib/appSettings";
import { requireAdminIdentity } from "@/lib/routeAuth";

function normalizeText(value: unknown) {
  if (typeof value !== "string") {
    return "";
  }

  return value.trim();
}

export async function GET() {
  const admin = await requireAdminIdentity();
  if (admin.error) {
    return admin.error;
  }

  const defaultTimezone = await getDefaultTimezone();
  return NextResponse.json({ defaultTimezone });
}

export async function PATCH(request: Request) {
  const admin = await requireAdminIdentity();
  if (admin.error) {
    return admin.error;
  }

  const body = await request.json();
  const timezone = normalizeText(body?.defaultTimezone);

  if (!timezone || !isValidTimeZone(timezone)) {
    return NextResponse.json({ error: "A valid IANA timezone is required" }, { status: 400 });
  }

  const defaultTimezone = await setDefaultTimezone(timezone);
  return NextResponse.json({ defaultTimezone });
}
