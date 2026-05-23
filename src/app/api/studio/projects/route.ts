// ── Studio Projects CRUD API ──
// GET: List all projects
// POST: Save a project (create or update)

import { NextRequest, NextResponse } from "next/server";
import {
  getAllStudioProjects,
  saveStudioProject,
  getStudioProject,
  deleteStudioProject,
  saveStudioDesigns,
  getStudioDesigns,
} from "@/lib/db";

export async function GET(req: NextRequest) {
  const id = req.nextUrl.searchParams.get("id");

  if (id) {
    // Get single project with designs
    const project = getStudioProject(id);
    if (!project) {
      return NextResponse.json({ error: "Project not found" }, { status: 404 });
    }
    const designs = getStudioDesigns(id);
    return NextResponse.json({ project, designs });
  }

  // List all projects
  const projects = getAllStudioProjects();
  return NextResponse.json({ projects });
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { project, designs } = body;

    if (!project?.id || !project?.keyword) {
      return NextResponse.json({ error: "project.id and project.keyword required" }, { status: 400 });
    }

    // Save project metadata
    saveStudioProject({
      id: project.id,
      keyword: project.keyword,
      design_mode: project.designMode || "text",
      current_step: project.currentStep || "inspiration",
      step_statuses: project.stepStatuses,
      niche_analysis: project.nicheAnalysis,
      product_configs: project.productConfigs,
      listings: project.listings,
      printful_products: project.printfulProducts,
      etsy_listings: project.etsyListings,
      status: project.status || "draft",
    });

    // Save designs (if provided)
    if (designs?.length > 0) {
      saveStudioDesigns(
        project.id,
        designs.map((d: Record<string, unknown>) => ({
          id: d.id as string,
          mode: (d.mode as string) || "text",
          phrase: d.phrase as string | undefined,
          style_preset: d.stylePreset as string | undefined,
          data_url: d.dataUrl as string,
          width: (d.width as number) || 4500,
          height: (d.height as number) || 5400,
          selected: d.selected as boolean,
          starred: d.starred as boolean,
        }))
      );
    }

    return NextResponse.json({ ok: true, id: project.id });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Save failed" },
      { status: 500 }
    );
  }
}

export async function DELETE(req: NextRequest) {
  const id = req.nextUrl.searchParams.get("id");
  if (!id) {
    return NextResponse.json({ error: "id required" }, { status: 400 });
  }
  const deleted = deleteStudioProject(id);
  return NextResponse.json({ ok: deleted });
}
