import { NextResponse } from "next/server";
import { ensureSafeExternalAttachmentUrl, listStoredUploadImages, saveUploadFile } from "@/lib/attachments";

function normalizeText(value: unknown) {
  if (typeof value !== "string") {
    return "";
  }
  return value.trim();
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const kind = normalizeText(searchParams.get("kind"));

  if (kind === "image") {
    const images = await listStoredUploadImages();
    return NextResponse.json(images);
  }

  return NextResponse.json({ error: "Unsupported kind" }, { status: 400 });
}

export async function POST(request: Request) {
  const formData = await request.formData();
  const file = formData.get("file") as File | null;
  const url = normalizeText(formData.get("url"));
  const name = normalizeText(formData.get("name"));

  if (file) {
    try {
      const saved = await saveUploadFile(file);
      return NextResponse.json(saved, { status: 201 });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Upload failed";
      return NextResponse.json({ error: message }, { status: 400 });
    }
  }

  if (url) {
    let safeUrl = "";
    try {
      safeUrl = ensureSafeExternalAttachmentUrl(url);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Invalid URL";
      return NextResponse.json({ error: message }, { status: 400 });
    }

    return NextResponse.json(
      {
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
        type: "url",
        name: name || safeUrl,
        url: safeUrl,
      },
      { status: 201 },
    );
  }

  return NextResponse.json(
    { error: "Either file or URL must be provided" },
    { status: 400 },
  );
}
