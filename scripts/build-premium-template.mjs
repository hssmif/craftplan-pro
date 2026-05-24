/**
 * ══════════════════════════════════════════════════════════════
 * Premium Template Builder v2 — Card-Based Grid Dashboard
 *
 * Inspired by Priori Digital Studio's Etsy bestseller design:
 * - Cream/beige page background with white bordered cards
 * - Navigation sidebar on left with tab links
 * - KPI cards with large numbers + donut charts
 * - Two-column content layout (tables + charts)
 * - Multiple sections: budget, categories, goals, transactions
 *
 * Usage:
 *   node scripts/build-premium-template.mjs              → default budget
 *   node scripts/build-premium-template.mjs baby          → baby budget
 *   node scripts/build-premium-template.mjs wedding       → wedding planner
 *   node scripts/build-premium-template.mjs travel        → travel budget
 * ══════════════════════════════════════════════════════════════
 */
import { google } from 'googleapis';
import { getAuthClient } from './gws-oauth-helper.mjs';
import { generateListingAssets } from './etsy-image-pipeline.mjs';

// ── Color Helpers ───────────────────────────────────────────
const hex = (h) => ({
  red: parseInt(h.slice(1, 3), 16) / 255,
  green: parseInt(h.slice(3, 5), 16) / 255,
  blue: parseInt(h.slice(5, 7), 16) / 255,
});

// ══════════════════════════════════════════════════════════════
// NICHE DEFINITIONS — Same structure, different content
// ══════════════════════════════════════════════════════════════

const NICHES = {
  budget: {
    title: 'MONTHLY BUDGET PLANNER',
    subtitle: 'Track your income, expenses & savings at a glance',
    emoji: '📊',
    incomeLabel: 'Monthly Income',
    monthlyIncome: 4200,
    accent: '#5B7553',       // sage green (Priori-style)
    accentLight: '#EBF0E9',
    accentMid: '#A3B89D',
    secondary: '#8D6E63',    // warm brown
    secondaryLight: '#EFEBE9',
    warm: '#C9968E',          // dusty rose
    warmLight: '#FFF0ED',
    kpis: ['TOTAL INCOME', 'TOTAL SPENT', 'NET SAVINGS', 'SAVINGS RATE'],
    kpiFormulas: [
      '=SUMIFS(Transactions!C:C,Transactions!E:E,"Income")',
      '=SUMIFS(Transactions!C:C,Transactions!E:E,"<>Income",Transactions!E:E,"<>")',
      '=E8-G8',
      '=IF(E8>0,J8/E8,0)',
    ],
    kpiFormats: ['$', '$', '$', '%'],
    categories: [
      { name: 'Rent / Mortgage', budget: 1200 },
      { name: 'Groceries', budget: 450 },
      { name: 'Utilities', budget: 180 },
      { name: 'Transportation', budget: 200 },
      { name: 'Insurance', budget: 150 },
      { name: 'Subscriptions', budget: 80 },
      { name: 'Personal Care', budget: 120 },
      { name: 'Entertainment', budget: 100 },
      { name: 'Dining Out', budget: 150 },
      { name: 'Savings', budget: 500 },
    ],
    goals: [
      { name: 'Emergency Fund', target: 10000, saved: 3200 },
      { name: 'Vacation Fund', target: 3000, saved: 800 },
      { name: 'New Car', target: 15000, saved: 2100 },
      { name: 'Home Down Payment', target: 40000, saved: 8500 },
    ],
    transactions: [
      // ── January ──
      ['2026-01-02', 'Paycheck', 2100, 'Salary', 'Income'],
      ['2026-01-03', 'Rent Payment', 1200, 'Rent / Mortgage', 'Housing'],
      ['2026-01-04', 'Whole Foods', 68, 'Groceries', 'Food'],
      ['2026-01-05', 'Electric Bill', 95, 'Utilities', 'Bills'],
      ['2026-01-06', 'Gas Station', 42, 'Transportation', 'Transport'],
      ['2026-01-07', 'Netflix', 15, 'Subscriptions', 'Entertainment'],
      ['2026-01-08', 'Trader Joes', 54, 'Groceries', 'Food'],
      ['2026-01-10', 'Gym Membership', 45, 'Personal Care', 'Health'],
      ['2026-01-12', 'Uber', 22, 'Transportation', 'Transport'],
      ['2026-01-14', 'Movie Night', 35, 'Entertainment', 'Leisure'],
      ['2026-01-15', 'Paycheck', 2100, 'Salary', 'Income'],
      ['2026-01-16', 'Car Insurance', 150, 'Insurance', 'Bills'],
      ['2026-01-18', 'Target', 85, 'Personal Care', 'Shopping'],
      ['2026-01-20', 'Costco', 120, 'Groceries', 'Food'],
      ['2026-01-22', 'Spotify', 10, 'Subscriptions', 'Entertainment'],
      ['2026-01-25', 'Hair Cut', 40, 'Personal Care', 'Self Care'],
      ['2026-01-28', 'Water Bill', 45, 'Utilities', 'Bills'],
      ['2026-01-30', 'Dinner Out', 55, 'Dining Out', 'Food'],
      // ── February ──
      ['2026-02-01', 'Paycheck', 2100, 'Salary', 'Income'],
      ['2026-02-02', 'Rent Payment', 1200, 'Rent / Mortgage', 'Housing'],
      ['2026-02-04', 'Whole Foods', 72, 'Groceries', 'Food'],
      ['2026-02-05', 'Gas Bill', 110, 'Utilities', 'Bills'],
      ['2026-02-06', 'Gas Station', 38, 'Transportation', 'Transport'],
      ['2026-02-07', 'Netflix', 15, 'Subscriptions', 'Entertainment'],
      ['2026-02-09', 'Costco', 95, 'Groceries', 'Food'],
      ['2026-02-10', 'Gym Membership', 45, 'Personal Care', 'Health'],
      ['2026-02-12', 'Valentine Dinner', 120, 'Dining Out', 'Food'],
      ['2026-02-15', 'Paycheck', 2100, 'Salary', 'Income'],
      ['2026-02-16', 'Car Insurance', 150, 'Insurance', 'Bills'],
      ['2026-02-18', 'Amazon', 65, 'Online Shopping', 'Shopping'],
      ['2026-02-20', 'Trader Joes', 58, 'Groceries', 'Food'],
      ['2026-02-22', 'Spotify', 10, 'Subscriptions', 'Entertainment'],
      ['2026-02-25', 'Water Bill', 42, 'Utilities', 'Bills'],
      ['2026-02-28', 'Phone Bill', 85, 'Utilities', 'Bills'],
      // ── March ──
      ['2026-03-01', 'Paycheck', 2100, 'Salary', 'Income'],
      ['2026-03-02', 'Rent Payment', 1200, 'Rent / Mortgage', 'Housing'],
      ['2026-03-03', 'Whole Foods', 78, 'Groceries', 'Food'],
      ['2026-03-05', 'Electric Bill', 88, 'Utilities', 'Bills'],
      ['2026-03-06', 'Gas Station', 45, 'Transportation', 'Transport'],
      ['2026-03-07', 'Netflix', 15, 'Subscriptions', 'Entertainment'],
      ['2026-03-09', 'Target', 92, 'Personal Care', 'Shopping'],
      ['2026-03-10', 'Gym Membership', 45, 'Personal Care', 'Health'],
      ['2026-03-13', 'Brunch', 48, 'Dining Out', 'Food'],
      ['2026-03-15', 'Paycheck', 2100, 'Salary', 'Income'],
      ['2026-03-16', 'Car Insurance', 150, 'Insurance', 'Bills'],
      ['2026-03-18', 'Costco', 115, 'Groceries', 'Food'],
      ['2026-03-20', 'Uber', 28, 'Transportation', 'Transport'],
      ['2026-03-22', 'Spotify', 10, 'Subscriptions', 'Entertainment'],
      ['2026-03-25', 'Hair Cut', 40, 'Personal Care', 'Self Care'],
      ['2026-03-28', 'Water Bill', 44, 'Utilities', 'Bills'],
    ],
    summaryMonths: true,
    tabNames: ['Dashboard', 'Transactions', 'Categories', 'Monthly Summary', 'Savings Goals', 'Setup & Instructions'],
    navSections: [
      { header: 'OVERVIEW', items: ['Dashboard', 'Categories'] },
      { header: 'TRACKING', items: ['Transactions', 'Monthly Summary'] },
      { header: 'GOALS', items: ['Savings Goals'] },
      { header: 'HELP', items: ['Setup & Instructions'] },
    ],
  },

  baby: {
    title: 'BABY BUDGET PLANNER',
    subtitle: 'Track every baby expense from diapers to daycare',
    emoji: '👶',
    incomeLabel: 'Monthly Household Income',
    monthlyIncome: 5500,
    accent: '#7E57C2',       // soft purple
    accentLight: '#EDE7F6',
    accentMid: '#B39DDB',
    secondary: '#E91E63',    // pink
    secondaryLight: '#FCE4EC',
    warm: '#26A69A',          // teal
    warmLight: '#E0F2F1',
    kpis: ['HOUSEHOLD INCOME', 'BABY COSTS', 'OTHER EXPENSES', 'NET SAVINGS'],
    kpiFormulas: [
      '=M3',
      '=SUMIFS(Transactions!C:C,Transactions!E:E,"Baby")',
      '=SUMIFS(Transactions!C:C,Transactions!E:E,"<>Income",Transactions!E:E,"<>Baby")',
      '=E8-G8-J8',
    ],
    kpiFormats: ['$', '$', '$', '$'],
    categories: [
      { name: 'Diapers & Wipes', budget: 80 },
      { name: 'Formula & Food', budget: 150 },
      { name: 'Clothing', budget: 60 },
      { name: 'Pediatric Visits', budget: 100 },
      { name: 'Childcare', budget: 800 },
      { name: 'Nursery & Gear', budget: 120 },
      { name: 'Baby Toys', budget: 40 },
      { name: 'Bath & Hygiene', budget: 35 },
      { name: 'Housing', budget: 1400 },
      { name: 'Groceries', budget: 400 },
    ],
    goals: [
      { name: 'College Fund (529)', target: 20000, saved: 4200 },
      { name: 'Baby Room Setup', target: 3000, saved: 2800 },
      { name: 'Childcare Reserve', target: 5000, saved: 1500 },
      { name: 'Emergency Fund', target: 10000, saved: 6000 },
    ],
    transactions: [
      ['2026-01-02', 'Paycheck', 2750, 'Salary', 'Income'],
      ['2026-01-03', 'Daycare - January', 800, 'Childcare', 'Baby'],
      ['2026-01-04', 'Amazon - Diapers', 45, 'Diapers & Wipes', 'Baby'],
      ['2026-01-05', 'Pediatrician Copay', 30, 'Pediatric Visits', 'Baby'],
      ['2026-01-06', 'Target - Baby Clothes', 55, 'Clothing', 'Baby'],
      ['2026-01-07', 'Similac Formula', 38, 'Formula & Food', 'Baby'],
      ['2026-01-08', 'Grocery Store', 95, 'Groceries', 'Household'],
      ['2026-01-10', 'Rent', 1400, 'Housing', 'Household'],
      ['2026-01-12', 'Baby Einstein Toys', 25, 'Baby Toys', 'Baby'],
      ['2026-01-14', 'Buy Buy Baby', 65, 'Nursery & Gear', 'Baby'],
      ['2026-01-15', 'Paycheck', 2750, 'Salary', 'Income'],
      ['2026-01-16', 'Johnson Baby Wash', 12, 'Bath & Hygiene', 'Baby'],
      ['2026-01-18', 'Gerber Baby Food', 28, 'Formula & Food', 'Baby'],
      ['2026-01-20', 'Electric Bill', 110, 'Utilities', 'Household'],
      ['2026-01-22', 'Pampers Refill', 35, 'Diapers & Wipes', 'Baby'],
      ['2026-01-25', 'Baby Monitor', 80, 'Nursery & Gear', 'Baby'],
      ['2026-01-28', 'Grocery Store', 88, 'Groceries', 'Household'],
      ['2026-01-30', 'Baby Clothes Sale', 42, 'Clothing', 'Baby'],
    ],
    summaryMonths: true,
    tabNames: ['Dashboard', 'Transactions', 'Categories', 'Monthly Summary', 'Savings Goals', 'Setup & Instructions'],
    navSections: [
      { header: 'OVERVIEW', items: ['Dashboard', 'Categories'] },
      { header: 'TRACKING', items: ['Transactions', 'Monthly Summary'] },
      { header: 'GOALS', items: ['Savings Goals'] },
      { header: 'HELP', items: ['Setup & Instructions'] },
    ],
  },

  wedding: {
    title: 'WEDDING PLANNER',
    subtitle: 'Your dream wedding, beautifully organized',
    emoji: '💍',
    incomeLabel: 'Total Wedding Budget',
    monthlyIncome: 35000,
    accent: '#5B7553',       // sage green (matches Priori)
    accentLight: '#EBF0E9',
    accentMid: '#A3B89D',
    secondary: '#8D6E63',    // warm brown
    secondaryLight: '#EFEBE9',
    warm: '#C9968E',          // dusty rose
    warmLight: '#FFF0ED',
    // Wedding-specific data
    coupleName1: 'John',
    coupleName2: 'Emily',
    weddingDate: '2026-09-15',
    guestData: {
      totalInvited: 120,
      rsvpReceived: 89,
      attending: 72,
      declined: 17,
      tablesNeeded: 9,
    },
    timeline: [
      { phase: '12+ Months Before', tasks: 5, done: 5 },
      { phase: '6-12 Months Before', tasks: 12, done: 8 },
      { phase: '3-6 Months Before', tasks: 7, done: 3 },
      { phase: '1-3 Months Before', tasks: 5, done: 0 },
      { phase: '1 Week Before', tasks: 5, done: 0 },
      { phase: '1 Day Before', tasks: 2, done: 0 },
    ],
    vendors: [
      { vendor: 'Grand Ballroom', category: 'Venue', amount: 12000, status: '✅ Booked' },
      { vendor: 'Bloom & Petal', category: 'Florist', amount: 3500, status: '✅ Booked' },
      { vendor: 'Capture Moments', category: 'Photography', amount: 4000, status: '⏳ Deposit' },
      { vendor: 'Harmony Sounds', category: 'DJ / Music', amount: 2000, status: '⏳ Deposit' },
      { vendor: 'Elegant Bites', category: 'Catering', amount: 8000, status: '📝 Quote' },
    ],
    heroImage: 'https://images.unsplash.com/photo-1519741497674-611481863552?w=600&h=350&fit=crop',
    flowerImage: 'https://images.unsplash.com/photo-1522748906645-95d8adfd52c7?w=600&h=350&fit=crop',
    kpis: ['WEDDING BUDGET', 'TOTAL SPENT', 'LEFT TO SPEND'],
    kpiFormulas: [
      '=M3',
      '=SUMIFS(Transactions!C:C,Transactions!E:E,"<>Income")',
      '=J10-L10',
    ],
    kpiFormats: ['$', '$', '$'],
    categories: [
      { name: 'Venue & Catering', budget: 12000 },
      { name: 'Photography & Video', budget: 4000 },
      { name: 'Flowers & Decor', budget: 3500 },
      { name: 'Attire & Beauty', budget: 3000 },
      { name: 'Music & Entertainment', budget: 2000 },
      { name: 'Invitations & Paper', budget: 800 },
      { name: 'Transportation', budget: 1200 },
      { name: 'Gifts & Favors', budget: 1000 },
      { name: 'Rings', budget: 3000 },
      { name: 'Honeymoon', budget: 4500 },
    ],
    goals: [
      { name: 'Honeymoon Fund', target: 5000, saved: 2000 },
      { name: 'Wedding Day Reserve', target: 3000, saved: 1500 },
      { name: 'Ring Upgrade', target: 2000, saved: 800 },
      { name: 'First Home Savings', target: 20000, saved: 5000 },
    ],
    transactions: [
      ['2026-01-05', 'Venue Deposit', 5000, 'Venue & Catering', 'Wedding'],
      ['2026-01-08', 'Photographer Retainer', 1500, 'Photography & Video', 'Wedding'],
      ['2026-01-10', 'Dress Shopping', 1800, 'Attire & Beauty', 'Wedding'],
      ['2026-01-12', 'Florist Consultation', 300, 'Flowers & Decor', 'Wedding'],
      ['2026-01-14', 'Save the Date Cards', 250, 'Invitations & Paper', 'Wedding'],
      ['2026-01-15', 'DJ Deposit', 700, 'Music & Entertainment', 'Wedding'],
      ['2026-01-18', 'Bridesmaid Gifts', 350, 'Gifts & Favors', 'Wedding'],
      ['2026-01-20', 'Catering Tasting', 400, 'Venue & Catering', 'Wedding'],
      ['2026-01-22', 'Wedding Bands', 2500, 'Rings', 'Wedding'],
      ['2026-01-25', 'Limo Rental Deposit', 600, 'Transportation', 'Wedding'],
      ['2026-01-28', 'Centerpiece Samples', 280, 'Flowers & Decor', 'Wedding'],
      ['2026-01-30', 'Groom Suit', 650, 'Attire & Beauty', 'Wedding'],
    ],
    summaryMonths: false,
    tabNames: ['Dashboard', 'Transactions', 'Budget Categories', 'Payment Schedule', 'Vendor Tracker', 'Setup & Instructions'],
    navSections: [
      { header: 'SETUP & OVERVIEW', items: ['Dashboard', 'Setup & Instructions'] },
      { header: 'BUDGET & PAYMENTS', items: ['Budget Categories', 'Transactions', 'Payment Schedule'] },
      { header: 'VENDORS', items: ['Vendor Tracker'] },
    ],
  },

  travel: {
    title: 'TRAVEL BUDGET PLANNER',
    subtitle: 'Plan and track every trip expense in one place',
    emoji: '✈️',
    incomeLabel: 'Trip Budget',
    monthlyIncome: 5000,
    accent: '#00796B',       // teal
    accentLight: '#E0F2F1',
    accentMid: '#80CBC4',
    secondary: '#F57C00',    // orange
    secondaryLight: '#FFF3E0',
    warm: '#1565C0',          // ocean blue
    warmLight: '#E3F2FD',
    kpis: ['TRIP BUDGET', 'TOTAL SPENT', 'REMAINING', '% USED'],
    kpiFormulas: [
      '=M3',
      '=SUMIFS(Transactions!C:C,Transactions!E:E,"<>Income")',
      '=E8-G8',
      '=IF(E8>0,G8/E8,0)',
    ],
    kpiFormats: ['$', '$', '$', '%'],
    categories: [
      { name: 'Flights', budget: 1200 },
      { name: 'Hotels & Lodging', budget: 1500 },
      { name: 'Food & Dining', budget: 600 },
      { name: 'Activities & Tours', budget: 500 },
      { name: 'Local Transport', budget: 300 },
      { name: 'Shopping & Souvenirs', budget: 400 },
      { name: 'Travel Insurance', budget: 200 },
      { name: 'Miscellaneous', budget: 300 },
    ],
    goals: [
      { name: 'Europe Trip Fund', target: 5000, saved: 2800 },
      { name: 'Emergency Travel Fund', target: 1000, saved: 1000 },
      { name: 'Next Trip Savings', target: 3000, saved: 600 },
      { name: 'Travel Gear', target: 500, saved: 350 },
    ],
    transactions: [
      ['2026-01-03', 'Round-trip Flights', 850, 'Flights', 'Travel'],
      ['2026-01-05', 'Hotel Booking (5 nights)', 1100, 'Hotels & Lodging', 'Travel'],
      ['2026-01-06', 'Travel Insurance', 180, 'Travel Insurance', 'Travel'],
      ['2026-01-10', 'Airport Transfer', 45, 'Local Transport', 'Travel'],
      ['2026-01-10', 'Welcome Dinner', 65, 'Food & Dining', 'Travel'],
      ['2026-01-11', 'Walking Tour', 30, 'Activities & Tours', 'Travel'],
      ['2026-01-11', 'Lunch Cafe', 22, 'Food & Dining', 'Travel'],
      ['2026-01-11', 'Metro Pass', 15, 'Local Transport', 'Travel'],
      ['2026-01-12', 'Museum Entry', 25, 'Activities & Tours', 'Travel'],
      ['2026-01-12', 'Souvenir Shop', 40, 'Shopping & Souvenirs', 'Travel'],
      ['2026-01-13', 'Day Trip Bus', 35, 'Local Transport', 'Travel'],
      ['2026-01-13', 'Seaside Restaurant', 55, 'Food & Dining', 'Travel'],
      ['2026-01-14', 'Cooking Class', 80, 'Activities & Tours', 'Travel'],
      ['2026-01-14', 'Market Shopping', 60, 'Shopping & Souvenirs', 'Travel'],
      ['2026-01-15', 'Airport Taxi', 50, 'Local Transport', 'Travel'],
    ],
    summaryMonths: false,
    tabNames: ['Dashboard', 'Transactions', 'Categories', 'Itinerary', 'Savings Goals', 'Setup & Instructions'],
    navSections: [
      { header: 'OVERVIEW', items: ['Dashboard', 'Categories'] },
      { header: 'TRACKING', items: ['Transactions', 'Itinerary'] },
      { header: 'GOALS', items: ['Savings Goals'] },
      { header: 'HELP', items: ['Setup & Instructions'] },
    ],
  },
};

