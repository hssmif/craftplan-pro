#!/usr/bin/env node
/**
 * ══════════════════════════════════════════════════════════════
 * Etsy Listing Image Pipeline
 *
 * Generates 7 professional listing images from a Google Sheet.
 *
 * Pipeline:
 *   1. Share sheet publicly (Google Drive API)
 *   2. Capture screenshots (Playwright)
 *   3. Compose 7 listing images (Sharp + SVG)
 *
 * Usage:
 *   node scripts/etsy-image-pipeline.mjs <SHEET_URL_OR_ID> --niche wedding
 *   node scripts/etsy-image-pipeline.mjs <SHEET_URL_OR_ID> --niche budget --title "Monthly Budget Planner"
 *
 * Output:
 *   ./output/listing-images/<niche>_<timestamp>/
 *     1_hero.png
 *     2_overview.png
 *     3_detail.png
 *     4_features.png
 *     5_lifestyle.png
 *     6_included.png
 *     7_delivery.png
 * ══════════════════════════════════════════════════════════════
 */
import sharp from 'sharp';
import { chromium } from 'playwright';
import { google } from 'googleapis';
import { getAuthClient } from './gws-oauth-helper.mjs';
import { execSync } from 'child_process';
import path from 'path';
import fs from 'fs';

// ══════════════════════════════════════════════════════════════
// CONSTANTS
// ══════════════════════════════════════════════════════════════

const W = 2000;  // Etsy recommended width
const H = 1500;  // 4:3 aspect ratio

// ══════════════════════════════════════════════════════════════
// NICHE THEMES — colors, copy, features per product type
// ══════════════════════════════════════════════════════════════

const THEMES = {
  wedding: {
    primary: '#5B7553',
    primaryDark: '#3D5038',
    secondary: '#C9968E',
    secondaryLight: '#F5E6E0',
    bg: '#F7F3EE',
    card: '#FFFCF9',
    text: '#2D2A26',
    textLight: '#7A7570',
    headline: 'Wedding Budget Planner',
    tagline: 'Plan Your Dream Wedding Without the Stress',
    subtitle: 'Google Sheets Template  •  Instant Download',
    features: [
      { icon: '💰', title: 'Budget Dashboard', desc: 'Track every dollar with auto-calculating totals' },
      { icon: '👰', title: 'Guest Manager', desc: 'RSVPs, seating, dietary needs at a glance' },
      { icon: '📋', title: '12-Month Timeline', desc: 'Never miss a deadline with your checklist' },
      { icon: '💐', title: 'Vendor Tracker', desc: 'Contacts, payments & status for every vendor' },
    ],
    tabs: ['Dashboard', 'Budget Categories', 'Transactions', 'Guest Manager', 'Timeline Checklist', 'Vendor Tracker', 'Payment Schedule', 'Setup Instructions'],
    benefit: 'Stay organized, on budget, and stress-free',
    audience: 'For engaged couples planning their wedding',
  },
  budget: {
    primary: '#5B7553',
    primaryDark: '#3D5038',
    secondary: '#8D6E63',
    secondaryLight: '#EFEBE9',
    bg: '#F5F0EB',
    card: '#FFFFFF',
    text: '#2D2A26',
    textLight: '#7A7570',
    headline: 'Monthly Budget Planner',
    tagline: 'Take Control of Your Finances',
    subtitle: 'Google Sheets Template  •  Instant Download',
    features: [
      { icon: '📊', title: 'Smart Dashboard', desc: 'See income, expenses & savings at a glance' },
      { icon: '📈', title: 'Expense Tracker', desc: 'Auto-categorized spending with charts' },
      { icon: '🎯', title: 'Savings Goals', desc: 'Track progress toward your financial goals' },
      { icon: '📅', title: 'Monthly Summary', desc: 'Month-by-month comparison and trends' },
    ],
    tabs: ['Dashboard', 'Transactions', 'Categories', 'Monthly Summary', 'Savings Goals', 'Setup & Instructions'],
    benefit: 'Finally see where your money goes',
    audience: 'For anyone who wants financial clarity',
  },
  baby: {
    primary: '#7BA7C4',
    primaryDark: '#4A7A9B',
    secondary: '#E8A0BF',
    secondaryLight: '#FCE4EC',
    bg: '#F8F5F0',
    card: '#FFFFFF',
    text: '#2D2A26',
    textLight: '#7A7570',
    headline: 'Baby Budget Planner',
    tagline: 'Prepare Financially for Your Little One',
    subtitle: 'Google Sheets Template  •  Instant Download',
    features: [
      { icon: '👶', title: 'Baby Expense Dashboard', desc: 'Track everything from diapers to daycare' },
      { icon: '🍼', title: 'Category Breakdown', desc: 'Nursery, feeding, clothing, medical & more' },
      { icon: '📊', title: 'Visual Charts', desc: 'See spending patterns with auto-updating charts' },
      { icon: '💰', title: 'Savings Tracker', desc: 'College fund & emergency savings goals' },
    ],
    tabs: ['Dashboard', 'Transactions', 'Categories', 'Monthly Summary', 'Savings Goals', 'Setup & Instructions'],
    benefit: 'Be financially ready for baby',
    audience: 'For new and expecting parents',
  },
  travel: {
    primary: '#2E86AB',
    primaryDark: '#1B5E7E',
    secondary: '#D4A574',
    secondaryLight: '#FFF3E6',
    bg: '#F5F0EB',
    card: '#FFFFFF',
    text: '#2D2A26',
    textLight: '#7A7570',
    headline: 'Travel Budget Planner',
    tagline: 'Plan Your Dream Trip Without Overspending',
    subtitle: 'Google Sheets Template  •  Instant Download',
    features: [
      { icon: '✈️', title: 'Trip Dashboard', desc: 'Budget vs actual for flights, hotels, food & more' },
      { icon: '🗓️', title: 'Daily Planner', desc: 'Day-by-day itinerary with spending limits' },
      { icon: '💱', title: 'Currency Converter', desc: 'Multi-currency support with live rates' },
      { icon: '📊', title: 'Expense Charts', desc: 'Visual breakdown of every category' },
    ],
    tabs: ['Dashboard', 'Daily Expenses', 'Categories', 'Packing List', 'Itinerary', 'Setup & Instructions'],
    benefit: 'Travel more, spend smarter',
    audience: 'For travelers who want to stay on budget',
  },
  debt: {
    primary: '#D64550',
    primaryDark: '#A8323B',
    secondary: '#5B7553',
    secondaryLight: '#EBF0E9',
    bg: '#F5F0EB',
    card: '#FFFFFF',
    text: '#2D2A26',
    textLight: '#7A7570',
    headline: 'Debt Payoff Tracker',
    tagline: 'Your Roadmap to Financial Freedom',
    subtitle: 'Google Sheets Template  •  Instant Download',
    features: [
      { icon: '🎯', title: 'Payoff Dashboard', desc: 'See total debt, monthly payment & payoff date' },
      { icon: '📉', title: 'Snowball & Avalanche', desc: 'Both methods calculated automatically' },
      { icon: '📅', title: 'Payment Calendar', desc: 'Never miss a payment with due date tracking' },
      { icon: '🏆', title: 'Milestone Tracker', desc: 'Celebrate every win on your debt-free journey' },
    ],
    tabs: ['Dashboard', 'Debt Accounts', 'Payment History', 'Snowball Plan', 'Avalanche Plan', 'Milestones', 'Setup & Instructions'],
    benefit: 'See your debt-free date and make it happen',
    audience: 'For anyone serious about paying off debt',
  },
  business: {
    primary: '#1A365D',
    primaryDark: '#0F2440',
    secondary: '#C8924F',
    secondaryLight: '#FFF3E0',
    bg: '#F8F8FA',
    card: '#FFFFFF',
    text: '#1A202C',
    textLight: '#718096',
    headline: 'Business P&L Tracker',
    tagline: 'Professional Financial Management Made Simple',
    subtitle: 'Google Sheets Template  •  Instant Download',
    features: [
      { icon: '📊', title: 'P&L Dashboard', desc: 'Revenue, expenses & profit at a glance' },
      { icon: '📈', title: 'Monthly Trends', desc: 'Track growth with auto-updating charts' },
      { icon: '🧾', title: 'Expense Categories', desc: 'Organized by tax-deductible categories' },
      { icon: '💰', title: 'Invoice Tracker', desc: 'Outstanding invoices & cash flow forecast' },
    ],
    tabs: ['Dashboard', 'Income Log', 'Expense Log', 'Monthly P&L', 'Invoice Tracker', 'Tax Summary', 'Setup & Instructions'],
    benefit: 'Know your numbers, grow your business',
    audience: 'For freelancers and small business owners',
  },
};

// ══════════════════════════════════════════════════════════════
// SVG HELPERS
// ══════════════════════════════════════════════════════════════

