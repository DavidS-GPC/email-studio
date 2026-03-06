import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, "..");
const testDbPath = path.resolve(projectRoot, "prisma", "test-integration.db");

if (fs.existsSync(testDbPath)) {
  fs.unlinkSync(testDbPath);
}

const sharedEnv = {
  ...process.env,
  NODE_ENV: "test",
  DATABASE_URL: `file:${testDbPath.replace(/\\/g, "/")}`,
  CONTACT_DATA_ENCRYPTION_KEY:
    process.env.CONTACT_DATA_ENCRYPTION_KEY || "MDEyMzQ1Njc4OWFiY2RlZjAxMjM0NTY3ODlhYmNkZWY=",
  CONTACT_DATA_HASH_PEPPER: process.env.CONTACT_DATA_HASH_PEPPER || "integration-test-pepper",
  RESEND_API_KEY: process.env.RESEND_API_KEY || "re_test_dummy",
  RESEND_FROM_EMAIL: process.env.RESEND_FROM_EMAIL || "noreply@example.test",
};

function run(command, args) {
  console.log(`\n> ${command} ${args.join(" ")}`);

  const result =
    process.platform === "win32"
      ? spawnSync("cmd.exe", ["/d", "/s", "/c", `${command} ${args.join(" ")}`], {
          cwd: projectRoot,
          env: sharedEnv,
          stdio: "inherit",
        })
      : spawnSync(command, args, {
          cwd: projectRoot,
          env: sharedEnv,
          stdio: "inherit",
        });

  if (result.error) {
    throw result.error;
  }

  if (result.status !== 0) {
    throw new Error(`Command failed (${command} ${args.join(" ")}) with exit code ${result.status ?? 1}`);
  }
}

let exitCode = 0;

try {
  run("npx", ["prisma", "migrate", "deploy"]);
  run("npx", ["vitest", "run", "--config", "vitest.config.ts", "tests/integration"]);
} catch (error) {
  exitCode = 1;
  console.error(error instanceof Error ? error.message : error);
} finally {
  if (fs.existsSync(testDbPath)) {
    fs.unlinkSync(testDbPath);
    console.log(`\nCleaned up ${testDbPath}`);
  }
}

process.exit(exitCode);
