import type { NextAuthOptions } from "next-auth";
import AzureADProvider from "next-auth/providers/azure-ad";
import CredentialsProvider from "next-auth/providers/credentials";
import { prisma } from "@/lib/prisma";
import { verifyPassword } from "@/lib/passwords";

type AppRole = "admin" | "manager" | "viewer";

type LocalLoginAttemptState = {
  firstFailedAt: number;
  failedCount: number;
  lockedUntil: number;
};

const LOCAL_LOGIN_MAX_ATTEMPTS = 5;
const LOCAL_LOGIN_WINDOW_MS = 15 * 60 * 1000;
const LOCAL_LOGIN_LOCKOUT_MS = 15 * 60 * 1000;
const LOCAL_LOGIN_FAILURE_DELAY_MS = 800;

const localLoginAttempts = new Map<string, LocalLoginAttemptState>();

function normalizeUsername(value: string) {
  return value.trim().toLowerCase();
}

function parseRole(value: string): AppRole {
  if (value === "admin" || value === "manager") {
    return value;
  }

  return "viewer";
}

function extractUsernameFromIdentity(input: { preferredUsername?: string | null; upn?: string | null; email?: string | null }) {
  const candidate = input.preferredUsername || input.upn || input.email || "";
  return normalizeUsername(candidate);
}

async function findEnabledAppUserByUsername(username: string) {
  if (!username) {
    return null;
  }

  return prisma.appUser.findFirst({
    where: {
      username,
      enabled: true,
    },
  });
}

function getAuthEnv(name: string) {
  return process.env[name] || "";
}

function sleep(ms: number) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function localLoginAttemptKey(username: string) {
  return `local:${normalizeUsername(username) || "unknown"}`;
}

function pruneLocalLoginAttempts(now: number) {
  for (const [key, state] of localLoginAttempts.entries()) {
    const isExpiredWindow = now - state.firstFailedAt > LOCAL_LOGIN_WINDOW_MS;
    const isUnlocked = state.lockedUntil <= now;
    if (isExpiredWindow && isUnlocked) {
      localLoginAttempts.delete(key);
    }
  }
}

function isLocalLoginLocked(attemptKey: string, now: number) {
  const state = localLoginAttempts.get(attemptKey);
  return Boolean(state && state.lockedUntil > now);
}

function recordLocalLoginFailure(attemptKey: string, now: number) {
  const existing = localLoginAttempts.get(attemptKey);
  if (!existing || now - existing.firstFailedAt > LOCAL_LOGIN_WINDOW_MS) {
    localLoginAttempts.set(attemptKey, {
      firstFailedAt: now,
      failedCount: 1,
      lockedUntil: 0,
    });
    return;
  }

  const nextFailedCount = existing.failedCount + 1;
  const lockedUntil =
    nextFailedCount >= LOCAL_LOGIN_MAX_ATTEMPTS ? now + LOCAL_LOGIN_LOCKOUT_MS : existing.lockedUntil;

  localLoginAttempts.set(attemptKey, {
    ...existing,
    failedCount: nextFailedCount,
    lockedUntil,
  });
}

function clearLocalLoginFailures(attemptKey: string) {
  localLoginAttempts.delete(attemptKey);
}

function normalizeBaseUrl(value: string) {
  const trimmed = value.trim();
  if (!trimmed) {
    return "";
  }

  try {
    return new URL(trimmed).origin;
  } catch {
    return "";
  }
}

function resolveRedirectBaseUrl(baseUrl: string) {
  const configuredPublic = normalizeBaseUrl(process.env.AUTH_PUBLIC_URL || "");
  if (configuredPublic) {
    return configuredPublic;
  }

  const configuredNextAuth = normalizeBaseUrl(process.env.NEXTAUTH_URL || "");
  if (configuredNextAuth) {
    return configuredNextAuth;
  }

  return normalizeBaseUrl(baseUrl) || baseUrl;
}