function esc(text) {
  return String(text).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function hexToRgb(hex) {
  const h = hex.replace('#', '');
  return { r: parseInt(h.slice(0, 2), 16), g: parseInt(h.slice(2, 4), 16), b: parseInt(h.slice(4, 6), 16) };
}

/** Create an SVG gradient background */
function gradientBg(w, h, color1, color2, angle = 135) {
  const rad = (angle * Math.PI) / 180;
  const x2 = Math.round(Math.cos(rad) * 100);
  const y2 = Math.round(Math.sin(rad) * 100);
  return Buffer.from(`<svg width="${w}" height="${h}" xmlns="http://www.w3.org/2000/svg">
    <defs><linearGradient id="g" x1="0%" y1="0%" x2="${x2}%" y2="${y2}%">
      <stop offset="0%" stop-color="${color1}"/>
      <stop offset="100%" stop-color="${color2}"/>
    </linearGradient></defs>
    <rect width="${w}" height="${h}" fill="url(#g)"/>
  </svg>`);
}

/** Create a solid color background */
function solidBg(w, h, color) {
  return Buffer.from(`<svg width="${w}" height="${h}" xmlns="http://www.w3.org/2000/svg">
    <rect width="${w}" height="${h}" fill="${color}"/>
  </svg>`);
}

/** Rounded rectangle mask for screenshots */
function roundMask(w, h, r = 16) {
  return Buffer.from(`<svg width="${w}" height="${h}" xmlns="http://www.w3.org/2000/svg">
    <rect width="${w}" height="${h}" rx="${r}" ry="${r}" fill="white"/>
  </svg>`);
}

/** Drop shadow behind a screenshot — basic */
async function addShadow(imgBuffer, w, h) {
  const shadow = await sharp(solidBg(w + 40, h + 40, 'rgba(0,0,0,0.15)'))
    .blur(20)
    .png()
    .toBuffer();
  return { shadow, offsetX: -20, offsetY: -10 };
}

/** Premium multi-layer shadow — deep, realistic, production-quality */
async function addDeepShadow(w, h, opts = {}) {
  const { blur = 35, opacity = 0.22, spread = 60, offsetY = 15, color = '0,0,0' } = opts;
  // Layer 1: Wide soft ambient shadow (large spread, low opacity)
  const ambient = await sharp(
    Buffer.from(`<svg width="${w + spread * 2}" height="${h + spread * 2}" xmlns="http://www.w3.org/2000/svg">
      <rect x="${spread * 0.3}" y="${spread * 0.3}" width="${w + spread * 0.4}" height="${h + spread * 0.4}" rx="18" fill="rgba(${color},${opacity * 0.6})"/>
    </svg>`)
  ).blur(Math.round(blur * 1.2)).png().toBuffer();

  // Layer 2: Focused contact shadow (smaller spread, higher opacity)
  const contact = await sharp(
    Buffer.from(`<svg width="${w + spread}" height="${h + spread}" xmlns="http://www.w3.org/2000/svg">
      <rect x="${spread * 0.25}" y="${spread * 0.25}" width="${w + spread * 0.5}" height="${h + spread * 0.5}" rx="12" fill="rgba(${color},${opacity})"/>
    </svg>`)
  ).blur(Math.round(blur * 0.6)).png().toBuffer();

  return { ambient, contact, spread, offsetY };
}

/** Premium gradient background — multi-stop with radial glow + vignette */
function premiumGradientBg(w, h, primaryDark, primary, secondary) {
  const { r: r1, g: g1, b: b1 } = hexToRgb(primaryDark);
  const { r: r2, g: g2, b: b2 } = hexToRgb(primary);
  const { r: r3, g: g3, b: b3 } = hexToRgb(secondary);
  return Buffer.from(`<svg width="${w}" height="${h}" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <!-- Main diagonal gradient (darker, richer) -->
      <linearGradient id="main" x1="0%" y1="0%" x2="70%" y2="100%">
        <stop offset="0%" stop-color="rgb(${Math.round(r1*0.7)},${Math.round(g1*0.7)},${Math.round(b1*0.7)})"/>
        <stop offset="40%" stop-color="rgb(${r1},${g1},${b1})"/>
        <stop offset="100%" stop-color="rgb(${r2},${g2},${b2})"/>
      </linearGradient>
      <!-- Radial spotlight at center-top for depth -->
      <radialGradient id="glow" cx="45%" cy="30%" r="55%">
        <stop offset="0%" stop-color="rgb(${r2},${g2},${b2})" stop-opacity="0.35"/>
        <stop offset="100%" stop-color="rgb(${r1},${g1},${b1})" stop-opacity="0"/>
      </radialGradient>
      <!-- Warm accent glow (bottom) -->
      <radialGradient id="warm" cx="60%" cy="85%" r="40%">
        <stop offset="0%" stop-color="rgb(${r3},${g3},${b3})" stop-opacity="0.12"/>
        <stop offset="100%" stop-color="rgb(${r1},${g1},${b1})" stop-opacity="0"/>
      </radialGradient>
      <!-- Edge vignette -->
      <radialGradient id="vig" cx="50%" cy="50%" r="70%">
        <stop offset="60%" stop-color="black" stop-opacity="0"/>
        <stop offset="100%" stop-color="black" stop-opacity="0.25"/>
      </radialGradient>
    </defs>
    <rect width="${w}" height="${h}" fill="url(#main)"/>
    <rect width="${w}" height="${h}" fill="url(#glow)"/>
    <rect width="${w}" height="${h}" fill="url(#warm)"/>
    <rect width="${w}" height="${h}" fill="url(#vig)"/>
  </svg>`);
}

/** Text with drop shadow effect — SVG glow filter */
function textWithShadow(text, opts = {}) {
  const { x = 0, y = 0, w = W, h = 80, align = 'center', size = 48, weight = 'bold', color = '#FFFFFF', family = 'Helvetica Neue, Helvetica, Arial', shadowBlur = 8, shadowOpacity = 0.4 } = opts;
  const anchor = align === 'center' ? 'middle' : (align === 'right' ? 'end' : 'start');
  const tx = align === 'center' ? w / 2 : (align === 'right' ? w - 40 : 40);
  return Buffer.from(`<svg width="${w}" height="${h}" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <filter id="ts" x="-20%" y="-20%" width="140%" height="140%">
        <feGaussianBlur in="SourceAlpha" stdDeviation="${shadowBlur}"/>
        <feOffset dx="0" dy="3"/>
        <feComponentTransfer><feFuncA type="linear" slope="${shadowOpacity}"/></feComponentTransfer>
        <feMerge><feMergeNode/><feMergeNode in="SourceGraphic"/></feMerge>
      </filter>
    </defs>
    <text filter="url(#ts)" x="${tx}" y="${h * 0.72}" font-family="${family}" font-size="${size}" font-weight="${weight}" fill="${color}" text-anchor="${anchor}">${esc(text)}</text>
  </svg>`);
}

/** Make a screenshot look like it's on a device screen */
async function screenshotMockup(screenshotPath, targetW, targetH) {
  // Resize + round corners
  const resized = await sharp(screenshotPath)
    .resize(targetW, targetH, { fit: 'cover', position: 'top' })
    .png()
    .toBuffer();

  const mask = roundMask(targetW, targetH, 12);
  const rounded = await sharp(resized)
    .composite([{ input: mask, blend: 'dest-in' }])
    .png()
    .toBuffer();

  // Add border
  const border = Buffer.from(`<svg width="${targetW + 4}" height="${targetH + 4}" xmlns="http://www.w3.org/2000/svg">
    <rect x="0" y="0" width="${targetW + 4}" height="${targetH + 4}" rx="14" ry="14" fill="none" stroke="#D5D0CB" stroke-width="2"/>
  </svg>`);

  const framed = await sharp({
    create: { width: targetW + 4, height: targetH + 4, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } }
  })
    .composite([
      { input: rounded, top: 2, left: 2 },
      { input: border, top: 0, left: 0 },
    ])
    .png()
    .toBuffer();

  return framed;
}

/** Multi-line SVG text block */
function textBlock(lines, opts = {}) {
  const { x = 0, y = 0, w = W, align = 'center', size = 48, weight = 'bold', color = '#FFFFFF', family = 'Helvetica Neue, Helvetica, Arial', lineHeight = 1.3 } = opts;
  const anchor = align === 'center' ? 'middle' : (align === 'right' ? 'end' : 'start');
  const tx = align === 'center' ? w / 2 : (align === 'right' ? w - 40 : 40);

  const texts = lines.map((line, i) =>
    `<text x="${tx}" y="${y + size + (i * size * lineHeight)}" font-family="${family}" font-size="${size}" font-weight="${weight}" fill="${color}" text-anchor="${anchor}">${esc(line)}</text>`
  ).join('\n');

  return Buffer.from(`<svg width="${w}" height="${y + size * lineHeight * lines.length + size}" xmlns="http://www.w3.org/2000/svg">${texts}</svg>`);
}

/** Single line of text as SVG buffer */
function textLine(text, opts = {}) {
  const { x = 0, y = 0, w = W, h = 80, align = 'center', size = 48, weight = 'bold', color = '#FFFFFF', family = 'Helvetica Neue, Helvetica, Arial' } = opts;
  const anchor = align === 'center' ? 'middle' : (align === 'right' ? 'end' : 'start');
  const tx = align === 'center' ? w / 2 : (align === 'right' ? w - 40 : 40);
  return Buffer.from(`<svg width="${w}" height="${h}" xmlns="http://www.w3.org/2000/svg">
    <text x="${tx}" y="${h * 0.72}" font-family="${family}" font-size="${size}" font-weight="${weight}" fill="${color}" text-anchor="${anchor}">${esc(text)}</text>
  </svg>`);
}

/** Rounded rectangle shape */
function roundedRect(w, h, color, r = 20, opacity = 1) {
  return Buffer.from(`<svg width="${w}" height="${h}" xmlns="http://www.w3.org/2000/svg">
    <rect width="${w}" height="${h}" rx="${r}" ry="${r}" fill="${color}" opacity="${opacity}"/>
  </svg>`);
}

