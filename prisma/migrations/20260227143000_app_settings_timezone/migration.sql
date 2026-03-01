-- Create app-level key/value settings table.
CREATE TABLE "AppSetting" (
    "key" TEXT NOT NULL PRIMARY KEY,
    "value" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

INSERT INTO "AppSetting" ("key", "value", "updatedAt")
VALUES ('defaultTimezone', 'UTC', CURRENT_TIMESTAMP);