// ══════════════════════════════════════════════════════════════
// PALETTE
// ══════════════════════════════════════════════════════════════

function buildPalette(niche) {
  return {
    cream: hex('#F5F0EB'),        // page background (Priori style)
    white: hex('#FFFFFF'),         // card backgrounds
    offWhite: hex('#FAFBFC'),
    lightGray: hex('#F1F5F9'),
    medGray: hex('#E2E8F0'),
    border: hex('#D5CFC9'),        // warm gray border
    cardBorder: hex('#E0DAD4'),    // subtle card border
    textDark: hex('#2D2A26'),      // warm dark
    textMuted: hex('#7A7570'),     // warm muted
    textLight: hex('#A39E99'),
    navBg: hex('#F0EBE6'),         // slightly darker cream for nav
    navText: hex('#5B7553'),       // accent-colored nav text

    accent: hex(niche.accent),
    accentLight: hex(niche.accentLight),
    accentMid: hex(niche.accentMid),
    secondary: hex(niche.secondary),
    secondaryLight: hex(niche.secondaryLight),
    warm: hex(niche.warm),
    warmLight: hex(niche.warmLight),

    green: hex('#16A34A'),
    greenLight: hex('#DCFCE7'),
    red: hex('#DC2626'),
    redLight: hex('#FEE2E2'),
    warning: hex('#D97706'),
    warningLight: hex('#FEF3C7'),
  };
}

// ══════════════════════════════════════════════════════════════
// HELPERS
// ══════════════════════════════════════════════════════════════

const noBorder = { style: 'NONE' };
const thinBorder = (color) => ({ style: 'SOLID', width: 1, colorStyle: { rgbColor: color } });
const medBorder = (color) => ({ style: 'SOLID_MEDIUM', width: 1, colorStyle: { rgbColor: color } });

function rc(sheetId, r0, r1, c0, c1, fmt) {
  return {
    repeatCell: {
      range: { sheetId, startRowIndex: r0, endRowIndex: r1, startColumnIndex: c0, endColumnIndex: c1 },
      cell: { userEnteredFormat: fmt },
      fields: 'userEnteredFormat(' + Object.keys(fmt).join(',') + ')',
    },
  };
}

function rowH(sheetId, r0, r1, h) {
  return {
    updateDimensionProperties: {
      range: { sheetId, dimension: 'ROWS', startIndex: r0, endIndex: r1 },
      properties: { pixelSize: h },
      fields: 'pixelSize',
    },
  };
}

function colW(sheetId, c0, c1, w) {
  return {
    updateDimensionProperties: {
      range: { sheetId, dimension: 'COLUMNS', startIndex: c0, endIndex: c1 },
      properties: { pixelSize: w },
      fields: 'pixelSize',
    },
  };
}

function mergeCells(sheetId, r0, r1, c0, c1) {
  return {
    mergeCells: {
      range: { sheetId, startRowIndex: r0, endRowIndex: r1, startColumnIndex: c0, endColumnIndex: c1 },
      mergeType: 'MERGE_ALL',
    },
  };
}

// Card helper: creates a white card region with border on cream bg
function cardRegion(sheetId, r0, r1, c0, c1, P) {
  const reqs = [];
  // White fill for card
  reqs.push(rc(sheetId, r0, r1, c0, c1, {
    backgroundColor: P.white,
  }));
  // Outer borders
  reqs.push({
    updateBorders: {
      range: { sheetId, startRowIndex: r0, endRowIndex: r1, startColumnIndex: c0, endColumnIndex: c1 },
      top: thinBorder(P.cardBorder),
      bottom: thinBorder(P.cardBorder),
      left: thinBorder(P.cardBorder),
      right: thinBorder(P.cardBorder),
    },
  });
  return reqs;
}

// Card header bar: colored accent top for a card
function cardHeader(sheetId, r, c0, c1, color, P) {
  return rc(sheetId, r, r + 1, c0, c1, {
    backgroundColor: color,
    textFormat: { foregroundColorStyle: { rgbColor: P.white }, bold: true, fontSize: 10, fontFamily: 'Inter' },
    horizontalAlignment: 'LEFT',
    verticalAlignment: 'MIDDLE',
    padding: { left: 8 },
  });
}

// ══════════════════════════════════════════════════════════════
// DASHBOARD LAYOUT
//
// Grid: 14 columns (A-N, indices 0-13)
//   Col 0:    12px left margin (cream)
//   Col 1-2:  Navigation sidebar (160px total)
//   Col 3:    8px gap (cream)
//   Col 4-7:  Left content (4 cols, ~480px)
//   Col 8:    8px gap (cream)
//   Col 9-12: Right content (4 cols, ~480px)
//   Col 13:   12px right margin (cream)
//
// Rows:
//   0:     8px top margin
//   1-2:   Header banner (accent + title)
//   3:     8px gap
//   4-9:   KPI Cards row (3 cards)
//   10:    8px gap
//   11-23: Category Breakdown card (left) + Expense Chart card (right)
//   24:    8px gap
//   25-33: Savings Goals card (left) + Recent Transactions card (right)
//   34:    8px gap
//   35-37: Footer
// ══════════════════════════════════════════════════════════════

const DASH_COLS = 14;
const DASH_ROWS = 45;

// Navigation sidebar indices
const NAV_C0 = 1;
const NAV_C1 = 3; // exclusive
// Left content
const L_C0 = 4;
const L_C1 = 8;
// Right content
const R_C0 = 9;
const R_C1 = 13;

function dashboardValues(niche) {
  // Build a 2D sparse array, DASH_ROWS × DASH_COLS
  const grid = Array.from({ length: DASH_ROWS }, () => Array(DASH_COLS).fill(''));

  // Row 1: Header title (col 4-12)
  grid[1][L_C0] = `${niche.emoji}  ${niche.title}`;
  // Row 2: Subtitle + Income
  grid[2][L_C0] = niche.subtitle;
  grid[2][R_C0 + 2] = `${niche.incomeLabel}:`;
  grid[2][R_C1 - 1] = niche.monthlyIncome;

  // Navigation sidebar (rows 1-30)
  grid[1][NAV_C0] = `${niche.emoji} ${niche.title.split(' ').slice(-1)[0]}`;
  let navRow = 4;
  for (const section of niche.navSections) {
    grid[navRow][NAV_C0] = section.header;
    navRow++;
    for (const item of section.items) {
      grid[navRow][NAV_C0] = `  → ${item}`;
      navRow++;
    }
    navRow++; // gap
  }

  // KPI Cards (rows 4-9, in left+right content area)
  // We use 3 KPI cards for visual impact like the reference
  // Card 1: cols 4-5, Card 2: cols 7-8, Card 3: cols 10-11 (with gaps at 6 and 9)
  grid[5][L_C0] = niche.kpis[0];
  grid[5][L_C0 + 2] = niche.kpis[1];
  grid[5][R_C0] = niche.kpis[2];
  grid[5][R_C0 + 2] = niche.kpis[3];

  // KPI formulas — row 8 (1-indexed), using spread across columns
  // A8 = KPI1, C8 = KPI2, E8 = KPI3, G8 = KPI4 — but we're in different cols now
  // Let's put them at: col4/row7, col6/row7, col9/row7, col11/row7
  grid[7][L_C0] = niche.kpiFormulas[0];
  grid[7][L_C0 + 2] = niche.kpiFormulas[1];
  grid[7][R_C0] = niche.kpiFormulas[2];
  grid[7][R_C0 + 2] = niche.kpiFormulas[3];

  // Category Breakdown card (rows 11-23, left cols 4-7)
  grid[11][L_C0] = 'EXPENSE CATEGORY';
  grid[12][L_C0] = 'Category';
  grid[12][L_C0 + 1] = 'Budget';
  grid[12][L_C0 + 2] = 'Spent';
  grid[12][L_C0 + 3] = 'Remaining';

  const catStartRow = 13;
  niche.categories.forEach((cat, i) => {
    const r = catStartRow + i;
    const row1 = r + 1; // 1-indexed
    // Use deterministic "spent" based on index (not random) for consistent screenshots
    const spentPct = [0.72, 0.85, 0.60, 0.91, 0.45, 1.05, 0.78, 0.55, 0.68, 0.80][i % 10];
    const spent = Math.round(cat.budget * spentPct);
    const budgetCol = String.fromCharCode(65 + L_C0 + 1); // F
    const spentCol = String.fromCharCode(65 + L_C0 + 2); // G
    grid[r][L_C0] = cat.name;
    grid[r][L_C0 + 1] = cat.budget;
    grid[r][L_C0 + 2] = spent;
    // Remaining with status emoji: ✅ under budget, ⚠️ close, 🔴 over
    grid[r][L_C0 + 3] = `=IF(${budgetCol}${row1}-${spentCol}${row1}<0,"🔴 "&TEXT(${budgetCol}${row1}-${spentCol}${row1},"$#,##0"),IF(${budgetCol}${row1}-${spentCol}${row1}<${budgetCol}${row1}*0.15,"⚠️ "&TEXT(${budgetCol}${row1}-${spentCol}${row1},"$#,##0"),"✅ "&TEXT(${budgetCol}${row1}-${spentCol}${row1},"$#,##0")))`;
  });
  // Total row
  const catEndRow = catStartRow + niche.categories.length;
  const totalRow1 = catEndRow + 1;
  const budgetCol = String.fromCharCode(65 + L_C0 + 1);
  const spentCol = String.fromCharCode(65 + L_C0 + 2);
  const remCol = String.fromCharCode(65 + L_C0 + 3);
  grid[catEndRow][L_C0] = 'TOTAL';
  grid[catEndRow][L_C0 + 1] = `=SUM(${budgetCol}${catStartRow + 1}:${budgetCol}${catEndRow})`;
  grid[catEndRow][L_C0 + 2] = `=SUM(${spentCol}${catStartRow + 1}:${spentCol}${catEndRow})`;
  grid[catEndRow][L_C0 + 3] = `=SUM(${remCol}${catStartRow + 1}:${remCol}${catEndRow})`;

  // Expense Distribution card header (right cols 9-12, row 11)
  grid[11][R_C0] = 'EXPENSE DISTRIBUTION';
  // Chart will overlay rows 12-22

  // Savings Goals card (rows 25-33, left cols 4-7)
  grid[25][L_C0] = 'SAVINGS GOALS';
  grid[26][L_C0] = 'Goal';
  grid[26][L_C0 + 1] = 'Target';
  grid[26][L_C0 + 2] = 'Saved';
  grid[26][L_C0 + 3] = 'Progress';
  niche.goals.forEach((g, i) => {
    const r = 27 + i;
    const row1 = r + 1;
    const tCol = String.fromCharCode(65 + L_C0 + 1);
    const sCol = String.fromCharCode(65 + L_C0 + 2);
    grid[r][L_C0] = g.name;
    grid[r][L_C0 + 1] = g.target;
    grid[r][L_C0 + 2] = g.saved;
    // Visual progress bar using REPT + percentage
    grid[r][L_C0 + 3] = `=REPT("█",ROUND(MIN(IF(${tCol}${row1}>0,${sCol}${row1}/${tCol}${row1},0),1)*10,0))&REPT("░",10-ROUND(MIN(IF(${tCol}${row1}>0,${sCol}${row1}/${tCol}${row1},0),1)*10,0))&" "&TEXT(IF(${tCol}${row1}>0,${sCol}${row1}/${tCol}${row1},0),"0%")`;
  });

  // Recent Transactions card (rows 25-33, right cols 9-12)
  grid[25][R_C0] = 'RECENT TRANSACTIONS';
  grid[26][R_C0] = 'Date';
  grid[26][R_C0 + 1] = 'Description';
  grid[26][R_C0 + 2] = 'Amount';
  grid[26][R_C0 + 3] = 'Category';
  // Last 6 transactions
  const recentTxns = niche.transactions.filter(t => t[4] !== 'Income').slice(-6);
  recentTxns.forEach((t, i) => {
    const r = 27 + i;
    grid[r][R_C0] = t[0];
    grid[r][R_C0 + 1] = t[1];
    grid[r][R_C0 + 2] = t[2];
    grid[r][R_C0 + 3] = t[3];
  });

  // Budget input cell — income is already in M3 (grid[2][R_C1 - 1])
  // KPI formulas reference M3 (the visible income cell in the subtitle bar)
  // No hidden cell needed — M3 is where the income value lives

  return grid;
}

