import { NextResponse } from "next/server";
import { requireSessionIdentity } from "@/lib/routeAuth";

export async function GET() {
  const result = await requireSessionIdentity();
  if (result.error) {
    return result.error;
  }

  return NextResponse.json({
    username: result.identity.username,
    role: result.identity.appRole,
    source: result.identity.authSource,
  });
}
