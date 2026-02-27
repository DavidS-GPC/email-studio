import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";
import { authOptions } from "@/lib/authOptions";

type AppRole = "admin" | "manager" | "viewer";

export type SessionIdentity = {
  appUserId: string;
  username: string;
  appRole: AppRole;
  authSource: "entra" | "local-db" | "local-env";
};

export async function requireSessionIdentity() {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return { error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  }

  if (session.user.accessDenied) {
    return { error: NextResponse.json({ error: "No matching user account found" }, { status: 403 }) };
  }

  const identity: SessionIdentity = {
    appUserId: session.user.appUserId || "",
    username: session.user.username || "",
    appRole: (session.user.appRole || "viewer") as AppRole,
    authSource: (session.user.authSource || "entra") as SessionIdentity["authSource"],
  };

  return { identity };
}

export async function requireAdminIdentity() {
  const result = await requireSessionIdentity();
  if (result.error) {
    return result;
  }

  if (result.identity.appRole !== "admin") {
    return { error: NextResponse.json({ error: "Forbidden" }, { status: 403 }) };
  }

  return result;
}
