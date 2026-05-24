// ── PDF Design Styles ──
// 10 visual style variants that control how planner layouts are rendered.
// Each style defines header, section, border, checkbox, divider, spacing,
// and decorative parameters. The jsPDF route reads these to produce
// visually distinct planners from the same content structure.

export interface DesignStyle {
  id: string;
  name: string;
  description: string;

  header: {
    height: number;
    cornerRadius: number;
    hasBottomLine: boolean;
    titleTransform: "uppercase" | "capitalize" | "none";
    titleFontSize: number;
    subtitleFontSize: number;
    fontStyle: "bold" | "normal";
  };

  section: {
    titleBarHeight: number;
    titleBarRadius: number;
    bodyRadius: number;
    bodyBorderWidth: number;
    bodyBorderStyle: "solid" | "dashed" | "dotted" | "none";
    titleFontSize: number;
    titleTransform: "uppercase" | "capitalize" | "none";
    hasShadow: boolean;
  };

  borders: {
    lineWidth: number;
    lineStyle: "solid" | "dashed" | "dotted";
    cornerRadius: number;
    tableBorderWidth: number;
  };

  checkbox: {
    style: "square" | "rounded" | "circle" | "bullet";
    size: number;
    lineWidth: number;
  };

  divider: {
    style: "line" | "dots" | "dashes" | "ornamental" | "none";
    thickness: number;
  };

  spacing: {
    sectionGap: number;
    innerPadding: number;
    margin: number;
    lineSpacing: number;
  };

  decorative: {
    coverStyle: "block" | "centered" | "frame" | "minimal" | "full-bleed";
    hasCornerAccents: boolean;
    hasDotDividers: boolean;
    headerBgStyle: "solid" | "gradient-hint" | "none";
    footerStyle: "bar" | "line" | "minimal";
    tableHeaderStyle: "filled" | "underline" | "bordered";
    alternateRowShading: boolean;
  };
}

// ── The 10 Named Design Styles ──