function dashboardFormatting(sheetId, niche, P) {
  const reqs = [];

  // ── Sheet properties ──
  reqs.push({
    updateSheetProperties: {
      properties: { sheetId, gridProperties: { hideGridlines: true } },
      fields: 'gridProperties.hideGridlines',
    },
  });

  // ── Cream background everywhere ──
  reqs.push(rc(sheetId, 0, DASH_ROWS, 0, DASH_COLS, {
    backgroundColor: P.cream,
    textFormat: { foregroundColorStyle: { rgbColor: P.textDark }, fontSize: 10, fontFamily: 'Inter' },
    borders: { top: noBorder, bottom: noBorder, left: noBorder, right: noBorder },
  }));

  // ── Column widths ──
  reqs.push(colW(sheetId, 0, 1, 12));    // left margin
  reqs.push(colW(sheetId, 1, 2, 130));   // nav col 1
  reqs.push(colW(sheetId, 2, 3, 40));    // nav col 2
  reqs.push(colW(sheetId, 3, 4, 8));     // gap
  reqs.push(colW(sheetId, 4, 5, 130));   // left content 1
  reqs.push(colW(sheetId, 5, 6, 100));   // left content 2
  reqs.push(colW(sheetId, 6, 7, 100));   // left content 3
  reqs.push(colW(sheetId, 7, 8, 100));   // left content 4
  reqs.push(colW(sheetId, 8, 9, 8));     // gap
  reqs.push(colW(sheetId, 9, 10, 110));  // right content 1
  reqs.push(colW(sheetId, 10, 11, 110)); // right content 2
  reqs.push(colW(sheetId, 11, 12, 100)); // right content 3
  reqs.push(colW(sheetId, 12, 13, 100)); // right content 4
  reqs.push(colW(sheetId, 13, 14, 12));  // right margin

  // ── Row heights ──
  reqs.push(rowH(sheetId, 0, 1, 8));     // top margin
  reqs.push(rowH(sheetId, 1, 2, 48));    // header row 1
  reqs.push(rowH(sheetId, 2, 3, 28));    // header row 2
  reqs.push(rowH(sheetId, 3, 4, 8));     // gap
  reqs.push(rowH(sheetId, 4, 5, 8));     // KPI top pad
  reqs.push(rowH(sheetId, 5, 6, 22));    // KPI labels
  reqs.push(rowH(sheetId, 6, 7, 8));     // KPI spacer
  reqs.push(rowH(sheetId, 7, 8, 48));    // KPI values
  reqs.push(rowH(sheetId, 8, 9, 8));     // KPI bottom pad
  reqs.push(rowH(sheetId, 9, 10, 4));    // extra pad
  reqs.push(rowH(sheetId, 10, 11, 8));   // gap
  reqs.push(rowH(sheetId, 24, 25, 8));   // gap
  reqs.push(rowH(sheetId, 34, 35, 8));   // gap

  // ══════════════════════════════════
  // NAVIGATION SIDEBAR (col 1-2, rows 1-30)
  // ══════════════════════════════════
  reqs.push(...cardRegion(sheetId, 1, 30, NAV_C0, NAV_C1, P));
  // Nav background slightly different from card white
  reqs.push(rc(sheetId, 1, 30, NAV_C0, NAV_C1, {
    backgroundColor: P.navBg,
    textFormat: { foregroundColorStyle: { rgbColor: P.textMuted }, fontSize: 9, fontFamily: 'Inter' },
    verticalAlignment: 'MIDDLE',
    wrapStrategy: 'CLIP',
  }));
  // Nav title row
  reqs.push(rc(sheetId, 1, 2, NAV_C0, NAV_C1, {
    backgroundColor: P.accent,
    textFormat: { foregroundColorStyle: { rgbColor: P.white }, bold: true, fontSize: 10, fontFamily: 'Inter' },
    verticalAlignment: 'MIDDLE',
    horizontalAlignment: 'CENTER',
  }));
  reqs.push(mergeCells(sheetId, 1, 2, NAV_C0, NAV_C1));

  // Style nav section headers (bold, accent color)
  let navRow = 4;
  for (const section of niche.navSections) {
    reqs.push(rc(sheetId, navRow, navRow + 1, NAV_C0, NAV_C1, {
      backgroundColor: P.navBg,
      textFormat: { foregroundColorStyle: { rgbColor: P.accent }, bold: true, fontSize: 8, fontFamily: 'Inter' },
      verticalAlignment: 'MIDDLE',
    }));
    navRow++;
    for (let j = 0; j < section.items.length; j++) {
      reqs.push(rc(sheetId, navRow, navRow + 1, NAV_C0, NAV_C1, {
        backgroundColor: P.navBg,
        textFormat: { foregroundColorStyle: { rgbColor: P.textDark }, fontSize: 9, fontFamily: 'Inter' },
        verticalAlignment: 'MIDDLE',
      }));
      navRow++;
    }
    navRow++;
  }
  // Border for sidebar
  reqs.push({
    updateBorders: {
      range: { sheetId, startRowIndex: 1, endRowIndex: 30, startColumnIndex: NAV_C0, endColumnIndex: NAV_C1 },
      top: medBorder(P.accent),
      bottom: thinBorder(P.cardBorder),
      left: thinBorder(P.cardBorder),
      right: thinBorder(P.cardBorder),
    },
  });

  // ══════════════════════════════════
  // HEADER BANNER (rows 1-2, cols 4-12)
  // ══════════════════════════════════
  reqs.push(...cardRegion(sheetId, 1, 3, L_C0, R_C1, P));
  // Row 1: accent banner with title
  reqs.push(mergeCells(sheetId, 1, 2, L_C0, R_C1));
  reqs.push(rc(sheetId, 1, 2, L_C0, R_C1, {
    backgroundColor: P.accent,
    textFormat: { foregroundColorStyle: { rgbColor: P.white }, bold: true, fontSize: 16, fontFamily: 'Inter' },
    horizontalAlignment: 'CENTER',
    verticalAlignment: 'MIDDLE',
  }));
  // Row 2: subtitle bar
  reqs.push(rc(sheetId, 2, 3, L_C0, R_C0, {
    backgroundColor: P.accentLight,
    textFormat: { foregroundColorStyle: { rgbColor: P.textMuted }, fontSize: 9, fontFamily: 'Inter' },
    verticalAlignment: 'MIDDLE',
    horizontalAlignment: 'LEFT',
  }));
  reqs.push(rc(sheetId, 2, 3, R_C0, R_C1, {
    backgroundColor: P.accentLight,
    textFormat: { foregroundColorStyle: { rgbColor: P.accent }, bold: true, fontSize: 10, fontFamily: 'Inter' },
    horizontalAlignment: 'RIGHT',
    verticalAlignment: 'MIDDLE',
  }));
  // Income value formatting
  reqs.push(rc(sheetId, 2, 3, R_C1 - 1, R_C1, {
    backgroundColor: P.accentLight,
    textFormat: { foregroundColorStyle: { rgbColor: P.accent }, bold: true, fontSize: 12, fontFamily: 'Inter' },
    horizontalAlignment: 'LEFT',
    verticalAlignment: 'MIDDLE',
    numberFormat: { type: 'CURRENCY', pattern: '"$"#,##0' },
  }));

  // ══════════════════════════════════
  // KPI CARDS (rows 4-9, cols 4-12)
  // 4 KPI cards across the content area
  // ══════════════════════════════════
  const kpiPositions = [
    { c0: L_C0, c1: L_C0 + 2 },      // Card 1
    { c0: L_C0 + 2, c1: L_C0 + 4 },  // Card 2
    { c0: R_C0, c1: R_C0 + 2 },      // Card 3
    { c0: R_C0 + 2, c1: R_C0 + 4 },  // Card 4
  ];
  const kpiColors = [P.accent, P.secondary, P.warm, P.accent];
  const kpiLightColors = [P.accentLight, P.secondaryLight, P.warmLight, P.accentLight];

  for (let k = 0; k < 4; k++) {
    const { c0, c1 } = kpiPositions[k];
    // Card background
    reqs.push(...cardRegion(sheetId, 4, 9, c0, c1, P));
    // Colored top bar
    reqs.push(rc(sheetId, 4, 5, c0, c1, {
      backgroundColor: kpiColors[k],
    }));
    // KPI label
    reqs.push(rc(sheetId, 5, 6, c0, c1, {
      backgroundColor: kpiLightColors[k],
      textFormat: { foregroundColorStyle: { rgbColor: kpiColors[k] }, bold: true, fontSize: 8, fontFamily: 'Inter' },
      horizontalAlignment: 'CENTER',
      verticalAlignment: 'BOTTOM',
    }));
    // KPI value — large number
    const fmt = niche.kpiFormats[k];
    reqs.push(rc(sheetId, 7, 8, c0, c1, {
      backgroundColor: kpiLightColors[k],
      textFormat: { foregroundColorStyle: { rgbColor: kpiColors[k] }, bold: true, fontSize: 22, fontFamily: 'Inter' },
      horizontalAlignment: 'CENTER',
      verticalAlignment: 'MIDDLE',
      numberFormat: fmt === '%'
        ? { type: 'PERCENT', pattern: '0%' }
        : { type: 'CURRENCY', pattern: '"$"#,##0' },
    }));
    // Bottom padding of card
    reqs.push(rc(sheetId, 8, 9, c0, c1, {
      backgroundColor: kpiLightColors[k],
    }));
  }

  // ══════════════════════════════════
  // CATEGORY BREAKDOWN CARD (rows 11-23, left cols 4-7)
  // ══════════════════════════════════
  const catCardEnd = 13 + niche.categories.length + 1; // header + data + total
  reqs.push(...cardRegion(sheetId, 11, catCardEnd, L_C0, L_C1, P));
  // Header bar
  reqs.push(cardHeader(sheetId, 11, L_C0, L_C1, P.accent, P));
  reqs.push(mergeCells(sheetId, 11, 12, L_C0, L_C1));
  reqs.push(rowH(sheetId, 11, 12, 32));

  // Column headers
  reqs.push(rowH(sheetId, 12, 13, 26));
  reqs.push(rc(sheetId, 12, 13, L_C0, L_C1, {
    backgroundColor: P.accentLight,
    textFormat: { foregroundColorStyle: { rgbColor: P.accent }, bold: true, fontSize: 9, fontFamily: 'Inter' },
    horizontalAlignment: 'CENTER',
    verticalAlignment: 'MIDDLE',
  }));

  // Data rows
  const catCount = niche.categories.length;
  for (let i = 0; i < catCount; i++) {
    const r = 13 + i;
    const bg = i % 2 === 0 ? P.white : P.offWhite;
    reqs.push(rowH(sheetId, r, r + 1, 26));
    reqs.push(rc(sheetId, r, r + 1, L_C0, L_C1, {
      backgroundColor: bg,
      textFormat: { foregroundColorStyle: { rgbColor: P.textDark }, fontSize: 9, fontFamily: 'Inter' },
      verticalAlignment: 'MIDDLE',
    }));
    reqs.push(rc(sheetId, r, r + 1, L_C0 + 1, L_C1, {
      numberFormat: { type: 'CURRENCY', pattern: '"$"#,##0' },
      horizontalAlignment: 'RIGHT',
    }));
  }
  // Total row
  const totalR = 13 + catCount;
  reqs.push(rowH(sheetId, totalR, totalR + 1, 28));
  reqs.push(rc(sheetId, totalR, totalR + 1, L_C0, L_C1, {
    backgroundColor: P.accentLight,
    textFormat: { foregroundColorStyle: { rgbColor: P.accent }, bold: true, fontSize: 10, fontFamily: 'Inter' },
    horizontalAlignment: 'RIGHT',
    verticalAlignment: 'MIDDLE',
    numberFormat: { type: 'CURRENCY', pattern: '"$"#,##0' },
  }));
  reqs.push(rc(sheetId, totalR, totalR + 1, L_C0, L_C0 + 1, {
    horizontalAlignment: 'LEFT',
  }));

  // ══════════════════════════════════
  // EXPENSE DISTRIBUTION CARD (rows 11-23, right cols 9-12)
  // ══════════════════════════════════
  reqs.push(...cardRegion(sheetId, 11, catCardEnd, R_C0, R_C1, P));
  reqs.push(cardHeader(sheetId, 11, R_C0, R_C1, P.secondary, P));
  reqs.push(mergeCells(sheetId, 11, 12, R_C0, R_C1));
  reqs.push(rowH(sheetId, 11, 12, 32));
  // Chart will be overlaid here via addChart

  // ══════════════════════════════════
  // SAVINGS GOALS CARD (rows 25-32, left cols 4-7)
  // ══════════════════════════════════
  const goalsEnd = 27 + niche.goals.length;
  reqs.push(...cardRegion(sheetId, 25, goalsEnd, L_C0, L_C1, P));
  reqs.push(cardHeader(sheetId, 25, L_C0, L_C1, P.warm, P));
  reqs.push(mergeCells(sheetId, 25, 26, L_C0, L_C1));
  reqs.push(rowH(sheetId, 25, 26, 32));

  // Goals column headers
  reqs.push(rowH(sheetId, 26, 27, 24));
  reqs.push(rc(sheetId, 26, 27, L_C0, L_C1, {
    backgroundColor: P.warmLight,
    textFormat: { foregroundColorStyle: { rgbColor: P.warm }, bold: true, fontSize: 9, fontFamily: 'Inter' },
    horizontalAlignment: 'CENTER',
    verticalAlignment: 'MIDDLE',
  }));

  // Goals data
  for (let i = 0; i < niche.goals.length; i++) {
    const r = 27 + i;
    const bg = i % 2 === 0 ? P.white : P.offWhite;
    reqs.push(rowH(sheetId, r, r + 1, 26));
    reqs.push(rc(sheetId, r, r + 1, L_C0, L_C1, {
      backgroundColor: bg,
      textFormat: { foregroundColorStyle: { rgbColor: P.textDark }, fontSize: 9, fontFamily: 'Inter' },
      verticalAlignment: 'MIDDLE',
    }));
    reqs.push(rc(sheetId, r, r + 1, L_C0 + 1, L_C0 + 3, {
      numberFormat: { type: 'CURRENCY', pattern: '"$"#,##0' },
      horizontalAlignment: 'RIGHT',
    }));
    // Progress bar column — monospace for visual bar alignment
    reqs.push(rc(sheetId, r, r + 1, L_C0 + 3, L_C1, {
      textFormat: { foregroundColorStyle: { rgbColor: P.accent }, fontSize: 8, fontFamily: 'Roboto Mono' },
      horizontalAlignment: 'LEFT',
      wrapStrategy: 'CLIP',
    }));
  }

  // ══════════════════════════════════
  // RECENT TRANSACTIONS CARD (rows 25-32, right cols 9-12)
  // ══════════════════════════════════
  const txnEnd = 27 + 6; // 6 recent transactions
  reqs.push(...cardRegion(sheetId, 25, txnEnd, R_C0, R_C1, P));
  reqs.push(cardHeader(sheetId, 25, R_C0, R_C1, P.accent, P));
  reqs.push(mergeCells(sheetId, 25, 26, R_C0, R_C1));
  reqs.push(rowH(sheetId, 25, 26, 32));

  // Transaction column headers
  reqs.push(rowH(sheetId, 26, 27, 24));
  reqs.push(rc(sheetId, 26, 27, R_C0, R_C1, {
    backgroundColor: P.accentLight,
    textFormat: { foregroundColorStyle: { rgbColor: P.accent }, bold: true, fontSize: 9, fontFamily: 'Inter' },
    horizontalAlignment: 'CENTER',
    verticalAlignment: 'MIDDLE',
  }));

  // Transaction data rows
  for (let i = 0; i < 6; i++) {
    const r = 27 + i;
    const bg = i % 2 === 0 ? P.white : P.offWhite;
    reqs.push(rowH(sheetId, r, r + 1, 24));
    reqs.push(rc(sheetId, r, r + 1, R_C0, R_C1, {
      backgroundColor: bg,
      textFormat: { foregroundColorStyle: { rgbColor: P.textDark }, fontSize: 9, fontFamily: 'Inter' },
      verticalAlignment: 'MIDDLE',
    }));
    reqs.push(rc(sheetId, r, r + 1, R_C0 + 2, R_C0 + 3, {
      numberFormat: { type: 'CURRENCY', pattern: '"$"#,##0' },
      horizontalAlignment: 'RIGHT',
    }));
  }

  return reqs;
}

