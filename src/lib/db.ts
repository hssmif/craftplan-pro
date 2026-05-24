import Database from 'better-sqlite3';
import { mkdirSync } from 'fs';
import path from 'path';

const DB_DIR = path.join(process.cwd(), 'data');
const DB_PATH = path.join(DB_DIR, 'products.db');

let db: Database.Database | null = null;

export function getDb(): Database.Database {
  if (!db) {
    mkdirSync(DB_DIR, { recursive: true });
    db = new Database(DB_PATH);
    db.pragma('journal_mode = WAL');
    db.pragma('foreign_keys = ON');
    migrateProductsConstraint(db);
  }
  // Schema migrations run on EVERY getDb() call — all statements use
  // CREATE TABLE IF NOT EXISTS / CREATE INDEX IF NOT EXISTS so re-
  // running is a no-op once the schema is up to date.  This means
  // newly-added tables (e.g. auto_pipeline_jobs added 2026-05-16)
  // work without restarting the dev server when the db instance was
  // cached at startup before the schema update landed.
  initSchema(db);
  return db;
}

// SQLite cannot ALTER a CHECK constraint in place — the only way to
// add new allowed `type` values to a pre-existing products row is to
// rebuild the table.  This migration is idempotent: it reads the
// current CREATE TABLE sql via sqlite_master, returns immediately if
// `cross_stitch` is already in the constraint, and otherwise does
// a transactional rebuild that preserves every column and every row.
//
// IMPORTANT: the rebuild copies columns by EXPLICIT NAME, not via
// SELECT *.  An earlier draft used positional SELECT * with a
// products_new schema that omitted description/tags and added
// updated_at/metadata; on the live row that would have placed the
// `description` value into `prompt`, `tags` into `file_paths`, etc.
// — silent data corruption.  Explicit column lists eliminate that
// class of bug.
function migrateProductsConstraint(db: Database.Database) {
  const row = db
    .prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name='products'")
    .get() as { sql: string } | undefined;
  // If the table doesn't exist (fresh install — initSchema just
  // created it with the new constraint), or the constraint already
  // permits cross_stitch, nothing to do.
  if (!row || row.sql.includes("cross_stitch")) return;

  db.exec(`
    BEGIN;
    CREATE TABLE products_new (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      type TEXT NOT NULL CHECK(type IN ('wall_art', 'svg', 'planner', 'mockup', 'notion_template', 'pod_product', 'cross_stitch')),
      title TEXT NOT NULL,
      description TEXT,
      tags TEXT,
      prompt TEXT,
      file_paths TEXT,
      preview_path TEXT,
      etsy_listing_id TEXT,
      etsy_status TEXT DEFAULT 'unlisted',
      price REAL DEFAULT 2.99,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
    INSERT INTO products_new (
      id, type, title, description, tags, prompt, file_paths,
      preview_path, etsy_listing_id, etsy_status, price, created_at
    )
    SELECT
      id, type, title, description, tags, prompt, file_paths,
      preview_path, etsy_listing_id, etsy_status, price, created_at
    FROM products;
    DROP TABLE products;
    ALTER TABLE products_new RENAME TO products;
    COMMIT;
  `);
  console.log('[db] migrated products table — added cross_stitch + pod_product to CHECK constraint');
}

