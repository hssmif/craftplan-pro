// ══════════════════════════════════════════════════════════════
// Digital Product Studio: Asset Storage Service
// Stores generated files (PDFs, XLSX, images) under a stable
// path: ./data/digital-products/{projectId}/
// Returns stable file IDs and download URLs.
// ══════════════════════════════════════════════════════════════

import fs from "fs";
import path from "path";
import { saveDigitalAsset, getDigitalAsset, getDigitalAssets, deleteDigitalAssets } from "./db";
import type { DigitalAsset } from "@/types/digital-product";

const DATA_ROOT = path.join(process.cwd(), "data", "digital-products");

// ── Ensure directory structure exists ────────────────────────

function ensureDir(dir: string): void {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

function projectDir(projectId: string): string {
  const dir = path.join(DATA_ROOT, projectId);
  ensureDir(dir);
  return dir;
}

// ── MIME type detection ──────────────────────────────────────

const MIME_MAP: Record<string, string> = {
  ".pdf": "application/pdf",
  ".xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  ".xls": "application/vnd.ms-excel",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".svg": "image/svg+xml",
};

function detectMimeType(fileName: string): string {
  const ext = path.extname(fileName).toLowerCase();
  return MIME_MAP[ext] || "application/octet-stream";
}

// ── Generate asset ID ────────────────────────────────────────

function generateAssetId(): string {
  return `da_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

// ── Public API ───────────────────────────────────────────────

/**
 * Save a generated file to persistent storage.
 *
 * @param projectId — The digital project ID this asset belongs to
 * @param buffer    — File contents as Buffer or Uint8Array
 * @param fileName  — Desired file name (e.g., "planner.pdf")
 * @param assetType — Type: "product" | "mockup" | "preview" | "thumbnail"
 * @returns         — DigitalAsset metadata with stable download URL
 */
export function storeAsset(
  projectId: string,
  buffer: Buffer | Uint8Array,
  fileName: string,
  assetType: "product" | "mockup" | "preview" | "thumbnail" = "product"
): DigitalAsset {
  const id = generateAssetId();
  const dir = projectDir(projectId);
  const mimeType = detectMimeType(fileName);

  // Write file to disk
  const filePath = path.join(dir, `${id}_${fileName}`);
  const buf = Buffer.isBuffer(buffer) ? buffer : Buffer.from(buffer);
  fs.writeFileSync(filePath, buf);

  const fileSizeBytes = buf.length;
  const storagePath = path.relative(path.join(process.cwd(), "data"), filePath);
  const downloadUrl = `/api/digital/download/${id}`;

  // Persist metadata to SQLite
  saveDigitalAsset({
    id,
    project_id: projectId,
    file_name: fileName,
    mime_type: mimeType,
    file_size_bytes: fileSizeBytes,
    asset_type: assetType,
    storage_path: storagePath,
  });

  return {
    id,
    projectId,
    fileName,
    mimeType,
    fileSizeBytes,
    assetType,
    storagePath,
    downloadUrl,
    createdAt: new Date().toISOString(),
  };
}

/**
 * Read the raw file bytes for a given asset ID.
 */
export function readAssetBuffer(assetId: string): { buffer: Buffer; asset: DigitalAsset } | null {
  const row = getDigitalAsset(assetId);
  if (!row) return null;

  const fullPath = path.join(process.cwd(), "data", row.storage_path);
  if (!fs.existsSync(fullPath)) return null;

  const buffer = fs.readFileSync(fullPath);
  const asset: DigitalAsset = {
    id: row.id,
    projectId: row.project_id,
    fileName: row.file_name,
    mimeType: row.mime_type,
    fileSizeBytes: row.file_size_bytes,
    assetType: row.asset_type as DigitalAsset["assetType"],
    storagePath: row.storage_path,
    downloadUrl: `/api/digital/download/${row.id}`,
    createdAt: row.created_at,
  };

  return { buffer, asset };
}

/**
 * List all assets for a project, optionally filtered by type.
 */
export function listAssets(
  projectId: string,
  assetType?: "product" | "mockup" | "preview" | "thumbnail"
): DigitalAsset[] {
  const rows = getDigitalAssets(projectId, assetType);
  return rows.map(row => ({
    id: row.id,
    projectId: row.project_id,
    fileName: row.file_name,
    mimeType: row.mime_type,
    fileSizeBytes: row.file_size_bytes,
    assetType: row.asset_type as DigitalAsset["assetType"],
    storagePath: row.storage_path,
    downloadUrl: `/api/digital/download/${row.id}`,
    createdAt: row.created_at,
  }));
}

/**
 * Delete all assets for a project (both from disk and database).
 */
export function deleteProjectAssets(projectId: string): void {
  const dir = path.join(DATA_ROOT, projectId);
  if (fs.existsSync(dir)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
  deleteDigitalAssets(projectId);
}

/**
 * Get a single asset's metadata.
 */
export function getAssetMetadata(assetId: string): DigitalAsset | null {
  const row = getDigitalAsset(assetId);
  if (!row) return null;
  return {
    id: row.id,
    projectId: row.project_id,
    fileName: row.file_name,
    mimeType: row.mime_type,
    fileSizeBytes: row.file_size_bytes,
    assetType: row.asset_type as DigitalAsset["assetType"],
    storagePath: row.storage_path,
    downloadUrl: `/api/digital/download/${row.id}`,
    createdAt: row.created_at,
  };
}
