import { NextResponse } from "next/server";
import fs from "fs";
import path from "path";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

export async function OPTIONS() {
  return NextResponse.json({}, { headers: corsHeaders });
}

export async function POST(req: Request) {
  try {
    const { imageBase64, filename } = await req.json();
    if (!imageBase64 || !filename) {
      return NextResponse.json({ error: "Missing imageBase64 or filename" }, { status: 400, headers: corsHeaders });
    }

    const dir = path.join(process.env.HOME || "/Users/houssam", "Documents", "MJ-IMAGES");
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

    const buffer = Buffer.from(imageBase64, "base64");
    const filePath = path.join(dir, filename);
    fs.writeFileSync(filePath, buffer);

    return NextResponse.json({ success: true, path: filePath, size: buffer.length }, { headers: corsHeaders });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500, headers: corsHeaders });
  }
}
