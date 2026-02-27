import { mkdir, writeFile, readFile, readdir, stat } from "node:fs/promises";
import net from "node:net";
import path from "node:path";

export type StoredAttachment = {
  id: string;
  type: "upload" | "url";
  name: string;
  url: string;
};

export type StoredUploadImage = {
  id: string;
  name: string;
  url: string;
  createdAt: string;
};

const MAX_ATTACHMENT_BYTES = 10 * 1024 * 1024;
const ALLOWED_IMAGE_MIME_TYPES = new Set(["image/png", "image/jpeg", "image/gif", "image/webp"]);

function isImageFileName(fileName: string) {
  const extension = path.extname(fileName).toLowerCase();
  return [".png", ".jpg", ".jpeg", ".gif", ".webp"].includes(extension);
}

function isPrivateOrLocalIp(ip: string) {
  const normalized = ip.trim();
  if (!normalized) {
    return true;
  }

  if (normalized === "::1" || normalized.toLowerCase() === "localhost") {
    return true;
  }

  if (net.isIPv4(normalized)) {
    if (normalized.startsWith("10.")) return true;
    if (normalized.startsWith("127.")) return true;
    if (normalized.startsWith("169.254.")) return true;
    if (normalized.startsWith("192.168.")) return true;

    const octets = normalized.split(".").map((part) => Number.parseInt(part, 10));
    if (octets[0] === 172 && octets[1] >= 16 && octets[1] <= 31) {
      return true;
    }
  }

  if (net.isIPv6(normalized)) {
    const lower = normalized.toLowerCase();
    if (lower.startsWith("fc") || lower.startsWith("fd") || lower.startsWith("fe80:")) {
      return true;
    }
  }

  return false;
}

function isForbiddenHostname(hostname: string) {
  const lower = hostname.trim().toLowerCase();
  if (!lower) {
    return true;
  }

  if (lower === "localhost" || lower.endsWith(".localhost") || lower.endsWith(".local") || lower.endsWith(".internal")) {
    return true;
  }

  if (isPrivateOrLocalIp(lower)) {
    return true;
  }

  return false;
}

export function ensureSafeExternalAttachmentUrl(value: string) {
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    throw new Error("Invalid URL attachment");
  }

  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new Error("Only http(s) attachment URLs are allowed");
  }

  if (parsed.username || parsed.password) {
    throw new Error("URL credentials are not allowed");
  }

  if (isForbiddenHostname(parsed.hostname)) {
    throw new Error("URL host is not allowed");
  }

  return parsed.toString();
}

function resolveUploadPathFromUrl(urlValue: string) {
  const uploadsRoot = path.resolve(process.cwd(), "public", "uploads");
  const normalizedUrl = urlValue.replace(/\\/g, "/");

  if (!normalizedUrl.startsWith("/uploads/")) {
    throw new Error("Upload path is invalid");
  }

  const relativePath = normalizedUrl.slice("/uploads/".length);
  const resolved = path.resolve(uploadsRoot, relativePath);
  if (resolved !== uploadsRoot && !resolved.startsWith(`${uploadsRoot}${path.sep}`)) {
    throw new Error("Upload path traversal blocked");
  }

  return resolved;
}

export async function listStoredUploadImages(limit = 40): Promise<StoredUploadImage[]> {
  const uploadDir = path.join(process.cwd(), "public", "uploads");
  await mkdir(uploadDir, { recursive: true });

  const fileNames = await readdir(uploadDir);
  const imageFileNames = fileNames.filter((name) => isImageFileName(name));

  const items = await Promise.all(
    imageFileNames.map(async (fileName) => {
      const fullPath = path.join(uploadDir, fileName);
      const info = await stat(fullPath);

      return {
        id: fileName,
        name: fileName.replace(/^[^-]+-/, ""),
        url: `/uploads/${fileName}`,
        createdAt: info.mtime.toISOString(),
      };
    }),
  );

  return items
    .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1))
    .slice(0, limit);
}

export async function saveUploadFile(file: File): Promise<StoredAttachment> {
  if (!ALLOWED_IMAGE_MIME_TYPES.has(file.type)) {
    throw new Error("Only PNG, JPG, GIF, and WEBP images are allowed");
  }

  if (file.size > MAX_ATTACHMENT_BYTES) {
    throw new Error("Image is too large (max 10MB)");
  }

  const uploadDir = path.join(process.cwd(), "public", "uploads");
  await mkdir(uploadDir, { recursive: true });

  const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
  const id = `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
  const filename = `${id}-${safeName}`;
  const filePath = path.join(uploadDir, filename);
  const bytes = await file.arrayBuffer();

  await writeFile(filePath, Buffer.from(bytes));

  return {
    id,
    type: "upload",
    name: file.name,
    url: `/uploads/${filename}`,
  };
}

export async function toResendAttachments(attachmentsRaw: string | null | undefined) {
  if (!attachmentsRaw) {
    return [];
  }

  const attachments: StoredAttachment[] = JSON.parse(attachmentsRaw);
  const resendAttachments: {
    filename: string;
    content: Buffer;
  }[] = [];

  for (const attachment of attachments) {
    if (attachment.type === "upload") {
      const filePath = resolveUploadPathFromUrl(attachment.url);
      const content = await readFile(filePath);
      resendAttachments.push({
        filename: attachment.name,
        content,
      });
      continue;
    }

    if (attachment.type === "url") {
      const safeUrl = ensureSafeExternalAttachmentUrl(attachment.url);
      const response = await fetch(safeUrl, {
        signal: AbortSignal.timeout(10_000),
      });
      if (!response.ok) {
        continue;
      }

      const contentLength = Number.parseInt(response.headers.get("content-length") || "0", 10);
      if (contentLength > MAX_ATTACHMENT_BYTES) {
        continue;
      }

      const arr = await response.arrayBuffer();
      if (arr.byteLength > MAX_ATTACHMENT_BYTES) {
        continue;
      }

      resendAttachments.push({
        filename: attachment.name,
        content: Buffer.from(arr),
      });
    }
  }

  return resendAttachments;
}