/** Pill badge (e.g., "Google Sheets" badge) */
function pillBadge(text, bgColor, textColor, fontSize = 24) {
  const w = text.length * fontSize * 0.65 + 40;
  const h = fontSize + 24;
  return {
    buf: Buffer.from(`<svg width="${w}" height="${h}" xmlns="http://www.w3.org/2000/svg">
      <rect width="${w}" height="${h}" rx="${h / 2}" fill="${bgColor}"/>
      <text x="${w / 2}" y="${h * 0.68}" font-family="Helvetica Neue, Helvetica, Arial" font-size="${fontSize}" font-weight="600" fill="${textColor}" text-anchor="middle">${esc(text)}</text>
    </svg>`),
    w, h,
  };
}

/** Checkmark icon */
function checkIcon(size = 32, color = '#5B7553') {
  return Buffer.from(`<svg width="${size}" height="${size}" xmlns="http://www.w3.org/2000/svg">
    <circle cx="${size / 2}" cy="${size / 2}" r="${size / 2}" fill="${color}"/>
    <polyline points="${size * 0.25},${size * 0.5} ${size * 0.45},${size * 0.7} ${size * 0.75},${size * 0.3}" fill="none" stroke="white" stroke-width="${size * 0.1}" stroke-linecap="round" stroke-linejoin="round"/>
  </svg>`);
}

/** Ensure composite positions are integers (Sharp requirement) and clamp negatives */
function intComposites(composites) {
  return composites.map(c => ({
    ...c,
    top: Math.max(-9999, Math.round(c.top)),
    left: Math.max(-9999, Math.round(c.left)),
  }));
}

/** Number circle for steps */
function numberCircle(num, size = 64, bgColor = '#5B7553') {
  return Buffer.from(`<svg width="${size}" height="${size}" xmlns="http://www.w3.org/2000/svg">
    <circle cx="${size / 2}" cy="${size / 2}" r="${size / 2 - 2}" fill="${bgColor}"/>
    <text x="${size / 2}" y="${size * 0.68}" font-family="Helvetica Neue, Helvetica, Arial" font-size="${size * 0.45}" font-weight="bold" fill="white" text-anchor="middle">${num}</text>
  </svg>`);
}

// ══════════════════════════════════════════════════════════════
// DEVICE MOCKUP FRAMES (MacBook, iPad, iPhone)
// ══════════════════════════════════════════════════════════════

/**
 * MacBook Pro frame — screen with bezels, camera notch, keyboard base.
 * Returns { frameBuf, screenX, screenY, screenW, screenH, totalW, totalH }
 */
function macbookFrame(screenW = 1200, screenH = 750) {
  const bezel = 20;
  const cameraH = 14;
  const hingeH = 12;
  const baseH = 50;
  const totalW = screenW + bezel * 2;
  const lidH = screenH + bezel * 2 + cameraH;
  const totalH = lidH + hingeH + baseH;
  const screenX = bezel;
  const screenY = bezel + cameraH;

  const svg = `<svg width="${totalW}" height="${totalH}" xmlns="http://www.w3.org/2000/svg">
    <!-- Lid -->
    <rect x="0" y="0" width="${totalW}" height="${lidH}" rx="14" fill="#2D2D2D"/>
    <!-- Screen bezel inner -->
    <rect x="${bezel - 2}" y="${cameraH + bezel - 2}" width="${screenW + 4}" height="${screenH + 4}" rx="4" fill="#1A1A1A"/>
    <!-- Camera notch -->
    <circle cx="${totalW / 2}" cy="${cameraH / 2 + 6}" r="4" fill="#3A3A3A"/>
    <circle cx="${totalW / 2}" cy="${cameraH / 2 + 6}" r="2" fill="#1A3A1A"/>
    <!-- Hinge -->
    <rect x="${totalW * 0.08}" y="${lidH}" width="${totalW * 0.84}" height="${hingeH}" rx="2" fill="#888"/>
    <!-- Base -->
    <path d="M${totalW * 0.04},${lidH + hingeH} L${totalW * 0.96},${lidH + hingeH} L${totalW},${totalH} Q${totalW},${totalH} ${totalW - 4},${totalH} L4,${totalH} Q0,${totalH} 0,${totalH} Z" fill="#C8C8C8"/>
    <path d="M${totalW * 0.04},${lidH + hingeH} L${totalW * 0.96},${lidH + hingeH} L${totalW},${totalH - 3} L0,${totalH - 3} Z" fill="#D5D5D5"/>
    <!-- Trackpad -->
    <rect x="${totalW / 2 - 80}" y="${lidH + hingeH + 12}" width="160" height="${baseH - 20}" rx="6" fill="#BFBFBF" stroke="#AAAAAA" stroke-width="1"/>
  </svg>`;

  return {
    frameBuf: Buffer.from(svg), screenX, screenY, screenW, screenH, totalW, totalH,
  };
}

/**
 * iPad Pro frame — thin bezels, rounded corners.
 * Returns { frameBuf, screenX, screenY, screenW, screenH, totalW, totalH }
 */
function ipadFrame(screenW = 660, screenH = 880) {
  const bezel = 22;
  const totalW = screenW + bezel * 2;
  const totalH = screenH + bezel * 2;
  const screenX = bezel;
  const screenY = bezel;

  const svg = `<svg width="${totalW}" height="${totalH}" xmlns="http://www.w3.org/2000/svg">
    <rect x="0" y="0" width="${totalW}" height="${totalH}" rx="28" fill="#2D2D2D"/>
    <rect x="${bezel}" y="${bezel}" width="${screenW}" height="${screenH}" rx="6" fill="#1A1A1A"/>
    <!-- Camera -->
    <circle cx="${totalW / 2}" cy="${bezel / 2}" r="4" fill="#3A3A3A"/>
  </svg>`;

  return {
    frameBuf: Buffer.from(svg), screenX, screenY, screenW, screenH, totalW, totalH,
  };
}

/**
 * iPhone 15 Pro frame — Dynamic Island, thin bezels.
 * Returns { frameBuf, screenX, screenY, screenW, screenH, totalW, totalH }
 */
function iphoneFrame(screenW = 340, screenH = 720) {
  const bezel = 14;
  const totalW = screenW + bezel * 2;
  const totalH = screenH + bezel * 2;
  const screenX = bezel;
  const screenY = bezel;

  const svg = `<svg width="${totalW}" height="${totalH}" xmlns="http://www.w3.org/2000/svg">
    <rect x="0" y="0" width="${totalW}" height="${totalH}" rx="40" fill="#2D2D2D"/>
    <rect x="${bezel}" y="${bezel}" width="${screenW}" height="${screenH}" rx="28" fill="#1A1A1A"/>
    <!-- Dynamic Island -->
    <rect x="${totalW / 2 - 50}" y="${bezel + 8}" width="100" height="26" rx="13" fill="#1A1A1A"/>
    <!-- Side button -->
    <rect x="${totalW - 3}" y="${totalH * 0.25}" width="3" height="60" rx="1" fill="#555"/>
    <rect x="0" y="${totalH * 0.2}" width="3" height="35" rx="1" fill="#555"/>
    <rect x="0" y="${totalH * 0.3}" width="3" height="55" rx="1" fill="#555"/>
  </svg>`;

  return {
    frameBuf: Buffer.from(svg), screenX, screenY, screenW, screenH, totalW, totalH,
  };
}

/**
 * Composite a screenshot into a device frame.
 * @param {string} screenshotPath - path to screenshot
 * @param {'macbook'|'ipad'|'iphone'} device - device type
 * @param {number} scale - scale factor for the final output
 */
async function deviceMockup(screenshotPath, device = 'macbook', scale = 1.0) {
  let frame;
  if (device === 'macbook') frame = macbookFrame();
  else if (device === 'ipad') frame = ipadFrame();
  else frame = iphoneFrame();

  const { frameBuf, screenX, screenY, screenW, screenH, totalW, totalH } = frame;

  // Resize screenshot to fit exactly in the screen area
  const screenContent = await sharp(screenshotPath)
    .resize(screenW, screenH, { fit: 'cover', position: 'top' })
    .png()
    .toBuffer();

  // Composite: frame + screenshot in the screen area
  const result = await sharp(frameBuf)
    .composite([{ input: screenContent, top: screenY, left: screenX }])
    .png()
    .toBuffer();

  // Scale if needed
  if (scale !== 1.0) {
    return sharp(result)
      .resize(Math.round(totalW * scale), Math.round(totalH * scale))
      .png()
      .toBuffer();
  }
  return result;
}

// ══════════════════════════════════════════════════════════════
// AI PHOTOREALISTIC BACKGROUNDS (Pollinations.ai free endpoint)
//
// Strategy: generate BACKGROUND SCENES only (no devices), then
// composite Sharp-built device frames on top. This gives us
// photorealistic desk/marble/lifestyle scenes with pixel-perfect
// real Google Sheets screenshots inside device frames.
// ══════════════════════════════════════════════════════════════

