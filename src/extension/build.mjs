import * as esbuild from "esbuild";

const isWatch = process.argv.includes("--watch");

const shared = {
  bundle: true,
  minify: !isWatch,
  sourcemap: isWatch ? "inline" : false,
  target: ["chrome120"],
  outdir: "public/extension/dist",
  logLevel: "info",
};

const entries = [
  // Background service worker
  { ...shared, entryPoints: ["src/extension/background.ts"] },
  // Content scripts (no React, plain TS) — current set: just the
  // Marketplace Insights scanner. The old POD scanner, Etsy form-filler,
  // Printful + Gumroad creators, and MJ image scanner were removed
  // during the extension cleanup (May 2026).
  { ...shared, entryPoints: ["src/extension/content/marketplace-insights-scanner.ts"] },
  // Popup (React)
  { ...shared, entryPoints: ["src/extension/popup/index.tsx"], jsx: "automatic" },
];

async function build() {
  if (isWatch) {
    console.log("👀 Watching extension files for changes...");
    for (const config of entries) {
      const ctx = await esbuild.context(config);
      await ctx.watch();
    }
  } else {
    for (const config of entries) {
      await esbuild.build(config);
    }
    console.log("✅ Extension built → public/extension/dist/");
  }
}

build().catch((err) => {
  console.error("Extension build failed:", err);
  process.exit(1);
});
