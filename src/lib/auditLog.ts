import crypto from "node:crypto";
import { prisma } from "@/lib/prisma";

type AuditLogInput = {
  actorUserId: string | null;
  actorUsername: string | null;
  action: string;
  targetType: string | null;
  targetId: string | null;
  metadata?: Record<string, unknown>;
};

export type AuditLogRecord = {
  id: string;
  actorUserId: string | null;
  actorUsername: string | null;
  action: string;
  targetType: string | null;
  targetId: string | null;
  metadata: Record<string, unknown> | null;
  createdAt: string;
};

export type AuditLogQuery = {
  limit?: number;
  offset?: number;
  action?: string;
  actor?: string;
  fromIso?: string;
  toIso?: string;
};

export type AuditLogQueryResult = {
  items: AuditLogRecord[];
  total: number;
  limit: number;
  offset: number;
};

function toNullableTrimmed(value: string | null | undefined) {
  const normalized = (value || "").trim();
  return normalized ? normalized : null;
}

export async function ensureAuditLogTable() {
  await prisma.$executeRaw`
    CREATE TABLE IF NOT EXISTS "AuditLog" (
      "id" TEXT PRIMARY KEY,
      "actorUserId" TEXT,
      "actorUsername" TEXT,
      "action" TEXT NOT NULL,
      "targetType" TEXT,
      "targetId" TEXT,
      "metadata" TEXT,
      "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `;
}

function normalizeAuditLogRows(
  rows: Array<{
    id: string;
    actorUserId: string | null;
    actorUsername: string | null;
    action: string;
    targetType: string | null;
    targetId: string | null;
    metadata: string | null;
    createdAt: string;
  }>,
): AuditLogRecord[] {
  return rows.map((row) => ({
    id: row.id,
    actorUserId: row.actorUserId,
    actorUsername: row.actorUsername,
    action: row.action,
    targetType: row.targetType,
    targetId: row.targetId,
    metadata: row.metadata ? ((JSON.parse(row.metadata) as Record<string, unknown>) || null) : null,
    createdAt: row.createdAt,
  }));
}

export async function fetchAuditLogs(query: AuditLogQuery = {}): Promise<AuditLogQueryResult> {
  const normalizedLimit = Number.isFinite(query.limit) ? Math.max(1, Math.min(200, Math.floor(query.limit as number))) : 50;
  const normalizedOffset = Number.isFinite(query.offset) ? Math.max(0, Math.floor(query.offset as number)) : 0;
  const action = toNullableTrimmed(query.action);
  const actor = toNullableTrimmed(query.actor);
  const fromIso = toNullableTrimmed(query.fromIso);
  const toIso = toNullableTrimmed(query.toIso);

  await ensureAuditLogTable();

  const whereSql = `
    WHERE 1 = 1
      AND (? IS NULL OR "action" = ?)
      AND (? IS NULL OR lower(coalesce("actorUsername", '')) LIKE '%' || lower(?) || '%')
      AND (? IS NULL OR "createdAt" >= ?)
      AND (? IS NULL OR "createdAt" <= ?)
  `;

  const dataSql = `
    SELECT
      "id",
      "actorUserId",
      "actorUsername",
      "action",
      "targetType",
      "targetId",
      "metadata",
      "createdAt"
    FROM "AuditLog"
    ${whereSql}
    ORDER BY "createdAt" DESC
    LIMIT ? OFFSET ?
  `;

  const rows = await prisma.$queryRawUnsafe<Array<{
    id: string;
    actorUserId: string | null;
    actorUsername: string | null;
    action: string;
    targetType: string | null;
    targetId: string | null;
    metadata: string | null;
    createdAt: string;
  }>>(dataSql, action, action, actor, actor, fromIso, fromIso, toIso, toIso, normalizedLimit, normalizedOffset);

  const countSql = `
    SELECT COUNT(*) as "count"
    FROM "AuditLog"
    ${whereSql}
  `;

  const countRows = await prisma.$queryRawUnsafe<Array<{ count: number }>>(
    countSql,
    action,
    action,
    actor,
    actor,
    fromIso,
    fromIso,
    toIso,
    toIso,
  );

  return {
    items: normalizeAuditLogRows(rows),
    total: Number(countRows[0]?.count || 0),
    limit: normalizedLimit,
    offset: normalizedOffset,
  };
}

export async function fetchRecentAuditLogs(limit = 50): Promise<AuditLogRecord[]> {
  const result = await fetchAuditLogs({ limit, offset: 0 });
  return result.items;
}

export async function writeAuditLog(input: AuditLogInput) {
  await ensureAuditLogTable();

  const id = crypto.randomUUID();
  const metadataJson = input.metadata ? JSON.stringify(input.metadata) : null;

  await prisma.$executeRaw`
    INSERT INTO "AuditLog" (
      "id",
      "actorUserId",
      "actorUsername",
      "action",
      "targetType",
      "targetId",
      "metadata",
      "createdAt"
    )
    VALUES (
      ${id},
      ${toNullableTrimmed(input.actorUserId)},
      ${toNullableTrimmed(input.actorUsername)},
      ${input.action.trim()},
      ${toNullableTrimmed(input.targetType)},
      ${toNullableTrimmed(input.targetId)},
      ${metadataJson},
      CURRENT_TIMESTAMP
    )
  `;
}