const AI_BG_NICHE_PROPS = {
  wedding: { props: 'dried eucalyptus and gold ring box', surface: 'elegant cream marble', mood: 'editorial wedding', tint: 'ivory cream to subtle blush pink' },
  budget:  { props: 'small succulent plant and leather notebook', surface: 'clean white desk with warm wood tones', mood: 'modern clean', tint: 'warm white to subtle sage green' },
  baby:    { props: 'small stuffed animal and wooden rattle', surface: 'soft cream desk', mood: 'warm nurturing', tint: 'soft white to gentle pastel lavender' },
  travel:  { props: 'vintage compass and small globe', surface: 'warm wood desk', mood: 'adventurous organized', tint: 'warm sand to subtle ocean blue' },
  debt:    { props: 'neatly stacked coins and small notepad', surface: 'clean organized desk', mood: 'bright motivating', tint: 'clean white to subtle mint green' },
  business:{ props: 'sleek pen and leather portfolio', surface: 'dark walnut desk', mood: 'premium executive', tint: 'charcoal to dark navy' },
};

function aiScenePrompt(scene, niche) {
  const n = AI_BG_NICHE_PROPS[niche] || AI_BG_NICHE_PROPS.budget;
  const scenes = {
    hero: `Professional product photography, ${n.surface} surface photographed from 20 degrees overhead angle, ${n.props} in far corners, soft diffused studio lighting from upper-left creating gentle shadows, center 70 percent completely clear for product placement, shallow depth of field at edges, ${n.mood} aesthetic, high-end commercial studio quality, no devices no screens no text no logos`,
    macbook: `Lifestyle product photography, ${n.surface} surface with warm ambient light, coffee cup and ${n.props.split(' and ')[0]} in far corner, beautiful golden-hour side lighting with soft shadows, center area completely clear for product, bokeh blurred background, ${n.mood} feel, premium quality, no devices no screens no text no logos`,
    devices: `Premium abstract backdrop for digital product showcase, ultra-smooth gradient from ${n.tint}, gentle light bloom at center-top, professional studio feel with very soft ambient shadows at bottom third, minimalist modern premium feel, absolutely clean, no objects no devices no text`,
    flatlay: `Flat lay product photography from directly above, ${n.surface} surface, ${n.props} arranged tastefully in corners and edges, large center area completely empty for product placement, soft even studio lighting, premium lifestyle aesthetic, no devices no screens no text`,
  };
  return scenes[scene] || null;
}

/**
 * Generate a single AI background via Pollinations.ai free endpoint.
 * Retries on 429 rate limits with exponential backoff.
 * Returns a PNG buffer sized to W×H, or null on failure.
 */
async function generateAIBackground(scene, niche, width = W, height = H) {
  const prompt = aiScenePrompt(scene, niche);
  if (!prompt) return null;

  const maxRetries = 2;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    if (attempt > 0) {
      const wait = 8000 * attempt; // 8s, 16s
      console.log(`   \u23F3 AI bg [${scene}] retry ${attempt}/${maxRetries} in ${wait / 1000}s...`);
      await new Promise(r => setTimeout(r, wait));
    }

    const seed = Math.floor(Math.random() * 100000);
    const encoded = encodeURIComponent(prompt);
    const url = `https://image.pollinations.ai/prompt/${encoded}?width=${width}&height=${height}&model=flux&seed=${seed}&enhance=true&nologo=true`;

    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 60000);
      const resp = await fetch(url, { signal: controller.signal });
      clearTimeout(timer);

      if (resp.status === 429) {
        if (attempt < maxRetries) continue; // retry after backoff
        console.log(`   \u26A0 AI bg [${scene}] rate limited \u2014 gradient fallback`);
        return null;
      }

      if (!resp.ok) {
        console.log(`   \u26A0 AI bg [${scene}] HTTP ${resp.status} \u2014 gradient fallback`);
        return null;
      }

      const ab = await resp.arrayBuffer();
      if (ab.byteLength < 5000) {
        console.log(`   \u26A0 AI bg [${scene}] too small (${ab.byteLength}B) \u2014 gradient fallback`);
        return null;
      }

      const buf = await sharp(Buffer.from(ab))
        .resize(width, height, { fit: 'cover' })
        .png()
        .toBuffer();

      console.log(`   \u2713 AI bg [${scene}]: ${Math.round(buf.length / 1024)}KB`);
      return buf;
    } catch (err) {
      const msg = err.name === 'AbortError' ? 'timeout (60s)' : (err.message || '').substring(0, 60);
      if (attempt < maxRetries) {
        console.log(`   \u26A0 AI bg [${scene}] ${msg}, will retry...`);
        continue;
      }
      console.log(`   \u26A0 AI bg [${scene}] ${msg} \u2014 gradient fallback`);
      return null;
    }
  }
  return null;
}

/**
 * Generate all 4 AI scene backgrounds in parallel.
 * Each request has its own retry logic for rate limiting (429).
 * Parallel cuts total time from ~6min to ~2min.
 * Returns { hero, devices, macbook, flatlay } — each is a PNG Buffer or null.
 */
async function generateAllAIBackgrounds(niche) {
  console.log('   \uD83C\uDFA8 Generating photorealistic backgrounds (Pollinations.ai)...');
  const scenes = ['hero', 'devices', 'macbook', 'flatlay'];

  const results = await Promise.allSettled(
    scenes.map(scene => generateAIBackground(scene, niche))
  );

  const bgs = {};
  scenes.forEach((scene, i) => {
    bgs[scene] = results[i].status === 'fulfilled' ? results[i].value : null;
  });

  const count = Object.values(bgs).filter(Boolean).length;
  console.log(`   ${count}/4 AI backgrounds generated`);
  return bgs;
}

/** Dark gradient overlay for white text readability on AI backgrounds */
function darkOverlay(w, h) {
  return Buffer.from(`<svg width="${w}" height="${h}" xmlns="http://www.w3.org/2000/svg">
    <defs><linearGradient id="dko" x1="0%" y1="0%" x2="0%" y2="100%">
      <stop offset="0%" stop-color="black" stop-opacity="0.52"/>
      <stop offset="30%" stop-color="black" stop-opacity="0.18"/>
      <stop offset="65%" stop-color="black" stop-opacity="0.22"/>
      <stop offset="100%" stop-color="black" stop-opacity="0.42"/>
    </linearGradient></defs>
    <rect width="${w}" height="${h}" fill="url(#dko)"/>
  </svg>`);
}

// ══════════════════════════════════════════════════════════════
// STEP 1: SHARE SHEET + EXTRACT ID
// ══════════════════════════════════════════════════════════════

function extractSheetId(input) {
  const match = input.match(/\/d\/([a-zA-Z0-9_-]+)/);
  if (match) return match[1];
  if (/^[a-zA-Z0-9_-]{20,}$/.test(input)) return input;
  throw new Error(`Cannot extract sheet ID from: ${input}`);
}

async function makeSheetPublic(sheetId) {
  const auth = await getAuthClient();
  const drive = google.drive({ version: 'v3', auth });
  const perm = await drive.permissions.create({
    fileId: sheetId,
    requestBody: { role: 'reader', type: 'anyone' },
  });
  console.log('   ✓ Sheet shared publicly');
  return perm.data.id;
}

async function revokePublicAccess(sheetId, permissionId) {
  try {
    const auth = await getAuthClient();
    const drive = google.drive({ version: 'v3', auth });
    await drive.permissions.delete({ fileId: sheetId, permissionId });
    console.log('   ✓ Public access revoked');
  } catch (e) {
    console.warn('   ⚠ Could not revoke access:', e.message);
  }
}

// ══════════════════════════════════════════════════════════════
// STEP 2: PLAYWRIGHT SCREENSHOT CAPTURE
// ══════════════════════════════════════════════════════════════

