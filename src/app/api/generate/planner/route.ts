import { NextRequest, NextResponse } from "next/server";
import { generatePlanner, PlannerConfig } from "@/lib/planner-generator";
import { createProduct } from "@/lib/db";
import fs from "fs";
import path from "path";

export async function POST(req: NextRequest) {
  try {
    const config: PlannerConfig = await req.json();

    if (!config.type || !config.theme) {
      return NextResponse.json(
        { error: "type and theme are required" },
        { status: 400 }
      );
    }

    // Generate PDF
    const pdfBytes = await generatePlanner(config);

    // Save to output directory
    const outDir = path.join(process.cwd(), "data", "planners");
    fs.mkdirSync(outDir, { recursive: true });

    const timestamp = Date.now();
    const filename = `${config.type}-${config.theme}-${timestamp}.pdf`;
    const filePath = path.join(outDir, filename);
    fs.writeFileSync(filePath, Buffer.from(pdfBytes));

    // Generate title for the product
    const typeLabels: Record<string, string> = {
      weekly: "Weekly Planner",
      monthly: "Monthly Planner",
      daily: "Daily Planner",
      habit_tracker: "Habit Tracker",
      budget: "Budget Planner",
      meal_planner: "Meal Planner",
      goals: "Goals Planner",
      gratitude: "Gratitude Journal",
    };

    const themeLabels: Record<string, string> = {
      minimal: "Minimalist",
      blush: "Blush Pink",
      sage: "Sage Green",
      ocean: "Ocean Blue",
      lavender: "Lavender",
      terracotta: "Terracotta",
    };

    const title = config.title ||
      `${themeLabels[config.theme] || config.theme} ${typeLabels[config.type] || config.type} ${config.year || new Date().getFullYear()}`;

    // Save to catalog
    const product = createProduct({
      type: "planner",
      title,
      prompt: JSON.stringify(config),
      file_paths: [filePath],
      preview_path: filePath,
      price: 3.99,
    });

    return NextResponse.json({
      id: product.id,
      title,
      filename,
      filePath,
      size: pdfBytes.length,
      pages: Math.ceil(pdfBytes.length / 2000), // rough estimate
      downloadUrl: `/api/generate/planner?file=${encodeURIComponent(filename)}`,
    });
  } catch (error) {
    console.error("Planner generation error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Generation failed" },
      { status: 500 }
    );
  }
}

// Download endpoint
export async function GET(req: NextRequest) {
  const filename = req.nextUrl.searchParams.get("file");
  if (!filename) {
    return NextResponse.json({ error: "file param required" }, { status: 400 });
  }

  const filePath = path.join(process.cwd(), "data", "planners", filename);
  if (!fs.existsSync(filePath)) {
    return NextResponse.json({ error: "File not found" }, { status: 404 });
  }

  const buffer = fs.readFileSync(filePath);
  return new NextResponse(buffer, {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}
