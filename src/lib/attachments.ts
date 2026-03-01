import { mkdir, writeFile, readFile, readdir, stat } from "node:fs/promises";
import { lookup } from "node:dns/promises";
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
const MAX_REMOTE_ATTACHMENT_REDIRECTS = 3;

type SupportedImageType = {
  extension: "png" | "jpg" | "gif" | "webp";
  mimeType: "image/png" | "image/jpeg" | "image/gif" | "image/webp";
};

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

async function assertHostnameResolvesToPublicIp(hostname: string) {
  const records = await lookup(hostname, { all: true, verbatim: true });
  if (records.length === 0) {
    throw new Error("URL host could not be resolved");
  }

  for (const record of records) {
    if (isPrivateOrLocalIp(record.address)) {
      throw new Error("URL host resolves to a blocked address");
    }
  }
}

function detectImageType(content: Buffer): SupportedImageType | null {
  if (content.length < 12) {
    return null;
  }

  const isPng =
    content[0] === 0x89 &&
    content[1] === 0x50 &&
    content[2] === 0x4e &&
    content[3] === 0x47 &&
    content[4] === 0x0d &&
    content[5] === 0x0a &&
    content[6] === 0x1a &&
    content[7] === 0x0a;
  if (isPng) {
    return { extension: "png", mimeType: "image/png" };
  }

  const isJpeg = content[0] === 0xff && content[1] === 0xd8 && content[2] === 0xff;
  if (isJpeg) {
    return { extension: "jpg", mimeType: "image/jpeg" };
  }

  const gifHeader = content.subarray(0, 6).toString("ascii");
  if (gifHeader === "GIF87a" || gifHeader === "GIF89a") {
    return { extension: "gif", mimeType: "image/gif" };
  }

  const riffHeader = content.subarray(0, 4).toString("ascii");
  const webpHeader = content.subarray(8, 12).toString("ascii");
  if (riffHeader === "RIFF" && webpHeader === "WEBP") {
    return { extension: "webp", mimeType: "image/webp" };
  }

  return null;
}

async function fetchRemoteAttachmentContent(inputUrl: string): Promise<Buffer | null> {
  let currentUrl = inputUrl;

  for (let attempt = 0; attempt <= MAX_REMOTE_ATTACHMENT_REDIRECTS; attempt += 1) {
    const parsed = new URL(currentUrl);
    await assertHostnameResolvesToPublicIp(parsed.hostname);

    const response = await fetch(currentUrl, {
      signal: AbortSignal.timeout(10_000),
      redirect: "manual",
    });

    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get("location");
      if (!location) {
        return null;
      }

      const nextUrl = new URL(location, currentUrl).toString();
      currentUrl = ensureSafeExternalAttachmentUrl(nextUrl);
      continue;
    }

    if (!response.ok) {
      return null;
    }

    const contentLengthRaw = response.headers.get("content-length") || "0";
    const contentLength = Number.parseInt(contentLengthRaw, 10);
    if (Number.isFinite(contentLength) && contentLength > MAX_ATTACHMENT_BYTES) {
      return null;
    }

    const arr = await response.arrayBuffer();
    if (arr.byteLength > MAX_ATTACHMENT_BYTES) {
      return null;
    }

    return Buffer.from(arr);
  }

  return null;
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
  if (file.type && !ALLOWED_IMAGE_MIME_TYPES.has(file.type)) {
    throw new Error("Only PNG, JPG, GIF, and WEBP images are allowed");
  }

  if (file.size > MAX_ATTACHMENT_BYTES) {
    throw new Error("Image is too large (max 10MB)");
  }

  const uploadDir = path.join(process.cwd(), "public", "uploads");
  await mkdir(uploadDir, { recursive: true });

  const bytes = Buffer.from(await file.arrayBuffer());
  const detectedImageType = detectImageType(bytes);
  if (!detectedImageType) {
    throw new Error("Uploaded file is not a supported image");
  }

  const baseName = path.basename(file.name, path.extname(file.name));
  const safeBaseName = (baseName || "upload").replace(/[^a-zA-Z0-9_-]/g, "_");
  const id = `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
  const filename = `${id}-${safeBaseName}.${detectedImageType.extension}`;
  const filePath = path.join(uploadDir, filename);

  await writeFile(filePath, bytes);

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
      const content = await fetchRemoteAttachmentContent(safeUrl);
      if (!content) {
        continue;
      }

      resendAttachments.push({
        filename: attachment.name,
        content,
      });
    }
  }

  return resendAttachments;
}