// ══════════════════════════════════════════════════════════════
// WEDDING-SPECIFIC DASHBOARD — v3
// Clean full-width layout. No sidebar. Nothing gets cut off.
// 12 columns, generous widths, elegant spacing.
// ══════════════════════════════════════════════════════════════

const W_COLS = 12;
const W_ROWS = 50;

function weddingDashboardValues(niche) {
  const g = Array.from({ length: W_ROWS }, () => Array(W_COLS).fill(''));

  // ── Row 1: Title banner ──
  g[0][0] = `💍  ${niche.title}`;

  // ── Row 2-3: Couple names (merged later) ──
  g[1][0] = `${niche.coupleName1}    ♡    ${niche.coupleName2}`;

  // ── Row 4: Date + countdown ──
  g[3][0] = niche.weddingDate;
  g[3][4] = 'DAYS LEFT';
  g[3][5] = `=DATEDIF(TODAY(),DATE(2026,9,15),"D")`;
  // Budget ref cell (for KPI formulas) — hidden in col 11
  g[3][11] = niche.monthlyIncome;

  // ── Row 5-6: Decorative accent (IMAGE() fails in htmlview screenshots, so left empty) ──
  // Users can add their own wedding photo: =IMAGE("url", 1)

  // ── Row 8-9: KPI cards ──
  g[7][0] = niche.kpis[0];
  g[8][0] = '=L4'; // budget from hidden cell
  g[7][4] = niche.kpis[1];
  g[8][4] = '=SUMIFS(Transactions!C:C,Transactions!E:E,"<>Income")';
  g[7][8] = niche.kpis[2];
  g[8][8] = '=A9-E9'; // budget - spent

  // ── Row 11-17: Guest Overview (left) + Timeline (right) ──
  g[10][0] = 'GUEST OVERVIEW';
  g[11][0] = 'Total Invited';     g[11][2] = niche.guestData.totalInvited;
  g[12][0] = 'RSVPs Received';    g[12][2] = niche.guestData.rsvpReceived;
  g[13][0] = 'Attending';         g[13][2] = niche.guestData.attending;
  g[14][0] = 'Declined';          g[14][2] = niche.guestData.declined;
  g[15][0] = 'Tables Needed';     g[15][2] = niche.guestData.tablesNeeded;

  g[10][6] = 'TIMELINE CHECKLIST';
  g[11][6] = 'Phase';             g[11][9] = 'Tasks';  g[11][10] = 'Done';
  niche.timeline.forEach((t, i) => {
    g[12 + i][6] = t.phase;
    g[12 + i][9] = t.tasks;
    g[12 + i][10] = t.done;
  });

  // ── Row 19-29: Expense Category (left) + Vendor Tracker (right) ──
  g[18][0] = 'EXPENSE CATEGORY';
  g[19][0] = 'Category';  g[19][1] = 'Budget';  g[19][2] = 'Spent';  g[19][3] = 'Remaining';
  niche.categories.forEach((cat, i) => {
    const r = 20 + i;
    const row1 = r + 1;
    const spent = Math.round(cat.budget * (0.55 + Math.random() * 0.5));
    g[r][0] = cat.name;
    g[r][1] = cat.budget;
    g[r][2] = spent;
    g[r][3] = `=B${row1}-C${row1}`;
  });
  const totR = 20 + niche.categories.length;
  g[totR][0] = 'TOTAL';
  g[totR][1] = `=SUM(B21:B${totR})`;
  g[totR][2] = `=SUM(C21:C${totR})`;
  g[totR][3] = `=SUM(D21:D${totR})`;

  g[18][6] = 'VENDOR TRACKER';
  g[19][6] = 'Vendor';  g[19][8] = 'Category';  g[19][9] = 'Amount';  g[19][10] = 'Status';
  niche.vendors.forEach((v, i) => {
    g[20 + i][6] = v.vendor;
    g[20 + i][8] = v.category;
    g[20 + i][9] = v.amount;
    g[20 + i][10] = v.status;
  });

  // ── Row 32+: Upcoming Deadlines ──
  g[32][0] = 'UPCOMING DEADLINES';
  g[33][0] = 'Date';  g[33][2] = 'Deadline';
  const deadlines = [
    ['2026-03-01', 'Book officiant'],
    ['2026-03-15', 'Order invitations'],
    ['2026-04-01', 'Finalize guest list'],
    ['2026-04-15', 'Cake tasting'],
    ['2026-05-01', 'Final dress fitting'],
    ['2026-06-01', 'Confirm all vendors'],
  ];
  deadlines.forEach((d, i) => {
    g[34 + i][0] = d[0];
    g[34 + i][2] = d[1];
  });

  return g;
}

function weddingDashboardFormatting(sheetId, niche, P) {
  const reqs = [];

  const cream = hex('#F7F3EE');
  const card = hex('#FFFCF9');
  const rose = hex('#C9968E');
  const roseBg = hex('#F5E6E0');
  const sage = hex('#5B7553');
  const sageBg = hex('#EBF0E9');
  const brown = hex('#8D6E63');
  const brownBg = hex('#EFEBE9');
  const white = hex('#FFFFFF');
  const altRow = hex('#FAF8F5');

  // ── Sheet properties ──
  reqs.push({ updateSheetProperties: { properties: { sheetId, gridProperties: { hideGridlines: true } }, fields: 'gridProperties.hideGridlines' } });

  // ── Cream background + base font ──
  reqs.push(rc(sheetId, 0, W_ROWS, 0, W_COLS, {
    backgroundColor: cream,
    textFormat: { foregroundColorStyle: { rgbColor: P.textDark }, fontSize: 10, fontFamily: 'Inter' },
    borders: { top: noBorder, bottom: noBorder, left: noBorder, right: noBorder },
  }));

  // ── Column widths (12 cols, generous) ──
  reqs.push(colW(sheetId, 0, 1, 160));   // A
  reqs.push(colW(sheetId, 1, 2, 110));   // B
  reqs.push(colW(sheetId, 2, 3, 90));    // C
  reqs.push(colW(sheetId, 3, 4, 100));   // D
  reqs.push(colW(sheetId, 4, 5, 110));   // E
  reqs.push(colW(sheetId, 5, 6, 80));    // F (countdown)
  reqs.push(colW(sheetId, 6, 7, 160));   // G (right block)
  reqs.push(colW(sheetId, 7, 8, 60));    // H
  reqs.push(colW(sheetId, 8, 9, 110));   // I
  reqs.push(colW(sheetId, 9, 10, 80));   // J
  reqs.push(colW(sheetId, 10, 11, 80));  // K
  reqs.push(colW(sheetId, 11, 12, 80));  // L

  // ── Row heights ──
  reqs.push(rowH(sheetId, 0, 1, 48));     // title banner
  reqs.push(rowH(sheetId, 1, 2, 56));     // couple names
  reqs.push(rowH(sheetId, 2, 3, 10));     // spacer
  reqs.push(rowH(sheetId, 3, 4, 32));     // date + countdown
  reqs.push(rowH(sheetId, 4, 5, 200));    // hero images
  reqs.push(rowH(sheetId, 5, 6, 10));     // spacer
  reqs.push(rowH(sheetId, 6, 7, 6));      // gap
  reqs.push(rowH(sheetId, 7, 8, 24));     // KPI labels
  reqs.push(rowH(sheetId, 8, 9, 56));     // KPI values
  reqs.push(rowH(sheetId, 9, 10, 10));    // spacer
  reqs.push(rowH(sheetId, 17, 18, 10));   // gap before expenses
  reqs.push(rowH(sheetId, 31, 32, 10));   // gap before deadlines

  // ════════════════════════════════
  // TITLE BANNER (row 0, full width)
  // ════════════════════════════════
  reqs.push(mergeCells(sheetId, 0, 1, 0, W_COLS));
  reqs.push(rc(sheetId, 0, 1, 0, W_COLS, {
    backgroundColor: sage,
    textFormat: { foregroundColorStyle: { rgbColor: white }, bold: true, fontSize: 14, fontFamily: 'Georgia' },
    horizontalAlignment: 'CENTER',
    verticalAlignment: 'MIDDLE',
  }));

  // ════════════════════════════════
  // COUPLE NAMES (row 1, full width)
  // ════════════════════════════════
  reqs.push(mergeCells(sheetId, 1, 2, 0, W_COLS));
  reqs.push(rc(sheetId, 1, 2, 0, W_COLS, {
    backgroundColor: roseBg,
    textFormat: { foregroundColorStyle: { rgbColor: brown }, bold: false, fontSize: 26, fontFamily: 'Georgia' },
    horizontalAlignment: 'CENTER',
    verticalAlignment: 'MIDDLE',
  }));

  // ════════════════════════════════
  // DATE + COUNTDOWN (row 3)
  // ════════════════════════════════
  // Date label (cols 0-3)
  reqs.push(mergeCells(sheetId, 3, 4, 0, 4));
  reqs.push(rc(sheetId, 3, 4, 0, 4, {
    backgroundColor: card,
    textFormat: { foregroundColorStyle: { rgbColor: brown }, fontSize: 11, fontFamily: 'Georgia' },
    horizontalAlignment: 'CENTER',
    verticalAlignment: 'MIDDLE',
    numberFormat: { type: 'DATE', pattern: 'MMMM d, yyyy' },
  }));
  // "DAYS LEFT" label (col 4)
  reqs.push(rc(sheetId, 3, 4, 4, 5, {
    backgroundColor: card,
    textFormat: { foregroundColorStyle: { rgbColor: rose }, bold: true, fontSize: 10, fontFamily: 'Inter' },
    horizontalAlignment: 'RIGHT',
    verticalAlignment: 'MIDDLE',
  }));
  // Countdown number (col 5)
  reqs.push(rc(sheetId, 3, 4, 5, 6, {
    backgroundColor: card,
    textFormat: { foregroundColorStyle: { rgbColor: sage }, bold: true, fontSize: 16, fontFamily: 'Inter' },
    horizontalAlignment: 'CENTER',
    verticalAlignment: 'MIDDLE',
    numberFormat: { type: 'NUMBER', pattern: '#,##0' },
  }));
  // Rest of date row (hide budget ref in L4 — white text on card bg)
  reqs.push(rc(sheetId, 3, 4, 6, W_COLS, {
    backgroundColor: card,
    textFormat: { foregroundColorStyle: { rgbColor: card }, fontSize: 1 },
  }));
  // Border around date row
  reqs.push({
    updateBorders: {
      range: { sheetId, startRowIndex: 3, endRowIndex: 4, startColumnIndex: 0, endColumnIndex: W_COLS },
      top: thinBorder(hex('#E8E0D8')),
      bottom: thinBorder(hex('#E8E0D8')),
      left: thinBorder(hex('#E8E0D8')),
      right: thinBorder(hex('#E8E0D8')),
    },
  });

  // ════════════════════════════════
  // HERO IMAGES (row 4)
  // ════════════════════════════════
  // Left image (cols 0-6)
  reqs.push(mergeCells(sheetId, 4, 5, 0, 7));
  reqs.push(rc(sheetId, 4, 5, 0, 7, {
    backgroundColor: card,
    verticalAlignment: 'MIDDLE',
    horizontalAlignment: 'CENTER',
  }));
  reqs.push({
    updateBorders: {
      range: { sheetId, startRowIndex: 4, endRowIndex: 5, startColumnIndex: 0, endColumnIndex: 7 },
      top: thinBorder(hex('#E8E0D8')),
      bottom: thinBorder(hex('#E8E0D8')),
      left: thinBorder(hex('#E8E0D8')),
      right: thinBorder(hex('#E8E0D8')),
    },
  });
  // Right image (cols 7-11)
  reqs.push(mergeCells(sheetId, 4, 5, 7, W_COLS));
  reqs.push(rc(sheetId, 4, 5, 7, W_COLS, {
    backgroundColor: card,
    verticalAlignment: 'MIDDLE',
    horizontalAlignment: 'CENTER',
  }));
  reqs.push({
    updateBorders: {
      range: { sheetId, startRowIndex: 4, endRowIndex: 5, startColumnIndex: 7, endColumnIndex: W_COLS },
      top: thinBorder(hex('#E8E0D8')),
      bottom: thinBorder(hex('#E8E0D8')),
      left: thinBorder(hex('#E8E0D8')),
      right: thinBorder(hex('#E8E0D8')),
    },
  });

  // ════════════════════════════════
  // 3 KPI CARDS (rows 7-8, cols 0-3 / 4-7 / 8-11)
  // ════════════════════════════════
  const kpiDefs = [
    { c0: 0, c1: 4, color: sage, light: sageBg },
    { c0: 4, c1: 8, color: rose, light: roseBg },
    { c0: 8, c1: W_COLS, color: brown, light: brownBg },
  ];

  for (let k = 0; k < 3; k++) {
    const { c0, c1, color, light } = kpiDefs[k];
    // KPI label row
    reqs.push(mergeCells(sheetId, 7, 8, c0, c1));
    reqs.push(rc(sheetId, 7, 8, c0, c1, {
      backgroundColor: light,
      textFormat: { foregroundColorStyle: { rgbColor: color }, bold: true, fontSize: 9, fontFamily: 'Inter' },
      horizontalAlignment: 'CENTER',
      verticalAlignment: 'BOTTOM',
    }));
    // KPI value row
    reqs.push(mergeCells(sheetId, 8, 9, c0, c1));
    reqs.push(rc(sheetId, 8, 9, c0, c1, {
      backgroundColor: light,
      textFormat: { foregroundColorStyle: { rgbColor: color }, bold: true, fontSize: 22, fontFamily: 'Inter' },
      horizontalAlignment: 'CENTER',
      verticalAlignment: 'MIDDLE',
      numberFormat: { type: 'CURRENCY', pattern: '"$"#,##0' },
    }));
    // Card border
    reqs.push({
      updateBorders: {
        range: { sheetId, startRowIndex: 7, endRowIndex: 9, startColumnIndex: c0, endColumnIndex: c1 },
        top: thinBorder(hex('#E8E0D8')),
        bottom: thinBorder(hex('#E8E0D8')),
        left: thinBorder(hex('#E8E0D8')),
        right: thinBorder(hex('#E8E0D8')),
      },
    });
  }

  // ════════════════════════════════
  // GUEST OVERVIEW CARD (rows 10-16, cols 0-5)
  // ════════════════════════════════
  reqs.push(...cardRegion(sheetId, 10, 16, 0, 6, P));
  // Card header
  reqs.push(mergeCells(sheetId, 10, 11, 0, 6));
  reqs.push(rc(sheetId, 10, 11, 0, 6, {
    backgroundColor: rose,
    textFormat: { foregroundColorStyle: { rgbColor: white }, bold: true, fontSize: 10, fontFamily: 'Inter' },
    horizontalAlignment: 'CENTER',
    verticalAlignment: 'MIDDLE',
  }));
  reqs.push(rowH(sheetId, 10, 11, 30));

  // Guest data rows (5 rows: 11-15)
  for (let i = 0; i < 5; i++) {
    const r = 11 + i;
    const bg = i % 2 === 0 ? card : altRow;
    reqs.push(rowH(sheetId, r, r + 1, 28));
    reqs.push(rc(sheetId, r, r + 1, 0, 6, {
      backgroundColor: bg,
      textFormat: { foregroundColorStyle: { rgbColor: hex('#4A4A4A') }, fontSize: 10, fontFamily: 'Inter' },
      verticalAlignment: 'MIDDLE',
    }));
    // Number column bold + accent
    reqs.push(rc(sheetId, r, r + 1, 2, 3, {
      textFormat: { foregroundColorStyle: { rgbColor: sage }, bold: true, fontSize: 14, fontFamily: 'Inter' },
      horizontalAlignment: 'CENTER',
    }));
  }

  // ════════════════════════════════
  // TIMELINE CHECKLIST (rows 10-17, cols 6-11)
  // ════════════════════════════════
  reqs.push(...cardRegion(sheetId, 10, 18, 6, W_COLS, P));
  // Card header
  reqs.push(mergeCells(sheetId, 10, 11, 6, W_COLS));
  reqs.push(rc(sheetId, 10, 11, 6, W_COLS, {
    backgroundColor: sage,
    textFormat: { foregroundColorStyle: { rgbColor: white }, bold: true, fontSize: 10, fontFamily: 'Inter' },
    horizontalAlignment: 'CENTER',
    verticalAlignment: 'MIDDLE',
  }));

  // Column headers (row 11)
  reqs.push(rc(sheetId, 11, 12, 6, W_COLS, {
    backgroundColor: sageBg,
    textFormat: { foregroundColorStyle: { rgbColor: sage }, bold: true, fontSize: 9, fontFamily: 'Inter' },
    horizontalAlignment: 'CENTER',
    verticalAlignment: 'MIDDLE',
  }));
  reqs.push(rowH(sheetId, 11, 12, 24));

  // Timeline rows (rows 12-17)
  for (let i = 0; i < 6; i++) {
    const r = 12 + i;
    const bg = i % 2 === 0 ? card : altRow;
    reqs.push(rowH(sheetId, r, r + 1, 26));
    reqs.push(rc(sheetId, r, r + 1, 6, W_COLS, {
      backgroundColor: bg,
      textFormat: { foregroundColorStyle: { rgbColor: hex('#4A4A4A') }, fontSize: 9, fontFamily: 'Inter' },
      verticalAlignment: 'MIDDLE',
    }));
    // Tasks + Done cols centered + bold
    reqs.push(rc(sheetId, r, r + 1, 9, 11, {
      horizontalAlignment: 'CENTER',
      textFormat: { foregroundColorStyle: { rgbColor: sage }, bold: true, fontSize: 10, fontFamily: 'Inter' },
    }));
  }

  // ════════════════════════════════
  // EXPENSE CATEGORY CARD (rows 18-30, cols 0-5)
  // ════════════════════════════════
  const catCount = niche.categories.length;
  const catCardEnd = 20 + catCount + 1;
  reqs.push(...cardRegion(sheetId, 18, catCardEnd, 0, 6, P));
  // Card header
  reqs.push(mergeCells(sheetId, 18, 19, 0, 6));
  reqs.push(rc(sheetId, 18, 19, 0, 6, {
    backgroundColor: brown,
    textFormat: { foregroundColorStyle: { rgbColor: white }, bold: true, fontSize: 10, fontFamily: 'Inter' },
    horizontalAlignment: 'CENTER',
    verticalAlignment: 'MIDDLE',
  }));
  reqs.push(rowH(sheetId, 18, 19, 30));

  // Column headers (row 19)
  reqs.push(rc(sheetId, 19, 20, 0, 6, {
    backgroundColor: brownBg,
    textFormat: { foregroundColorStyle: { rgbColor: brown }, bold: true, fontSize: 9, fontFamily: 'Inter' },
    horizontalAlignment: 'CENTER',
    verticalAlignment: 'MIDDLE',
  }));
  reqs.push(rowH(sheetId, 19, 20, 24));

  // Data rows
  for (let i = 0; i < catCount; i++) {
    const r = 20 + i;
    const bg = i % 2 === 0 ? card : altRow;
    reqs.push(rowH(sheetId, r, r + 1, 24));
    reqs.push(rc(sheetId, r, r + 1, 0, 6, {
      backgroundColor: bg,
      textFormat: { foregroundColorStyle: { rgbColor: hex('#4A4A4A') }, fontSize: 9, fontFamily: 'Inter' },
      verticalAlignment: 'MIDDLE',
    }));
    reqs.push(rc(sheetId, r, r + 1, 1, 4, {
      numberFormat: { type: 'CURRENCY', pattern: '"$"#,##0' },
      horizontalAlignment: 'RIGHT',
    }));
  }
  // Total row
  const totalR = 20 + catCount;
  reqs.push(rowH(sheetId, totalR, totalR + 1, 28));
  reqs.push(rc(sheetId, totalR, totalR + 1, 0, 6, {
    backgroundColor: brownBg,
    textFormat: { foregroundColorStyle: { rgbColor: brown }, bold: true, fontSize: 10, fontFamily: 'Inter' },
    horizontalAlignment: 'RIGHT',
    verticalAlignment: 'MIDDLE',
    numberFormat: { type: 'CURRENCY', pattern: '"$"#,##0' },
  }));

  // ════════════════════════════════
  // VENDOR TRACKER CARD (rows 18-28, cols 6-11)
  // ════════════════════════════════
  const vendorEnd = 20 + niche.vendors.length + 1;
  reqs.push(...cardRegion(sheetId, 18, vendorEnd, 6, W_COLS, P));
  // Card header
  reqs.push(mergeCells(sheetId, 18, 19, 6, W_COLS));
  reqs.push(rc(sheetId, 18, 19, 6, W_COLS, {
    backgroundColor: sage,
    textFormat: { foregroundColorStyle: { rgbColor: white }, bold: true, fontSize: 10, fontFamily: 'Inter' },
    horizontalAlignment: 'CENTER',
    verticalAlignment: 'MIDDLE',
  }));

  // Column headers (row 19)
  reqs.push(rc(sheetId, 19, 20, 6, W_COLS, {
    backgroundColor: sageBg,
    textFormat: { foregroundColorStyle: { rgbColor: sage }, bold: true, fontSize: 9, fontFamily: 'Inter' },
    horizontalAlignment: 'CENTER',
    verticalAlignment: 'MIDDLE',
  }));

  // Vendor data rows
  for (let i = 0; i < niche.vendors.length; i++) {
    const r = 20 + i;
    const bg = i % 2 === 0 ? card : altRow;
    reqs.push(rowH(sheetId, r, r + 1, 26));
    reqs.push(rc(sheetId, r, r + 1, 6, W_COLS, {
      backgroundColor: bg,
      textFormat: { foregroundColorStyle: { rgbColor: hex('#4A4A4A') }, fontSize: 9, fontFamily: 'Inter' },
      verticalAlignment: 'MIDDLE',
    }));
    reqs.push(rc(sheetId, r, r + 1, 9, 10, {
      numberFormat: { type: 'CURRENCY', pattern: '"$"#,##0' },
      horizontalAlignment: 'RIGHT',
    }));
  }

  // ════════════════════════════════
  // UPCOMING DEADLINES CARD (rows 32-40, cols 0-5)
  // ════════════════════════════════
  reqs.push(...cardRegion(sheetId, 32, 40, 0, 6, P));
  // Card header
  reqs.push(mergeCells(sheetId, 32, 33, 0, 6));
  reqs.push(rc(sheetId, 32, 33, 0, 6, {
    backgroundColor: rose,
    textFormat: { foregroundColorStyle: { rgbColor: white }, bold: true, fontSize: 10, fontFamily: 'Inter' },
    horizontalAlignment: 'CENTER',
    verticalAlignment: 'MIDDLE',
  }));
  reqs.push(rowH(sheetId, 32, 33, 30));

  // Column headers (row 33)
  reqs.push(rc(sheetId, 33, 34, 0, 6, {
    backgroundColor: roseBg,
    textFormat: { foregroundColorStyle: { rgbColor: rose }, bold: true, fontSize: 9, fontFamily: 'Inter' },
    horizontalAlignment: 'CENTER',
    verticalAlignment: 'MIDDLE',
  }));

  // Deadline rows
  for (let i = 0; i < 6; i++) {
    const r = 34 + i;
    const bg = i % 2 === 0 ? card : altRow;
    reqs.push(rowH(sheetId, r, r + 1, 26));
    reqs.push(rc(sheetId, r, r + 1, 0, 6, {
      backgroundColor: bg,
      textFormat: { foregroundColorStyle: { rgbColor: hex('#4A4A4A') }, fontSize: 9, fontFamily: 'Inter' },
      verticalAlignment: 'MIDDLE',
    }));
    reqs.push(rc(sheetId, r, r + 1, 0, 1, {
      numberFormat: { type: 'DATE', pattern: 'MMM d, yyyy' },
      textFormat: { foregroundColorStyle: { rgbColor: brown }, fontSize: 9 },
    }));
  }

  return reqs;
}

