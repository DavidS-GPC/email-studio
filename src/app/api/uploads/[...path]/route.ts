import { NextResponse } from "next/server";
import { readFile, stat } from "node:fs/promises";
import path from "node:path";

const MIME_TYPES: Record<string, string> = {
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".svg": "image/svg+xml",
  ".csv": "text/csv",
};

type Params = {
  params: Promise<{ path: string[] }>;
};

export async function GET(_request: Request, { params }: Params) {
  const { path: segments } = await params;
  const fileName = segments.join("/");

  // Block path traversal
  if (fileName.includes("..") || fileName.startsWith("/")) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const uploadsRoot = path.resolve(process.cwd(), "public", "uploads");
  const filePath = path.resolve(uploadsRoot, fileName);

  // Ensure resolved path is within uploads directory
  if (!filePath.startsWith(uploadsRoot + path.sep) && filePath !== uploadsRoot) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  try {
    const info = await stat(filePath);
    if (!info.isFile()) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const content = await readFile(filePath);
    const ext = path.extname(filePath).toLowerCase();
    const contentType = MIME_TYPES[ext] || "application/octet-stream";

    return new NextResponse(content, {
      status: 200,
      headers: {
        "Content-Type": contentType,
        "Content-Length": String(content.length),
        "Cache-Control": "public, max-age=31536000, immutable",
      },
    });
  } catch {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
}