export const DESIGN_STYLES: Record<string, DesignStyle> = {
  "modern-minimal": {
    id: "modern-minimal",
    name: "Modern Minimal",
    description: "Clean lines, lots of white space, thin borders",
    header: { height: 18, cornerRadius: 0, hasBottomLine: true, titleTransform: "uppercase", titleFontSize: 13, subtitleFontSize: 9, fontStyle: "bold" },
    section: { titleBarHeight: 6, titleBarRadius: 0, bodyRadius: 0, bodyBorderWidth: 0.1, bodyBorderStyle: "solid", titleFontSize: 7, titleTransform: "uppercase", hasShadow: false },
    borders: { lineWidth: 0.1, lineStyle: "solid", cornerRadius: 0, tableBorderWidth: 0.1 },
    checkbox: { style: "square", size: 3, lineWidth: 0.2 },
    divider: { style: "line", thickness: 0.1 },
    spacing: { sectionGap: 5, innerPadding: 3, margin: 18, lineSpacing: 6 },
    decorative: { coverStyle: "minimal", hasCornerAccents: false, hasDotDividers: false, headerBgStyle: "solid", footerStyle: "minimal", tableHeaderStyle: "underline", alternateRowShading: false },
  },

  "classic-elegant": {
    id: "classic-elegant",
    name: "Classic Elegant",
    description: "Ornamental dividers, structured grids, timeless feel",
    header: { height: 24, cornerRadius: 0, hasBottomLine: false, titleTransform: "capitalize", titleFontSize: 16, subtitleFontSize: 10, fontStyle: "bold" },
    section: { titleBarHeight: 8, titleBarRadius: 0, bodyRadius: 0, bodyBorderWidth: 0.4, bodyBorderStyle: "solid", titleFontSize: 8, titleTransform: "capitalize", hasShadow: false },
    borders: { lineWidth: 0.3, lineStyle: "solid", cornerRadius: 0, tableBorderWidth: 0.3 },
    checkbox: { style: "square", size: 3.5, lineWidth: 0.3 },
    divider: { style: "ornamental", thickness: 0.3 },
    spacing: { sectionGap: 6, innerPadding: 4, margin: 16, lineSpacing: 6.5 },
    decorative: { coverStyle: "frame", hasCornerAccents: true, hasDotDividers: true, headerBgStyle: "solid", footerStyle: "line", tableHeaderStyle: "filled", alternateRowShading: true },
  },

  "boho-creative": {
    id: "boho-creative",
    name: "Boho Creative",
    description: "Rounded corners, organic shapes, decorative borders",
    header: { height: 22, cornerRadius: 6, hasBottomLine: false, titleTransform: "capitalize", titleFontSize: 15, subtitleFontSize: 9, fontStyle: "bold" },
    section: { titleBarHeight: 7, titleBarRadius: 4, bodyRadius: 4, bodyBorderWidth: 0.3, bodyBorderStyle: "dashed", titleFontSize: 8, titleTransform: "capitalize", hasShadow: false },
    borders: { lineWidth: 0.2, lineStyle: "dashed", cornerRadius: 4, tableBorderWidth: 0.2 },
    checkbox: { style: "circle", size: 3.5, lineWidth: 0.3 },
    divider: { style: "dots", thickness: 0.4 },
    spacing: { sectionGap: 5, innerPadding: 4, margin: 15, lineSpacing: 6 },
    decorative: { coverStyle: "centered", hasCornerAccents: false, hasDotDividers: true, headerBgStyle: "solid", footerStyle: "minimal", tableHeaderStyle: "bordered", alternateRowShading: false },
  },

  "corporate-pro": {
    id: "corporate-pro",
    name: "Corporate Pro",
    description: "Sharp edges, bold headers, business-style tables",
    header: { height: 20, cornerRadius: 0, hasBottomLine: false, titleTransform: "uppercase", titleFontSize: 14, subtitleFontSize: 10, fontStyle: "bold" },
    section: { titleBarHeight: 7, titleBarRadius: 0, bodyRadius: 0, bodyBorderWidth: 0.5, bodyBorderStyle: "solid", titleFontSize: 8, titleTransform: "uppercase", hasShadow: true },
    borders: { lineWidth: 0.4, lineStyle: "solid", cornerRadius: 0, tableBorderWidth: 0.4 },
    checkbox: { style: "square", size: 3.5, lineWidth: 0.4 },
    divider: { style: "line", thickness: 0.4 },
    spacing: { sectionGap: 4, innerPadding: 3, margin: 14, lineSpacing: 5.5 },
    decorative: { coverStyle: "block", hasCornerAccents: false, hasDotDividers: false, headerBgStyle: "solid", footerStyle: "bar", tableHeaderStyle: "filled", alternateRowShading: true },
  },

  "pastel-soft": {
    id: "pastel-soft",
    name: "Pastel Soft",
    description: "Rounded soft boxes, gentle tones, playful layout",
    header: { height: 22, cornerRadius: 8, hasBottomLine: false, titleTransform: "capitalize", titleFontSize: 14, subtitleFontSize: 9, fontStyle: "bold" },
    section: { titleBarHeight: 7, titleBarRadius: 6, bodyRadius: 6, bodyBorderWidth: 0.2, bodyBorderStyle: "solid", titleFontSize: 8, titleTransform: "capitalize", hasShadow: false },
    borders: { lineWidth: 0.15, lineStyle: "solid", cornerRadius: 6, tableBorderWidth: 0.15 },
    checkbox: { style: "rounded", size: 3.5, lineWidth: 0.2 },
    divider: { style: "dots", thickness: 0.3 },
    spacing: { sectionGap: 5, innerPadding: 4, margin: 16, lineSpacing: 6 },
    decorative: { coverStyle: "centered", hasCornerAccents: false, hasDotDividers: true, headerBgStyle: "solid", footerStyle: "minimal", tableHeaderStyle: "filled", alternateRowShading: true },
  },

  "bold-bright": {
    id: "bold-bright",
    name: "Bold & Bright",
    description: "Thick borders, large headers, high contrast sections",
    header: { height: 26, cornerRadius: 0, hasBottomLine: false, titleTransform: "uppercase", titleFontSize: 18, subtitleFontSize: 11, fontStyle: "bold" },
    section: { titleBarHeight: 9, titleBarRadius: 0, bodyRadius: 0, bodyBorderWidth: 0.8, bodyBorderStyle: "solid", titleFontSize: 9, titleTransform: "uppercase", hasShadow: true },
    borders: { lineWidth: 0.6, lineStyle: "solid", cornerRadius: 0, tableBorderWidth: 0.5 },
    checkbox: { style: "square", size: 4, lineWidth: 0.5 },
    divider: { style: "line", thickness: 0.6 },
    spacing: { sectionGap: 4, innerPadding: 3, margin: 14, lineSpacing: 6 },
    decorative: { coverStyle: "full-bleed", hasCornerAccents: false, hasDotDividers: false, headerBgStyle: "solid", footerStyle: "bar", tableHeaderStyle: "filled", alternateRowShading: false },
  },

  "vintage-journal": {
    id: "vintage-journal",
    name: "Vintage Journal",
    description: "Dotted borders, stamp aesthetics, journal feel",
    header: { height: 20, cornerRadius: 0, hasBottomLine: true, titleTransform: "capitalize", titleFontSize: 14, subtitleFontSize: 9, fontStyle: "normal" },
    section: { titleBarHeight: 7, titleBarRadius: 0, bodyRadius: 0, bodyBorderWidth: 0.3, bodyBorderStyle: "dotted", titleFontSize: 8, titleTransform: "capitalize", hasShadow: false },
    borders: { lineWidth: 0.2, lineStyle: "dotted", cornerRadius: 0, tableBorderWidth: 0.2 },
    checkbox: { style: "circle", size: 3, lineWidth: 0.2 },
    divider: { style: "dashes", thickness: 0.3 },
    spacing: { sectionGap: 5, innerPadding: 4, margin: 17, lineSpacing: 7 },
    decorative: { coverStyle: "frame", hasCornerAccents: true, hasDotDividers: true, headerBgStyle: "none", footerStyle: "line", tableHeaderStyle: "underline", alternateRowShading: false },
  },

  "clean-grid": {
    id: "clean-grid",
    name: "Clean Grid",
    description: "Mathematical grid, aligned sections, systematic layout",
    header: { height: 18, cornerRadius: 0, hasBottomLine: true, titleTransform: "uppercase", titleFontSize: 12, subtitleFontSize: 9, fontStyle: "bold" },
    section: { titleBarHeight: 6, titleBarRadius: 0, bodyRadius: 0, bodyBorderWidth: 0.3, bodyBorderStyle: "solid", titleFontSize: 7, titleTransform: "uppercase", hasShadow: false },
    borders: { lineWidth: 0.25, lineStyle: "solid", cornerRadius: 0, tableBorderWidth: 0.25 },
    checkbox: { style: "square", size: 3.5, lineWidth: 0.25 },
    divider: { style: "line", thickness: 0.25 },
    spacing: { sectionGap: 4, innerPadding: 3, margin: 15, lineSpacing: 5.5 },
    decorative: { coverStyle: "minimal", hasCornerAccents: false, hasDotDividers: false, headerBgStyle: "solid", footerStyle: "line", tableHeaderStyle: "bordered", alternateRowShading: true },
  },

  "artistic-watercolor": {
    id: "artistic-watercolor",
    name: "Artistic Watercolor",
    description: "Gradient fills, flowing sections, artistic feel",
    header: { height: 24, cornerRadius: 4, hasBottomLine: false, titleTransform: "capitalize", titleFontSize: 16, subtitleFontSize: 10, fontStyle: "bold" },
    section: { titleBarHeight: 8, titleBarRadius: 3, bodyRadius: 3, bodyBorderWidth: 0.2, bodyBorderStyle: "solid", titleFontSize: 8, titleTransform: "capitalize", hasShadow: false },
    borders: { lineWidth: 0.15, lineStyle: "solid", cornerRadius: 3, tableBorderWidth: 0.15 },
    checkbox: { style: "circle", size: 3.5, lineWidth: 0.2 },
    divider: { style: "ornamental", thickness: 0.3 },
    spacing: { sectionGap: 6, innerPadding: 4, margin: 16, lineSpacing: 6.5 },
    decorative: { coverStyle: "centered", hasCornerAccents: true, hasDotDividers: true, headerBgStyle: "gradient-hint", footerStyle: "minimal", tableHeaderStyle: "filled", alternateRowShading: true },
  },

  "luxe-gold": {
    id: "luxe-gold",
    name: "Luxe Gold",
    description: "Premium feel, accent borders, elegant spacing",
    header: { height: 22, cornerRadius: 2, hasBottomLine: true, titleTransform: "capitalize", titleFontSize: 15, subtitleFontSize: 10, fontStyle: "bold" },
    section: { titleBarHeight: 7, titleBarRadius: 2, bodyRadius: 2, bodyBorderWidth: 0.4, bodyBorderStyle: "solid", titleFontSize: 8, titleTransform: "capitalize", hasShadow: true },
    borders: { lineWidth: 0.3, lineStyle: "solid", cornerRadius: 2, tableBorderWidth: 0.3 },
    checkbox: { style: "rounded", size: 3.5, lineWidth: 0.3 },
    divider: { style: "ornamental", thickness: 0.4 },
    spacing: { sectionGap: 6, innerPadding: 5, margin: 18, lineSpacing: 6.5 },
    decorative: { coverStyle: "frame", hasCornerAccents: true, hasDotDividers: true, headerBgStyle: "solid", footerStyle: "line", tableHeaderStyle: "filled", alternateRowShading: true },
  },
};

