import { NextRequest, NextResponse } from "next/server";
import { generateNotionPrompt, NotionTemplateConfig } from "@/lib/notion-builder";

export async function POST(req: NextRequest) {
  try {
    const config: NotionTemplateConfig = await req.json();

    if (!config.type || !config.aesthetic) {
      return NextResponse.json(
        { error: "type and aesthetic are required" },
        { status: 400 }
      );
    }

    const result = generateNotionPrompt(config);

    return NextResponse.json(result);
  } catch (error) {
    console.error("Notion builder error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Generation failed" },
      { status: 500 }
    );
  }
}
