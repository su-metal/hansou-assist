
import { NextRequest, NextResponse } from "next/server";
import { analyzeImage } from "@/lib/gemini/client";

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const file = formData.get("file") as File;

    if (!file) {
      return NextResponse.json(
        { error: "File is required" },
        { status: 400 }
      );
    }

    const buffer = await file.arrayBuffer();
    const base64 = Buffer.from(buffer).toString("base64");
    const mimeType = file.type;

    const result = await analyzeImage(base64, mimeType);

    return NextResponse.json(result, { status: 200 });
  } catch (error: any) {
    console.error("OCR API Error:", error);
    return NextResponse.json(
      { error: error.message || "Internal Server Error" },
      { status: 500 }
    );
  }
}