function weddingCharts(sheetId, niche) {
  const catCount = niche.categories.length;
  const reqs = [];

  // Donut chart — Expense Distribution (positioned below vendor tracker area)
  reqs.push({
    addChart: {
      chart: {
        spec: {
          title: 'Expense Distribution',
          pieChart: {
            legendPosition: 'RIGHT_LEGEND',
            domain: {
              sourceRange: { sources: [{ sheetId, startRowIndex: 20, endRowIndex: 20 + catCount, startColumnIndex: 0, endColumnIndex: 1 }] },
            },
            series: {
              sourceRange: { sources: [{ sheetId, startRowIndex: 20, endRowIndex: 20 + catCount, startColumnIndex: 2, endColumnIndex: 3 }] },
            },
            pieHole: 0.45,
          },
          backgroundColorStyle: { rgbColor: hex('#FFFCF9') },
          titleTextFormat: { foregroundColorStyle: { rgbColor: hex('#5B7553') }, fontSize: 11, bold: true },
        },
        position: {
          overlayPosition: {
            anchorCell: { sheetId, rowIndex: 32, columnIndex: 6 },
            widthPixels: 420,
            heightPixels: 260,
          },
        },
      },
    },
  });

  return reqs;
}

// ══════════════════════════════════════════════════════════════
// TAB: VENDOR TRACKER (wedding-specific)
// ══════════════════════════════════════════════════════════════

function vendorTrackerValues(niche) {
  const rows = [];
  rows.push(['📇 VENDOR TRACKER']);
  rows.push(['Manage all your vendors — contacts, payments & booking status.']);
  rows.push([]);
  rows.push(['Vendor', 'Category', 'Contact', 'Email', 'Package', 'Amount', 'Deposit', 'Balance', 'Status']);
  const vendors = [
    ['Grand Ballroom', 'Venue', '(555) 123-4567', 'info@grandballroom.com', 'Premium Package', 12000, 5000, 7000, '✅ Booked'],
    ['Bloom & Petal Florals', 'Florist', '(555) 234-5678', 'hello@bloomandpetal.com', 'Classic Wedding', 3500, 1000, 2500, '✅ Booked'],
    ['Capture Moments Photography', 'Photography', '(555) 345-6789', 'info@capturemoments.com', 'Full Day Coverage', 4000, 1500, 2500, '⏳ Deposit Paid'],
    ['Harmony Sounds DJ', 'DJ / Music', '(555) 456-7890', 'book@harmonysounds.com', 'Premium DJ Package', 2000, 700, 1300, '⏳ Deposit Paid'],
    ['Elegant Bites Catering', 'Catering', '(555) 567-8901', 'events@elegantbites.com', 'Dinner & Cocktails', 8000, 0, 8000, '📝 Quoted'],
    ['Sweet Perfection Cakes', 'Cake', '(555) 678-9012', 'orders@sweetperfection.com', '3-Tier Wedding Cake', 800, 0, 800, '📝 Quoted'],
    ['Glamour Touch Beauty', 'Hair & Makeup', '(555) 789-0123', 'book@glamourtouch.com', 'Bride + 4 Party', 1200, 300, 900, '⏳ Deposit Paid'],
  ];
  rows.push(...vendors);
  // Empty rows for adding more vendors
  for (let i = 0; i < 5; i++) rows.push(['', '', '', '', '', '', '', '', '']);
  rows.push([]);
  rows.push(['💡 Tip: Add new vendors below. Update Status as you book them.']);
  return rows;
}

function vendorTrackerFormatting(sheetId, P) {
  const reqs = [];
  reqs.push({ updateSheetProperties: { properties: { sheetId, gridProperties: { hideGridlines: true } }, fields: 'gridProperties.hideGridlines' } });
  // Full cream background
  reqs.push(rc(sheetId, 0, 20, 0, 9, { backgroundColor: P.cream, textFormat: { foregroundColorStyle: { rgbColor: P.textDark }, fontSize: 10, fontFamily: 'Inter' } }));
  // Title banner (row 0)
  reqs.push(rowH(sheetId, 0, 1, 44));
  reqs.push(mergeCells(sheetId, 0, 1, 0, 9));
  reqs.push(rc(sheetId, 0, 1, 0, 9, {
    backgroundColor: P.accent,
    textFormat: { foregroundColorStyle: { rgbColor: P.white }, bold: true, fontSize: 16, fontFamily: 'Inter' },
    horizontalAlignment: 'CENTER', verticalAlignment: 'MIDDLE',
  }));
  // Subtitle (row 1)
  reqs.push(rowH(sheetId, 1, 2, 28));
  reqs.push(mergeCells(sheetId, 1, 2, 0, 9));
  reqs.push(rc(sheetId, 1, 2, 0, 9, {
    backgroundColor: P.accentLight,
    textFormat: { foregroundColorStyle: { rgbColor: P.accent }, italic: true, fontSize: 10, fontFamily: 'Inter' },
    horizontalAlignment: 'CENTER', verticalAlignment: 'MIDDLE',
  }));
  // Column header (row 3)
  reqs.push(rowH(sheetId, 3, 4, 32));
  reqs.push(rc(sheetId, 3, 4, 0, 9, {
    backgroundColor: P.secondary,
    textFormat: { foregroundColorStyle: { rgbColor: P.white }, bold: true, fontSize: 9, fontFamily: 'Inter' },
    horizontalAlignment: 'CENTER', verticalAlignment: 'MIDDLE',
  }));
  // White content area
  reqs.push(rc(sheetId, 4, 16, 0, 9, { backgroundColor: P.white }));
  // Column widths
  reqs.push(colW(sheetId, 0, 1, 180));
  reqs.push(colW(sheetId, 1, 2, 100));
  reqs.push(colW(sheetId, 2, 3, 120));
  reqs.push(colW(sheetId, 3, 4, 200));
  reqs.push(colW(sheetId, 4, 5, 160));
  reqs.push(colW(sheetId, 5, 6, 90));
  reqs.push(colW(sheetId, 6, 7, 90));
  reqs.push(colW(sheetId, 7, 8, 90));
  reqs.push(colW(sheetId, 8, 9, 110));
  // Currency formats
  reqs.push(rc(sheetId, 4, 16, 5, 8, { numberFormat: { type: 'CURRENCY', pattern: '"$"#,##0' } }));
  // Banded rows
  reqs.push({
    addBanding: {
      bandedRange: {
        range: { sheetId, startRowIndex: 4, endRowIndex: 14, startColumnIndex: 0, endColumnIndex: 9 },
        rowProperties: {
          firstBandColorStyle: { rgbColor: P.white },
          secondBandColorStyle: { rgbColor: P.offWhite },
        },
      },
    },
  });
  // Card border
  reqs.push({
    updateBorders: {
      range: { sheetId, startRowIndex: 0, endRowIndex: 14, startColumnIndex: 0, endColumnIndex: 9 },
      top: thinBorder(P.cardBorder),
      bottom: thinBorder(P.cardBorder),
      left: thinBorder(P.cardBorder),
      right: thinBorder(P.cardBorder),
    },
  });
  // Tip row
  const tipRow = 16;
  reqs.push(mergeCells(sheetId, tipRow, tipRow + 1, 0, 9));
  reqs.push(rc(sheetId, tipRow, tipRow + 1, 0, 9, {
    backgroundColor: P.warmLight,
    textFormat: { foregroundColorStyle: { rgbColor: P.warm }, italic: true, fontSize: 10, fontFamily: 'Inter' },
    horizontalAlignment: 'CENTER', verticalAlignment: 'MIDDLE',
  }));
  return reqs;
}

// ══════════════════════════════════════════════════════════════
// TAB 1: TRANSACTIONS
// ══════════════════════════════════════════════════════════════

function transactionsValues(niche) {
  const rows = [];
  rows.push(['📋 TRANSACTIONS']);
  rows.push(['Record every expense here — the Dashboard updates automatically.']);
  rows.push([]);
  rows.push(['Date', 'Description', 'Amount', 'Sub-Category', 'Category']);
  niche.transactions.forEach(t => rows.push(t));
  // Add empty rows for user input
  for (let i = 0; i < 15; i++) rows.push(['', '', '', '', '']);
  rows.push([]);
  rows.push(['💡 Tip: Add new transactions below. The Dashboard KPIs & charts update in real time.']);
  return rows;
}