async function captureScreenshots(sheetId, outDir) {
  // Use the /edit URL — shows the FULL formatted sheet (charts, conditional
  // formatting, KPI cards, sidebar, pie charts, progress bars, merged cells).
  // The sheet must be public (reader access for anyone) for this to work.
  const url = `https://docs.google.com/spreadsheets/d/${sheetId}/edit#gid=0`;
  console.log('   Launching browser...');

  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({
    viewport: { width: 1440, height: 3000 }, // Tall viewport to capture entire sheet
    deviceScaleFactor: 2, // Retina-quality captures
  });
  const page = await ctx.newPage();

  await page.goto(url, { waitUntil: 'load', timeout: 45000 });

  // Wait for the spreadsheet grid to render (Google Sheets never reaches networkidle)
  try {
    await page.waitForSelector('.grid-container, .waffle, [role="grid"]', { timeout: 15000 });
    console.log('   ✓ Sheet grid loaded');
  } catch {
    console.log('   ⚠ Grid not detected, waiting longer...');
  }
  await page.waitForTimeout(5000); // Extra time for charts + formatting to render

  // Dismiss any "view-only" banners or popups
  try {
    const dismissBtns = await page.$$('[aria-label="Close"], [aria-label="Dismiss"], .docs-butterbar-dismiss');
    for (const btn of dismissBtns) await btn.click().catch(() => {});
    await page.waitForTimeout(500);
  } catch { /* no popups */ }
  await page.waitForTimeout(1000);
  console.log('   ✓ Sheet content loaded (full edit view with charts)');

  // Take one full-page screenshot at high resolution, then crop sections
  console.log('   Taking full-page capture...');
  const fullPath = path.join(outDir, 'raw_full.png');
  await page.screenshot({ path: fullPath, fullPage: true });

  // Get the full image dimensions
  const fullMeta = await sharp(fullPath).metadata();
  const fullW = fullMeta.width;
  const fullH = fullMeta.height;
  const channels = fullMeta.channels || 4; // RGBA for PNG
  console.log(`   Full capture: ${fullW}x${fullH}px (${channels}ch)`);

  // Pixel scan: sample 5 vertical columns across the width, scan bottom-up
  // to find where actual sheet content ends (below that is whitespace)
  let contentBottomPx = 0;
  try {
    const sampleXs = [0.2, 0.35, 0.5, 0.65, 0.8].map(p => Math.round(fullW * p));
    for (const sx of sampleXs) {
      const strip = await sharp(fullPath)
        .extract({ left: sx, top: 0, width: 1, height: fullH })
        .removeAlpha().raw().toBuffer(); // RGB, 3 bytes per pixel
      // Scan from 95% upward (skip tab bar at the very bottom)
      const startY = Math.round(fullH * 0.95);
      for (let y = startY; y >= 0; y--) {
        const idx = y * 3;
        const r = strip[idx], g = strip[idx + 1], b = strip[idx + 2];
        // Non-white pixel = content (white = rgb(255,255,255), grid lines ~rgb(230+))
        if (r < 230 || g < 230 || b < 230) {
          const bottom = y + 80; // padding
          if (bottom > contentBottomPx) contentBottomPx = bottom;
          break;
        }
      }
    }
    console.log(`   Content ends at ~${contentBottomPx}px (pixel scan)`);
  } catch (err) { console.log(`   ⚠ Pixel scan failed: ${err.message}`); }

  const contentH = contentBottomPx > 400 ? Math.min(contentBottomPx, fullH) : fullH;
  console.log(`   Usable content area: ${contentH}px (${Math.round(contentH/fullH*100)}% of full)`);

  // Crop into 3 overlapping sections within the content area
  const sectionH = Math.min(1800, Math.round(contentH * 0.55));  // ~55% of content per section

  console.log('   Cropping top section...');
  await sharp(fullPath)
    .extract({ left: 0, top: 0, width: fullW, height: Math.min(sectionH, contentH) })
    .toFile(path.join(outDir, 'raw_top.png'));

  console.log('   Cropping middle section...');
  const midTop = Math.round(contentH * 0.30);
  await sharp(fullPath)
    .extract({ left: 0, top: midTop, width: fullW, height: Math.min(sectionH, contentH - midTop) })
    .toFile(path.join(outDir, 'raw_mid.png'));

  console.log('   Cropping bottom section...');
  const botTop = Math.max(0, contentH - sectionH);
  await sharp(fullPath)
    .extract({ left: 0, top: botTop, width: fullW, height: contentH - botTop })
    .toFile(path.join(outDir, 'raw_bottom.png'));

  await browser.close();
  console.log('   ✓ 3 screenshots captured');

  return {
    top: path.join(outDir, 'raw_top.png'),
    mid: path.join(outDir, 'raw_mid.png'),
    bottom: path.join(outDir, 'raw_bottom.png'),
  };
}

// ══════════════════════════════════════════════════════════════
// STEP 3: COMPOSE 7 LISTING IMAGES
// ══════════════════════════════════════════════════════════════

// ─── IMAGE 1: HERO THUMBNAIL (HIGHEST PRIORITY — drives clicks) ──
async function composeHero(caps, theme, outPath, aiBgs = {}) {
  // AI photorealistic desk scene or premium gradient fallback
  let bg;
  if (aiBgs.hero) {
    bg = await sharp(aiBgs.hero)
      .composite([{ input: darkOverlay(W, H) }])
      .png().toBuffer();
  } else {
    bg = await sharp(premiumGradientBg(W, H, theme.primaryDark, theme.primary, theme.secondary))
      .png().toBuffer();
  }

  // MacBook device frame with real screenshot inside
  const mac = macbookFrame(1200, 750);
  const screenContent = await sharp(caps.top)
    .resize(mac.screenW, mac.screenH, { fit: 'cover', position: 'top' })
    .png().toBuffer();
  // Composite screenshot into MacBook frame
  const macbookImg = await sharp(mac.frameBuf)
    .composite([{ input: screenContent, top: mac.screenY, left: mac.screenX }])
    .png().toBuffer();

  // Deep multi-layer shadow under the MacBook
  const shadow = await addDeepShadow(mac.totalW, mac.totalH, {
    blur: 40, opacity: 0.28, spread: 80, offsetY: 20,
  });

  // Headline text with drop shadow
  const title = textWithShadow(theme.headline, {
    size: 72, weight: 'bold', color: '#FFFFFF', h: 100, shadowBlur: 12, shadowOpacity: 0.5,
  });
  const tagline = textWithShadow(theme.tagline, {
    size: 30, weight: '400', color: '#FFFFFFDD', h: 55, shadowBlur: 6, shadowOpacity: 0.3,
  });

  // Accent underline
  const accent = Buffer.from(`<svg width="100" height="4" xmlns="http://www.w3.org/2000/svg">
    <rect width="100" height="4" rx="2" fill="${theme.secondary}"/>
  </svg>`);

  // Bottom info strip: frosted pill badges
  const badge1 = pillBadge('Google Sheets', '#FFFFFF20', '#FFFFFF', 20);
  const badge2 = pillBadge('Instant Download', '#FFFFFF20', '#FFFFFF', 20);
  const badge3 = pillBadge('Pre-Built Formulas', '#FFFFFF20', '#FFFFFF', 20);

  // Position MacBook centrally, lower third
  const macX = Math.round((W - mac.totalW) / 2);
  const macY = 340;

  const composites = [
    // Shadows (behind device)
    { input: shadow.ambient, top: macY - shadow.spread + shadow.offsetY + 10, left: macX - shadow.spread + 5 },
    { input: shadow.contact, top: macY - Math.round(shadow.spread/2) + shadow.offsetY, left: macX - Math.round(shadow.spread/4) },
    // Device
    { input: macbookImg, top: macY, left: macX },
    // Text
    { input: title, top: 50, left: 0 },
    { input: tagline, top: 155, left: 0 },
    { input: accent, top: 220, left: (W - 100) / 2 },
    // Bottom badges
    { input: badge1.buf, top: H - 70, left: W / 2 - badge1.w - badge2.w / 2 - 20 },
    { input: badge2.buf, top: H - 70, left: (W - badge2.w) / 2 },
    { input: badge3.buf, top: H - 70, left: W / 2 + badge2.w / 2 + 20 },
  ];

  await sharp(bg).composite(intComposites(composites)).png().toFile(outPath);
  console.log(`   ✓ Image 1: Hero${aiBgs.hero ? ' (AI background)' : ''}`);
}

// ─── IMAGE 2: FEATURE OVERVIEW ───────────────────────────────
async function composeOverview(caps, theme, outPath) {
  const bg = await sharp(solidBg(W, H, theme.bg)).png().toBuffer();

  // Header with subtle shadow
  const header = textWithShadow('Everything You Need in One Place', {
    size: 48, weight: 'bold', color: theme.text, h: 70, shadowBlur: 3, shadowOpacity: 0.12,
  });

  // Full dashboard mockup (larger) with rounded corners
  const mockup = await screenshotMockup(caps.top, 1600, 1000);
  const mockMeta = await sharp(mockup).metadata();

  // Shadow under the screenshot
  const shadow = await addDeepShadow(mockMeta.width, mockMeta.height, {
    blur: 25, opacity: 0.16, spread: 40,
  });

  // Bottom benefit text
  const benefit = textLine(theme.benefit, { size: 26, weight: '500', color: theme.textLight, h: 50 });

  // Accent bar top
  const accent = roundedRect(W, 8, theme.primary, 0);
  const mockX = Math.round((W - mockMeta.width) / 2);

  await sharp(bg).composite(intComposites([
    { input: accent, top: 0, left: 0 },
    { input: header, top: 40, left: 0 },
    { input: shadow.ambient, top: 140 - 20 + 10, left: mockX - 20 },
    { input: mockup, top: 140, left: mockX },
    { input: benefit, top: H - 80, left: 0 },
  ])).png().toFile(outPath);
  console.log('   ✓ Image 2: Overview');
}

// ─── IMAGE 3: DETAIL ZOOM ────────────────────────────────────
async function composeDetail(caps, theme, outPath) {
  const bg = await sharp(solidBg(W, H, '#FFFFFF')).png().toBuffer();

  // Header
  const header = textLine('Beautifully Designed Details', { size: 48, weight: 'bold', color: theme.text, h: 70 });

  // Two side-by-side zoomed sections — top vs bottom for maximum visual contrast
  const panelW = 880;
  const panelH = 900;  // Taller panels to fill vertical space
  const leftMock = await screenshotMockup(caps.top, panelW, panelH);
  const rightMock = await screenshotMockup(caps.bottom, panelW, panelH);

  // Labels
  const leftLabel = textLine('Dashboard & Overview', { size: 26, weight: '600', color: theme.primary, h: 44, w: panelW });
  const rightLabel = textLine('Charts & Analytics', { size: 26, weight: '600', color: theme.secondary, h: 44, w: panelW });

  // Bottom text
  const desc = textLine('All formulas auto-calculate  •  Charts update in real-time', { size: 24, weight: '400', color: theme.textLight, h: 50 });

  const panelTop = 150;
  const labelTop = panelTop + panelH + 20;

  await sharp(bg).composite(intComposites([
    { input: header, top: 50, left: 0 },
    { input: leftMock, top: panelTop, left: 100 },
    { input: rightMock, top: panelTop, left: 1020 },
    { input: leftLabel, top: labelTop, left: 100 },
    { input: rightLabel, top: labelTop, left: 1020 },
    { input: desc, top: H - 80, left: 0 },
  ])).png().toFile(outPath);
  console.log('   ✓ Image 3: Detail');
}

