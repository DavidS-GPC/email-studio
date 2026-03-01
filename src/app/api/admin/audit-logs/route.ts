import { NextResponse } from "next/server";
import { fetchAuditLogs } from "@/lib/auditLog";
import { requireAdminIdentity } from "@/lib/routeAuth";

function parseIntWithBounds(value: string | null, fallback: number, min: number, max: number) {
  if (!value) {
    return fallback;
  }

  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed)) {
    return fallback;
  }

  return Math.max(min, Math.min(parsed, max));
}

export async function GET(request: Request) {
  const admin = await requireAdminIdentity();
  if (admin.error) {
    return admin.error;
  }

  const { searchParams } = new URL(request.url);
  const limit = parseIntWithBounds(searchParams.get("limit"), 25, 1, 200);
  const page = parseIntWithBounds(searchParams.get("page"), 1, 1, 10_000);
  const offset = (page - 1) * limit;

  const queryResult = await fetchAuditLogs({
    limit,
    offset,
    action: searchParams.get("action") || undefined,
    actor: searchParams.get("actor") || undefined,
    fromIso: searchParams.get("from") || undefined,
    toIso: searchParams.get("to") || undefined,
  });

  return NextResponse.json({
    items: queryResult.items,
    page,
    pageSize: queryResult.limit,
    total: queryResult.total,
    totalPages: Math.max(1, Math.ceil(queryResult.total / queryResult.limit)),
  });
}