function transactionsFormatting(sheetId, P, txnCount) {
  const reqs = [];
  // Computed row ranges
  const contentEnd = 4 + txnCount + 15 + 3;
  const bandEnd = 4 + txnCount + 15;
  const tipRow = 4 + txnCount + 15 + 1; // header(4) + data + empty(15) + spacer(1)

  reqs.push({ updateSheetProperties: { properties: { sheetId, gridProperties: { hideGridlines: true } }, fields: 'gridProperties.hideGridlines' } });
  // Full cream background
  reqs.push(rc(sheetId, 0, contentEnd + 5, 0, 6, { backgroundColor: P.cream, textFormat: { foregroundColorStyle: { rgbColor: P.textDark }, fontSize: 10, fontFamily: 'Inter' } }));
  // Title banner (row 0) — full-width sage green
  reqs.push(rowH(sheetId, 0, 1, 44));
  reqs.push(mergeCells(sheetId, 0, 1, 0, 5));
  reqs.push(rc(sheetId, 0, 1, 0, 5, {
    backgroundColor: P.accent,
    textFormat: { foregroundColorStyle: { rgbColor: P.white }, bold: true, fontSize: 16, fontFamily: 'Inter' },
    horizontalAlignment: 'CENTER', verticalAlignment: 'MIDDLE',
  }));
  // Subtitle (row 1) — light accent
  reqs.push(rowH(sheetId, 1, 2, 28));
  reqs.push(mergeCells(sheetId, 1, 2, 0, 5));
  reqs.push(rc(sheetId, 1, 2, 0, 5, {
    backgroundColor: P.accentLight,
    textFormat: { foregroundColorStyle: { rgbColor: P.accent }, italic: true, fontSize: 10, fontFamily: 'Inter' },
    horizontalAlignment: 'CENTER', verticalAlignment: 'MIDDLE',
  }));
  // Column header row (row 3)
  reqs.push(rowH(sheetId, 3, 4, 34));
  reqs.push(rc(sheetId, 3, 4, 0, 5, {
    backgroundColor: P.secondary,
    textFormat: { foregroundColorStyle: { rgbColor: P.white }, bold: true, fontSize: 10, fontFamily: 'Inter' },
    horizontalAlignment: 'CENTER', verticalAlignment: 'MIDDLE',
  }));
  // White content area
  reqs.push(rc(sheetId, 4, contentEnd, 0, 5, { backgroundColor: P.white }));
  // Column widths
  reqs.push(colW(sheetId, 0, 1, 120));
  reqs.push(colW(sheetId, 1, 2, 240));
  reqs.push(colW(sheetId, 2, 3, 120));
  reqs.push(colW(sheetId, 3, 4, 160));
  reqs.push(colW(sheetId, 4, 5, 130));
  // Banded rows for data area
  reqs.push({
    addBanding: {
      bandedRange: {
        range: { sheetId, startRowIndex: 4, endRowIndex: bandEnd, startColumnIndex: 0, endColumnIndex: 5 },
        rowProperties: {
          firstBandColorStyle: { rgbColor: P.white },
          secondBandColorStyle: { rgbColor: P.offWhite },
        },
      },
    },
  });
  // Number formats
  reqs.push(rc(sheetId, 4, contentEnd, 2, 3, { numberFormat: { type: 'CURRENCY', pattern: '"$"#,##0.00' } }));
  reqs.push(rc(sheetId, 4, contentEnd, 0, 1, { numberFormat: { type: 'DATE', pattern: 'yyyy-mm-dd' } }));
  // Card border around the whole table
  reqs.push({
    updateBorders: {
      range: { sheetId, startRowIndex: 0, endRowIndex: tipRow + 2, startColumnIndex: 0, endColumnIndex: 5 },
      top: thinBorder(P.cardBorder),
      bottom: thinBorder(P.cardBorder),
      left: thinBorder(P.cardBorder),
      right: thinBorder(P.cardBorder),
    },
  });
  // Tip row at bottom
  reqs.push(mergeCells(sheetId, tipRow, tipRow + 1, 0, 5));
  reqs.push(rc(sheetId, tipRow, tipRow + 1, 0, 5, {
    backgroundColor: P.warmLight,
    textFormat: { foregroundColorStyle: { rgbColor: P.warm }, italic: true, fontSize: 10, fontFamily: 'Inter' },
    horizontalAlignment: 'CENTER', verticalAlignment: 'MIDDLE',
  }));
  return reqs;
}

// ══════════════════════════════════════════════════════════════
// TAB 2: CATEGORIES (Budget Setup)
// ══════════════════════════════════════════════════════════════

function categoriesValues(niche) {
  const rows = [];
  rows.push(['📊 BUDGET CATEGORIES']);
  rows.push(['Set your monthly budget for each category below.']);
  rows.push([]);
  rows.push(['Category', 'Monthly Budget', '% of Total', 'Spent', 'Remaining', 'Status']);
  const catCount = niche.categories.length;
  const spentPcts = [0.72, 0.85, 0.60, 0.91, 0.45, 1.05, 0.78, 0.55, 0.68, 0.80];
  niche.categories.forEach((c, i) => {
    const r = i + 5; // 1-indexed row
    const spent = Math.round(c.budget * spentPcts[i % 10]);
    rows.push([
      c.name,
      c.budget,
      `=IF(B${catCount + 5}>0,B${r}/B${catCount + 5},0)`,
      spent,
      `=B${r}-D${r}`,
      // Status with emoji + visual bar
      `=IF(B${r}-D${r}<0,"🔴 Over","")&IF(AND(B${r}-D${r}>=0,B${r}-D${r}<B${r}*0.15),"⚠️ Low","")&IF(B${r}-D${r}>=B${r}*0.15,"✅ OK","")&"  "&REPT("█",ROUND(MIN(IF(B${r}>0,D${r}/B${r},0),1)*10,0))&REPT("░",10-ROUND(MIN(IF(B${r}>0,D${r}/B${r},0),1)*10,0))`,
    ]);
  });
  rows.push(['TOTAL', `=SUM(B5:B${4 + catCount})`, '', `=SUM(D5:D${4 + catCount})`, `=B${catCount + 5}-D${catCount + 5}`, '']);
  rows.push([]);
  rows.push(['💡 Tip: Adjust budgets here — the Dashboard pie chart updates automatically. Status updates in real time!']);
  return rows;
}

function categoriesFormatting(sheetId, P, niche) {
  const reqs = [];
  const catCount = niche.categories.length;
  const totalRow = 4 + catCount; // 0-indexed
  const endRow = totalRow + 3;
  const totalCols = 6;
  reqs.push({ updateSheetProperties: { properties: { sheetId, gridProperties: { hideGridlines: true } }, fields: 'gridProperties.hideGridlines' } });
  // Full cream background
  reqs.push(rc(sheetId, 0, 30, 0, totalCols, { backgroundColor: P.cream, textFormat: { foregroundColorStyle: { rgbColor: P.textDark }, fontSize: 10, fontFamily: 'Inter' } }));
  // Title banner (row 0)
  reqs.push(rowH(sheetId, 0, 1, 44));
  reqs.push(mergeCells(sheetId, 0, 1, 0, totalCols));
  reqs.push(rc(sheetId, 0, 1, 0, totalCols, {
    backgroundColor: P.accent,
    textFormat: { foregroundColorStyle: { rgbColor: P.white }, bold: true, fontSize: 16, fontFamily: 'Inter' },
    horizontalAlignment: 'CENTER', verticalAlignment: 'MIDDLE',
  }));
  // Subtitle (row 1)
  reqs.push(rowH(sheetId, 1, 2, 28));
  reqs.push(mergeCells(sheetId, 1, 2, 0, totalCols));
  reqs.push(rc(sheetId, 1, 2, 0, totalCols, {
    backgroundColor: P.accentLight,
    textFormat: { foregroundColorStyle: { rgbColor: P.accent }, italic: true, fontSize: 10, fontFamily: 'Inter' },
    horizontalAlignment: 'CENTER', verticalAlignment: 'MIDDLE',
  }));
  // Column header (row 3)
  reqs.push(rowH(sheetId, 3, 4, 32));
  reqs.push(rc(sheetId, 3, 4, 0, totalCols, {
    backgroundColor: P.secondary,
    textFormat: { foregroundColorStyle: { rgbColor: P.white }, bold: true, fontSize: 10, fontFamily: 'Inter' },
    horizontalAlignment: 'CENTER', verticalAlignment: 'MIDDLE',
  }));
  // White content area
  reqs.push(rc(sheetId, 4, totalRow + 1, 0, totalCols, { backgroundColor: P.white }));
  // Column widths
  reqs.push(colW(sheetId, 0, 1, 180));   // Category
  reqs.push(colW(sheetId, 1, 2, 120));   // Monthly Budget
  reqs.push(colW(sheetId, 2, 3, 90));    // % of Total
  reqs.push(colW(sheetId, 3, 4, 100));   // Spent
  reqs.push(colW(sheetId, 4, 5, 100));   // Remaining
  reqs.push(colW(sheetId, 5, 6, 200));   // Status + bar
  // Currency + percent formats
  reqs.push(rc(sheetId, 4, 25, 1, 2, { numberFormat: { type: 'CURRENCY', pattern: '"$"#,##0' } }));
  reqs.push(rc(sheetId, 4, 25, 2, 3, { numberFormat: { type: 'PERCENT', pattern: '0%' } }));
  reqs.push(rc(sheetId, 4, 25, 3, 4, { numberFormat: { type: 'CURRENCY', pattern: '"$"#,##0' } }));
  reqs.push(rc(sheetId, 4, 25, 4, 5, { numberFormat: { type: 'CURRENCY', pattern: '"$"#,##0' } }));
  // Status bar column styling — monospace for aligned bars
  reqs.push(rc(sheetId, 4, totalRow + 1, 5, 6, {
    textFormat: { foregroundColorStyle: { rgbColor: P.textMuted }, fontSize: 9, fontFamily: 'Roboto Mono' },
    verticalAlignment: 'MIDDLE',
  }));
  // Banded rows
  for (let i = 0; i < catCount; i++) {
    const r = 4 + i;
    if (i % 2 === 1) {
      reqs.push(rc(sheetId, r, r + 1, 0, totalCols, { backgroundColor: P.offWhite }));
    }
    reqs.push(rowH(sheetId, r, r + 1, 30));
  }
  // Total row — bold with accent underline
  reqs.push(rc(sheetId, totalRow, totalRow + 1, 0, totalCols, {
    backgroundColor: P.accentLight,
    textFormat: { foregroundColorStyle: { rgbColor: P.accent }, bold: true, fontSize: 11, fontFamily: 'Inter' },
    horizontalAlignment: 'CENTER', verticalAlignment: 'MIDDLE',
  }));
  // Card border
  reqs.push({
    updateBorders: {
      range: { sheetId, startRowIndex: 0, endRowIndex: totalRow + 1, startColumnIndex: 0, endColumnIndex: totalCols },
      top: thinBorder(P.cardBorder),
      bottom: thinBorder(P.cardBorder),
      left: thinBorder(P.cardBorder),
      right: thinBorder(P.cardBorder),
    },
  });
  // Tip row
  const tipRow = totalRow + 2;
  reqs.push(mergeCells(sheetId, tipRow, tipRow + 1, 0, totalCols));
  reqs.push(rc(sheetId, tipRow, tipRow + 1, 0, totalCols, {
    backgroundColor: P.warmLight,
    textFormat: { foregroundColorStyle: { rgbColor: P.warm }, italic: true, fontSize: 10, fontFamily: 'Inter' },
    horizontalAlignment: 'CENTER', verticalAlignment: 'MIDDLE',
  }));
  return reqs;
}

// ══════════════════════════════════════════════════════════════
// TAB 3: SUMMARY / SCHEDULE / ITINERARY
// ══════════════════════════════════════════════════════════════

function summaryValues(niche) {
  if (niche.summaryMonths) {
    const months = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
    const rows = [['📅 MONTHLY SUMMARY'], ['See your income vs expenses month by month.'], []];
    rows.push(['Month', 'Income', 'Expenses', 'Net']);
    months.forEach((m, i) => {
      const r = i + 5; // shifted by +1 for subtitle row
      const monthNum = i + 1;
      // Dates are stored as serial numbers by Google Sheets. Use MONTH() directly.
      // SUMPRODUCT handles arrays safely; IFERROR wraps MONTH for empty cells.
      rows.push([
        m,
        `=IFERROR(SUMPRODUCT((Transactions!E5:E100="Income")*(IFERROR(MONTH(Transactions!A5:A100),0)=${monthNum})*IFERROR(Transactions!C5:C100,0)),0)`,
        `=IFERROR(SUMPRODUCT((Transactions!E5:E100<>"Income")*(LEN(Transactions!E5:E100)>0)*(IFERROR(MONTH(Transactions!A5:A100),0)=${monthNum})*IFERROR(Transactions!C5:C100,0)),0)`,
        `=B${r}-C${r}`,
      ]);
    });
    rows.push([]);
    rows.push(['💡 Tip: This view auto-calculates from Transactions. No manual entry needed.']);
    return rows;
  } else if (niche.tabNames[3] === 'Itinerary') {
    return [
      ['✈️ TRIP ITINERARY'], ['Plan each day of your trip — activities, times & costs.'], [],
      ['Day', 'Activity', 'Location', 'Time', 'Est. Cost'],
      ['Day 1', 'Arrive & Check In', 'Airport → Hotel', '10:00 AM', 45],
      ['Day 1', 'Welcome Dinner', 'Local Restaurant', '7:00 PM', 65],
      ['Day 2', 'Walking Tour', 'City Center', '9:00 AM', 30],
      ['Day 2', 'Museum Visit', 'National Museum', '2:00 PM', 25],
      ['Day 3', 'Day Trip', 'Coastal Town', '8:00 AM', 90],
      ['Day 4', 'Cooking Class', 'Local Kitchen', '11:00 AM', 80],
      ['Day 4', 'Market Shopping', 'Main Market', '3:00 PM', 60],
      ['Day 5', 'Free Morning', 'Hotel Area', '10:00 AM', 0],
      ['Day 5', 'Departure', 'Hotel → Airport', '3:00 PM', 50],
      [], [], [], [], [], [],
      ['💡 Tip: Add more days below. Costs feed into the Dashboard summary.'],
    ];
  } else {
    return [
      ['💳 PAYMENT SCHEDULE'], ['Track every payment — what\'s paid, what\'s coming up.'], [],
      ['Item', 'Amount', 'Due Date', 'Status'],
      ['Venue Deposit', 5000, '2026-03-01', '✅ Paid'],
      ['Photographer', 1500, '2026-04-15', '⏳ Pending'],
      ['Florist', 3500, '2026-05-01', '⏳ Pending'],
      ['DJ / Music', 2000, '2026-05-15', '⏳ Pending'],
      ['Catering Final', 7000, '2026-06-01', '⏳ Pending'],
      ['Wedding Bands', 3000, '2026-04-01', '✅ Paid'],
      ['Invitations', 800, '2026-03-15', '✅ Paid'],
      ['Transportation', 1200, '2026-06-10', '⏳ Pending'],
      [], [], [], [], [],
      ['💡 Tip: Update the Status column as you make payments.'],
    ];
  }
}

function summaryFormatting(sheetId, P, niche) {
  const reqs = [];
  const cols = niche.tabNames[3] === 'Itinerary' ? 5 : 4;
  reqs.push({ updateSheetProperties: { properties: { sheetId, gridProperties: { hideGridlines: true } }, fields: 'gridProperties.hideGridlines' } });
  // Full cream background
  reqs.push(rc(sheetId, 0, 30, 0, cols, { backgroundColor: P.cream, textFormat: { foregroundColorStyle: { rgbColor: P.textDark }, fontSize: 10, fontFamily: 'Inter' } }));
  // Title banner (row 0)
  reqs.push(rowH(sheetId, 0, 1, 44));
  reqs.push(mergeCells(sheetId, 0, 1, 0, cols));
  reqs.push(rc(sheetId, 0, 1, 0, cols, {
    backgroundColor: P.warm,
    textFormat: { foregroundColorStyle: { rgbColor: P.white }, bold: true, fontSize: 16, fontFamily: 'Inter' },
    horizontalAlignment: 'CENTER', verticalAlignment: 'MIDDLE',
  }));
  // Subtitle (row 1)
  reqs.push(rowH(sheetId, 1, 2, 28));
  reqs.push(mergeCells(sheetId, 1, 2, 0, cols));
  reqs.push(rc(sheetId, 1, 2, 0, cols, {
    backgroundColor: P.warmLight,
    textFormat: { foregroundColorStyle: { rgbColor: P.warm }, italic: true, fontSize: 10, fontFamily: 'Inter' },
    horizontalAlignment: 'CENTER', verticalAlignment: 'MIDDLE',
  }));
  // Column header (row 3)
  reqs.push(rowH(sheetId, 3, 4, 32));
  reqs.push(rc(sheetId, 3, 4, 0, cols, {
    backgroundColor: P.secondary,
    textFormat: { foregroundColorStyle: { rgbColor: P.white }, bold: true, fontSize: 10, fontFamily: 'Inter' },
    horizontalAlignment: 'CENTER', verticalAlignment: 'MIDDLE',
  }));
  // White content area
  reqs.push(rc(sheetId, 4, 22, 0, cols, { backgroundColor: P.white }));
  // Column widths
  reqs.push(colW(sheetId, 0, 1, 180));
  reqs.push(colW(sheetId, 1, 2, 140));
  reqs.push(colW(sheetId, 2, 3, 140));
  reqs.push(colW(sheetId, 3, 4, 120));
  if (cols === 5) reqs.push(colW(sheetId, 4, 5, 110));
  // Currency format — Income, Expenses, Net (columns B-D)
  reqs.push(rc(sheetId, 4, 25, 1, cols, { numberFormat: { type: 'CURRENCY', pattern: '"$"#,##0' } }));
  // Banded rows
  reqs.push({
    addBanding: {
      bandedRange: {
        range: { sheetId, startRowIndex: 4, endRowIndex: 20, startColumnIndex: 0, endColumnIndex: cols },
        rowProperties: {
          firstBandColorStyle: { rgbColor: P.white },
          secondBandColorStyle: { rgbColor: P.offWhite },
        },
      },
    },
  });
  // Card border
  reqs.push({
    updateBorders: {
      range: { sheetId, startRowIndex: 0, endRowIndex: 20, startColumnIndex: 0, endColumnIndex: cols },
      top: thinBorder(P.cardBorder),
      bottom: thinBorder(P.cardBorder),
      left: thinBorder(P.cardBorder),
      right: thinBorder(P.cardBorder),
    },
  });
  return reqs;
}