// ─── IMAGE 4: FEATURE BREAKDOWN ──────────────────────────────
async function composeFeatures(caps, theme, outPath) {
  const bg = await sharp(solidBg(W, H, theme.bg)).png().toBuffer();
  const composites = [];

  // Header
  composites.push({ input: textLine('What Makes This Special', { size: 52, weight: 'bold', color: theme.text, h: 80 }), top: 60, left: 0 });

  // Accent line under header
  composites.push({ input: roundedRect(120, 4, theme.primary, 2), top: 155, left: (W - 120) / 2 });

  // 4 feature cards in 2x2 grid
  const cardW = 820;
  const cardH = 300;
  const gap = 40;
  const startX = (W - cardW * 2 - gap) / 2;
  const startY = 200;

  for (let i = 0; i < 4; i++) {
    const col = i % 2;
    const row = Math.floor(i / 2);
    const x = startX + col * (cardW + gap);
    const y = startY + row * (cardH + gap);
    const feat = theme.features[i];
    const accentColor = i % 2 === 0 ? theme.primary : theme.secondary;

    // Card background
    composites.push({ input: roundedRect(cardW, cardH, '#FFFFFF', 16), top: y, left: x });

    // Accent left bar
    composites.push({ input: roundedRect(6, cardH - 40, accentColor, 3), top: y + 20, left: x + 24 });

    // Icon — colored circle with initial (SVG can't render emoji)
    const initial = feat.title.charAt(0);
    const iconSvg = Buffer.from(`<svg width="52" height="52" xmlns="http://www.w3.org/2000/svg">
      <circle cx="26" cy="26" r="26" fill="${accentColor}"/>
      <text x="26" y="34" font-family="Helvetica Neue, Helvetica, Arial" font-size="24" font-weight="bold" fill="white" text-anchor="middle">${initial}</text>
    </svg>`);
    composites.push({ input: iconSvg, top: y + 35, left: x + 50 });

    // Title
    composites.push({
      input: textLine(feat.title, { size: 30, weight: 'bold', color: theme.text, h: 44, w: cardW - 140, align: 'left' }),
      top: y + 30, left: x + 120,
    });

    // Description
    composites.push({
      input: textLine(feat.desc, { size: 22, weight: '400', color: theme.textLight, h: 36, w: cardW - 140, align: 'left' }),
      top: y + 80, left: x + 120,
    });
  }

  // Bottom CTA
  composites.push({
    input: textLine(theme.audience, { size: 24, weight: '500', color: theme.textLight, h: 50 }),
    top: H - 80, left: 0,
  });

  await sharp(bg).composite(intComposites(composites)).png().toFile(outPath);
  console.log('   ✓ Image 4: Features');
}

// ─── IMAGE 5: LIFESTYLE / USE CASE ──────────────────────────
async function composeLifestyle(caps, theme, outPath, aiBgs = {}) {
  // AI flat lay background or gradient fallback
  let bg;
  if (aiBgs.flatlay) {
    bg = await sharp(aiBgs.flatlay).png().toBuffer();
  } else {
    bg = await sharp(gradientBg(W, H, theme.secondaryLight, theme.bg, 180))
      .png().toBuffer();
  }

  // Decorative circles
  const circle1 = Buffer.from(`<svg width="400" height="400" xmlns="http://www.w3.org/2000/svg">
    <circle cx="200" cy="200" r="200" fill="${theme.primary}" opacity="0.06"/>
  </svg>`);
  const circle2 = Buffer.from(`<svg width="300" height="300" xmlns="http://www.w3.org/2000/svg">
    <circle cx="150" cy="150" r="150" fill="${theme.secondary}" opacity="0.08"/>
  </svg>`);

  // Tablet-style mockup (slightly smaller, centered)
  const tabletMock = await screenshotMockup(caps.top, 1100, 700);

  // Text
  const header = textLine('Works on Any Device', { size: 48, weight: 'bold', color: theme.text, h: 70 });
  const sub = textLine('Access from your laptop, tablet, or phone — anywhere, anytime', { size: 24, weight: '400', color: theme.textLight, h: 50 });

  // Device icons row
  const devices = Buffer.from(`<svg width="600" height="50" xmlns="http://www.w3.org/2000/svg">
    <text x="0" y="38" font-family="Helvetica Neue" font-size="20" font-weight="500" fill="${theme.textLight}">💻 Desktop    📱 Mobile    📊 Tablet    🌐 Browser</text>
  </svg>`);

  await sharp(bg).composite(intComposites([
    { input: circle1, top: -100, left: -100 },
    { input: circle2, top: H - 200, left: W - 200 },
    { input: header, top: 60, left: 0 },
    { input: sub, top: 140, left: 0 },
    { input: tabletMock, top: 250, left: (W - 1104) / 2 },
    { input: devices, top: H - 80, left: (W - 600) / 2 },
  ])).png().toFile(outPath);
  console.log(`   ✓ Image 5: Lifestyle${aiBgs.flatlay ? ' (AI background)' : ''}`);
}

// ─── IMAGE 6: WHAT'S INCLUDED ────────────────────────────────
async function composeIncluded(caps, theme, outPath) {
  const bg = await sharp(solidBg(W, H, '#FFFFFF')).png().toBuffer();
  const composites = [];

  // Colored header block
  composites.push({ input: roundedRect(W, 200, theme.primary, 0), top: 0, left: 0 });
  composites.push({
    input: textLine("What's Inside", { size: 56, weight: 'bold', color: '#FFFFFF', h: 80 }),
    top: 30, left: 0,
  });
  composites.push({
    input: textLine(`${theme.tabs.length} Organized Tabs`, { size: 28, weight: '400', color: '#FFFFFFCC', h: 50 }),
    top: 120, left: 0,
  });

  // Tab list with checkmarks
  const listStartY = 260;
  const rowH = 70;
  const listX = 300;

  for (let i = 0; i < theme.tabs.length; i++) {
    const y = listStartY + i * rowH;
    const isAlt = i % 2 === 1;

    // Alternating row bg
    if (isAlt) {
      composites.push({ input: roundedRect(W - 200, rowH - 8, '#F8F6F3', 8), top: y, left: 100 });
    }

    // Checkmark
    composites.push({ input: checkIcon(36, theme.primary), top: y + 14, left: listX });

    // Tab name
    composites.push({
      input: textLine(theme.tabs[i], { size: 28, weight: '500', color: theme.text, h: 50, w: W - listX - 100, align: 'left' }),
      top: y + 8, left: listX + 56,
    });
  }

  // Bottom badge
  const plus = textLine('+ Setup & Instructions Guide', { size: 22, weight: '500', color: theme.primary, h: 44 });
  composites.push({ input: plus, top: H - 70, left: 0 });

  await sharp(bg).composite(intComposites(composites)).png().toFile(outPath);
  console.log('   ✓ Image 6: Included');
}

// ─── IMAGE 7: HOW IT WORKS / DELIVERY ────────────────────────
async function composeDelivery(caps, theme, outPath) {
  const bg = await sharp(solidBg(W, H, theme.bg)).png().toBuffer();
  const composites = [];

  // Header
  composites.push({
    input: textLine('How It Works', { size: 52, weight: 'bold', color: theme.text, h: 80 }),
    top: 60, left: 0,
  });
  composites.push({
    input: textLine('3 Simple Steps', { size: 28, weight: '400', color: theme.textLight, h: 50 }),
    top: 145, left: 0,
  });
  composites.push({ input: roundedRect(80, 4, theme.primary, 2), top: 205, left: (W - 80) / 2 });

  // 3 step cards
  const steps = [
    { num: '1', title: 'Purchase & Download', desc: 'Instant digital delivery to your email.\nNo shipping, no waiting.' },
    { num: '2', title: 'Open in Google Sheets', desc: 'Click the link → File → Make a Copy.\nWorks on any device with internet.' },
    { num: '3', title: 'Start Using It!', desc: 'All formulas are pre-built.\nJust enter your data and go.' },
  ];

  const cardW = 520;
  const cardH = 380;
  const gap = 50;
  const startX = (W - cardW * 3 - gap * 2) / 2;
  const startY = 280;

  for (let i = 0; i < 3; i++) {
    const x = startX + i * (cardW + gap);
    const step = steps[i];
    const accentColor = [theme.primary, theme.secondary, theme.primary][i];

    // Card
    composites.push({ input: roundedRect(cardW, cardH, '#FFFFFF', 20), top: startY, left: x });

    // Colored top strip
    composites.push({ input: roundedRect(cardW, 8, accentColor, 0), top: startY, left: x });

    // Number circle
    composites.push({ input: numberCircle(step.num, 64, accentColor), top: startY + 40, left: x + (cardW - 64) / 2 });

    // Step title
    composites.push({
      input: textLine(step.title, { size: 28, weight: 'bold', color: theme.text, h: 44, w: cardW }),
      top: startY + 130, left: x,
    });

    // Step description (split into lines)
    const descLines = step.desc.split('\n');
    descLines.forEach((line, li) => {
      composites.push({
        input: textLine(line, { size: 20, weight: '400', color: theme.textLight, h: 34, w: cardW }),
        top: startY + 185 + li * 34, left: x,
      });
    });
  }

  // Bottom trust line
  composites.push({
    input: textLine('No software needed  /  Works on Mac, PC, phone &amp; tablet', { size: 22, weight: '500', color: theme.textLight, h: 44 }),
    top: H - 70, left: 0,
  });

  // Accent bar bottom
  composites.push({ input: roundedRect(W, 6, theme.primary, 0), top: H - 6, left: 0 });

  await sharp(bg).composite(intComposites(composites)).png().toFile(outPath);
  console.log('   ✓ Image 7: Delivery');
}