export const authOptions: NextAuthOptions = {
  providers: [
    AzureADProvider({
      clientId: getAuthEnv("AUTH_AZURE_AD_ID"),
      clientSecret: getAuthEnv("AUTH_AZURE_AD_SECRET"),
      tenantId: process.env.AUTH_AZURE_AD_TENANT_ID || "common",
    }),
    CredentialsProvider({
      name: "Local admin",
      credentials: {
        username: { label: "Username", type: "text" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        const now = Date.now();
        pruneLocalLoginAttempts(now);

        const username = normalizeUsername(String(credentials?.username || ""));
        const password = String(credentials?.password || "");
        const attemptKey = localLoginAttemptKey(username);

        if (isLocalLoginLocked(attemptKey, now)) {
          await sleep(LOCAL_LOGIN_FAILURE_DELAY_MS);
          return null;
        }

        if (!username || !password) {
          recordLocalLoginFailure(attemptKey, now);
          await sleep(LOCAL_LOGIN_FAILURE_DELAY_MS);
          return null;
        }

        const envAdminUser = normalizeUsername(process.env.LOCAL_ADMIN_USERNAME || "");
        const envAdminPass = process.env.LOCAL_ADMIN_PASSWORD || "";
        if (envAdminUser && envAdminPass && username === envAdminUser && password === envAdminPass) {
          clearLocalLoginFailures(attemptKey);
          return {
            id: "local-env-admin",
            name: envAdminUser,
            email: null,
            appUserId: "local-env-admin",
            username: envAdminUser,
            appRole: "admin" as AppRole,
            authSource: "local-env" as const,
          };
        }

        const appUser = await findEnabledAppUserByUsername(username);
        if (!appUser || !appUser.localPasswordHash) {
          recordLocalLoginFailure(attemptKey, now);
          await sleep(LOCAL_LOGIN_FAILURE_DELAY_MS);
          return null;
        }

        if (!verifyPassword(password, appUser.localPasswordHash)) {
          recordLocalLoginFailure(attemptKey, now);
          await sleep(LOCAL_LOGIN_FAILURE_DELAY_MS);
          return null;
        }

        clearLocalLoginFailures(attemptKey);

        return {
          id: appUser.id,
          name: appUser.displayName || appUser.username,
          email: appUser.email,
          appUserId: appUser.id,
          username: appUser.username,
          appRole: parseRole(appUser.role),
          authSource: "local-db" as const,
        };
      },
    }),
  ],
  secret: process.env.AUTH_SECRET,
  session: {
    strategy: "jwt",
    maxAge: 60 * 60 * 4,
  },
  jwt: {
    maxAge: 60 * 60 * 4,
  },
  pages: {
    signIn: "/signin",
  },
  callbacks: {
    async redirect({ url, baseUrl }) {
      const resolvedBaseUrl = resolveRedirectBaseUrl(baseUrl);

      if (url.startsWith("/")) {
        return `${resolvedBaseUrl}${url}`;
      }

      try {
        const targetUrl = new URL(url);
        const allowedOrigin = new URL(resolvedBaseUrl).origin;

        if (targetUrl.origin === allowedOrigin) {
          return targetUrl.toString();
        }
      } catch {
        // Fall through to safe default.
      }

      return resolvedBaseUrl;
    },
    async signIn({ account, profile, user }) {
      if (account?.provider !== "azure-ad") {
        return true;
      }

      const profileRecord = (profile || {}) as Record<string, unknown>;
      const username = extractUsernameFromIdentity({
        preferredUsername:
          typeof profileRecord["preferred_username"] === "string"
            ? (profileRecord["preferred_username"] as string)
            : null,
        upn: typeof profileRecord["upn"] === "string" ? (profileRecord["upn"] as string) : null,
        email: user?.email,
      });

      const appUser = await findEnabledAppUserByUsername(username);
      if (!appUser) {
        return "/signin?error=no_matching_user_account_found";
      }

      user.appUserId = appUser.id;
      user.username = appUser.username;
      user.appRole = parseRole(appUser.role);
      user.authSource = "entra";

      return true;
    },
    async jwt({ token, user }) {
      if (user) {
        token.appUserId = user.appUserId;
        token.username = user.username;
        token.appRole = user.appRole;
        token.authSource = user.authSource;
        token.accessDenied = false;
      }

      if (token.authSource === "entra" || token.authSource === "local-db") {
        const appUser = token.appUserId
          ? await prisma.appUser.findUnique({ where: { id: token.appUserId } })
          : await findEnabledAppUserByUsername(String(token.username || ""));

        if (!appUser || !appUser.enabled) {
          token.accessDenied = true;
          return token;
        }

        token.appUserId = appUser.id;
        token.username = appUser.username;
        token.appRole = parseRole(appUser.role);
        token.accessDenied = false;
      }

      return token;
    },
    async session({ session, token }) {
      session.user.appUserId = token.appUserId;
      session.user.username = token.username;
      session.user.appRole = token.appRole;
      session.user.authSource = token.authSource;
      session.user.accessDenied = Boolean(token.accessDenied);
      return session;
    },
  },
};