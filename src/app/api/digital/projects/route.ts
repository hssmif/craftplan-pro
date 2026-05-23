// ══════════════════════════════════════════════════════════════
// Digital Product Studio: Project CRUD API
// GET    — List all projects (optionally filter by ?type=)
//          or fetch single project by ?id=
// POST   — Save/update a project
// DELETE — Delete a project by ?id=
// ══════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from "next/server";
import {
  saveDigitalProject,
  getDigitalProject,
  getAllDigitalProjects,
  deleteDigitalProject,
} from "@/lib/db";
import { deleteProjectAssets } from "@/lib/digital-asset-storage";
import type { DigitalProduct, DigitalProjectSummary } from "@/types/digital-product";

// ── GET: List or fetch projects ──────────────────────────────

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const id = searchParams.get("id");
    const productType = searchParams.get("type");

    // Single project fetch
    if (id) {
      const row = getDigitalProject(id);
      if (!row) {
        return NextResponse.json({ error: "Project not found" }, { status: 404 });
      }

      const project: DigitalProduct = {
        id: row.id,
        projectName: row.project_name,
        productType: row.product_type as DigitalProduct["productType"],
        status: row.status as DigitalProduct["status"],
        currentStep: row.current_step as DigitalProduct["currentStep"],
        stepStatuses: row.step_statuses ? JSON.parse(row.step_statuses) : {},
        inspiration: row.inspiration ? JSON.parse(row.inspiration) : { source: "manual" },
        config: row.config ? JSON.parse(row.config) : null,
        generation: row.generation ? JSON.parse(row.generation) : { status: "idle", result: null },
        preview: row.preview ? JSON.parse(row.preview) : { mockups: [], mockupStatus: "idle" },
        listing: row.listing
          ? JSON.parse(row.listing)
          : { title: "", description: "", tags: [], price: { min: 0, max: 0, recommended: 0 }, faqs: [], mockupIdeas: [], status: "idle" },
        publish: row.publish
          ? JSON.parse(row.publish)
          : { platform: "none", etsyStatus: "unpublished" },
        qualityScore: row.quality_score ? JSON.parse(row.quality_score) : null,
        batchMeta: row.batch_meta ? JSON.parse(row.batch_meta) : null,
        importSource: row.import_source ? JSON.parse(row.import_source) : null,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
      };

      return NextResponse.json({ project });
    }

    // List all projects (summaries)
    const rows = getAllDigitalProjects(productType || undefined);
    const projects: DigitalProjectSummary[] = rows.map(row => {
      const publish = row.publish ? JSON.parse(row.publish) : null;
      const quality = row.quality_score ? JSON.parse(row.quality_score) : null;
      const preview = row.preview ? JSON.parse(row.preview) : null;
      const batchMeta = row.batch_meta ? JSON.parse(row.batch_meta) : null;
      const importSource = row.import_source ? JSON.parse(row.import_source) : null;

      return {
        id: row.id,
        projectName: row.project_name,
        productType: row.product_type as DigitalProjectSummary["productType"],
        status: row.status as DigitalProjectSummary["status"],
        currentStep: row.current_step as DigitalProjectSummary["currentStep"],
        thumbnailUrl: preview?.thumbnailUrl,
        etsyListingUrl: publish?.etsyListingUrl,
        qualityTier: quality?.tier,
        batchId: batchMeta?.batchId,
        variantLabel: batchMeta?.variantLabel,
        importSourceType: importSource?.type,
        importSourceUrl: importSource?.url,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
      };
    });

    return NextResponse.json({ projects });
  } catch (err) {
    console.error("[Digital Projects GET]", err);
    return NextResponse.json({ error: "Failed to fetch projects" }, { status: 500 });
  }
}

// ── POST: Save/update a project ──────────────────────────────

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const project = body.project as DigitalProduct;

    if (!project?.id || !project?.productType) {
      return NextResponse.json(
        { error: "Missing required fields: id, productType" },
        { status: 400 }
      );
    }

    saveDigitalProject({
      id: project.id,
      project_name: project.projectName || "Untitled Product",
      product_type: project.productType,
      status: project.status || "draft",
      current_step: project.currentStep || "discover",
      step_statuses: project.stepStatuses,
      inspiration: project.inspiration,
      config: project.config,
      generation: project.generation,
      preview: project.preview,
      listing: project.listing,
      publish: project.publish,
      quality_score: project.qualityScore,
      batch_meta: project.batchMeta,
      import_source: project.importSource,
    });

    return NextResponse.json({ success: true, id: project.id });
  } catch (err) {
    console.error("[Digital Projects POST]", err);
    return NextResponse.json({ error: "Failed to save project" }, { status: 500 });
  }
}

// ── DELETE: Remove a project ─────────────────────────────────

export async function DELETE(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const id = searchParams.get("id");

    if (!id) {
      return NextResponse.json({ error: "Missing project id" }, { status: 400 });
    }

    // Delete assets from disk + database
    deleteProjectAssets(id);

    // Delete project record
    const deleted = deleteDigitalProject(id);

    if (!deleted) {
      return NextResponse.json({ error: "Project not found" }, { status: 404 });
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("[Digital Projects DELETE]", err);
    return NextResponse.json({ error: "Failed to delete project" }, { status: 500 });
  }
}
