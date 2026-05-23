import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Local agent worktrees, snapshots, generated bundles, and product output.
    ".claude/**",
    "backups/**",
    "data/**",
    "logs/**",
    "etsy-keyword-research/**",
    "public/extension/dist/**",
    "public/factory-videos/**",
    "public/listing-video.mp4",
    "public/mockup-templates/**",
    "public/video-assets/**",
    "pattern-engine/.venv/**",
  ]),
  {
    rules: {
      "@typescript-eslint/no-explicit-any": "off",
      "@typescript-eslint/no-require-imports": "off",
      "react-hooks/set-state-in-effect": "off",
      "react/no-unescaped-entities": "off",
    },
  },
]);

export default eslintConfig;
