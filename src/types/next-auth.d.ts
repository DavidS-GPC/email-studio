import { DefaultSession } from "next-auth";

type AppRole = "admin" | "manager" | "viewer";

declare module "next-auth" {
  interface Session {
    user: DefaultSession["user"] & {
      appUserId?: string;
      username?: string;
      appRole?: AppRole;
      authSource?: "entra" | "local-db" | "local-env";
      accessDenied?: boolean;
    };
  }

  interface User {
    appUserId?: string;
    username?: string;
    appRole?: AppRole;
    authSource?: "entra" | "local-db" | "local-env";
    accessDenied?: boolean;
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    appUserId?: string;
    username?: string;
    appRole?: AppRole;
    authSource?: "entra" | "local-db" | "local-env";
    accessDenied?: boolean;
  }
}