// ─── IMAGE 8: MULTI-DEVICE SHOWCASE ─────────────────────────
async function composeMultiDevice(caps, theme, outPath, aiBgs = {}) {
  // AI abstract backdrop or gradient fallback
  let bg;
  if (aiBgs.devices) {
    bg = await sharp(aiBgs.devices).png().toBuffer();
  } else {
    bg = await sharp(gradientBg(W, H, '#F8F6F3', '#EDE8E2', 160)).png().toBuffer();
  }

  // Header with shadow
  const header = textWithShadow('Works Beautifully Everywhere', { size: 48, weight: 'bold', color: theme.text, h: 70, shadowBlur: 4, shadowOpacity: 0.15 });
  const sub = textLine('Google Sheets — open on any device, no software needed', { size: 24, weight: '400', color: theme.textLight, h: 50 });

  // Three devices at different scales
  const macbook = await deviceMockup(caps.top, 'macbook', 0.75);
  const ipad = await deviceMockup(caps.top, 'ipad', 0.50);
  const iphone = await deviceMockup(caps.top, 'iphone', 0.55);

  const macMeta = await sharp(macbook).metadata();
  const ipadMeta = await sharp(ipad).metadata();
  const iphoneMeta = await sharp(iphone).metadata();

  // Position: MacBook center-left, iPad center-right, iPhone far-right overlapping
  const macX = 50;
  const macY = 220;
  const ipadX = W - ipadMeta.width - 280;
  const ipadY = H - ipadMeta.height - 100;
  const iphoneX = W - iphoneMeta.width - 60;
  const iphoneY = H - iphoneMeta.height - 80;

  // Deep shadows for each device
  const macShadow = await addDeepShadow(macMeta.width, macMeta.height, { blur: 30, opacity: 0.18, spread: 50 });
  const ipadShadow = await addDeepShadow(ipadMeta.width, ipadMeta.height, { blur: 20, opacity: 0.15, spread: 35 });

  await sharp(bg).composite(intComposites([
    { input: header, top: 40, left: 0 },
    { input: sub, top: 110, left: 0 },
    { input: macShadow.ambient, top: macY - 25 + 15, left: macX - 25 },
    { input: macbook, top: macY, left: macX },
    { input: ipadShadow.ambient, top: ipadY - 18 + 10, left: ipadX - 18 },
    { input: ipad, top: ipadY, left: ipadX },
    { input: iphone, top: iphoneY, left: iphoneX },
  ])).png().toFile(outPath);
  console.log(`   ✓ Image 8: Multi-Device${aiBgs.devices ? ' (AI background)' : ''}`);
}

// ─── IMAGE 9: MACBOOK CLOSE-UP ──────────────────────────────
async function composeMacbookCloseup(caps, theme, outPath, aiBgs = {}) {
  // AI lifestyle background or gradient fallback
  let bg;
  if (aiBgs.macbook) {
    bg = await sharp(aiBgs.macbook)
      .composite([{ input: darkOverlay(W, H) }])
      .png().toBuffer();
  } else {
    bg = await sharp(premiumGradientBg(W, H, theme.primaryDark, theme.primary, theme.secondary))
      .png().toBuffer();
  }

  // Large MacBook mockup
  const macbook = await deviceMockup(caps.top, 'macbook', 1.3);
  const macMeta = await sharp(macbook).metadata();

  // Deep shadow
  const shadow = await addDeepShadow(macMeta.width, macMeta.height, {
    blur: 45, opacity: 0.25, spread: 70, offsetY: 20,
  });

  // Headline with text shadow
  const header = textWithShadow('Professional. Clean. Ready to Use.', {
    size: 44, weight: 'bold', color: '#FFFFFF', h: 65, shadowBlur: 10, shadowOpacity: 0.4,
  });
  const sub = textWithShadow('Every formula, chart, and layout — pre-built for you', {
    size: 24, weight: '400', color: '#FFFFFFCC', h: 50, shadowBlur: 6, shadowOpacity: 0.3,
  });

  // Position macbook centered, slightly lower to show text above
  const macX = Math.round((W - macMeta.width) / 2);
  const macY = 200;

  // Decorative accent
  const accent = roundedRect(80, 4, theme.secondary, 2);

  await sharp(bg).composite(intComposites([
    { input: shadow.ambient, top: macY - 35 + 20, left: macX - 35 },
    { input: shadow.contact, top: macY - 18 + 20, left: macX - 9 },
    { input: header, top: 50, left: 0 },
    { input: accent, top: 120, left: (W - 80) / 2 },
    { input: sub, top: 135, left: 0 },
    { input: macbook, top: macY, left: macX },
  ])).png().toFile(outPath);
  console.log(`   ✓ Image 9: MacBook Close-up${aiBgs.macbook ? ' (AI background)' : ''}`);
}

// ─── IMAGE 10: TABLET + PHONE MOCKUP ────────────────────────
async function composeTabletPhone(caps, theme, outPath) {
  const bg = await sharp(solidBg(W, H, theme.bg)).png().toBuffer();

  // iPad (large, angled slightly via positioning) and iPhone side by side
  const ipad = await deviceMockup(caps.mid, 'ipad', 0.85);
  const iphone = await deviceMockup(caps.bottom, 'iphone', 0.70);

  const ipadMeta = await sharp(ipad).metadata();
  const iphoneMeta = await sharp(iphone).metadata();

  // Header
  const header = textLine('Mobile Friendly Design', { size: 48, weight: 'bold', color: theme.text, h: 70 });
  const sub = textLine('Access your planner from your tablet or phone', { size: 24, weight: '400', color: theme.textLight, h: 50 });

  // Position: iPad center-left, iPhone right with overlap
  const ipadX = Math.round(W * 0.12);
  const ipadY = 210;
  const iphoneX = Math.round(W * 0.62);
  const iphoneY = Math.round(H - iphoneMeta.height - 60);

  // Decorative circles
  const circle1 = Buffer.from(`<svg width="300" height="300" xmlns="http://www.w3.org/2000/svg">
    <circle cx="150" cy="150" r="150" fill="${theme.primary}" opacity="0.05"/>
  </svg>`);
  const circle2 = Buffer.from(`<svg width="200" height="200" xmlns="http://www.w3.org/2000/svg">
    <circle cx="100" cy="100" r="100" fill="${theme.secondary}" opacity="0.08"/>
  </svg>`);

  // Device labels
  const ipadLabel = textLine('iPad / Tablet', { size: 22, weight: '600', color: theme.primary, h: 40, w: ipadMeta.width });
  const iphoneLabel = textLine('iPhone / Mobile', { size: 22, weight: '600', color: theme.secondary, h: 40, w: iphoneMeta.width });

  await sharp(bg).composite(intComposites([
    { input: circle1, top: -50, left: W - 250 },
    { input: circle2, top: H - 200, left: -50 },
    { input: header, top: 40, left: 0 },
    { input: sub, top: 110, left: 0 },
    { input: ipad, top: ipadY, left: ipadX },
    { input: iphone, top: iphoneY, left: iphoneX },
    { input: ipadLabel, top: ipadY + ipadMeta.height + 15, left: ipadX },
    { input: iphoneLabel, top: iphoneY + iphoneMeta.height + 15, left: iphoneX },
  ])).png().toFile(outPath);
  console.log('   ✓ Image 10: Tablet + Phone');
}

// ══════════════════════════════════════════════════════════════
// STEP 4: PROMO VIDEO (FFmpeg)
// ══════════════════════════════════════════════════════════════

async function generatePromoVideo(outDir, theme) {
  const ffmpeg = '/opt/homebrew/bin/ffmpeg';

  // Verify ffmpeg exists
  try { execSync(`${ffmpeg} -version`, { stdio: 'pipe' }); }
  catch { console.log('   ⚠ FFmpeg not found, skipping video'); return null; }

  // Collect the listing images in order
  const images = [];
  for (let i = 1; i <= 10; i++) {
    const file = fs.readdirSync(outDir).find(f => f.startsWith(`${i}_`));
    if (file) images.push(path.join(outDir, file));
  }
  if (images.length === 0) { console.log('   ⚠ No images found for video'); return null; }

  // Each slide: 3 seconds display + 0.5s fade transition
  // Ken Burns effect: slight zoom-in from 100% to 105%
  const slideDuration = 3;
  const fps = 30;
  const framesPerSlide = slideDuration * fps; // 90 frames per slide
  const totalFrames = images.length * framesPerSlide;

  // Go straight to the simple concat approach — reliable, fast, compatible
  const videoPath = path.join(outDir, 'promo_video.mp4');

  console.log(`   Generating ${images.length}-slide promo video...`);
  return generateSimpleVideo(outDir, images, ffmpeg);
}

