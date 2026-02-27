-- Create app-level allowlist and role table for authz.
CREATE TABLE "AppUser" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "username" TEXT NOT NULL,
    "displayName" TEXT,
    "email" TEXT,
    "role" TEXT NOT NULL DEFAULT 'viewer',
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "localPasswordHash" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

CREATE UNIQUE INDEX "AppUser_username_key" ON "AppUser"("username");
CREATE UNIQUE INDEX "AppUser_email_key" ON "AppUser"("email");