// ══════════════════════════════════════════════════════════════
// TAB 4: SAVINGS GOALS
// ══════════════════════════════════════════════════════════════

function goalsValues(niche) {
  const rows = [];
  rows.push(['🎯 SAVINGS GOALS']);
  rows.push(['Track progress toward your financial goals.']);
  rows.push([]);
  rows.push(['Goal', 'Target', 'Saved', 'Remaining', '%', 'Progress Bar']);
  niche.goals.forEach((g, i) => {
    const r = i + 5; // shifted by +1 for subtitle
    rows.push([
      g.name,
      g.target,
      g.saved,
      `=B${r}-C${r}`,
      `=IF(B${r}>0,C${r}/B${r},0)`,
      // Visual REPT progress bar — 20 chars wide
      `=REPT("█",ROUND(MIN(IF(B${r}>0,C${r}/B${r},0),1)*20,0))&REPT("░",20-ROUND(MIN(IF(B${r}>0,C${r}/B${r},0),1)*20,0))&" "&TEXT(IF(B${r}>0,C${r}/B${r},0),"0%")`,
    ]);
  });
  // Add empty rows for user to add their own goals
  for (let i = 0; i < 4; i++) {
    const r = 5 + niche.goals.length + i;
    rows.push(['', '', '', `=IF(B${r}>0,B${r}-C${r},"")`, `=IF(B${r}>0,C${r}/B${r},"")`, `=IF(B${r}>0,REPT("█",ROUND(MIN(C${r}/B${r},1)*20,0))&REPT("░",20-ROUND(MIN(C${r}/B${r},1)*20,0))&" "&TEXT(C${r}/B${r},"0%"),"")`]);
  }
  rows.push([]);
  rows.push(['💡 Tip: Update the "Saved" column as you save. Progress bars update automatically!']);
  return rows;
}

function goalsFormatting(sheetId, P, niche) {
  const reqs = [];
  const goalCount = niche.goals.length;
  const lastDataRow = 4 + goalCount + 4; // goals + 4 empty rows
  const totalCols = 6;
  reqs.push({ updateSheetProperties: { properties: { sheetId, gridProperties: { hideGridlines: true } }, fields: 'gridProperties.hideGridlines' } });
  // Full cream background
  reqs.push(rc(sheetId, 0, lastDataRow + 4, 0, totalCols, { backgroundColor: P.cream, textFormat: { foregroundColorStyle: { rgbColor: P.textDark }, fontSize: 10, fontFamily: 'Inter' } }));
  // Title banner (row 0)
  reqs.push(rowH(sheetId, 0, 1, 44));
  reqs.push(mergeCells(sheetId, 0, 1, 0, totalCols));
  reqs.push(rc(sheetId, 0, 1, 0, totalCols, {
    backgroundColor: P.secondary,
    textFormat: { foregroundColorStyle: { rgbColor: P.white }, bold: true, fontSize: 16, fontFamily: 'Inter' },
    horizontalAlignment: 'CENTER', verticalAlignment: 'MIDDLE',
  }));
  // Subtitle (row 1)
  reqs.push(rowH(sheetId, 1, 2, 28));
  reqs.push(mergeCells(sheetId, 1, 2, 0, totalCols));
  reqs.push(rc(sheetId, 1, 2, 0, totalCols, {
    backgroundColor: P.secondaryLight,
    textFormat: { foregroundColorStyle: { rgbColor: P.secondary }, italic: true, fontSize: 10, fontFamily: 'Inter' },
    horizontalAlignment: 'CENTER', verticalAlignment: 'MIDDLE',
  }));
  // Column header (row 3)
  reqs.push(rowH(sheetId, 3, 4, 32));
  reqs.push(rc(sheetId, 3, 4, 0, totalCols, {
    backgroundColor: P.accent,
    textFormat: { foregroundColorStyle: { rgbColor: P.white }, bold: true, fontSize: 10, fontFamily: 'Inter' },
    horizontalAlignment: 'CENTER', verticalAlignment: 'MIDDLE',
  }));
  // White content area
  reqs.push(rc(sheetId, 4, lastDataRow + 1, 0, totalCols, { backgroundColor: P.white }));
  // Banded rows for data
  for (let i = 0; i < goalCount + 4; i++) {
    const r = 4 + i;
    if (i % 2 === 1) {
      reqs.push(rc(sheetId, r, r + 1, 0, totalCols, { backgroundColor: P.offWhite }));
    }
    reqs.push(rowH(sheetId, r, r + 1, 32));
  }
  // Column widths
  reqs.push(colW(sheetId, 0, 1, 200));   // Goal name
  reqs.push(colW(sheetId, 1, 2, 110));   // Target
  reqs.push(colW(sheetId, 2, 3, 110));   // Saved
  reqs.push(colW(sheetId, 3, 4, 110));   // Remaining
  reqs.push(colW(sheetId, 4, 5, 70));    // %
  reqs.push(colW(sheetId, 5, 6, 260));   // Progress Bar (wide for visual bar)
  // Number formats
  reqs.push(rc(sheetId, 4, lastDataRow + 1, 1, 4, { numberFormat: { type: 'CURRENCY', pattern: '"$"#,##0' } }));
  reqs.push(rc(sheetId, 4, lastDataRow + 1, 4, 5, { numberFormat: { type: 'PERCENT', pattern: '0%' }, textFormat: { foregroundColorStyle: { rgbColor: P.accent }, bold: true, fontSize: 11 } }));
  // Progress bar column — accent colored, monospace-like for bar alignment
  reqs.push(rc(sheetId, 4, lastDataRow + 1, 5, 6, {
    textFormat: { foregroundColorStyle: { rgbColor: P.accent }, fontSize: 10, fontFamily: 'Roboto Mono' },
    verticalAlignment: 'MIDDLE',
    horizontalAlignment: 'LEFT',
  }));
  // Card border
  reqs.push({
    updateBorders: {
      range: { sheetId, startRowIndex: 0, endRowIndex: lastDataRow + 1, startColumnIndex: 0, endColumnIndex: totalCols },
      top: thinBorder(P.cardBorder),
      bottom: thinBorder(P.cardBorder),
      left: thinBorder(P.cardBorder),
      right: thinBorder(P.cardBorder),
    },
  });
  // Tip row
  const tipRow = lastDataRow + 1;
  reqs.push(mergeCells(sheetId, tipRow, tipRow + 1, 0, totalCols));
  reqs.push(rc(sheetId, tipRow, tipRow + 1, 0, totalCols, {
    backgroundColor: P.warmLight,
    textFormat: { foregroundColorStyle: { rgbColor: P.warm }, italic: true, fontSize: 10, fontFamily: 'Inter' },
    horizontalAlignment: 'CENTER', verticalAlignment: 'MIDDLE',
  }));
  return reqs;
}

// ══════════════════════════════════════════════════════════════
// TAB 5: SETUP & INSTRUCTIONS
// ══════════════════════════════════════════════════════════════

function setupValues(niche) {
  return [
    [`${niche.emoji} ${niche.title}`],
    ['Thank you for purchasing! Here\'s how to get started.'],
    [''],
    ['📖 HOW TO USE THIS SPREADSHEET'],
    [''],
    ['Step 1:  Go to the Categories tab and set your budget for each category.'],
    ['Step 2:  Log all income & expenses in the Transactions tab.'],
    ['Step 3:  Assign each transaction to a Category using the dropdown.'],
    ['Step 4:  Watch the Dashboard update automatically — KPIs, charts & more!'],
    ['Step 5:  Track your savings in the Savings Goals tab.'],
    ['Step 6:  Delete the sample data and start adding your own!'],
    [''],
    ['📑 TABS INCLUDED IN THIS TEMPLATE'],
    [''],
    ...niche.tabNames.map(t => [`  ✓  ${t}`]),
    [''],
    ['💻 HOW TO OPEN IN GOOGLE SHEETS'],
    [''],
    ['1.  Download the file from your Etsy purchase.'],
    ['2.  Go to drive.google.com and sign in.'],
    ['3.  Click "+ New" → "File upload" → select this file.'],
    ['4.  Right-click the uploaded file → "Open with" → "Google Sheets".'],
    ['5.  Go to File → "Make a copy" to get your fully editable version.'],
    [''],
    ['✨ All formulas update automatically. Sample data is included to show you how it works.'],
    ['   Clear the sample data and add your own to get started!'],
    [''],
    ['Need help? Reach out through Etsy messages — we\'re happy to assist!'],
  ];
}

function setupFormatting(sheetId, P, niche) {
  const reqs = [];
  reqs.push({ updateSheetProperties: { properties: { sheetId, gridProperties: { hideGridlines: true } }, fields: 'gridProperties.hideGridlines' } });
  // Full cream background
  reqs.push(rc(sheetId, 0, 30, 0, 1, { backgroundColor: P.cream, textFormat: { foregroundColorStyle: { rgbColor: P.textDark }, fontSize: 11, fontFamily: 'Inter' } }));
  reqs.push(rc(sheetId, 0, 28, 0, 1, { backgroundColor: P.white }));
  reqs.push(colW(sheetId, 0, 1, 600));
  // Title banner (row 0)
  reqs.push(rowH(sheetId, 0, 1, 48));
  reqs.push(rc(sheetId, 0, 1, 0, 1, {
    backgroundColor: P.accent,
    textFormat: { foregroundColorStyle: { rgbColor: P.white }, bold: true, fontSize: 18, fontFamily: 'Inter' },
    horizontalAlignment: 'CENTER', verticalAlignment: 'MIDDLE',
  }));
  // Subtitle (row 1)
  reqs.push(rowH(sheetId, 1, 2, 30));
  reqs.push(rc(sheetId, 1, 2, 0, 1, {
    backgroundColor: P.accentLight,
    textFormat: { foregroundColorStyle: { rgbColor: P.accent }, italic: true, fontSize: 11, fontFamily: 'Inter' },
    horizontalAlignment: 'CENTER', verticalAlignment: 'MIDDLE',
  }));
  // Section headers — "HOW TO USE", "TABS INCLUDED", "HOW TO OPEN"
  reqs.push(rc(sheetId, 3, 4, 0, 1, {
    backgroundColor: P.secondary,
    textFormat: { foregroundColorStyle: { rgbColor: P.white }, bold: true, fontSize: 13, fontFamily: 'Inter' },
    verticalAlignment: 'MIDDLE',
  }));
  reqs.push(rowH(sheetId, 3, 4, 36));
  // Tabs Included header
  const tabsHeaderRow = 12;
  reqs.push(rc(sheetId, tabsHeaderRow, tabsHeaderRow + 1, 0, 1, {
    backgroundColor: P.warm,
    textFormat: { foregroundColorStyle: { rgbColor: P.white }, bold: true, fontSize: 13, fontFamily: 'Inter' },
    verticalAlignment: 'MIDDLE',
  }));
  reqs.push(rowH(sheetId, tabsHeaderRow, tabsHeaderRow + 1, 36));
  // Tab list items — accent color
  const tabListStart = tabsHeaderRow + 2;
  const tabListEnd = tabListStart + niche.tabNames.length;
  reqs.push(rc(sheetId, tabListStart, tabListEnd, 0, 1, {
    textFormat: { foregroundColorStyle: { rgbColor: P.accent }, fontSize: 11, fontFamily: 'Inter' },
  }));
  // Google Sheets header
  const gsHeaderRow = tabListEnd + 1;
  reqs.push(rc(sheetId, gsHeaderRow, gsHeaderRow + 1, 0, 1, {
    backgroundColor: P.accent,
    textFormat: { foregroundColorStyle: { rgbColor: P.white }, bold: true, fontSize: 13, fontFamily: 'Inter' },
    verticalAlignment: 'MIDDLE',
  }));
  reqs.push(rowH(sheetId, gsHeaderRow, gsHeaderRow + 1, 36));
  // Card border around the entire content
  reqs.push({
    updateBorders: {
      range: { sheetId, startRowIndex: 0, endRowIndex: 28, startColumnIndex: 0, endColumnIndex: 1 },
      top: thinBorder(P.cardBorder),
      bottom: thinBorder(P.cardBorder),
      left: thinBorder(P.cardBorder),
      right: thinBorder(P.cardBorder),
    },
  });
  return reqs;
}

// ══════════════════════════════════════════════════════════════
// CHARTS
// ══════════════════════════════════════════════════════════════

function buildCharts(sheetId, niche) {
  const catCount = niche.categories.length;
  const reqs = [];

  // Donut chart — Expense Distribution (overlaid on right card area)
  reqs.push({
    addChart: {
      chart: {
        spec: {
          title: '',
          pieChart: {
            legendPosition: 'BOTTOM_LEGEND',
            domain: {
              sourceRange: {
                sources: [{
                  sheetId,
                  startRowIndex: 13,
                  endRowIndex: 13 + catCount,
                  startColumnIndex: L_C0,
                  endColumnIndex: L_C0 + 1,
                }],
              },
            },
            series: {
              sourceRange: {
                sources: [{
                  sheetId,
                  startRowIndex: 13,
                  endRowIndex: 13 + catCount,
                  startColumnIndex: L_C0 + 2,
                  endColumnIndex: L_C0 + 3,
                }],
              },
            },
            pieHole: 0.45,
          },
          backgroundColorStyle: { rgbColor: hex('#FFFFFF') },
          titleTextFormat: { foregroundColorStyle: { rgbColor: hex(niche.accent) }, fontSize: 10, bold: true },
        },
        position: {
          overlayPosition: {
            anchorCell: { sheetId, rowIndex: 12, columnIndex: R_C0 },
            widthPixels: 400,
            heightPixels: catCount * 26 + 30,
          },
        },
      },
    },
  });

  // Budget vs Spent bar chart (overlaid below the donut, or as second chart)
  reqs.push({
    addChart: {
      chart: {
        spec: {
          title: 'Budget vs Spent',
          basicChart: {
            chartType: 'BAR',
            legendPosition: 'BOTTOM_LEGEND',
            axis: [
              { position: 'BOTTOM_AXIS', title: '' },
              { position: 'LEFT_AXIS', title: '' },
            ],
            domains: [{
              domain: {
                sourceRange: {
                  sources: [{
                    sheetId,
                    startRowIndex: 13,
                    endRowIndex: 13 + Math.min(catCount, 6),
                    startColumnIndex: L_C0,
                    endColumnIndex: L_C0 + 1,
                  }],
                },
              },
            }],
            series: [
              {
                series: {
                  sourceRange: {
                    sources: [{
                      sheetId,
                      startRowIndex: 13,
                      endRowIndex: 13 + Math.min(catCount, 6),
                      startColumnIndex: L_C0 + 1,
                      endColumnIndex: L_C0 + 2,
                    }],
                  },
                },
                colorStyle: { rgbColor: hex(niche.accent) },
              },
              {
                series: {
                  sourceRange: {
                    sources: [{
                      sheetId,
                      startRowIndex: 13,
                      endRowIndex: 13 + Math.min(catCount, 6),
                      startColumnIndex: L_C0 + 2,
                      endColumnIndex: L_C0 + 3,
                    }],
                  },
                },
                colorStyle: { rgbColor: hex(niche.warm) },
              },
            ],
            headerCount: 0,
          },
          backgroundColorStyle: { rgbColor: hex('#FFFFFF') },
          titleTextFormat: { foregroundColorStyle: { rgbColor: hex(niche.accent) }, fontSize: 10, bold: true },
        },
        position: {
          overlayPosition: {
            anchorCell: { sheetId, rowIndex: 34, columnIndex: L_C0 },
            widthPixels: 840,
            heightPixels: 250,
          },
        },
      },
    },
  });

  return reqs;
}

