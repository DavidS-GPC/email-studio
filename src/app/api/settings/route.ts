import { NextResponse } from "next/server";
import { getDefaultTimezone } from "@/lib/appSettings";
import { requireSessionIdentity } from "@/lib/routeAuth";

export async function GET() {
  const identity = await requireSessionIdentity();
  if (identity.error) {
    return identity.error;
  }

  const defaultTimezone = await getDefaultTimezone();
  return NextResponse.json({ defaultTimezone });
}