function initSchema(db: Database.Database) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS products (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      type TEXT NOT NULL CHECK(type IN ('wall_art', 'svg', 'planner', 'mockup', 'notion_template', 'pod_product', 'cross_stitch')),
      title TEXT NOT NULL,
      description TEXT,
      tags TEXT,
      prompt TEXT,
      file_paths TEXT,
      preview_path TEXT,
      etsy_listing_id TEXT,
      etsy_status TEXT DEFAULT 'unlisted',
      price REAL DEFAULT 2.99,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS etsy_tokens (
      id INTEGER PRIMARY KEY CHECK(id = 1),
      access_token TEXT NOT NULL,
      refresh_token TEXT NOT NULL,
      expires_at INTEGER NOT NULL,
      shop_id TEXT
    );

    CREATE TABLE IF NOT EXISTS generation_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      product_id INTEGER REFERENCES products(id) ON DELETE CASCADE,
      provider TEXT,
      prompt TEXT,
      status TEXT DEFAULT 'success',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS tracked_shops (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      shop_id TEXT NOT NULL UNIQUE,
      shop_name TEXT NOT NULL,
      total_sales INTEGER DEFAULT 0,
      listing_count INTEGER DEFAULT 0,
      avg_price REAL DEFAULT 0,
      top_tags TEXT,
      last_checked DATETIME,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS tracked_listings (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      listing_id TEXT NOT NULL UNIQUE,
      shop_name TEXT,
      title TEXT NOT NULL,
      price REAL,
      quantity INTEGER,
      views INTEGER DEFAULT 0,
      favorites INTEGER DEFAULT 0,
      sales_estimate INTEGER DEFAULT 0,
      tags TEXT,
      category TEXT,
      listing_age_days INTEGER DEFAULT 0,
      image_url TEXT,
      url TEXT,
      last_checked DATETIME,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS niche_research (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      keyword TEXT NOT NULL,
      total_results INTEGER DEFAULT 0,
      avg_price REAL DEFAULT 0,
      avg_favorites REAL DEFAULT 0,
      top_tags TEXT,
      competition_level TEXT,
      demand_score INTEGER DEFAULT 0,
      searched_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS scan_runs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      started_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      completed_at DATETIME,
      keywords_total INTEGER DEFAULT 0,
      keywords_scanned INTEGER DEFAULT 0,
      listings_found INTEGER DEFAULT 0,
      listings_new INTEGER DEFAULT 0,
      status TEXT DEFAULT 'pending' CHECK(status IN ('pending','running','completed','failed','cancelled')),
      error_message TEXT,
      scan_config TEXT
    );

    CREATE TABLE IF NOT EXISTS scan_keyword_results (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      scan_run_id INTEGER NOT NULL REFERENCES scan_runs(id) ON DELETE CASCADE,
      keyword TEXT NOT NULL,
      total_results INTEGER DEFAULT 0,
      listings_fetched INTEGER DEFAULT 0,
      avg_price REAL DEFAULT 0,
      avg_favorites REAL DEFAULT 0,
      competition_level TEXT,
      demand_score INTEGER DEFAULT 0,
      top_tags TEXT,
      scanned_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      error TEXT
    );

    CREATE TABLE IF NOT EXISTS trend_snapshots (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      scan_run_id INTEGER NOT NULL REFERENCES scan_runs(id) ON DELETE CASCADE,
      category TEXT NOT NULL,
      avg_price REAL,
      avg_favorites REAL,
      total_listings INTEGER,
      avg_sales_estimate REAL,
      top_tags TEXT,
      snapshot_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    -- Etsy extension import batches
    CREATE TABLE IF NOT EXISTS etsy_imports (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      source TEXT DEFAULT 'extension',
      listings_count INTEGER DEFAULT 0,
      keywords_count INTEGER DEFAULT 0,
      deduped_listings INTEGER DEFAULT 0,
      deduped_keywords INTEGER DEFAULT 0,
      status TEXT DEFAULT 'complete',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    -- Imported listings from extension (dedupe by url)
    CREATE TABLE IF NOT EXISTS etsy_import_listings (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      import_id INTEGER NOT NULL REFERENCES etsy_imports(id) ON DELETE CASCADE,
      listing_id TEXT,
      url TEXT NOT NULL UNIQUE,
      title TEXT NOT NULL,
      shop_name TEXT,
      price REAL DEFAULT 0,
      currency TEXT DEFAULT 'USD',
      rating REAL DEFAULT 0,
      reviews INTEGER DEFAULT 0,
      favorites INTEGER DEFAULT 0,
      is_bestseller INTEGER DEFAULT 0,
      is_etsy_pick INTEGER DEFAULT 0,
      tags TEXT,
      category TEXT,
      source_keyword TEXT,
      listing_age_days INTEGER,
      listing_age_source TEXT,
      views_24h INTEGER,
      daily_sales REAL,
      weekly_sales REAL,
      monthly_sales REAL,
      revenue_estimate REAL,
      total_revenue REAL,
      demand_score INTEGER,
      opportunity_score REAL,
      velocity_score REAL,
      monthly_trend TEXT,
      confidence TEXT,
      classification TEXT,
      scanned_at TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    -- Imported keywords from extension (dedupe by keyword text)
    CREATE TABLE IF NOT EXISTS etsy_import_keywords (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      import_id INTEGER NOT NULL REFERENCES etsy_imports(id) ON DELETE CASCADE,
      keyword TEXT NOT NULL UNIQUE,
      frequency INTEGER DEFAULT 1,
      cluster_id TEXT,
      classification TEXT,
      demand_score INTEGER DEFAULT 0,
      avg_price REAL DEFAULT 0,
      avg_favorites REAL DEFAULT 0,
      competition_level TEXT,
      listings_count INTEGER DEFAULT 0,
      scanned_at TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    -- Print On Demand products
    CREATE TABLE IF NOT EXISTS pod_products (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      product_id INTEGER REFERENCES products(id) ON DELETE CASCADE,
      printify_product_id TEXT,
      printify_shop_id TEXT,
      blueprint_id INTEGER,
      print_provider_id INTEGER,
      category TEXT,
      variants TEXT,
      design_image_id TEXT,
      base_cost REAL,
      retail_price REAL,
      publish_status TEXT DEFAULT 'draft',
      external_id TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    -- Product Studio projects
    CREATE TABLE IF NOT EXISTS studio_projects (
      id TEXT PRIMARY KEY,
      keyword TEXT NOT NULL,
      design_mode TEXT DEFAULT 'text',
      current_step TEXT DEFAULT 'inspiration',
      step_statuses TEXT,
      niche_analysis TEXT,
      product_configs TEXT,
      listings TEXT,
      printful_products TEXT,
      etsy_listings TEXT,
      status TEXT DEFAULT 'draft',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS studio_designs (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL REFERENCES studio_projects(id) ON DELETE CASCADE,
      mode TEXT DEFAULT 'text',
      phrase TEXT,
      style_preset TEXT,
      data_url TEXT,
      width INTEGER DEFAULT 4500,
      height INTEGER DEFAULT 5400,
      selected INTEGER DEFAULT 0,
      starred INTEGER DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    -- Opportunities generated from imports
    CREATE TABLE IF NOT EXISTS opportunities (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      import_id INTEGER REFERENCES etsy_imports(id),
      source TEXT DEFAULT 'etsy',
      title TEXT NOT NULL,
      core_keywords TEXT,
      tag_set TEXT,
      niche TEXT,
      category TEXT,
      market_signals TEXT,
      opportunity_score REAL DEFAULT 0,
      recommended_angle TEXT,
      deliverables TEXT,
      listing_plan TEXT,
      status TEXT DEFAULT 'new' CHECK(status IN ('new','shortlisted','in_progress','published','dismissed')),
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    -- ════════════════════════════════════════════════════════════
    -- Digital Product Studio: unified digital product projects
    -- ════════════════════════════════════════════════════════════

    CREATE TABLE IF NOT EXISTS digital_projects (
      id TEXT PRIMARY KEY,
      project_name TEXT NOT NULL DEFAULT 'Untitled Product',
      product_type TEXT NOT NULL CHECK(product_type IN ('notion', 'pdf', 'excel', 'printable')),
      status TEXT NOT NULL DEFAULT 'draft',
      current_step TEXT NOT NULL DEFAULT 'discover',
      step_statuses TEXT,
      inspiration TEXT,
      config TEXT,
      generation TEXT,
      preview TEXT,
      listing TEXT,
      publish TEXT,
      quality_score TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS digital_assets (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL REFERENCES digital_projects(id) ON DELETE CASCADE,
      file_name TEXT NOT NULL,
      mime_type TEXT NOT NULL,
      file_size_bytes INTEGER DEFAULT 0,
      asset_type TEXT NOT NULL CHECK(asset_type IN ('product', 'mockup', 'preview', 'thumbnail')),
      storage_path TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
  `);

  // Factory runs — tracks an end-to-end factory-orchestrator run from
  // keyword/opportunity pick through blueprint → image generation →
  // packaging.  Schema mirrors the FactoryRun TypeScript shape used by
  // src/lib/factory-orchestrator.ts; columns it stores as JSON
  // (keywords, listing_images, engine_log) round-trip through the
  // updateFactoryRun() helper below.
  db.exec(`
    CREATE TABLE IF NOT EXISTS factory_runs (
      id                TEXT PRIMARY KEY,
      status            TEXT NOT NULL DEFAULT 'pending',
      keywords          TEXT,          -- JSON array of strings
      opportunity_id    INTEGER,
      selected_listing_id TEXT,
      blueprint_id      TEXT,
      project_id        TEXT,
      listing_images    TEXT,          -- JSON array of asset IDs
      delivery_pdf_asset_id TEXT,
      listing_copy      TEXT,          -- JSON ListingCopyPackage
      image_plan        TEXT,          -- JSON ListingImagePlan
      package_asset_id  TEXT,
      review_status     TEXT,
      review_scorecard  TEXT,          -- JSON ReviewScorecard
      reviewed_at       TEXT,
      etsy_listing_id   TEXT,
      etsy_listing_url  TEXT,
      etsy_status       TEXT,
      published_at      TEXT,
      google_sheet_id   TEXT,
      gemini_sheet_spec TEXT,          -- JSON legacy Gemini spreadsheet spec
      engine_log        TEXT,          -- JSON array of FactoryEngineLog
      error_message     TEXT,
      started_at        TEXT,
      completed_at      TEXT,
      created_at        TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `);

  // Factory blueprints — generated by /api/factory/blueprint
  db.exec(`
    CREATE TABLE IF NOT EXISTS factory_blueprints (
      id                        TEXT PRIMARY KEY,
      factory_run_id            TEXT,
      opportunity_id            INTEGER,
      source_listing_title      TEXT,
      source_listing_description TEXT,
      product_type              TEXT,
      config                    TEXT,    -- JSON ProductBlueprintConfig
      competitor_strengths      TEXT,    -- JSON array
      competitor_weaknesses     TEXT,    -- JSON array
      competitor_features       TEXT,    -- JSON optional Gemini Vision manifest
      differentiation_strategy  TEXT,    -- JSON
      listing_strategy          TEXT,    -- JSON title keywords / USPs
      suggested_price           REAL,
      positioning               TEXT,
      tabs                      TEXT,    -- JSON BlueprintTab[]
      charts                    TEXT,    -- JSON BlueprintChart[]
      color_scheme              TEXT,    -- JSON
      sample_data               TEXT,
      delivery_method           TEXT,
      concept_spec              TEXT,    -- JSON optional
      structure_spec            TEXT,    -- JSON optional
      visual_direction          TEXT,    -- JSON optional
      video_direction           TEXT,    -- JSON optional
      listing_positioning       TEXT,    -- JSON optional
      copy_direction            TEXT,    -- JSON optional
      created_at                TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `);

  // Product ideas — generated by /api/research/ideas/generate
  db.exec(`
    CREATE TABLE IF NOT EXISTS product_ideas (
      id                  INTEGER PRIMARY KEY AUTOINCREMENT,
      title               TEXT NOT NULL,
      niche               TEXT,
      product_type        TEXT,
      why_now             TEXT,
      target_buyer        TEXT,
      suggested_price     REAL NOT NULL DEFAULT 0,
      demand_score        INTEGER NOT NULL DEFAULT 0,
      competition_score   INTEGER NOT NULL DEFAULT 0,
      urgency_score       INTEGER NOT NULL DEFAULT 0,
      confidence          INTEGER NOT NULL DEFAULT 0,
      signal_listings     TEXT,
      suggested_tags      TEXT,
      suggested_keywords  TEXT,
      status              TEXT NOT NULL DEFAULT 'new',
      notes               TEXT,
      generated_at        TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at          TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `);

  // Live sales feed — populated by the live tracker / strategist
  db.exec(`
    CREATE TABLE IF NOT EXISTS live_sales (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      title       TEXT NOT NULL,
      shop_name   TEXT,
      price       REAL NOT NULL DEFAULT 0,
      niche       TEXT,
      category    TEXT,
      sold_delta  INTEGER NOT NULL DEFAULT 1,
      url         TEXT,
      detected_at TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `);

  db.exec(`
    CREATE TABLE IF NOT EXISTS listing_cogs (
      listing_id INTEGER PRIMARY KEY,
      cogs REAL NOT NULL DEFAULT 0,
      notes TEXT,
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS operating_expenses (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      category TEXT,
      monthly_amount REAL NOT NULL DEFAULT 0,
      started_at TEXT,
      ended_at TEXT,
      notes TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `);

  // Safe column additions for existing tables
  const addCol = (table: string, column: string, definition: string) => {
    const hasColumn = () => {
      const cols = db.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[];
      return cols.some(c => c.name === column);
    };
    if (!hasColumn()) {
      try {
        db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
      } catch (err) {
        if (err instanceof Error && /duplicate column name/i.test(err.message) && hasColumn()) {
          return;
        }
        throw err;
      }
    }
  };
  addCol('tracked_listings', 'scan_run_id', 'INTEGER REFERENCES scan_runs(id)');
  addCol('tracked_listings', 'keyword', 'TEXT');
  addCol('tracked_listings', 'revenue_estimate', 'REAL DEFAULT 0');

  // Factory run outputs added after the first orchestrator version.
  // Existing local DBs need these columns because the package/review/publish
  // routes read them directly.
  addCol('factory_runs', 'listing_copy', 'TEXT');
  addCol('factory_runs', 'image_plan', 'TEXT');
  addCol('factory_runs', 'package_asset_id', 'TEXT');
  addCol('factory_runs', 'review_status', 'TEXT');
  addCol('factory_runs', 'review_scorecard', 'TEXT');
  addCol('factory_runs', 'reviewed_at', 'TEXT');
  addCol('factory_runs', 'etsy_listing_id', 'TEXT');
  addCol('factory_runs', 'etsy_listing_url', 'TEXT');
  addCol('factory_runs', 'etsy_status', 'TEXT');
  addCol('factory_runs', 'published_at', 'TEXT');
  addCol('factory_runs', 'google_sheet_id', 'TEXT');
  addCol('factory_runs', 'gemini_sheet_spec', 'TEXT');

  // Phase 1: Enhanced extraction columns for etsy_import_listings
  addCol('etsy_import_listings', 'shop_url', 'TEXT');
  addCol('etsy_import_listings', 'original_price', 'REAL');
  addCol('etsy_import_listings', 'is_star_seller', 'INTEGER DEFAULT 0');
  addCol('etsy_import_listings', 'description_raw', 'TEXT');
  addCol('etsy_import_listings', 'description_sections', 'TEXT');
  addCol('etsy_import_listings', 'image_count', 'INTEGER DEFAULT 0');
  addCol('etsy_import_listings', 'image_urls', 'TEXT');
  addCol('etsy_import_listings', 'has_video', 'INTEGER DEFAULT 0');
  addCol('etsy_import_listings', 'digital_file_types', 'TEXT');
  addCol('etsy_import_listings', 'description_quality_score', 'INTEGER DEFAULT 0');
  addCol('etsy_import_listings', 'image_quality_score', 'INTEGER DEFAULT 0');
  addCol('etsy_import_listings', 'trust_score', 'INTEGER DEFAULT 0');
  addCol('etsy_import_listings', 'feature_density', 'INTEGER DEFAULT 0');
  addCol('etsy_import_listings', 'moat_score', 'INTEGER DEFAULT 0');
  addCol('etsy_import_listings', 'review_signals', 'TEXT');
  addCol('etsy_import_listings', 'winner_tier', 'TEXT');
  addCol('etsy_import_listings', 'winner_score', 'INTEGER DEFAULT 0');

  // Phase 1: Enhanced opportunity columns
  addCol('opportunities', 'decision', 'TEXT DEFAULT \'pending\'');
  addCol('opportunities', 'decision_reason', 'TEXT');
  addCol('opportunities', 'avg_description_quality', 'REAL DEFAULT 0');
  addCol('opportunities', 'avg_image_quality', 'REAL DEFAULT 0');
  addCol('opportunities', 'avg_trust_score', 'REAL DEFAULT 0');
  addCol('opportunities', 'avg_moat_score', 'REAL DEFAULT 0');
  addCol('opportunities', 'top_features', 'TEXT');
  addCol('opportunities', 'top_complaints', 'TEXT');
  addCol('opportunities', 'competitive_gaps', 'TEXT');

  // Factory blueprint metadata added after the original table shipped.
  addCol('factory_blueprints', 'source_listing_description', 'TEXT');
  addCol('factory_blueprints', 'competitor_features', 'TEXT');
  addCol('factory_blueprints', 'listing_strategy', 'TEXT');

  // Phase 4: Batch metadata for digital projects
  addCol('digital_projects', 'batch_meta', 'TEXT');

  // Phase 5: Import source metadata for digital projects
  addCol('digital_projects', 'import_source', 'TEXT');

  // Phase 6 (2026-05-16): Server-side auto-pipeline jobs.
  // Per user request: pipeline must survive page refresh, navigation,
  // tab close, and laptop close.  Job state lives here instead of
  // client IndexedDB.  Orchestrator runs server-side as a fire-and-
  // forget async fn after the POST handler returns.
  db.exec(`
    CREATE TABLE IF NOT EXISTS auto_pipeline_jobs (
      id              TEXT PRIMARY KEY,
      status          TEXT NOT NULL DEFAULT 'queued',     -- queued | running | completed | cancelled | failed
      style           TEXT,                                -- all | funny | bookmarks | folk
      requested_count INTEGER NOT NULL,
      items_json      TEXT NOT NULL DEFAULT '[]',          -- serialized AutoPipelineItem[]
      cost_usd_spent  REAL NOT NULL DEFAULT 0,
      current_stage   TEXT,                                -- 1A | 1B | 1C | 2A | 2B | 3 | 4 | null
      cancel_requested INTEGER NOT NULL DEFAULT 0,
      error           TEXT,
      started_at      INTEGER NOT NULL,
      updated_at      INTEGER NOT NULL,
      completed_at    INTEGER
    );
    CREATE INDEX IF NOT EXISTS idx_auto_pipeline_jobs_status ON auto_pipeline_jobs(status);
    CREATE INDEX IF NOT EXISTS idx_auto_pipeline_jobs_started ON auto_pipeline_jobs(started_at DESC);
  `);

  // Phase 2 SEO (2026-05-17): listing ranking history.  Tracks each
  // of our listings' position on Etsy search for its target keywords.
  // Position 0 = not in top 100.  Lets us see whether SEO tweaks work.
  db.exec(`
    CREATE TABLE IF NOT EXISTS listing_ranking_history (
      id              INTEGER PRIMARY KEY AUTOINCREMENT,
      listing_id      TEXT NOT NULL,
      keyword         TEXT NOT NULL,
      position        INTEGER NOT NULL,
      total_results   INTEGER,
      checked_at      INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_ranking_listing ON listing_ranking_history(listing_id);
    CREATE INDEX IF NOT EXISTS idx_ranking_checked ON listing_ranking_history(checked_at DESC);
  `);

  // Phase 3 SEO (2026-05-17): renewal schedule.  Tracks which of our
  // Etsy listings should auto-renew and when.  Etsy gives a recency
  // boost to renewed listings.
  db.exec(`
    CREATE TABLE IF NOT EXISTS listing_renewal_schedule (
      listing_id      TEXT PRIMARY KEY,
      enabled         INTEGER NOT NULL DEFAULT 1,
      cadence_days    INTEGER NOT NULL DEFAULT 30,
      last_renewed_at INTEGER,
      next_renewal_at INTEGER NOT NULL,
      last_error      TEXT
    );
  `);

  // Radar captures (extension feed). Stores what the Chrome extension
  // observed while the user browses Etsy — DOM-only, no extra Etsy
  // HTTP traffic. Safe to keep around even though the SW listing
  // fetcher was removed.
  db.exec(`
    CREATE TABLE IF NOT EXISTS radar_captures (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      listing_id TEXT NOT NULL,
      title TEXT NOT NULL,
      shop_name TEXT,
      url TEXT,
      image_url TEXT,
      price REAL,
      currency TEXT,
      reviews INTEGER DEFAULT 0,
      rating REAL DEFAULT 0,
      product_type TEXT,
      is_bestseller INTEGER DEFAULT 0,
      is_etsy_pick INTEGER DEFAULT 0,
      is_digital INTEGER DEFAULT 0,
      atc_badge TEXT,
      atc_count INTEGER,
      atc_tier TEXT,
      sales_estimate INTEGER,
      search_query TEXT,
      page_url TEXT,
      scanned_at DATETIME NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
  `);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_radar_listing ON radar_captures(listing_id)`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_radar_scanned ON radar_captures(scanned_at DESC)`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_radar_atc ON radar_captures(atc_tier, scanned_at DESC)`);
}

// ── Radar (Chrome extension) feed helpers ──
// The Chrome extension POSTs DOM-scraped data here while the user
// browses Etsy. Read-only storage — nothing in this module fetches
// anything from etsy.com.

export interface RadarCapture {
  id?: number;
  listing_id: string;
  title: string;
  shop_name: string | null;
  url: string | null;
  image_url: string | null;
  price: number | null;
  currency: string | null;
  reviews: number;
  rating: number;
  product_type: string | null;
  is_bestseller: number;
  is_etsy_pick: number;
  is_digital: number;
  atc_badge: string | null;
  atc_count: number | null;
  atc_tier: "hot" | "warm" | "cold" | null;
  sales_estimate: number | null;
  search_query: string | null;
  page_url: string | null;
  scanned_at: string;
  created_at?: string;
}

export function insertRadarCaptures(captures: Array<Omit<RadarCapture, "id" | "created_at">>): number {
  if (!captures.length) return 0;
  const stmt = getDb().prepare(`
    INSERT INTO radar_captures (
      listing_id, title, shop_name, url, image_url, price, currency,
      reviews, rating, product_type, is_bestseller, is_etsy_pick, is_digital,
      atc_badge, atc_count, atc_tier, sales_estimate, search_query, page_url, scanned_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  const tx = getDb().transaction((rows: typeof captures) => {
    for (const r of rows) {
      stmt.run(
        r.listing_id, r.title, r.shop_name, r.url, r.image_url,
        r.price, r.currency, r.reviews, r.rating, r.product_type,
        r.is_bestseller, r.is_etsy_pick, r.is_digital,
        r.atc_badge, r.atc_count, r.atc_tier, r.sales_estimate,
        r.search_query, r.page_url, r.scanned_at,
      );
    }
  });
  tx(captures);
  return captures.length;
}

export interface RadarSummary {
  recent: RadarCapture[];
  hot: RadarCapture[];
  total: number;
  uniqueListings: number;
  uniqueShops: number;
}

export function getRadarSummary(opts?: { limit?: number; sinceHours?: number; digitalOnly?: boolean }): RadarSummary {
  const db = getDb();
  const limit = opts?.limit ?? 60;
  const sinceMs = Date.now() - (opts?.sinceHours ?? 168) * 3600 * 1000;
  const sinceIso = new Date(sinceMs).toISOString();
  const digitalClause = opts?.digitalOnly ? "AND is_digital = 1" : "";

  const recent = db.prepare(`
    SELECT * FROM radar_captures
    WHERE scanned_at >= ? ${digitalClause}
    ORDER BY scanned_at DESC LIMIT ?
  `).all(sinceIso, limit) as RadarCapture[];

  const hot = db.prepare(`
    SELECT * FROM radar_captures
    WHERE scanned_at >= ? AND atc_tier IN ('hot', 'warm') ${digitalClause}
    ORDER BY
      CASE atc_tier WHEN 'hot' THEN 0 WHEN 'warm' THEN 1 ELSE 2 END,
      atc_count DESC,
      scanned_at DESC
    LIMIT ?
  `).all(sinceIso, limit) as RadarCapture[];

  const totalRow = db.prepare(`SELECT COUNT(*) as c FROM radar_captures WHERE scanned_at >= ? ${digitalClause}`).get(sinceIso) as { c: number };
  const uniqueRow = db.prepare(`SELECT COUNT(DISTINCT listing_id) as c FROM radar_captures WHERE scanned_at >= ? ${digitalClause}`).get(sinceIso) as { c: number };
  const shopsRow = db.prepare(`SELECT COUNT(DISTINCT shop_name) as c FROM radar_captures WHERE scanned_at >= ? AND shop_name IS NOT NULL ${digitalClause}`).get(sinceIso) as { c: number };

  return {
    recent,
    hot,
    total: totalRow.c,
    uniqueListings: uniqueRow.c,
    uniqueShops: shopsRow.c,
  };
}

// ═════════════════════════════════════════════════════════════════════
// Etsy Marketplace Insights — captured by the Chrome extension while
// the user browses their authenticated Etsy Plus dashboard.
//
// THE SIGNAL: Marketplace Insights is Etsy's first-party data showing
// what BUYERS are typing into Etsy's search bar with monthly volume.
// It's UI-only — no v3 API exposes it — so we capture via the same
// sanctioned Chrome-extension-while-browsing path we already use for
// listing captures (the user's own session, their own subscription,
// their own data).
//
// Stored per (term, category, captured_at). Same term can appear in
// multiple categories or refresh over time; we keep all rows for
// time-series analysis and let consumers dedupe with a MAX(captured_at)
// query when they only want "the latest" per term.
// ═════════════════════════════════════════════════════════════════════
function ensureEtsyInsightsSchema() {
  const db = getDb();
  db.exec(`
    CREATE TABLE IF NOT EXISTS etsy_insights_terms (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      term TEXT NOT NULL,
      term_normalized TEXT NOT NULL,
      category TEXT,
      monthly_searches INTEGER,
      raw_volume_text TEXT,
      thumbnail_url TEXT,
      source_page TEXT,
      captured_at DATETIME NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
  `);
  // ── Phase-6 additions (idempotent migrations) ───────────────────────
  // Detail-page capture brings 4 new dimensions:
  //   • growth_pct          — +/- percent change in searches WoW
  //   • search_results      — Etsy's reported listing count (competition)
  //   • capture_type        — "grid" | "detail-main" | "detail-related"
  //   • parent_term         — for detail-related rows, the term that
  //                           was searched (lets us join "related terms"
  //                           back to their parent query)
  //   • daily_series_json   — 30-day daily counts + 7-day moving avg,
  //                           stored as a JSON string for simplicity
  //                           (only set on detail-main captures)
  //
  // SQLite has no `ADD COLUMN IF NOT EXISTS`, so we probe table_info
  // first and only add missing columns. Safe on cold DBs (table just
  // created above — no columns to add) and on warm DBs (existing
  // columns are left alone).
  const hasColumn = (column: string) => {
    const cols = db.prepare(`PRAGMA table_info(etsy_insights_terms)`).all() as Array<{ name: string }>;
    return cols.some((c) => c.name === column);
  };
  const newColumns: Array<[string, string]> = [
    ["growth_pct", "REAL"],
    ["search_results", "INTEGER"],
    ["capture_type", "TEXT DEFAULT 'grid'"],
    ["parent_term", "TEXT"],
    ["daily_series_json", "TEXT"],
    // ── Phase-7b: digital classifier ──
    // "digital" | "physical" | "mixed" | null (= unclassified yet)
    // mixed = term that legitimately covers both physical AND digital
    // ("fathers day", "wedding", "graduation gift" — could be a physical
    // mug or a digital invitation depending on listing).
    ["is_digital", "TEXT"],
    // Bucketed factory hint when classified (cross-stitch, planner,
    // svg, wall-art, etc.). Null if not classified or non-digital.
    ["digital_niche", "TEXT"],
    // Provenance of the classification: "heuristic" | "gemini" | "manual".
    // Lets us re-classify if we improve the heuristic later, or override
    // a Gemini result manually.
    ["classified_by", "TEXT"],
  ];
  for (const [name, type] of newColumns) {
    if (!hasColumn(name)) {
      try {
        db.exec(`ALTER TABLE etsy_insights_terms ADD COLUMN ${name} ${type}`);
      } catch (err) {
        if (err instanceof Error && /duplicate column name/i.test(err.message) && hasColumn(name)) {
          continue;
        }
        throw err;
      }
    }
  }
  db.exec(`CREATE INDEX IF NOT EXISTS idx_insights_normalized ON etsy_insights_terms(term_normalized)`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_insights_category ON etsy_insights_terms(category, captured_at DESC)`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_insights_captured ON etsy_insights_terms(captured_at DESC)`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_insights_type ON etsy_insights_terms(capture_type, captured_at DESC)`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_insights_parent ON etsy_insights_terms(parent_term, captured_at DESC)`);
}
ensureEtsyInsightsSchema();

export interface EtsyInsightsTerm {
  id?: number;
  term: string;
  term_normalized: string;
  category: string | null;
  monthly_searches: number | null;
  /** Original "170.9k" / "1.2M" string from the Etsy UI — preserved for audit. */
  raw_volume_text: string | null;
  thumbnail_url: string | null;
  /** URL of the dashboard page that produced this row (audit / debug). */
  source_page: string | null;
  captured_at: string;
  created_at?: string;
  // ── Phase-6 detail-page fields ──────────────────────────────────────
  /** Signed % change WoW (e.g. -6.4 means searches dropped 6.4%).
   *  Null on grid captures (Etsy doesn't show it there). */
  growth_pct?: number | null;
  /** Etsy's reported listing count for this term — the COMPETITION
   *  number visible as "9.1M" on the detail page. Null on grid captures. */
  search_results?: number | null;
  /** Origin of this row:
   *    "grid"            — category-grid trending card
   *    "detail-main"     — primary term on a search-detail page
   *    "detail-related"  — related-term row from the "Discover what buyers
   *                        are searching for" section on a detail page */
  capture_type?: "grid" | "detail-main" | "detail-related";
  /** For detail-related rows: the term that was searched to produce
   *  this related-term row. Lets us reconstruct query→related mappings. */
  parent_term?: string | null;
  /** Serialized 30-day daily series for detail-main captures:
   *    [{date: "2026-04-19", searches: 1009, ma7: 1145}, ...]
   *  Stored as JSON because it's only consumed by the freshness
   *  dashboard and we don't need to query inside it. Null elsewhere. */
  daily_series_json?: string | null;
  // ── Phase-7b classifier columns ─────────────────────────────────────
  /** "digital" | "physical" | "mixed" — what KIND of product the term is.
   *  Null when not yet classified (insert-time heuristic + a reclassify
   *  endpoint catch ambiguous rows via Gemini). */
  is_digital?: "digital" | "physical" | "mixed" | null;
  /** When is_digital is "digital" or "mixed", the digital-niche bucket
   *  (matches AnchorNiche from digital-anchors.ts: planners, cut-files,
   *  wall-art, patterns-needle, etc.). Null otherwise. */
  digital_niche?: string | null;
  /** Provenance: "heuristic" (regex match), "gemini" (LLM fallback),
   *  or "manual" (user override). */
  classified_by?: "heuristic" | "gemini" | "manual" | null;
}

/** Normalize a search term for matching across sources. Same rules as
 *  market-pulse's normalizeTerm — lowercase, strip punctuation, collapse
 *  whitespace, naïve singularize. Keep in sync if one changes. */
function normalizeInsightTerm(raw: string): string {
  let t = raw
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
  t = t
    .split(" ")
    .map((w) => (w.length > 3 && w.endsWith("s") && !w.endsWith("ss") ? w.slice(0, -1) : w))
    .join(" ");
  return t;
}

/** Parse Etsy's volume text ("170.9k", "1.2M", "850") into an integer.
 *  Returns null if unparseable. */
function parseVolumeText(raw: string | null | undefined): number | null {
  if (!raw) return null;
  const txt = raw.trim().toLowerCase().replace(/,/g, "");
  const m = txt.match(/^([\d.]+)\s*([kmb]?)$/);
  if (!m) {
    // Maybe plain digits
    const n = parseInt(txt, 10);
    return Number.isFinite(n) ? n : null;
  }
  const num = parseFloat(m[1]);
  if (!Number.isFinite(num)) return null;
  const mult = m[2] === "k" ? 1_000 : m[2] === "m" ? 1_000_000 : m[2] === "b" ? 1_000_000_000 : 1;
  return Math.round(num * mult);
}

/** Bulk-insert captured Marketplace Insights terms. Idempotent at the
 *  schema level (no unique constraint — we WANT time-series history).
 *  Callers should normalize and parse before insert via the helpers
 *  exported below.
 *
 *  Returns number of rows inserted. */
export function insertEtsyInsightsTerms(
  rows: Array<Omit<EtsyInsightsTerm, "id" | "created_at">>,
): number {
  if (!rows.length) return 0;
  // Phase-6: insert now writes all 13 columns. Grid captures from older
  // clients still work — Phase-6 columns default to null / "grid".
  const stmt = getDb().prepare(`
    INSERT INTO etsy_insights_terms (
      term, term_normalized, category, monthly_searches,
      raw_volume_text, thumbnail_url, source_page, captured_at,
      growth_pct, search_results, capture_type, parent_term, daily_series_json
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  const tx = getDb().transaction((batch: typeof rows) => {
    for (const r of batch) {
      stmt.run(
        r.term,
        r.term_normalized,
        r.category,
        r.monthly_searches,
        r.raw_volume_text,
        r.thumbnail_url,
        r.source_page,
        r.captured_at,
        r.growth_pct ?? null,
        r.search_results ?? null,
        r.capture_type ?? "grid",
        r.parent_term ?? null,
        r.daily_series_json ?? null,
      );
    }
  });
  tx(rows);
  return rows.length;
}

/** Build a normalized + parsed row from raw extension capture data.
 *  Phase-6 fields are all optional — grid captures don't supply them. */
export function buildInsightsTermRow(input: {
  term: string;
  category?: string | null;
  volumeText?: string | null;
  thumbnailUrl?: string | null;
  sourcePage?: string | null;
  capturedAt?: string;
  // ── Phase-6 detail-page fields ──
  /** Raw growth string from Etsy: "+12.4%", "-6.4%". Sign preserved.
   *  Falls back to numeric `growthPct` if both supplied. */
  growthText?: string | null;
  growthPct?: number | null;
  /** Raw search-results string from Etsy: "9.1M", "901.6k". */
  searchResultsText?: string | null;
  searchResults?: number | null;
  captureType?: "grid" | "detail-main" | "detail-related";
  parentTerm?: string | null;
  dailySeries?: unknown;
}): Omit<EtsyInsightsTerm, "id" | "created_at"> {
  // Growth: prefer the numeric input, else parse the text ("+12.4%" → 12.4).
  let growthPct: number | null = null;
  if (typeof input.growthPct === "number" && Number.isFinite(input.growthPct)) {
    growthPct = input.growthPct;
  } else if (input.growthText) {
    const m = input.growthText.trim().match(/^([+-]?\d+(?:\.\d+)?)\s*%?$/);
    if (m) {
      const n = parseFloat(m[1]);
      if (Number.isFinite(n)) growthPct = n;
    }
  }
  // Search results: prefer numeric input, else parse the text via the
  // same parser used for volumes (handles "9.1M", "901.6k").
  let searchResults: number | null = null;
  if (typeof input.searchResults === "number" && Number.isFinite(input.searchResults)) {
    searchResults = input.searchResults;
  } else if (input.searchResultsText) {
    searchResults = parseVolumeText(input.searchResultsText);
  }
  return {
    term: input.term.trim().slice(0, 300),
    term_normalized: normalizeInsightTerm(input.term),
    category: input.category?.trim()?.slice(0, 100) ?? null,
    monthly_searches: parseVolumeText(input.volumeText),
    raw_volume_text: input.volumeText?.trim()?.slice(0, 50) ?? null,
    thumbnail_url: input.thumbnailUrl?.trim()?.slice(0, 500) ?? null,
    source_page: input.sourcePage?.trim()?.slice(0, 500) ?? null,
    captured_at: input.capturedAt ?? new Date().toISOString(),
    growth_pct: growthPct,
    search_results: searchResults,
    capture_type: input.captureType ?? "grid",
    parent_term: input.parentTerm?.trim()?.slice(0, 300) ?? null,
    daily_series_json: input.dailySeries
      ? JSON.stringify(input.dailySeries).slice(0, 8000)
      : null,
  };
}

export interface EtsyInsightsSummary {
  /** Latest row per term_normalized (highest captured_at), sorted by
   *  monthly_searches desc. Used by market-pulse and dashboards. */
  latestPerTerm: EtsyInsightsTerm[];
  /** Distinct categories with capture counts. */
  byCategory: Array<{ category: string; count: number; max_captured_at: string }>;
  /** Total rows + most-recent capture timestamp (for "data is N days old"). */
  total: number;
  mostRecentCapturedAt: string | null;
}

/** Update classification fields on rows matching a normalized term.
 *  Bulk-updates all historical captures for the same term in one call,
 *  so when Gemini classifies "wedding invitation" as digital, every
 *  past + future row for that term carries the tag. */
export function updateInsightsClassification(
  termNormalized: string,
  classification: {
    isDigital: "digital" | "physical" | "mixed";
    digitalNiche: string | null;
    classifiedBy: "heuristic" | "gemini" | "manual";
  },
): number {
  const stmt = getDb().prepare(`
    UPDATE etsy_insights_terms
    SET is_digital = ?, digital_niche = ?, classified_by = ?
    WHERE term_normalized = ?
  `);
  const r = stmt.run(
    classification.isDigital,
    classification.digitalNiche,
    classification.classifiedBy,
    termNormalized,
  );
  return r.changes ?? 0;
}

/** Return all distinct unclassified term_normalized values. Used by
 *  the background classifier job. */
export function getUnclassifiedInsightsTerms(limit = 100): Array<{
  term: string;
  term_normalized: string;
}> {
  return getDb()
    .prepare(`
      SELECT term, term_normalized
      FROM etsy_insights_terms
      WHERE is_digital IS NULL
      GROUP BY term_normalized
      ORDER BY MAX(captured_at) DESC
      LIMIT ?
    `)
    .all(limit) as Array<{ term: string; term_normalized: string }>;
}

/** For a set of normalized anchor terms, return which ones we've
 *  captured at least one row for (via the "detail-main" capture_type
 *  ideally — that signals the user actually loaded that anchor's
 *  detail page and we got rich data). Used by the AnchorSweepPanel
 *  in /research to show "X / 40 covered" progress. */
export function getAnchorCoverage(
  normalizedAnchors: string[],
  opts?: { sinceHours?: number },
): Array<{
  normalized: string;
  covered: boolean;
  /** Best capture for this anchor — null if uncovered. */
  capturedAt: string | null;
  monthlySearches: number | null;
  growthPct: number | null;
  searchResults: number | null;
  captureType: string | null;
}> {
  if (normalizedAnchors.length === 0) return [];
  const db = getDb();
  const sinceHours = opts?.sinceHours ?? 24 * 90; // 90 days default
  const sinceIso = new Date(Date.now() - sinceHours * 3600 * 1000).toISOString();

  // We want the BEST capture per anchor: prefer detail-main rows
  // (richest data) over detail-related over grid, then latest.
  // Implement as a CASE-WHEN ranking + window in a subquery, then JOIN.
  const placeholders = normalizedAnchors.map(() => "?").join(",");
  const rows = db.prepare(`
    SELECT
      t.term_normalized,
      t.captured_at,
      t.monthly_searches,
      t.growth_pct,
      t.search_results,
      t.capture_type
    FROM etsy_insights_terms t
    INNER JOIN (
      SELECT term_normalized,
             MAX(
               CASE capture_type
                 WHEN 'detail-main' THEN 3
                 WHEN 'detail-related' THEN 2
                 WHEN 'grid' THEN 1
                 ELSE 0
               END * 1000000000000
               + CAST(strftime('%s', captured_at) AS INTEGER)
             ) AS rank
      FROM etsy_insights_terms
      WHERE term_normalized IN (${placeholders})
        AND captured_at >= ?
      GROUP BY term_normalized
    ) best ON t.term_normalized = best.term_normalized
       AND (
         CASE t.capture_type
           WHEN 'detail-main' THEN 3
           WHEN 'detail-related' THEN 2
           WHEN 'grid' THEN 1
           ELSE 0
         END * 1000000000000
         + CAST(strftime('%s', t.captured_at) AS INTEGER)
       ) = best.rank
  `).all(...normalizedAnchors, sinceIso) as Array<{
    term_normalized: string;
    captured_at: string;
    monthly_searches: number | null;
    growth_pct: number | null;
    search_results: number | null;
    capture_type: string | null;
  }>;

  const byNorm = new Map(rows.map((r) => [r.term_normalized, r]));
  return normalizedAnchors.map((n) => {
    const r = byNorm.get(n);
    return {
      normalized: n,
      covered: !!r,
      capturedAt: r?.captured_at ?? null,
      monthlySearches: r?.monthly_searches ?? null,
      growthPct: r?.growth_pct ?? null,
      searchResults: r?.search_results ?? null,
      captureType: r?.capture_type ?? null,
    };
  });
}

/** Read summary of captured Insights data. Used by market-pulse +
 *  /research UI "data freshness" nudge. */
export function getEtsyInsightsSummary(opts?: {
  sinceHours?: number;
  category?: string;
  limit?: number;
}): EtsyInsightsSummary {
  const db = getDb();
  const sinceHours = opts?.sinceHours ?? 24 * 30; // default: last 30 days
  const limit = opts?.limit ?? 200;
  const sinceIso = new Date(Date.now() - sinceHours * 3600 * 1000).toISOString();

  // Latest row per term_normalized within the window. Use a correlated
  // subquery picking the MAX(captured_at) per normalized key, then
  // sort by volume desc.
  const categoryClause = opts?.category ? "AND category = ?" : "";
  const args: Array<string | number> = [sinceIso];
  if (opts?.category) args.push(opts.category);
  args.push(limit);

  const latestPerTerm = db.prepare(`
    SELECT t1.* FROM etsy_insights_terms t1
    INNER JOIN (
      SELECT term_normalized, MAX(captured_at) AS max_at
      FROM etsy_insights_terms
      WHERE captured_at >= ? ${categoryClause}
      GROUP BY term_normalized
    ) t2 ON t1.term_normalized = t2.term_normalized AND t1.captured_at = t2.max_at
    ORDER BY COALESCE(t1.monthly_searches, 0) DESC, t1.captured_at DESC
    LIMIT ?
  `).all(...args) as EtsyInsightsTerm[];

  const byCategory = db.prepare(`
    SELECT category, COUNT(*) AS count, MAX(captured_at) AS max_captured_at
    FROM etsy_insights_terms
    WHERE captured_at >= ? AND category IS NOT NULL
    GROUP BY category
    ORDER BY count DESC
  `).all(sinceIso) as Array<{ category: string; count: number; max_captured_at: string }>;

  const totalRow = db.prepare(`
    SELECT COUNT(*) AS c, MAX(captured_at) AS most_recent
    FROM etsy_insights_terms
  `).get() as { c: number; most_recent: string | null };

  return {
    latestPerTerm,
    byCategory,
    total: totalRow.c,
    mostRecentCapturedAt: totalRow.most_recent,
  };
}

// --- Product CRUD ---

export interface Product {
  id: number;
  type: 'wall_art' | 'svg' | 'planner' | 'mockup' | 'notion_template' | 'pod_product' | 'cross_stitch';
  title: string;
  description: string | null;
  tags: string | null;
  prompt: string | null;
  file_paths: string | null;
  preview_path: string | null;
  etsy_listing_id: string | null;
  etsy_status: string;
  price: number;
  created_at: string;
}

export function createProduct(data: {
  type: Product['type'];
  title: string;
  description?: string;
  tags?: string[];
  prompt?: string;
  file_paths?: string[];
  preview_path?: string;
  price?: number;
}): Product {
  const db = getDb();
  const stmt = db.prepare(`
    INSERT INTO products (type, title, description, tags, prompt, file_paths, preview_path, price)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `);
  const result = stmt.run(
    data.type,
    data.title,
    data.description || null,
    data.tags ? JSON.stringify(data.tags) : null,
    data.prompt || null,
    data.file_paths ? JSON.stringify(data.file_paths) : null,
    data.preview_path || null,
    data.price ?? 2.99
  );
  return getProduct(result.lastInsertRowid as number)!;
}

export function getProduct(id: number): Product | undefined {
  const db = getDb();
  return db.prepare('SELECT * FROM products WHERE id = ?').get(id) as Product | undefined;
}

export function getAllProducts(type?: string): Product[] {
  const db = getDb();
  if (type) {
    return db.prepare('SELECT * FROM products WHERE type = ? ORDER BY created_at DESC').all(type) as Product[];
  }
  return db.prepare('SELECT * FROM products ORDER BY created_at DESC').all() as Product[];
}

export function updateProduct(id: number, data: Partial<Omit<Product, 'id' | 'created_at'>>): Product | undefined {
  const db = getDb();
  const fields: string[] = [];
  const values: unknown[] = [];

  for (const [key, value] of Object.entries(data)) {
    fields.push(`${key} = ?`);
    if (key === 'tags' || key === 'file_paths') {
      values.push(Array.isArray(value) ? JSON.stringify(value) : value);
    } else {
      values.push(value);
    }
  }

  if (fields.length === 0) return getProduct(id);

  values.push(id);
  db.prepare(`UPDATE products SET ${fields.join(', ')} WHERE id = ?`).run(...values);
  return getProduct(id);
}

export function deleteProduct(id: number): boolean {
  const db = getDb();
  const result = db.prepare('DELETE FROM products WHERE id = ?').run(id);
  return result.changes > 0;
}

// --- Etsy Tokens ---

export interface EtsyToken {
  access_token: string;
  refresh_token: string;
  expires_at: number;
  shop_id: string | null;
}

export function saveEtsyTokens(tokens: EtsyToken): void {
  const db = getDb();
  db.prepare(`
    INSERT OR REPLACE INTO etsy_tokens (id, access_token, refresh_token, expires_at, shop_id)
    VALUES (1, ?, ?, ?, ?)
  `).run(tokens.access_token, tokens.refresh_token, tokens.expires_at, tokens.shop_id);
}

export function getEtsyTokens(): EtsyToken | undefined {
  const db = getDb();
  return db.prepare('SELECT access_token, refresh_token, expires_at, shop_id FROM etsy_tokens WHERE id = 1').get() as EtsyToken | undefined;
}

// --- Profit Tracker ---

export interface OperatingExpense {
  id: string;
  name: string;
  category: string | null;
  monthly_amount: number;
  started_at: string | null;
  ended_at: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

function makeExpenseId(): string {
  return `oe_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

export function setListingCogs(listingId: number, cogs: number, notes?: string): void {
  const db = getDb();
  db.prepare(`
    INSERT INTO listing_cogs (listing_id, cogs, notes, updated_at)
    VALUES (?, ?, ?, datetime('now'))
    ON CONFLICT(listing_id) DO UPDATE SET
      cogs = excluded.cogs,
      notes = excluded.notes,
      updated_at = datetime('now')
  `).run(listingId, cogs, notes ?? null);
}

export function getAllListingCogs(): Record<number, number> {
  const db = getDb();
  const rows = db.prepare("SELECT listing_id, cogs FROM listing_cogs").all() as Array<{
    listing_id: number;
    cogs: number;
  }>;
  return Object.fromEntries(rows.map((row) => [row.listing_id, row.cogs]));
}

export function listOperatingExpenses(): OperatingExpense[] {
  const db = getDb();
  return db
    .prepare("SELECT * FROM operating_expenses ORDER BY created_at DESC")
    .all() as OperatingExpense[];
}

export function upsertOperatingExpense(data: {
  id?: string;
  name: string;
  category: string | null;
  monthly_amount: number;
  started_at: string | null;
  ended_at: string | null;
  notes: string | null;
}): string {
  const db = getDb();
  const id = data.id || makeExpenseId();
  db.prepare(`
    INSERT INTO operating_expenses (
      id, name, category, monthly_amount, started_at, ended_at, notes, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))
    ON CONFLICT(id) DO UPDATE SET
      name = excluded.name,
      category = excluded.category,
      monthly_amount = excluded.monthly_amount,
      started_at = excluded.started_at,
      ended_at = excluded.ended_at,
      notes = excluded.notes,
      updated_at = datetime('now')
  `).run(
    id,
    data.name,
    data.category,
    data.monthly_amount,
    data.started_at,
    data.ended_at,
    data.notes,
  );
  return id;
}

export function deleteOperatingExpense(id: string): boolean {
  const db = getDb();
  return db.prepare("DELETE FROM operating_expenses WHERE id = ?").run(id).changes > 0;
}

// --- Generation Log ---

export function logGeneration(data: { product_id: number; provider: string; prompt: string; status?: string }): void {
  const db = getDb();
  db.prepare(`
    INSERT INTO generation_log (product_id, provider, prompt, status)
    VALUES (?, ?, ?, ?)
  `).run(data.product_id, data.provider, data.prompt, data.status || 'success');
}

// --- Research ---

export interface TrackedShop {
  id: number;
  shop_id: string;
  shop_name: string;
  total_sales: number;
  listing_count: number;
  avg_price: number;
  top_tags: string | null;
  last_checked: string | null;
  created_at: string;
}

export interface TrackedListing {
  id: number;
  listing_id: string;
  shop_name: string | null;
  title: string;
  price: number;
  quantity: number;
  views: number;
  favorites: number;
  sales_estimate: number;
  tags: string | null;
  category: string | null;
  listing_age_days: number;
  image_url: string | null;
  url: string | null;
  last_checked: string | null;
  created_at: string;
}

export interface NicheResearch {
  id: number;
  keyword: string;
  total_results: number;
  avg_price: number;
  avg_favorites: number;
  top_tags: string | null;
  competition_level: string | null;
  demand_score: number;
  searched_at: string;
}

export function saveTrackedShop(data: Omit<TrackedShop, 'id' | 'created_at'>): void {
  const db = getDb();
  db.prepare(`
    INSERT OR REPLACE INTO tracked_shops (shop_id, shop_name, total_sales, listing_count, avg_price, top_tags, last_checked)
    VALUES (?, ?, ?, ?, ?, ?, datetime('now'))
  `).run(data.shop_id, data.shop_name, data.total_sales, data.listing_count, data.avg_price, data.top_tags);
}

export function getTrackedShops(): TrackedShop[] {
  const db = getDb();
  return db.prepare('SELECT * FROM tracked_shops ORDER BY total_sales DESC').all() as TrackedShop[];
}

export function deleteTrackedShop(shopId: string): void {
  const db = getDb();
  db.prepare('DELETE FROM tracked_shops WHERE shop_id = ?').run(shopId);
}

export function saveTrackedListings(listings: Omit<TrackedListing, 'id' | 'created_at'>[]): void {
  const db = getDb();
  const stmt = db.prepare(`
    INSERT OR REPLACE INTO tracked_listings (listing_id, shop_name, title, price, quantity, views, favorites, sales_estimate, tags, category, listing_age_days, image_url, url, last_checked)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
  `);
  const insertMany = db.transaction((items: Omit<TrackedListing, 'id' | 'created_at'>[]) => {
    for (const item of items) {
      stmt.run(item.listing_id, item.shop_name, item.title, item.price, item.quantity, item.views, item.favorites, item.sales_estimate, item.tags, item.category, item.listing_age_days, item.image_url, item.url);
    }
  });
  insertMany(listings);
}

export function getTrackedListings(sortBy?: string): TrackedListing[] {
  const db = getDb();
  const orderCol = sortBy === 'favorites' ? 'favorites' : sortBy === 'price' ? 'price' : sortBy === 'sales' ? 'sales_estimate' : 'favorites';
  return db.prepare(`SELECT * FROM tracked_listings ORDER BY ${orderCol} DESC LIMIT 200`).all() as TrackedListing[];
}

export function saveNicheResearch(data: Omit<NicheResearch, 'id' | 'searched_at'>): void {
  const db = getDb();
  db.prepare(`
    INSERT INTO niche_research (keyword, total_results, avg_price, avg_favorites, top_tags, competition_level, demand_score)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(data.keyword, data.total_results, data.avg_price, data.avg_favorites, data.top_tags, data.competition_level, data.demand_score);
}

export function getNicheResearch(): NicheResearch[] {
  const db = getDb();
  return db.prepare('SELECT * FROM niche_research ORDER BY demand_score DESC').all() as NicheResearch[];
}

// --- Scan Runs ---

export interface ScanRun {
  id: number;
  started_at: string;
  completed_at: string | null;
  keywords_total: number;
  keywords_scanned: number;
  listings_found: number;
  listings_new: number;
  status: 'pending' | 'running' | 'completed' | 'failed' | 'cancelled';
  error_message: string | null;
  scan_config: string | null;
}

export interface ScanKeywordResult {
  id: number;
  scan_run_id: number;
  keyword: string;
  total_results: number;
  listings_fetched: number;
  avg_price: number;
  avg_favorites: number;
  competition_level: string | null;
  demand_score: number;
  top_tags: string | null;
  scanned_at: string;
  error: string | null;
}

export interface TrendSnapshot {
  id: number;
  scan_run_id: number;
  category: string;
  avg_price: number;
  avg_favorites: number;
  total_listings: number;
  avg_sales_estimate: number;
  top_tags: string | null;
  snapshot_at: string;
}

export function createScanRun(keywordsTotal: number, scanConfig?: string): number {
  const db = getDb();
  const result = db.prepare(
    `INSERT INTO scan_runs (keywords_total, status, scan_config) VALUES (?, 'running', ?)`
  ).run(keywordsTotal, scanConfig || null);
  return result.lastInsertRowid as number;
}

export function updateScanRunProgress(id: number, keywordsScanned: number, listingsFound: number, listingsNew: number): void {
  const db = getDb();
  db.prepare(`UPDATE scan_runs SET keywords_scanned = ?, listings_found = ?, listings_new = ? WHERE id = ?`)
    .run(keywordsScanned, listingsFound, listingsNew, id);
}

export function completeScanRun(id: number, status: 'completed' | 'failed' | 'cancelled', errorMessage?: string): void {
  const db = getDb();
  db.prepare(`UPDATE scan_runs SET status = ?, completed_at = datetime('now'), error_message = ? WHERE id = ?`)
    .run(status, errorMessage || null, id);
}

export function getLatestScanRun(): ScanRun | undefined {
  const db = getDb();
  return db.prepare('SELECT * FROM scan_runs ORDER BY started_at DESC LIMIT 1').get() as ScanRun | undefined;
}

export function getScanRun(id: number): ScanRun | undefined {
  const db = getDb();
  return db.prepare('SELECT * FROM scan_runs WHERE id = ?').get(id) as ScanRun | undefined;
}

export function getAllScanRuns(): ScanRun[] {
  const db = getDb();
  return db.prepare('SELECT * FROM scan_runs ORDER BY started_at DESC LIMIT 20').all() as ScanRun[];
}

export function saveScanKeywordResult(data: {
  scan_run_id: number; keyword: string; total_results: number; listings_fetched: number;
  avg_price: number; avg_favorites: number; competition_level: string; demand_score: number;
  top_tags: string; error?: string;
}): void {
  const db = getDb();
  db.prepare(`INSERT INTO scan_keyword_results (scan_run_id, keyword, total_results, listings_fetched, avg_price, avg_favorites, competition_level, demand_score, top_tags, error)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(
    data.scan_run_id, data.keyword, data.total_results, data.listings_fetched, data.avg_price,
    data.avg_favorites, data.competition_level, data.demand_score, data.top_tags, data.error || null
  );
}

export function getScanKeywordResults(scanRunId: number): ScanKeywordResult[] {
  const db = getDb();
  return db.prepare('SELECT * FROM scan_keyword_results WHERE scan_run_id = ? ORDER BY demand_score DESC').all(scanRunId) as ScanKeywordResult[];
}

export function saveTrackedListingsWithScan(listings: { listing_id: string; shop_name: string | null; title: string; price: number; quantity: number; views: number; favorites: number; sales_estimate: number; tags: string; category: string; listing_age_days: number; image_url: string; url: string; scan_run_id: number; keyword: string; revenue_estimate: number }[]): number {
  const db = getDb();
  let newCount = 0;
  const stmt = db.prepare(`INSERT INTO tracked_listings (listing_id, shop_name, title, price, quantity, views, favorites, sales_estimate, tags, category, listing_age_days, image_url, url, last_checked, scan_run_id, keyword, revenue_estimate)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), ?, ?, ?)
    ON CONFLICT(listing_id) DO UPDATE SET price=excluded.price, views=excluded.views, favorites=excluded.favorites, sales_estimate=excluded.sales_estimate, last_checked=datetime('now'), scan_run_id=excluded.scan_run_id, keyword=excluded.keyword, revenue_estimate=excluded.revenue_estimate`);
  const insertMany = db.transaction((items: typeof listings) => {
    for (const item of items) {
      stmt.run(item.listing_id, item.shop_name, item.title, item.price, item.quantity, item.views, item.favorites, item.sales_estimate, item.tags, item.category, item.listing_age_days, item.image_url, item.url, item.scan_run_id, item.keyword, item.revenue_estimate);
      newCount++;
    }
  });
  insertMany(listings);
  return newCount;
}

export function saveTrendSnapshot(data: { scan_run_id: number; category: string; avg_price: number; avg_favorites: number; total_listings: number; avg_sales_estimate: number; top_tags: string }): void {
  const db = getDb();
  db.prepare(`INSERT INTO trend_snapshots (scan_run_id, category, avg_price, avg_favorites, total_listings, avg_sales_estimate, top_tags) VALUES (?, ?, ?, ?, ?, ?, ?)`)
    .run(data.scan_run_id, data.category, data.avg_price, data.avg_favorites, data.total_listings, data.avg_sales_estimate, data.top_tags);
}

export function getTrendSnapshots(scanRunId?: number): TrendSnapshot[] {
  const db = getDb();
  if (scanRunId) return db.prepare('SELECT * FROM trend_snapshots WHERE scan_run_id = ? ORDER BY avg_favorites DESC').all(scanRunId) as TrendSnapshot[];
  return db.prepare('SELECT * FROM trend_snapshots ORDER BY snapshot_at DESC LIMIT 500').all() as TrendSnapshot[];
}

export function getTopListingsByScanRun(scanRunId: number, limit: number = 50, sortBy: string = 'favorites'): TrackedListing[] {
  const db = getDb();
  const col = sortBy === 'revenue' ? 'revenue_estimate' : sortBy === 'sales' ? 'sales_estimate' : 'favorites';
  return db.prepare(`SELECT * FROM tracked_listings WHERE scan_run_id = ? ORDER BY ${col} DESC LIMIT ?`).all(scanRunId, limit) as TrackedListing[];
}

export function getCategoryBreakdown(scanRunId: number): { keyword: string; count: number; avg_price: number; avg_favorites: number; avg_revenue: number }[] {
  const db = getDb();
  return db.prepare(`SELECT keyword, COUNT(*) as count, AVG(price) as avg_price, AVG(favorites) as avg_favorites, AVG(revenue_estimate) as avg_revenue
    FROM tracked_listings WHERE scan_run_id = ? GROUP BY keyword ORDER BY avg_favorites DESC`).all(scanRunId) as { keyword: string; count: number; avg_price: number; avg_favorites: number; avg_revenue: number }[];
}

// --- Stats ---

// --- Etsy Imports ---

export interface EtsyImport {
  id: number;
  source: string;
  listings_count: number;
  keywords_count: number;
  deduped_listings: number;
  deduped_keywords: number;
  status: string;
  created_at: string;
}

export interface EtsyImportListing {
  id: number;
  import_id: number;
  listing_id: string | null;
  url: string;
  title: string;
  shop_name: string | null;
  price: number;
  currency: string;
  rating: number;
  reviews: number;
  favorites: number;
  is_bestseller: number;
  is_etsy_pick: number;
  tags: string | null;
  category: string | null;
  source_keyword: string | null;
  listing_age_days: number | null;
  listing_age_source: string | null;
  views_24h: number | null;
  daily_sales: number | null;
  weekly_sales: number | null;
  monthly_sales: number | null;
  revenue_estimate: number | null;
  total_revenue: number | null;
  demand_score: number | null;
  opportunity_score: number | null;
  velocity_score: number | null;
  monthly_trend: string | null;
  confidence: string | null;
  classification: string | null;
  scanned_at: string | null;
  created_at: string;
  // Extended fields
  description_sections: string | null;
  image_count: number;
  has_video: number;
  feature_density: number;
  moat_score: number;
  review_signals: string | null;
  winner_tier: string | null;
  winner_score: number | null;
}

export interface EtsyImportKeyword {
  id: number;
  import_id: number;
  keyword: string;
  frequency: number;
  cluster_id: string | null;
  classification: string | null;
  demand_score: number;
  avg_price: number;
  avg_favorites: number;
  competition_level: string | null;
  listings_count: number;
  scanned_at: string | null;
  created_at: string;
}

export interface Opportunity {
  id: number;
  import_id: number | null;
  source: string;
  title: string;
  core_keywords: string | null;
  tag_set: string | null;
  niche: string | null;
  category: string | null;
  market_signals: string | null;
  opportunity_score: number;
  recommended_angle: string | null;
  deliverables: string | null;
  listing_plan: string | null;
  status: 'new' | 'shortlisted' | 'in_progress' | 'published' | 'dismissed';
  created_at: string;
  updated_at: string;
}

export function createEtsyImport(source: string = 'extension'): number {
  const db = getDb();
  const result = db.prepare(
    `INSERT INTO etsy_imports (source) VALUES (?)`
  ).run(source);
  return result.lastInsertRowid as number;
}

export function updateEtsyImport(id: number, data: Partial<Omit<EtsyImport, 'id' | 'created_at'>>): void {
  const db = getDb();
  const fields: string[] = [];
  const values: unknown[] = [];
  for (const [key, value] of Object.entries(data)) {
    fields.push(`${key} = ?`);
    values.push(value);
  }
  if (fields.length === 0) return;
  values.push(id);
  db.prepare(`UPDATE etsy_imports SET ${fields.join(', ')} WHERE id = ?`).run(...values);
}

export function getEtsyImports(): EtsyImport[] {
  const db = getDb();
  return db.prepare('SELECT * FROM etsy_imports ORDER BY created_at DESC').all() as EtsyImport[];
}

export function getEtsyImport(id: number): EtsyImport | undefined {
  const db = getDb();
  return db.prepare('SELECT * FROM etsy_imports WHERE id = ?').get(id) as EtsyImport | undefined;
}

export function deleteEtsyImport(id: number): boolean {
  const db = getDb();
  // CASCADE will delete related listings and keywords
  const result = db.prepare('DELETE FROM etsy_imports WHERE id = ?').run(id);
  return result.changes > 0;
}

export function clearAllEtsyImports(): number {
  const db = getDb();
  const result = db.prepare('DELETE FROM etsy_imports').run();
  return result.changes;
}

export function saveImportListings(importId: number, listings: Record<string, unknown>[]): { inserted: number; deduped: number } {
  const db = getDb();
  const stmt = db.prepare(`
    INSERT OR IGNORE INTO etsy_import_listings
    (import_id, listing_id, url, title, shop_name, price, currency, rating, reviews, favorites,
     is_bestseller, is_etsy_pick, tags, category, source_keyword, listing_age_days, listing_age_source,
     views_24h, daily_sales, weekly_sales, monthly_sales, revenue_estimate, total_revenue,
     demand_score, opportunity_score, velocity_score, monthly_trend, confidence, classification, scanned_at,
     shop_url, original_price, is_star_seller, description_raw, description_sections,
     image_count, image_urls, has_video, digital_file_types,
     description_quality_score, image_quality_score, trust_score, feature_density, moat_score, review_signals,
     winner_tier, winner_score)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?,
            ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  let inserted = 0;
  let deduped = 0;
  const insertMany = db.transaction((items: Record<string, unknown>[]) => {
    for (const l of items) {
      const result = stmt.run(
        importId, l.listing_id || null, l.url, l.title, l.shop_name || null,
        l.price || 0, l.currency || 'USD', l.rating || 0, l.reviews || 0, l.favorites || 0,
        l.is_bestseller ? 1 : 0, l.is_etsy_pick ? 1 : 0,
        typeof l.tags === 'string' ? l.tags : JSON.stringify(l.tags || []),
        l.category || null, l.source_keyword || null,
        l.listing_age_days ?? null, l.listing_age_source || null,
        l.views_24h ?? null, l.daily_sales ?? null, l.weekly_sales ?? null,
        l.monthly_sales ?? null, l.revenue_estimate ?? null, l.total_revenue ?? null,
        l.demand_score ?? null, l.opportunity_score ?? null, l.velocity_score ?? null,
        l.monthly_trend || null, l.confidence || null, l.classification || null,
        l.scanned_at || new Date().toISOString(),
        // Phase 1 enhanced fields
        l.shop_url || null, l.original_price ?? null, l.is_star_seller ? 1 : 0,
        typeof l.description_raw === 'string' ? (l.description_raw as string).slice(0, 5000) : null,
        typeof l.description_sections === 'string' ? l.description_sections : (l.description_sections ? JSON.stringify(l.description_sections) : null),
        l.image_count ?? 0, typeof l.image_urls === 'string' ? l.image_urls : (l.image_urls ? JSON.stringify(l.image_urls) : null),
        l.has_video ? 1 : 0,
        typeof l.digital_file_types === 'string' ? l.digital_file_types : (l.digital_file_types ? JSON.stringify(l.digital_file_types) : null),
        l.description_quality_score ?? 0, l.image_quality_score ?? 0,
        l.trust_score ?? 0, l.feature_density ?? 0, l.moat_score ?? 0,
        typeof l.review_signals === 'string' ? l.review_signals : (l.review_signals ? JSON.stringify(l.review_signals) : null),
        l.winner_tier || null, l.winner_score ?? 0
      );
      if (result.changes > 0) inserted++;
      else deduped++;
    }
  });
  insertMany(listings);
  return { inserted, deduped };
}

export function saveImportKeywords(importId: number, keywords: Record<string, unknown>[]): { inserted: number; deduped: number } {
  const db = getDb();
  const stmt = db.prepare(`
    INSERT OR IGNORE INTO etsy_import_keywords
    (import_id, keyword, frequency, cluster_id, classification, demand_score,
     avg_price, avg_favorites, competition_level, listings_count, scanned_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  let inserted = 0;
  let deduped = 0;
  const insertMany = db.transaction((items: Record<string, unknown>[]) => {
    for (const k of items) {
      const result = stmt.run(
        importId, k.keyword, k.frequency || 1, k.cluster_id || null,
        k.classification || null, k.demand_score || 0,
        k.avg_price || 0, k.avg_favorites || 0,
        k.competition_level || null, k.listings_count || 0,
        k.scanned_at || new Date().toISOString()
      );
      if (result.changes > 0) inserted++;
      else deduped++;
    }
  });
  insertMany(keywords);
  return { inserted, deduped };
}

export function getImportListings(importId?: number, sortBy?: string): EtsyImportListing[] {
  const db = getDb();
  const col = sortBy === 'price' ? 'price' : sortBy === 'revenue' ? 'revenue_estimate' : sortBy === 'demand' ? 'demand_score' : 'favorites';
  if (importId) {
    return db.prepare(`SELECT * FROM etsy_import_listings WHERE import_id = ? ORDER BY ${col} DESC`).all(importId) as EtsyImportListing[];
  }
  return db.prepare(`SELECT * FROM etsy_import_listings ORDER BY ${col} DESC LIMIT 500`).all() as EtsyImportListing[];
}

export function getImportKeywords(importId?: number): EtsyImportKeyword[] {
  const db = getDb();
  if (importId) {
    return db.prepare('SELECT * FROM etsy_import_keywords WHERE import_id = ? ORDER BY demand_score DESC').all(importId) as EtsyImportKeyword[];
  }
  return db.prepare('SELECT * FROM etsy_import_keywords ORDER BY demand_score DESC LIMIT 500').all() as EtsyImportKeyword[];
}

// --- Opportunities ---

export function createOpportunity(data: {
  import_id?: number; title: string; core_keywords?: string[]; tag_set?: string[];
  niche?: string; category?: string; market_signals?: Record<string, unknown>;
  opportunity_score?: number; status?: string;
}): Opportunity {
  const db = getDb();
  const result = db.prepare(`
    INSERT INTO opportunities (import_id, title, core_keywords, tag_set, niche, category, market_signals, opportunity_score, status)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    data.import_id || null, data.title,
    data.core_keywords ? JSON.stringify(data.core_keywords) : null,
    data.tag_set ? JSON.stringify(data.tag_set) : null,
    data.niche || null, data.category || null,
    data.market_signals ? JSON.stringify(data.market_signals) : null,
    data.opportunity_score || 0, data.status || 'new'
  );
  return getOpportunity(result.lastInsertRowid as number)!;
}

export function getOpportunities(status?: string): Opportunity[] {
  const db = getDb();
  if (status) {
    return db.prepare('SELECT * FROM opportunities WHERE status = ? ORDER BY opportunity_score DESC').all(status) as Opportunity[];
  }
  return db.prepare('SELECT * FROM opportunities ORDER BY opportunity_score DESC').all() as Opportunity[];
}

export function getOpportunity(id: number): Opportunity | undefined {
  const db = getDb();
  return db.prepare('SELECT * FROM opportunities WHERE id = ?').get(id) as Opportunity | undefined;
}

export function updateOpportunity(id: number, data: Partial<Omit<Opportunity, 'id' | 'created_at'>>): Opportunity | undefined {
  const db = getDb();
  const fields: string[] = ['updated_at = CURRENT_TIMESTAMP'];
  const values: unknown[] = [];
  for (const [key, value] of Object.entries(data)) {
    if (key === 'id' || key === 'created_at') continue;
    fields.push(`${key} = ?`);
    if (['core_keywords', 'tag_set', 'market_signals', 'deliverables', 'listing_plan'].includes(key) && typeof value === 'object') {
      values.push(JSON.stringify(value));
    } else {
      values.push(value);
    }
  }
  values.push(id);
  db.prepare(`UPDATE opportunities SET ${fields.join(', ')} WHERE id = ?`).run(...values);
  return getOpportunity(id);
}

export function deleteOpportunity(id: number): boolean {
  const db = getDb();
  const result = db.prepare('DELETE FROM opportunities WHERE id = ?').run(id);
  return result.changes > 0;
}

/** Get a single import listing by its row ID */
export function getImportListingById(id: number): EtsyImportListing | undefined {
  const db = getDb();
  return db.prepare('SELECT * FROM etsy_import_listings WHERE id = ?').get(id) as EtsyImportListing | undefined;
}

/** Get a single import listing by its Etsy listing_id string */
export function getImportListingByListingId(listingId: string): EtsyImportListing | undefined {
  const db = getDb();
  return db.prepare('SELECT * FROM etsy_import_listings WHERE listing_id = ?').get(listingId) as EtsyImportListing | undefined;
}

/** Find an existing opportunity that matches a listing's source_keyword */
export function findOpportunityByListing(listingId: string, importId: number): Opportunity | undefined {
  const db = getDb();
  // Get the listing's keyword
  const listing = db.prepare('SELECT source_keyword FROM etsy_import_listings WHERE listing_id = ? AND import_id = ?')
    .get(listingId, importId) as { source_keyword: string } | undefined;
  if (!listing?.source_keyword) return undefined;
  // Find opportunity whose core_keywords includes this keyword
  const opps = db.prepare('SELECT * FROM opportunities WHERE import_id = ? ORDER BY opportunity_score DESC')
    .all(importId) as Opportunity[];
  for (const opp of opps) {
    const keywords: string[] = opp.core_keywords ? JSON.parse(opp.core_keywords) : [];
    if (keywords.includes(listing.source_keyword)) return opp;
  }
  return undefined;
}

export function getStats(): { total: number; listed: number; byType: Record<string, number> } {
  const db = getDb();
  const total = (db.prepare('SELECT COUNT(*) as count FROM products').get() as { count: number }).count;
  const listed = (db.prepare("SELECT COUNT(*) as count FROM products WHERE etsy_listing_id IS NOT NULL").get() as { count: number }).count;

  const typeRows = db.prepare('SELECT type, COUNT(*) as count FROM products GROUP BY type').all() as { type: string; count: number }[];
  const byType: Record<string, number> = {};
  for (const row of typeRows) {
    byType[row.type] = row.count;
  }

  return { total, listed, byType };
}

// --- POD Products ---

export interface PodProduct {
  id: number;
  product_id: number;
  printify_product_id: string | null;
  printify_shop_id: string | null;
  blueprint_id: number;
  print_provider_id: number;
  category: string | null;
  variants: string | null;
  design_image_id: string | null;
  base_cost: number;
  retail_price: number;
  publish_status: string;
  external_id: string | null;
  created_at: string;
}

export function createPodProduct(data: {
  product_id: number;
  printify_product_id?: string;
  printify_shop_id?: string;
  blueprint_id: number;
  print_provider_id: number;
  category?: string;
  variants?: unknown[];
  design_image_id?: string;
  base_cost: number;
  retail_price: number;
}): PodProduct {
  const db = getDb();
  const result = db.prepare(`
    INSERT INTO pod_products (product_id, printify_product_id, printify_shop_id, blueprint_id, print_provider_id, category, variants, design_image_id, base_cost, retail_price)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    data.product_id,
    data.printify_product_id || null,
    data.printify_shop_id || null,
    data.blueprint_id,
    data.print_provider_id,
    data.category || null,
    data.variants ? JSON.stringify(data.variants) : null,
    data.design_image_id || null,
    data.base_cost,
    data.retail_price
  );
  return db.prepare('SELECT * FROM pod_products WHERE id = ?').get(result.lastInsertRowid as number) as PodProduct;
}

export function getPodProducts(): PodProduct[] {
  const db = getDb();
  return db.prepare('SELECT * FROM pod_products ORDER BY created_at DESC').all() as PodProduct[];
}

export function getPodProduct(id: number): PodProduct | undefined {
  const db = getDb();
  return db.prepare('SELECT * FROM pod_products WHERE id = ?').get(id) as PodProduct | undefined;
}

export function updatePodProduct(id: number, data: Partial<Omit<PodProduct, 'id' | 'created_at'>>): PodProduct | undefined {
  const db = getDb();
  const fields: string[] = [];
  const values: unknown[] = [];
  for (const [key, value] of Object.entries(data)) {
    fields.push(`${key} = ?`);
    if (key === 'variants' && Array.isArray(value)) {
      values.push(JSON.stringify(value));
    } else {
      values.push(value);
    }
  }
  if (fields.length === 0) return getPodProduct(id);
  values.push(id);
  db.prepare(`UPDATE pod_products SET ${fields.join(', ')} WHERE id = ?`).run(...values);
  return getPodProduct(id);
}

// --- Studio Projects ---

export interface StudioProjectRow {
  id: string;
  keyword: string;
  design_mode: string;
  current_step: string;
  step_statuses: string | null;
  niche_analysis: string | null;
  product_configs: string | null;
  listings: string | null;
  printful_products: string | null;
  etsy_listings: string | null;
  status: string;
  created_at: string;
  updated_at: string;
}

export interface StudioDesignRow {
  id: string;
  project_id: string;
  mode: string;
  phrase: string | null;
  style_preset: string | null;
  data_url: string | null;
  width: number;
  height: number;
  selected: number;
  starred: number;
  created_at: string;
}

export function saveStudioProject(project: {
  id: string;
  keyword: string;
  design_mode: string;
  current_step: string;
  step_statuses?: Record<string, string>;
  niche_analysis?: unknown;
  product_configs?: unknown[];
  listings?: unknown[];
  printful_products?: unknown[];
  etsy_listings?: unknown[];
  status?: string;
}): void {
  const db = getDb();
  db.prepare(`
    INSERT OR REPLACE INTO studio_projects
    (id, keyword, design_mode, current_step, step_statuses, niche_analysis,
     product_configs, listings, printful_products, etsy_listings, status, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
  `).run(
    project.id,
    project.keyword,
    project.design_mode,
    project.current_step,
    project.step_statuses ? JSON.stringify(project.step_statuses) : null,
    project.niche_analysis ? JSON.stringify(project.niche_analysis) : null,
    project.product_configs ? JSON.stringify(project.product_configs) : null,
    project.listings ? JSON.stringify(project.listings) : null,
    project.printful_products ? JSON.stringify(project.printful_products) : null,
    project.etsy_listings ? JSON.stringify(project.etsy_listings) : null,
    project.status || 'draft'
  );
}

export function getStudioProject(id: string): StudioProjectRow | undefined {
  const db = getDb();
  return db.prepare('SELECT * FROM studio_projects WHERE id = ?').get(id) as StudioProjectRow | undefined;
}

export function getAllStudioProjects(): StudioProjectRow[] {
  const db = getDb();
  return db.prepare('SELECT * FROM studio_projects ORDER BY updated_at DESC LIMIT 100').all() as StudioProjectRow[];
}

export function deleteStudioProject(id: string): boolean {
  const db = getDb();
  const result = db.prepare('DELETE FROM studio_projects WHERE id = ?').run(id);
  return result.changes > 0;
}

export function saveStudioDesigns(projectId: string, designs: {
  id: string;
  mode: string;
  phrase?: string;
  style_preset?: string;
  data_url: string;
  width: number;
  height: number;
  selected: boolean;
  starred: boolean;
}[]): void {
  const db = getDb();
  // Clear existing designs for this project
  db.prepare('DELETE FROM studio_designs WHERE project_id = ?').run(projectId);

  const stmt = db.prepare(`
    INSERT INTO studio_designs (id, project_id, mode, phrase, style_preset, data_url, width, height, selected, starred)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  const insertMany = db.transaction((items: typeof designs) => {
    for (const d of items) {
      stmt.run(d.id, projectId, d.mode, d.phrase || null, d.style_preset || null, d.data_url, d.width, d.height, d.selected ? 1 : 0, d.starred ? 1 : 0);
    }
  });
  insertMany(designs);
}

export function getStudioDesigns(projectId: string): StudioDesignRow[] {
  const db = getDb();
  return db.prepare('SELECT * FROM studio_designs WHERE project_id = ? ORDER BY created_at ASC').all(projectId) as StudioDesignRow[];
}

// ══════════════════════════════════════════════════════════════
// Digital Product Studio: Projects + Assets CRUD
// ══════════════════════════════════════════════════════════════

export interface DigitalProjectRow {
  id: string;
  project_name: string;
  product_type: string;
  status: string;
  current_step: string;
  step_statuses: string | null;
  inspiration: string | null;
  config: string | null;
  generation: string | null;
  preview: string | null;
  listing: string | null;
  publish: string | null;
  quality_score: string | null;
  batch_meta: string | null;
  import_source: string | null;
  created_at: string;
  updated_at: string;
}

export interface DigitalAssetRow {
  id: string;
  project_id: string;
  file_name: string;
  mime_type: string;
  file_size_bytes: number;
  asset_type: string;
  storage_path: string;
  created_at: string;
}

export function saveDigitalProject(project: {
  id: string;
  project_name: string;
  product_type: string;
  status: string;
  current_step: string;
  step_statuses?: Record<string, string>;
  inspiration?: unknown;
  config?: unknown;
  generation?: unknown;
  preview?: unknown;
  listing?: unknown;
  publish?: unknown;
  quality_score?: unknown;
  batch_meta?: unknown;
  import_source?: unknown;
}): void {
  const db = getDb();
  db.prepare(`
    INSERT OR REPLACE INTO digital_projects
    (id, project_name, product_type, status, current_step, step_statuses,
     inspiration, config, generation, preview, listing, publish, quality_score, batch_meta, import_source, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
  `).run(
    project.id,
    project.project_name,
    project.product_type,
    project.status,
    project.current_step,
    project.step_statuses ? JSON.stringify(project.step_statuses) : null,
    project.inspiration ? JSON.stringify(project.inspiration) : null,
    project.config ? JSON.stringify(project.config) : null,
    project.generation ? JSON.stringify(project.generation) : null,
    project.preview ? JSON.stringify(project.preview) : null,
    project.listing ? JSON.stringify(project.listing) : null,
    project.publish ? JSON.stringify(project.publish) : null,
    project.quality_score ? JSON.stringify(project.quality_score) : null,
    project.batch_meta ? JSON.stringify(project.batch_meta) : null,
    project.import_source ? JSON.stringify(project.import_source) : null,
  );
}

export function getDigitalProject(id: string): DigitalProjectRow | undefined {
  const db = getDb();
  return db.prepare('SELECT * FROM digital_projects WHERE id = ?').get(id) as DigitalProjectRow | undefined;
}

export function getAllDigitalProjects(productType?: string): DigitalProjectRow[] {
  const db = getDb();
  if (productType) {
    return db.prepare('SELECT * FROM digital_projects WHERE product_type = ? ORDER BY updated_at DESC LIMIT 200')
      .all(productType) as DigitalProjectRow[];
  }
  return db.prepare('SELECT * FROM digital_projects ORDER BY updated_at DESC LIMIT 200').all() as DigitalProjectRow[];
}

export function deleteDigitalProject(id: string): boolean {
  const db = getDb();
  const result = db.prepare('DELETE FROM digital_projects WHERE id = ?').run(id);
  return result.changes > 0;
}

export function saveDigitalAsset(asset: {
  id: string;
  project_id: string;
  file_name: string;
  mime_type: string;
  file_size_bytes: number;
  asset_type: string;
  storage_path: string;
}): void {
  const db = getDb();
  db.prepare(`
    INSERT OR REPLACE INTO digital_assets
    (id, project_id, file_name, mime_type, file_size_bytes, asset_type, storage_path)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(
    asset.id, asset.project_id, asset.file_name,
    asset.mime_type, asset.file_size_bytes, asset.asset_type, asset.storage_path,
  );
}

export function getDigitalAssets(projectId: string, assetType?: string): DigitalAssetRow[] {
  const db = getDb();
  if (assetType) {
    return db.prepare('SELECT * FROM digital_assets WHERE project_id = ? AND asset_type = ? ORDER BY created_at ASC')
      .all(projectId, assetType) as DigitalAssetRow[];
  }
  return db.prepare('SELECT * FROM digital_assets WHERE project_id = ? ORDER BY created_at ASC')
    .all(projectId) as DigitalAssetRow[];
}

export function getDigitalAsset(id: string): DigitalAssetRow | undefined {
  const db = getDb();
  return db.prepare('SELECT * FROM digital_assets WHERE id = ?').get(id) as DigitalAssetRow | undefined;
}

export function deleteDigitalAssets(projectId: string): void {
  const db = getDb();
  db.prepare('DELETE FROM digital_assets WHERE project_id = ?').run(projectId);
}

// ── Factory Runs ──────────────────────────────────────────────────────────
// Persistence layer for the factory-orchestrator pipeline (keyword pick →
// blueprint → images → package).  CREATE TABLE for factory_runs lives in
// initSchema() above so a fresh install ships with the table.  Existing
// installs pick the table up the first time getDb() runs after this
// change (CREATE TABLE IF NOT EXISTS is a no-op once it exists).

export function createFactoryRun(data: {
  id: string;
  keywords?: string[];
  opportunityId?: number;
  selectedListingId?: string;
}): void {
  const db = getDb();
  db.prepare(`
    INSERT OR IGNORE INTO factory_runs (id, keywords, opportunity_id, selected_listing_id, status)
    VALUES (?, ?, ?, ?, 'pending')
  `).run(
    data.id,
    data.keywords ? JSON.stringify(data.keywords) : null,
    data.opportunityId ?? null,
    data.selectedListingId ?? null,
  );
}

export function createFactoryBlueprint(data: {
  id: string;
  factoryRunId?: string;
  opportunityId?: number;
  sourceListingTitle?: string;
  sourceListingDescription?: string;
  productType?: string;
  config?: string;
  competitorStrengths?: string;
  competitorWeaknesses?: string;
  competitorFeatures?: string;
  differentiationStrategy?: string;
  listingStrategy?: string;
  suggestedPrice?: number;
  positioning?: string;
  tabs?: string;
  charts?: string;
  colorScheme?: string;
  sampleData?: string;
  deliveryMethod?: string;
  conceptSpec?: string;
  structureSpec?: string;
  visualDirection?: string;
  videoDirection?: string;
  listingPositioning?: string;
  copyDirection?: string;
}): void {
  const db = getDb();
  db.prepare(`
    INSERT OR REPLACE INTO factory_blueprints (
      id, factory_run_id, opportunity_id, source_listing_title, source_listing_description, product_type,
      config, competitor_strengths, competitor_weaknesses, competitor_features, differentiation_strategy, listing_strategy,
      suggested_price, positioning, tabs, charts, color_scheme, sample_data, delivery_method,
      concept_spec, structure_spec, visual_direction, video_direction, listing_positioning, copy_direction
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    data.id,
    data.factoryRunId ?? null,
    data.opportunityId ?? null,
    data.sourceListingTitle ?? null,
    data.sourceListingDescription ?? null,
    data.productType ?? null,
    data.config ?? null,
    data.competitorStrengths ?? null,
    data.competitorWeaknesses ?? null,
    data.competitorFeatures ?? null,
    data.differentiationStrategy ?? null,
    data.listingStrategy ?? null,
    data.suggestedPrice ?? null,
    data.positioning ?? null,
    data.tabs ?? null,
    data.charts ?? null,
    data.colorScheme ?? null,
    data.sampleData ?? null,
    data.deliveryMethod ?? null,
    data.conceptSpec ?? null,
    data.structureSpec ?? null,
    data.visualDirection ?? null,
    data.videoDirection ?? null,
    data.listingPositioning ?? null,
    data.copyDirection ?? null,
  );
}

export function getFactoryBlueprint(id: string): Record<string, unknown> | undefined {
  const db = getDb();
  return db.prepare("SELECT * FROM factory_blueprints WHERE id = ?").get(id) as
    | Record<string, unknown>
    | undefined;
}

export function updateFactoryRun(
  id: string,
  updates: {
    status?: string;
    blueprintId?: string;
    projectId?: string;
    listingImages?: string[];
    deliveryPdfAssetId?: string;
    listingCopy?: unknown;
    imagePlan?: unknown;
    packageAssetId?: string | null;
    reviewStatus?: string | null;
    reviewScorecard?: unknown;
    reviewedAt?: string;
    etsyListingId?: string | number | null;
    etsyListingUrl?: string | null;
    etsyStatus?: string;
    publishedAt?: string;
    googleSheetId?: string | null;
    geminiSheetSpec?: unknown;
    engineLog?: unknown[];
    errorMessage?: string;
    startedAt?: string;
    completedAt?: string;
    [key: string]: unknown;
  }
): void {
  const db = getDb();
  const setClauses: string[] = [];
  const params: unknown[] = [];

  if (updates.status !== undefined)              { setClauses.push("status = ?");                params.push(updates.status); }
  if (updates.blueprintId !== undefined)         { setClauses.push("blueprint_id = ?");          params.push(updates.blueprintId); }
  if (updates.projectId !== undefined)           { setClauses.push("project_id = ?");            params.push(updates.projectId); }
  if (updates.listingImages !== undefined)       { setClauses.push("listing_images = ?");        params.push(JSON.stringify(updates.listingImages)); }
  if (updates.deliveryPdfAssetId !== undefined)  { setClauses.push("delivery_pdf_asset_id = ?"); params.push(updates.deliveryPdfAssetId); }
  if (updates.listingCopy !== undefined)         { setClauses.push("listing_copy = ?");          params.push(typeof updates.listingCopy === "string" ? updates.listingCopy : JSON.stringify(updates.listingCopy)); }
  if (updates.imagePlan !== undefined)           { setClauses.push("image_plan = ?");            params.push(typeof updates.imagePlan === "string" ? updates.imagePlan : JSON.stringify(updates.imagePlan)); }
  if (updates.packageAssetId !== undefined)      { setClauses.push("package_asset_id = ?");      params.push(updates.packageAssetId); }
  if (updates.reviewStatus !== undefined)        { setClauses.push("review_status = ?");         params.push(updates.reviewStatus); }
  if (updates.reviewScorecard !== undefined)     { setClauses.push("review_scorecard = ?");      params.push(typeof updates.reviewScorecard === "string" ? updates.reviewScorecard : JSON.stringify(updates.reviewScorecard)); }
  if (updates.reviewedAt !== undefined)          { setClauses.push("reviewed_at = ?");           params.push(updates.reviewedAt); }
  if (updates.etsyListingId !== undefined)       { setClauses.push("etsy_listing_id = ?");       params.push(updates.etsyListingId == null ? null : String(updates.etsyListingId)); }
  if (updates.etsyListingUrl !== undefined)      { setClauses.push("etsy_listing_url = ?");      params.push(updates.etsyListingUrl); }
  if (updates.etsyStatus !== undefined)          { setClauses.push("etsy_status = ?");           params.push(updates.etsyStatus); }
  if (updates.publishedAt !== undefined)         { setClauses.push("published_at = ?");          params.push(updates.publishedAt); }
  if (updates.googleSheetId !== undefined)       { setClauses.push("google_sheet_id = ?");       params.push(updates.googleSheetId); }
  if (updates.geminiSheetSpec !== undefined)     { setClauses.push("gemini_sheet_spec = ?");     params.push(typeof updates.geminiSheetSpec === "string" ? updates.geminiSheetSpec : JSON.stringify(updates.geminiSheetSpec)); }
  if (updates.engineLog !== undefined)           { setClauses.push("engine_log = ?");            params.push(JSON.stringify(updates.engineLog)); }
  if (updates.errorMessage !== undefined)        { setClauses.push("error_message = ?");         params.push(updates.errorMessage); }
  if (updates.startedAt !== undefined)           { setClauses.push("started_at = ?");            params.push(updates.startedAt); }
  if (updates.completedAt !== undefined)         { setClauses.push("completed_at = ?");          params.push(updates.completedAt); }

  if (setClauses.length === 0) return;
  params.push(id);
  db.prepare(`UPDATE factory_runs SET ${setClauses.join(", ")} WHERE id = ?`).run(...params);
}

export function getFactoryRun(id: string): Record<string, unknown> | undefined {
  const db = getDb();
  return db.prepare("SELECT * FROM factory_runs WHERE id = ?").get(id) as
    Record<string, unknown> | undefined;
}

export function getFactoryRuns(limit = 50): Record<string, unknown>[] {
  const db = getDb();
  return db
    .prepare("SELECT * FROM factory_runs ORDER BY created_at DESC LIMIT ?")
    .all(limit) as Record<string, unknown>[];
}