// ══════════════════════════════════════════════════════════════
// CONDITIONAL FORMATTING
// ══════════════════════════════════════════════════════════════

function buildConditionalFormatting(niche, P) {
  const reqs = [];
  const catCount = niche.categories.length;

  // ═══ DASHBOARD (Sheet 0) ═══

  // Category "Remaining" column — green when positive, red when over budget
  // Remaining is in col H (index 7) = L_C0+3, rows 13 to 13+catCount
  const dashRemCol = L_C0 + 3; // col 7 = H
  // Red for over budget (contains 🔴)
  reqs.push({
    addConditionalFormatRule: {
      rule: {
        ranges: [{ sheetId: 0, startRowIndex: 13, endRowIndex: 13 + catCount, startColumnIndex: dashRemCol, endColumnIndex: dashRemCol + 1 }],
        booleanRule: {
          condition: { type: 'TEXT_CONTAINS', values: [{ userEnteredValue: '🔴' }] },
          format: { backgroundColor: P.redLight, textFormat: { foregroundColorStyle: { rgbColor: P.red } } },
        },
      },
      index: 0,
    },
  });
  // Orange for warning (contains ⚠️)
  reqs.push({
    addConditionalFormatRule: {
      rule: {
        ranges: [{ sheetId: 0, startRowIndex: 13, endRowIndex: 13 + catCount, startColumnIndex: dashRemCol, endColumnIndex: dashRemCol + 1 }],
        booleanRule: {
          condition: { type: 'TEXT_CONTAINS', values: [{ userEnteredValue: '⚠️' }] },
          format: { backgroundColor: P.warningLight, textFormat: { foregroundColorStyle: { rgbColor: P.warning } } },
        },
      },
      index: 1,
    },
  });
  // Green for under budget (contains ✅)
  reqs.push({
    addConditionalFormatRule: {
      rule: {
        ranges: [{ sheetId: 0, startRowIndex: 13, endRowIndex: 13 + catCount, startColumnIndex: dashRemCol, endColumnIndex: dashRemCol + 1 }],
        booleanRule: {
          condition: { type: 'TEXT_CONTAINS', values: [{ userEnteredValue: '✅' }] },
          format: { backgroundColor: P.greenLight, textFormat: { foregroundColorStyle: { rgbColor: P.green } } },
        },
      },
      index: 2,
    },
  });

  // ═══ TRANSACTIONS (Sheet 1) ═══

  // Income rows highlighted green (category column E = "Income")
  reqs.push({
    addConditionalFormatRule: {
      rule: {
        ranges: [{ sheetId: 1, startRowIndex: 4, endRowIndex: 30, startColumnIndex: 0, endColumnIndex: 5 }],
        booleanRule: {
          condition: { type: 'CUSTOM_FORMULA', values: [{ userEnteredValue: '=$E5="Income"' }] },
          format: { backgroundColor: P.greenLight },
        },
      },
      index: 0,
    },
  });

  // ═══ CATEGORIES (Sheet 2) ═══

  // Remaining column (E) — green when positive, red when negative
  reqs.push({
    addConditionalFormatRule: {
      rule: {
        ranges: [{ sheetId: 2, startRowIndex: 4, endRowIndex: 4 + catCount, startColumnIndex: 4, endColumnIndex: 5 }],
        booleanRule: {
          condition: { type: 'NUMBER_LESS', values: [{ userEnteredValue: '0' }] },
          format: { backgroundColor: P.redLight, textFormat: { foregroundColorStyle: { rgbColor: P.red }, bold: true } },
        },
      },
      index: 0,
    },
  });
  reqs.push({
    addConditionalFormatRule: {
      rule: {
        ranges: [{ sheetId: 2, startRowIndex: 4, endRowIndex: 4 + catCount, startColumnIndex: 4, endColumnIndex: 5 }],
        booleanRule: {
          condition: { type: 'NUMBER_GREATER_THAN_EQ', values: [{ userEnteredValue: '0' }] },
          format: { backgroundColor: P.greenLight, textFormat: { foregroundColorStyle: { rgbColor: P.green } } },
        },
      },
      index: 1,
    },
  });

  // Status column (F) — color by status emoji
  reqs.push({
    addConditionalFormatRule: {
      rule: {
        ranges: [{ sheetId: 2, startRowIndex: 4, endRowIndex: 4 + catCount, startColumnIndex: 5, endColumnIndex: 6 }],
        booleanRule: {
          condition: { type: 'TEXT_CONTAINS', values: [{ userEnteredValue: '🔴' }] },
          format: { backgroundColor: P.redLight },
        },
      },
      index: 0,
    },
  });
  reqs.push({
    addConditionalFormatRule: {
      rule: {
        ranges: [{ sheetId: 2, startRowIndex: 4, endRowIndex: 4 + catCount, startColumnIndex: 5, endColumnIndex: 6 }],
        booleanRule: {
          condition: { type: 'TEXT_CONTAINS', values: [{ userEnteredValue: '⚠️' }] },
          format: { backgroundColor: P.warningLight },
        },
      },
      index: 1,
    },
  });
  reqs.push({
    addConditionalFormatRule: {
      rule: {
        ranges: [{ sheetId: 2, startRowIndex: 4, endRowIndex: 4 + catCount, startColumnIndex: 5, endColumnIndex: 6 }],
        booleanRule: {
          condition: { type: 'TEXT_CONTAINS', values: [{ userEnteredValue: '✅' }] },
          format: { backgroundColor: P.greenLight },
        },
      },
      index: 2,
    },
  });

  // ═══ GOALS (Sheet 4) ═══

  // Progress % column (E) — gradient scale from red to green
  reqs.push({
    addConditionalFormatRule: {
      rule: {
        ranges: [{ sheetId: 4, startRowIndex: 4, endRowIndex: 15, startColumnIndex: 4, endColumnIndex: 5 }],
        gradientRule: {
          minpoint: { colorStyle: { rgbColor: P.redLight }, type: 'NUMBER', value: '0' },
          midpoint: { colorStyle: { rgbColor: P.warningLight }, type: 'NUMBER', value: '0.5' },
          maxpoint: { colorStyle: { rgbColor: P.greenLight }, type: 'NUMBER', value: '1' },
        },
      },
      index: 0,
    },
  });

  // ═══ SUMMARY / PAYMENT SCHEDULE (Sheet 3) ═══

  // For monthly summary: green when Net > 0, red when Net < 0
  if (niche.summaryMonths) {
    reqs.push({
      addConditionalFormatRule: {
        rule: {
          ranges: [{ sheetId: 3, startRowIndex: 4, endRowIndex: 16, startColumnIndex: 3, endColumnIndex: 4 }],
          booleanRule: {
            condition: { type: 'NUMBER_LESS', values: [{ userEnteredValue: '0' }] },
            format: { backgroundColor: P.redLight, textFormat: { foregroundColorStyle: { rgbColor: P.red } } },
          },
        },
        index: 0,
      },
    });
    reqs.push({
      addConditionalFormatRule: {
        rule: {
          ranges: [{ sheetId: 3, startRowIndex: 4, endRowIndex: 16, startColumnIndex: 3, endColumnIndex: 4 }],
          booleanRule: {
            condition: { type: 'NUMBER_GREATER', values: [{ userEnteredValue: '0' }] },
            format: { backgroundColor: P.greenLight, textFormat: { foregroundColorStyle: { rgbColor: P.green } } },
          },
        },
        index: 1,
      },
    });
  } else {
    // Payment schedule: color by status text
    reqs.push({
      addConditionalFormatRule: {
        rule: {
          ranges: [{ sheetId: 3, startRowIndex: 4, endRowIndex: 20, startColumnIndex: 3, endColumnIndex: 4 }],
          booleanRule: {
            condition: { type: 'TEXT_CONTAINS', values: [{ userEnteredValue: '✅' }] },
            format: { backgroundColor: P.greenLight, textFormat: { foregroundColorStyle: { rgbColor: P.green } } },
          },
        },
        index: 0,
      },
    });
    reqs.push({
      addConditionalFormatRule: {
        rule: {
          ranges: [{ sheetId: 3, startRowIndex: 4, endRowIndex: 20, startColumnIndex: 3, endColumnIndex: 4 }],
          booleanRule: {
            condition: { type: 'TEXT_CONTAINS', values: [{ userEnteredValue: '⏳' }] },
            format: { backgroundColor: P.warningLight, textFormat: { foregroundColorStyle: { rgbColor: P.warning } } },
          },
        },
        index: 1,
      },
    });
  }

  return reqs;
}

// ══════════════════════════════════════════════════════════════
// MAIN BUILD
// ══════════════════════════════════════════════════════════════

async function main() {
  const nicheKey = process.argv[2] || 'budget';
  const niche = NICHES[nicheKey];
  if (!niche) {
    console.error(`Unknown niche: ${nicheKey}. Available: ${Object.keys(NICHES).join(', ')}`);
    process.exit(1);
  }

  console.log('═══════════════════════════════════════════════════');
  console.log(`  Premium Template Builder v2 — ${niche.emoji} ${niche.title}`);
  console.log('═══════════════════════════════════════════════════\n');

  const auth = await getAuthClient();
  const sheets = google.sheets({ version: 'v4', auth });
  const P = buildPalette(niche);

  // Tab definitions — wedding gets a completely different dashboard
  const isWedding = nicheKey === 'wedding';
  const tabDefs = isWedding ? [
    { name: 'Dashboard', values: weddingDashboardValues(niche), format: (id) => weddingDashboardFormatting(id, niche, P), cols: W_COLS, rows: W_ROWS },
    { name: 'Transactions', values: transactionsValues(niche), format: (id) => transactionsFormatting(id, P, niche.transactions.length) },
    { name: 'Budget Categories', values: categoriesValues(niche), format: (id) => categoriesFormatting(id, P, niche), colCount: 6 },
    { name: 'Payment Schedule', values: summaryValues(niche), format: (id) => summaryFormatting(id, P, niche) },
    { name: 'Vendor Tracker', values: vendorTrackerValues(niche), format: (id) => vendorTrackerFormatting(id, P) },
    { name: 'Setup & Instructions', values: setupValues(niche), format: (id) => setupFormatting(id, P, niche) },
  ] : [
    { name: 'Dashboard', values: dashboardValues(niche), format: (id) => dashboardFormatting(id, niche, P) },
    { name: 'Transactions', values: transactionsValues(niche), format: (id) => transactionsFormatting(id, P, niche.transactions.length) },
    { name: 'Categories', values: categoriesValues(niche), format: (id) => categoriesFormatting(id, P, niche), colCount: 6 },
    { name: niche.tabNames[3], values: summaryValues(niche), format: (id) => summaryFormatting(id, P, niche) },
    { name: 'Savings Goals', values: goalsValues(niche), format: (id) => goalsFormatting(id, P, niche), colCount: 6 },
    { name: 'Setup & Instructions', values: setupValues(niche), format: (id) => setupFormatting(id, P, niche) },
  ];

  // Step 1: Create spreadsheet
  console.log('[1/5] Creating spreadsheet...');
  const { data: ss } = await sheets.spreadsheets.create({
    requestBody: {
      properties: {
        title: `${niche.emoji} ${niche.title}`,
        locale: 'en_US',
        defaultFormat: { textFormat: { fontFamily: 'Inter', fontSize: 10 } },
      },
      sheets: tabDefs.map((tab, i) => ({
        properties: {
          sheetId: i,
          title: tab.name,
          tabColorStyle: { rgbColor: P.accent },
          gridProperties: {
            rowCount: i === 0 ? (tab.rows || DASH_ROWS) : Math.max(50, (tab.values?.length || 0) + 20),
            columnCount: i === 0 ? (tab.cols || DASH_COLS) : (tab.colCount || (tab.name === 'Vendor Tracker' ? 10 : 6)),
            frozenRowCount: i === 0 ? 0 : 1,
          },
        },
      })),
    },
  });
  const spreadsheetId = ss.spreadsheetId;
  console.log(`   → ${ss.spreadsheetUrl}`);

  // Step 2: Populate values
  console.log('[2/5] Populating values...');
  const valueData = tabDefs.map(tab => ({
    range: `'${tab.name}'!A1`,
    values: tab.values,
  }));
  await sheets.spreadsheets.values.batchUpdate({
    spreadsheetId,
    requestBody: { valueInputOption: 'USER_ENTERED', data: valueData },
  });

  // Step 3: Apply formatting
  console.log('[3/5] Applying premium formatting...');
  const allReqs = [];
  tabDefs.forEach((tab, i) => allReqs.push(...tab.format(i)));
  if (allReqs.length > 0) {
    await sheets.spreadsheets.batchUpdate({ spreadsheetId, requestBody: { requests: allReqs } });
  }

  // Step 3b: Apply conditional formatting (red/green/gradient rules)
  console.log('      Applying conditional formatting...');
  const cfReqs = buildConditionalFormatting(niche, P);
  if (cfReqs.length > 0) {
    await sheets.spreadsheets.batchUpdate({ spreadsheetId, requestBody: { requests: cfReqs } });
  }

  // Step 4: Add charts
  console.log('[4/5] Adding charts...');
  const chartReqs = isWedding ? weddingCharts(0, niche) : buildCharts(0, niche);
  if (chartReqs.length > 0) {
    await sheets.spreadsheets.batchUpdate({ spreadsheetId, requestBody: { requests: chartReqs } });
  }

  // Step 5: Final touches — make sheet publicly viewable for previews
  console.log('[5/5] Final touches...');

  // Make the sheet publicly viewable (required for Playwright screenshots)
  try {
    const drive = google.drive({ version: 'v3', auth });
    await drive.permissions.create({
      fileId: spreadsheetId,
      requestBody: {
        role: 'reader',
        type: 'anyone',
      },
    });
  } catch (shareErr) {
    // Non-fatal — sheet still works, just can't be previewed without auth
    console.warn('   ⚠ Could not make sheet public:', shareErr.message?.slice(0, 80));
  }

  console.log('\n✅ Template built!');
  console.log(`   Spreadsheet: ${ss.spreadsheetUrl}`);
  console.log(`   Niche: ${nicheKey}`);
  console.log(`   Tabs: ${tabDefs.map(t => t.name).join(', ')}`);

  // Machine-readable JSON output (consumed by factory pipeline)
  if (process.argv.includes('--json')) {
    const jsonResult = JSON.stringify({
      success: true,
      spreadsheetId,
      spreadsheetUrl: ss.spreadsheetUrl,
      nicheKey,
      tabCount: tabDefs.length,
      tabs: tabDefs.map(t => t.name),
    });
    console.log(`__JSON_OUTPUT__${jsonResult}__JSON_END__`);
  }

  // Step 6: Auto-generate Etsy listing images + promo video
  const skipImages = process.argv.includes('--no-images');
  if (!skipImages) {
    console.log('\n──────────────────────────────────────────────────');
    console.log('  Generating Etsy listing assets...');
    console.log('──────────────────────────────────────────────────');
    try {
      // Wait a few seconds for Google Sheets to finalize formatting/charts
      await new Promise(r => setTimeout(r, 5000));
      const outDir = await generateListingAssets(spreadsheetId, nicheKey);
      console.log('\n══════════════════════════════════════════════════');
      console.log('  🎉 EVERYTHING READY TO LIST ON ETSY');
      console.log('══════════════════════════════════════════════════');
      console.log(`  📄 Template:  ${ss.spreadsheetUrl}`);
      console.log(`  🖼️  Images:   ${outDir}`);
      console.log(`  🎬 Video:     ${outDir}/promo_video.mp4`);
      console.log('══════════════════════════════════════════════════\n');
    } catch (e) {
      console.error(`\n⚠ Image generation failed: ${e.message}`);
      console.log('  You can retry manually:');
      console.log(`  node scripts/etsy-image-pipeline.mjs "${ss.spreadsheetUrl}" --niche ${nicheKey}\n`);
    }
  }
}

main().catch(err => {
  console.error('Build failed:', err.message);
  if (err.response?.data?.error) console.error(JSON.stringify(err.response.data.error, null, 2));
  process.exit(1);
});