/** Simpler FFmpeg slideshow fallback — concat demuxer */
async function generateSimpleVideo(outDir, images, ffmpeg) {
  const videoPath = path.join(outDir, 'promo_video.mp4');
  const listPath = path.join(outDir, '_concat_list.txt');

  // Write concat list with ABSOLUTE paths (concat resolves relative to list file location)
  const lines = images.map(img => `file '${path.resolve(img)}'\nduration 3`).join('\n');
  fs.writeFileSync(listPath, lines + `\nfile '${path.resolve(images[images.length - 1])}'`);

  const cmd = [
    ffmpeg, '-y',
    '-f', 'concat', '-safe', '0', '-i', `"${listPath}"`,
    '-vf', '"scale=2000:1500:force_original_aspect_ratio=decrease,pad=2000:1500:(ow-iw)/2:(oh-ih)/2,format=yuv420p"',
    '-c:v', 'libx264', '-preset', 'medium', '-crf', '23',
    '-pix_fmt', 'yuv420p', '-movflags', '+faststart',
    `"${videoPath}"`,
  ];

  try {
    execSync(cmd.join(' '), { stdio: 'pipe', timeout: 180000 });
    // Cleanup temp file
    fs.unlinkSync(listPath);
    const stats = fs.statSync(videoPath);
    console.log(`   ✓ Promo video: ${Math.round(stats.size / 1024)}KB`);
    return videoPath;
  } catch (err) {
    console.log(`   ✗ Video generation failed: ${err.stderr?.toString().substring(0, 200) || err.message?.substring(0, 200)}`);
    try { fs.unlinkSync(listPath); } catch {}
    return null;
  }
}

// ══════════════════════════════════════════════════════════════
// MAIN PIPELINE
// ══════════════════════════════════════════════════════════════

async function main() {
  const args = process.argv.slice(2);
  if (args.length === 0) {
    console.log('Usage: node scripts/etsy-image-pipeline.mjs <SHEET_URL_OR_ID> --niche <niche>');
    console.log('Niches:', Object.keys(THEMES).join(', '));
    process.exit(1);
  }

  const sheetInput = args[0];
  const nicheIdx = args.indexOf('--niche');
  const niche = nicheIdx !== -1 ? args[nicheIdx + 1] : 'budget';
  const titleIdx = args.indexOf('--title');
  const customTitle = titleIdx !== -1 ? args[titleIdx + 1] : null;

  const theme = THEMES[niche];
  if (!theme) {
    console.error(`Unknown niche: ${niche}. Available: ${Object.keys(THEMES).join(', ')}`);
    process.exit(1);
  }

  if (customTitle) theme.headline = customTitle;

  const sheetId = extractSheetId(sheetInput);
  const timestamp = Date.now();
  const outDir = path.resolve(`./output/listing-images/${niche}_${timestamp}`);
  fs.mkdirSync(outDir, { recursive: true });

  console.log('');
  console.log('═══════════════════════════════════════════════════');
  console.log(`  Etsy Image Pipeline — ${theme.headline}`);
  console.log('═══════════════════════════════════════════════════');
  console.log('');

  // Step 1: Share sheet publicly
  console.log('[1/4] Sharing sheet publicly...');
  let permId;
  try {
    permId = await makeSheetPublic(sheetId);
  } catch (e) {
    console.warn('   ⚠ Could not share sheet (may already be public):', e.message);
  }

  // Step 2: Capture screenshots
  console.log('[2/4] Capturing screenshots...');
  let caps;
  try {
    caps = await captureScreenshots(sheetId, outDir);
  } catch (e) {
    console.error('   ✗ Screenshot capture failed:', e.message);
    console.log('   Falling back to placeholder images...');
    // Create simple placeholder screenshots so composition can proceed
    for (const name of ['raw_top.png', 'raw_mid.png', 'raw_bottom.png']) {
      await sharp(solidBg(1440, 900, '#F5F0EB')).png().toFile(path.join(outDir, name));
    }
    caps = {
      top: path.join(outDir, 'raw_top.png'),
      mid: path.join(outDir, 'raw_mid.png'),
      bottom: path.join(outDir, 'raw_bottom.png'),
    };
  }

  // Step 3: Generate AI backgrounds + compose 10 listing images
  console.log('[3/5] Composing listing images...');
  const aiBgs = await generateAllAIBackgrounds(niche);
  await composeHero(caps, theme, path.join(outDir, '1_hero.png'), aiBgs);
  await composeMultiDevice(caps, theme, path.join(outDir, '2_devices.png'), aiBgs);
  await composeMacbookCloseup(caps, theme, path.join(outDir, '3_macbook.png'), aiBgs);
  await composeOverview(caps, theme, path.join(outDir, '4_overview.png'));
  await composeDetail(caps, theme, path.join(outDir, '5_detail.png'));
  await composeFeatures(caps, theme, path.join(outDir, '6_features.png'));
  await composeTabletPhone(caps, theme, path.join(outDir, '7_tablet_phone.png'));
  await composeIncluded(caps, theme, path.join(outDir, '8_included.png'));
  await composeDelivery(caps, theme, path.join(outDir, '9_delivery.png'));
  await composeLifestyle(caps, theme, path.join(outDir, '10_lifestyle.png'), aiBgs);

  // Step 4: Generate promo video
  console.log('[4/5] Generating promo video...');
  await generatePromoVideo(outDir, theme);

  // Step 5: Cleanup — revoke public access
  console.log('[5/5] Cleaning up...');
  if (permId) await revokePublicAccess(sheetId, permId);

  console.log('');
  console.log('═══════════════════════════════════════════════════');
  console.log(`  ✅ Done! 10 listing images + promo video generated`);
  console.log(`  📁 ${outDir}`);
  console.log('═══════════════════════════════════════════════════');
  console.log('');

  // List all output files
  for (const f of fs.readdirSync(outDir).filter(f => /^\d+_/.test(f) || f.endsWith('.mp4'))) {
    const stats = fs.statSync(path.join(outDir, f));
    console.log(`  ${f}  (${Math.round(stats.size / 1024)}KB)`);
  }

  // Machine-readable output marker for factory integration
  console.log(`__OUTPUT_DIR__${outDir}__OUTPUT_END__`);

  return outDir;
}

/**
 * Exported function — called by build-premium-template.mjs after sheet creation.
 * @param {string} sheetId - Google Sheets spreadsheet ID
 * @param {string} niche - one of: wedding, budget, baby, travel, debt, business
 * @param {string} [customTitle] - optional override headline
 * @returns {string} output directory path
 */
export async function generateListingAssets(sheetId, niche = 'budget', customTitle = null) {
  const theme = { ...THEMES[niche] };
  if (!theme) throw new Error(`Unknown niche: ${niche}`);
  if (customTitle) theme.headline = customTitle;

  const timestamp = Date.now();
  const outDir = path.resolve(`./output/listing-images/${niche}_${timestamp}`);
  fs.mkdirSync(outDir, { recursive: true });

  console.log('');
  console.log('═══════════════════════════════════════════════════');
  console.log(`  Etsy Image Pipeline — ${theme.headline}`);
  console.log('═══════════════════════════════════════════════════');
  console.log('');

  // Share sheet
  console.log('[1/5] Sharing sheet publicly...');
  let permId;
  try { permId = await makeSheetPublic(sheetId); }
  catch (e) { console.warn('   ⚠ Could not share:', e.message); }

  // Capture
  console.log('[2/5] Capturing screenshots...');
  let caps;
  try {
    caps = await captureScreenshots(sheetId, outDir);
  } catch (e) {
    console.error('   ✗ Screenshot failed:', e.message);
    for (const name of ['raw_top.png', 'raw_mid.png', 'raw_bottom.png']) {
      await sharp(solidBg(1440, 900, '#F5F0EB')).png().toFile(path.join(outDir, name));
    }
    caps = {
      top: path.join(outDir, 'raw_top.png'),
      mid: path.join(outDir, 'raw_mid.png'),
      bottom: path.join(outDir, 'raw_bottom.png'),
    };
  }

  // Compose with AI photorealistic backgrounds
  console.log('[3/5] Composing listing images...');
  const aiBgs = await generateAllAIBackgrounds(niche);
  await composeHero(caps, theme, path.join(outDir, '1_hero.png'), aiBgs);
  await composeMultiDevice(caps, theme, path.join(outDir, '2_devices.png'), aiBgs);
  await composeMacbookCloseup(caps, theme, path.join(outDir, '3_macbook.png'), aiBgs);
  await composeOverview(caps, theme, path.join(outDir, '4_overview.png'));
  await composeDetail(caps, theme, path.join(outDir, '5_detail.png'));
  await composeFeatures(caps, theme, path.join(outDir, '6_features.png'));
  await composeTabletPhone(caps, theme, path.join(outDir, '7_tablet_phone.png'));
  await composeIncluded(caps, theme, path.join(outDir, '8_included.png'));
  await composeDelivery(caps, theme, path.join(outDir, '9_delivery.png'));
  await composeLifestyle(caps, theme, path.join(outDir, '10_lifestyle.png'), aiBgs);

  // Video
  console.log('[4/5] Generating promo video...');
  await generatePromoVideo(outDir, theme);

  // Cleanup
  console.log('[5/5] Cleaning up...');
  if (permId) await revokePublicAccess(sheetId, permId);

  console.log(`\n  ✅ Listing assets ready → ${outDir}\n`);
  // Machine-readable output marker for factory integration
  console.log(`__OUTPUT_DIR__${outDir}__OUTPUT_END__`);
  return outDir;
}

// CLI entry point
if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(new URL(import.meta.url).pathname)) {
  main().catch(e => { console.error('Pipeline failed:', e); process.exit(1); });
}