// ── Style options for the frontend UI ──

export const DESIGN_STYLE_OPTIONS = [
  { id: "modern-minimal", name: "Modern Minimal", icon: "✦", desc: "Clean lines, white space, thin borders", badge: "Default" },
  { id: "classic-elegant", name: "Classic Elegant", icon: "❧", desc: "Ornamental dividers, structured grids", badge: null },
  { id: "boho-creative", name: "Boho Creative", icon: "❀", desc: "Rounded corners, organic shapes", badge: "Popular" },
  { id: "corporate-pro", name: "Corporate Pro", icon: "▤", desc: "Sharp edges, bold headers, tables", badge: null },
  { id: "pastel-soft", name: "Pastel Soft", icon: "◌", desc: "Rounded soft boxes, gentle tones", badge: null },
  { id: "bold-bright", name: "Bold & Bright", icon: "◼", desc: "Thick borders, large headers", badge: null },
  { id: "vintage-journal", name: "Vintage Journal", icon: "❝", desc: "Dotted borders, journal feel", badge: null },
  { id: "clean-grid", name: "Clean Grid", icon: "⊞", desc: "Mathematical grid, systematic", badge: null },
  { id: "artistic-watercolor", name: "Artistic Watercolor", icon: "◕", desc: "Gradient fills, flowing sections", badge: "Trending" },
  { id: "luxe-gold", name: "Luxe Gold", icon: "◆", desc: "Premium feel, accent borders", badge: null },
];
