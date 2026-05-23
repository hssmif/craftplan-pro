/**
 * ══════════════════════════════════════════════════════════════
 * Pay Yourself First — Budget Tracker
 * Premium Google Sheets Builder (Node.js + googleapis)
 *
 * Creates a fully-formatted, Etsy-sellable spreadsheet with:
 * - 7 tabs (Dashboard, Transactions, Budget Setup, Monthly Summary, Savings Goals, Instructions, Reference)
 * - Dark premium theme (navy + gold + rose)
 * - 4 KPI cards, 3 charts, conditional formatting
 * - Data validation dropdowns, frozen headers, sample data
 * ══════════════════════════════════════════════════════════════
 */
import { google } from 'googleapis';
import { getAuthClient } from './gws-oauth-helper.mjs';

// ── Color Helpers ───────────────────────────────────────────
const hex = (h) => ({
  red: parseInt(h.slice(1, 3), 16) / 255,
  green: parseInt(h.slice(3, 5), 16) / 255,
  blue: parseInt(h.slice(5, 7), 16) / 255,
});

const C = {
  navy:     hex('#1B3A5C'),
  darkBg:   hex('#0F172A'),
  cardBg:   hex('#162033'),
  altRow:   hex('#1E293B'),
  gold:     hex('#D4AF37'),
  rose:     hex('#CC6666'),
  green:    hex('#22C55E'),
  red:      hex('#EF4444'),
  warning:  hex('#F59E0B'),
  blue:     hex('#60A5FA'),
  purple:   hex('#A78BFA'),
  white:    hex('#F8FAFC'),
  muted:    hex('#94A3B8'),
  headerBg: hex('#16203D'),
  totalsBg: hex('#1E2A3E'),
  pure:     hex('#FFFFFF'),
  lightGray: hex('#F1F5F9'),
};

// ── Main Build ──────────────────────────────────────────────
async function main() {
  console.log('═══════════════════════════════════════════════════');
  console.log('  Pay Yourself First — Budget Tracker Builder');
  console.log('═══════════════════════════════════════════════════\n');

  const auth = await getAuthClient();
  const sheets = google.sheets({ version: 'v4', auth });

  // ── Step 1: Create Spreadsheet ────────────────────────────
  console.log('📄 Creating spreadsheet with 7 tabs...');
  const { data: ss } = await sheets.spreadsheets.create({
    requestBody: {
      properties: {
        title: '💰 Pay Yourself First — Budget Tracker',
        locale: 'en_US',
        defaultFormat: {
          textFormat: { fontFamily: 'Inter', fontSize: 10 },
        },
      },
      sheets: [
        { properties: { sheetId: 0, title: 'Dashboard', tabColorStyle: { rgbColor: C.navy }, gridProperties: { rowCount: 50, columnCount: 12, frozenRowCount: 3 } } },
        { properties: { sheetId: 1, title: 'Transactions', tabColorStyle: { rgbColor: C.muted }, gridProperties: { rowCount: 200, columnCount: 8, frozenRowCount: 1 } } },
        { properties: { sheetId: 2, title: 'Budget Setup', tabColorStyle: { rgbColor: C.gold }, gridProperties: { rowCount: 25, columnCount: 5, frozenRowCount: 1 } } },
        { properties: { sheetId: 3, title: 'Monthly Summary', tabColorStyle: { rgbColor: C.green }, gridProperties: { rowCount: 16, columnCount: 8, frozenRowCount: 1 } } },
        { properties: { sheetId: 4, title: 'Savings Goals', tabColorStyle: { rgbColor: C.rose }, gridProperties: { rowCount: 10, columnCount: 7, frozenRowCount: 1 } } },
        { properties: { sheetId: 5, title: 'Setup & Instructions', tabColorStyle: { rgbColor: C.altRow }, gridProperties: { rowCount: 30, columnCount: 8 } } },
        { properties: { sheetId: 6, title: 'Reference', hidden: true, tabColorStyle: { rgbColor: C.darkBg }, gridProperties: { rowCount: 22, columnCount: 3 } } },
      ],
    },
  });

  const ID = ss.spreadsheetId;
  console.log(`✅ Created: https://docs.google.com/spreadsheets/d/${ID}\n`);

  // ── Step 2: Populate All Data ─────────────────────────────
  console.log('📝 Populating all tabs with data + formulas...');
  await sheets.spreadsheets.values.batchUpdate({
    spreadsheetId: ID,
    requestBody: {
      valueInputOption: 'USER_ENTERED',
      data: [
        // ─── Reference (hidden) ───
        { range: 'Reference!A1:A13', values: [['Month'],['January'],['February'],['March'],['April'],['May'],['June'],['July'],['August'],['September'],['October'],['November'],['December']] },
        { range: 'Reference!B1:B6', values: [['Bucket'],['Income'],['Savings'],['Needs'],['Wants'],['Bills']] },
        { range: 'Reference!C1:C21', values: [['Sub-Category'],['Salary'],['Freelance'],['Emergency'],['Travel'],['Retirement'],['HY Savings'],['Car/Tech'],['Rent'],['Groceries'],['Gas'],['Insurance'],['Health'],['Coffee'],['Amazon'],['Nails'],['Shopping'],['Internet'],['Streaming'],['Phone'],['Student Loans']] },

        // ─── Budget Setup ───
        { range: "'Budget Setup'!B2:C2", values: [['💰 PAY YOURSELF FIRST', '']] },
        { range: "'Budget Setup'!B3:C3", values: [['Monthly Income', 4200]] },
        { range: "'Budget Setup'!B5:D5", values: [['📊 BUCKET ALLOCATION', '', '']] },
        { range: "'Budget Setup'!B6:D6", values: [['Bucket', '% of Income', '$ Amount']] },
        { range: "'Budget Setup'!B7:D10", values: [
          ['Savings', 25, '=C7/100*$C$3'],
          ['Needs', 35, '=C8/100*$C$3'],
          ['Wants', 20, '=C9/100*$C$3'],
          ['Bills', 20, '=C10/100*$C$3'],
        ]},
        { range: "'Budget Setup'!B11:D11", values: [['TOTAL', '=SUM(C7:C10)', '=SUM(D7:D10)']] },
        { range: "'Budget Setup'!B13:D13", values: [['🎯 SAVINGS GOALS', '', '']] },
        { range: "'Budget Setup'!B14:D14", values: [['Goal', 'Target', 'Monthly Contribution']] },
        { range: "'Budget Setup'!B15:D19", values: [
          ['Emergency Fund', 5000, 400],
          ['Travel Fund', 3500, 200],
          ['Retirement Roth IRA', 6500, 250],
          ['High-Yield Savings', 2000, 150],
          ['Sinking Fund Car/Tech', 1500, 100],
        ]},

        // ─── Savings Goals ───
        { range: "'Savings Goals'!A1:G1", values: [['#', 'Goal Name', 'Target', 'Saved', 'Remaining', 'Progress', 'Status']] },
        { range: "'Savings Goals'!A2:G6", values: [
          [1, 'Emergency Fund', 5000, 1100, '=C2-D2', '=IF(C2>0,D2/C2,0)', '=IF(F2>=1,"✅ Funded",IF(F2>=0.5,"⏳ Halfway","🚀 In Progress"))'],
          [2, 'Travel Fund', 3500, 800, '=C3-D3', '=IF(C3>0,D3/C3,0)', '=IF(F3>=1,"✅ Funded",IF(F3>=0.5,"⏳ Halfway","🚀 In Progress"))'],
          [3, 'Retirement Roth IRA', 6500, 2500, '=C4-D4', '=IF(C4>0,D4/C4,0)', '=IF(F4>=1,"✅ Funded",IF(F4>=0.5,"⏳ Halfway","🚀 In Progress"))'],
          [4, 'High-Yield Savings', 2000, 900, '=C5-D5', '=IF(C5>0,D5/C5,0)', '=IF(F5>=1,"✅ Funded",IF(F5>=0.5,"⏳ Halfway","🚀 In Progress"))'],
          [5, 'Sinking Fund Car/Tech', 1500, 600, '=C6-D6', '=IF(C6>0,D6/C6,0)', '=IF(F6>=1,"✅ Funded",IF(F6>=0.5,"⏳ Halfway","🚀 In Progress"))'],
        ]},

        // ─── Transactions (20 sample entries) ───
        { range: 'Transactions!A1:H1', values: [['#', 'Date', 'Description', 'Amount', 'Sub-Category', 'Category', 'Bucket', 'Month']] },
        { range: 'Transactions!A2:H21', values: [
          [1, '2026-01-01', 'Monthly salary', 4200, 'Salary', 'Income', 'Income', 'January'],
          [2, '2026-01-02', 'Emergency Fund', 400, 'Emergency', 'Savings', 'Savings', 'January'],
          [3, '2026-01-02', 'Roth IRA contribution', 250, 'Retirement', 'Savings', 'Savings', 'January'],
          [4, '2026-01-02', 'High-yield savings', 150, 'HY Savings', 'Savings', 'Savings', 'January'],
          [5, '2026-01-02', 'Travel fund', 200, 'Travel', 'Savings', 'Savings', 'January'],
          [6, '2026-01-02', 'Sinking fund (car)', 100, 'Car/Tech', 'Savings', 'Savings', 'January'],
          [7, '2026-01-03', 'Rent payment', 1200, 'Rent', 'Needs', 'Needs', 'January'],
          [8, '2026-01-05', 'Whole Foods groceries', 62, 'Groceries', 'Needs', 'Needs', 'January'],
          [9, '2026-01-10', 'Gas fill up', 45, 'Gas', 'Needs', 'Needs', 'January'],
          [10, '2026-01-14', 'Car insurance', 145, 'Insurance', 'Needs', 'Needs', 'January'],
          [11, '2026-01-20', 'Therapy session', 40, 'Health', 'Needs', 'Needs', 'January'],
          [12, '2026-01-06', 'Starbucks', 32.50, 'Coffee', 'Wants', 'Wants', 'January'],
          [13, '2026-01-08', 'Amazon phone case', 22, 'Amazon', 'Wants', 'Wants', 'January'],
          [14, '2026-01-12', 'Nail appointment', 50, 'Nails', 'Wants', 'Wants', 'January'],
          [15, '2026-01-18', 'Target run', 55, 'Shopping', 'Wants', 'Wants', 'January'],
          [16, '2026-01-01', 'Internet', 59.99, 'Internet', 'Bills', 'Bills', 'January'],
          [17, '2026-01-01', 'Netflix + Spotify', 32.48, 'Streaming', 'Bills', 'Bills', 'January'],
          [18, '2026-01-05', 'Phone plan', 85, 'Phone', 'Bills', 'Bills', 'January'],
          [19, '2026-01-15', 'Student loans', 280, 'Loans', 'Bills', 'Bills', 'January'],
          [20, '2026-01-20', 'Gym membership', 45, 'Gym', 'Bills', 'Bills', 'January'],
        ]},

        // ─── Monthly Summary ───
        { range: "'Monthly Summary'!A1:H1", values: [['#', 'Month', 'Income', 'Savings', 'Needs', 'Wants', 'Bills', 'Net']] },
        ...['January','February','March','April','May','June','July','August','September','October','November','December'].map((m, i) => ({
          range: `'Monthly Summary'!A${i+2}:H${i+2}`,
          values: [[
            i+1, m,
            `=SUMIFS(Transactions!D:D,Transactions!F:F,"Income",Transactions!H:H,B${i+2})`,
            `=SUMIFS(Transactions!D:D,Transactions!G:G,"Savings",Transactions!H:H,B${i+2})`,
            `=SUMIFS(Transactions!D:D,Transactions!G:G,"Needs",Transactions!H:H,B${i+2})`,
            `=SUMIFS(Transactions!D:D,Transactions!G:G,"Wants",Transactions!H:H,B${i+2})`,
            `=SUMIFS(Transactions!D:D,Transactions!G:G,"Bills",Transactions!H:H,B${i+2})`,
            `=C${i+2}-D${i+2}-E${i+2}-F${i+2}-G${i+2}`,
          ]],
        })),
        { range: "'Monthly Summary'!A15:H15", values: [['', 'TOTAL', '=SUM(C2:C13)', '=SUM(D2:D13)', '=SUM(E2:E13)', '=SUM(F2:F13)', '=SUM(G2:G13)', '=SUM(H2:H13)']] },

        // ─── Dashboard ───
        { range: 'Dashboard!A1', values: [['💰 PAY YOURSELF FIRST — BUDGET DASHBOARD']] },
        { range: 'Dashboard!A2', values: [['Save First. Spend Smarter. Build Wealth.']] },
        { range: 'Dashboard!B3:I3', values: [['📅 SELECT MONTH', 'January', '', '', '', '', '💰 MONTHLY INCOME', "='Budget Setup'!C3"]] },
        // KPI Labels (row 5)
        { range: 'Dashboard!B5:J5', values: [['TOTAL INCOME', '', 'TOTAL SPENT', '', '', 'NET SAVINGS', '', 'SAVINGS RATE', '']] },
        // KPI Values (row 6)
        { range: 'Dashboard!B6:J6', values: [[
          '=IFERROR(SUMIFS(Transactions!D:D,Transactions!G:G,"Income",Transactions!H:H,$C$3),0)', '',
          '=IFERROR(SUMIFS(Transactions!D:D,Transactions!G:G,"<>Income",Transactions!H:H,$C$3),0)', '', '',
          '=B6-D6', '',
          '=IF(B6>0,(B6-D6)/B6,0)', '',
        ]] },
        // Section headers (row 8)
        { range: 'Dashboard!B8:F8', values: [['🎯 SAVINGS GOALS', '', '', '', '']] },
        { range: 'Dashboard!H8:L8', values: [['💳 WHERE YOUR MONEY WENT', '', '', '', '']] },
        // Column headers (row 9)
        { range: 'Dashboard!B9:F9', values: [['Goal', 'Target', 'Saved', 'Remaining', 'Progress']] },
        { range: 'Dashboard!H9:L9', values: [['Category', 'Budgeted', 'Spent', 'Left', 'Status']] },
        // Savings goals data (rows 10-14)
        ...Array.from({length: 5}, (_, i) => ({
          range: `Dashboard!B${10+i}:F${10+i}`,
          values: [[
            `='Savings Goals'!B${2+i}`, `='Savings Goals'!C${2+i}`, `='Savings Goals'!D${2+i}`,
            `='Savings Goals'!E${2+i}`, `='Savings Goals'!F${2+i}`,
          ]],
        })),
        { range: 'Dashboard!B15:F15', values: [['TOTAL', '=SUM(C10:C14)', '=SUM(D10:D14)', '=SUM(E10:E14)', '']] },
        // Money went data (rows 10-13)
        { range: 'Dashboard!H10:L13', values: [
          ['Savings', "='Budget Setup'!D7", '=IFERROR(SUMIFS(Transactions!D:D,Transactions!G:G,H10,Transactions!H:H,$C$3),0)', '=I10-J10', '=IF(J10=0,"—",IF(J10<=I10,"✅ On Track",IF(J10<=I10*1.15,"⚠️ "&TEXT(J10/I10,"0%"),"🔴 Over")))'],
          ['Needs', "='Budget Setup'!D8", '=IFERROR(SUMIFS(Transactions!D:D,Transactions!G:G,H11,Transactions!H:H,$C$3),0)', '=I11-J11', '=IF(J11=0,"—",IF(J11<=I11,"✅ On Track",IF(J11<=I11*1.15,"⚠️ "&TEXT(J11/I11,"0%"),"🔴 Over")))'],
          ['Wants', "='Budget Setup'!D9", '=IFERROR(SUMIFS(Transactions!D:D,Transactions!G:G,H12,Transactions!H:H,$C$3),0)', '=I12-J12', '=IF(J12=0,"—",IF(J12<=I12,"✅ On Track",IF(J12<=I12*1.15,"⚠️ "&TEXT(J12/I12,"0%"),"🔴 Over")))'],
          ['Bills', "='Budget Setup'!D10", '=IFERROR(SUMIFS(Transactions!D:D,Transactions!G:G,H13,Transactions!H:H,$C$3),0)', '=I13-J13', '=IF(J13=0,"—",IF(J13<=I13,"✅ On Track",IF(J13<=I13*1.15,"⚠️ "&TEXT(J13/I13,"0%"),"🔴 Over")))'],
        ]},
        { range: 'Dashboard!H14:L14', values: [['TOTAL SPENT', '', '=SUM(J10:J13)', '', '']] },
        // Goal Allocation section
        { range: 'Dashboard!B17:F17', values: [['📊 MY GOAL ALLOCATION', '', '', '', '']] },
        { range: 'Dashboard!B18:F18', values: [['Bucket', '% Goal', '$ Goal', '% Actual', '$ Actual']] },
        { range: 'Dashboard!B19:F22', values: [
          ['Savings', "='Budget Setup'!C7/100", "='Budget Setup'!D7", '=IF($I$3>0,J10/$I$3,0)', '=J10'],
          ['Needs', "='Budget Setup'!C8/100", "='Budget Setup'!D8", '=IF($I$3>0,J11/$I$3,0)', '=J11'],
          ['Wants', "='Budget Setup'!C9/100", "='Budget Setup'!D9", '=IF($I$3>0,J12/$I$3,0)', '=J12'],
          ['Bills', "='Budget Setup'!C10/100", "='Budget Setup'!D10", '=IF($I$3>0,J13/$I$3,0)', '=J13'],
        ]},
        { range: 'Dashboard!B23:F23', values: [['TOTAL', '=SUM(C19:C22)', '=SUM(D19:D22)', '=SUM(E19:E22)', '=SUM(F19:F22)']] },

        // ─── Setup & Instructions ───
        { range: "'Setup & Instructions'!B1", values: [['📋 PAY YOURSELF FIRST — SETUP GUIDE']] },
        { range: "'Setup & Instructions'!B3:B4", values: [['Welcome! This premium budget tracker uses the "Pay Yourself First" method.'], ['Save first, then allocate the rest to Needs, Wants, and Bills.']] },
        { range: "'Setup & Instructions'!B6:B13", values: [
          ['🚀 GETTING STARTED'],
          [''],
          ['Step 1 → Go to Budget Setup tab → enter your monthly income'],
          ['Step 2 → Adjust savings/needs/wants/bills percentages to fit your life'],
          ['Step 3 → Set your savings goals and monthly contributions'],
          ['Step 4 → Log every transaction in the Transactions tab'],
          ['Step 5 → Check the Dashboard to see your budget health at a glance'],
          [''],
        ]},
        { range: "'Setup & Instructions'!B14:B20", values: [
          ['📂 TAB GUIDE'],
          ['Dashboard — Your financial command center with KPIs, goals, and charts'],
          ['Transactions — Log every dollar in and out with dropdown categories'],
          ['Budget Setup — Set income and bucket allocation percentages'],
          ['Monthly Summary — Automatic month-by-month spending breakdown'],
          ['Savings Goals — Track progress toward each financial goal'],
          ['💡 Use the month selector dropdown on the Dashboard to view any month!'],
        ]},
      ],
    },
  });
  console.log('✅ All data populated\n');

  // ── Step 3: Apply Premium Formatting ──────────────────────
  console.log('🎨 Applying premium formatting...');

  /** helper: repeatCell shorthand */
  const rc = (sheetId, r0, r1, c0, c1, fmt) => ({
    repeatCell: {
      range: { sheetId, startRowIndex: r0, endRowIndex: r1, startColumnIndex: c0, endColumnIndex: c1 },
      cell: { userEnteredFormat: fmt },
      fields: 'userEnteredFormat(' + Object.keys(fmt).join(',') + ')',
    },
  });
  const merge = (sheetId, r0, r1, c0, c1) => ({
    mergeCells: { range: { sheetId, startRowIndex: r0, endRowIndex: r1, startColumnIndex: c0, endColumnIndex: c1 }, mergeType: 'MERGE_ALL' },
  });
  const colW = (sheetId, c0, c1, px) => ({
    updateDimensionProperties: {
      range: { sheetId, dimension: 'COLUMNS', startIndex: c0, endIndex: c1 },
      properties: { pixelSize: px },
      fields: 'pixelSize',
    },
  });
  const rowH = (sheetId, r0, r1, px) => ({
    updateDimensionProperties: {
      range: { sheetId, dimension: 'ROWS', startIndex: r0, endIndex: r1 },
      properties: { pixelSize: px },
      fields: 'pixelSize',
    },
  });
  const solidBorder = (color, style = 'SOLID') => ({ style, colorStyle: { rgbColor: color } });

  const requests = [
    // ═══ DASHBOARD (sheetId: 0) ═══

    // Column widths
    colW(0, 0, 1, 30),    // A spacer
    colW(0, 1, 6, 140),   // B-F content
    colW(0, 6, 7, 30),    // G spacer
    colW(0, 7, 12, 140),  // H-L content

    // Row 1: Title bar
    merge(0, 0, 1, 0, 12),
    rc(0, 0, 1, 0, 12, {
      backgroundColor: C.navy,
      textFormat: { foregroundColorStyle: { rgbColor: C.white }, bold: true, fontSize: 16, fontFamily: 'Inter' },
      horizontalAlignment: 'CENTER', verticalAlignment: 'MIDDLE',
      padding: { top: 12, bottom: 12 },
    }),
    rowH(0, 0, 1, 56),

    // Row 2: Subtitle
    merge(0, 1, 2, 0, 12),
    rc(0, 1, 2, 0, 12, {
      backgroundColor: C.darkBg,
      textFormat: { foregroundColorStyle: { rgbColor: C.muted }, fontSize: 11, fontFamily: 'Inter', italic: true },
      horizontalAlignment: 'CENTER', verticalAlignment: 'MIDDLE',
    }),

    // Row 3: Controls
    rc(0, 2, 3, 0, 12, {
      backgroundColor: C.headerBg,
      textFormat: { foregroundColorStyle: { rgbColor: C.white }, bold: true, fontSize: 10, fontFamily: 'Inter' },
      verticalAlignment: 'MIDDLE',
    }),
    rowH(0, 2, 3, 36),

    // Row 4: Spacer
    rc(0, 3, 4, 0, 12, { backgroundColor: C.darkBg }),
    rowH(0, 3, 4, 8),

    // KPI card merges
    merge(0, 4, 5, 1, 3),  // TOTAL INCOME label
    merge(0, 5, 6, 1, 3),  // TOTAL INCOME value
    merge(0, 4, 5, 3, 5),  // TOTAL SPENT label
    merge(0, 5, 6, 3, 5),  // TOTAL SPENT value
    merge(0, 4, 5, 5, 8),  // NET SAVINGS label
    merge(0, 5, 6, 5, 8),  // NET SAVINGS value
    merge(0, 4, 5, 8, 10), // SAVINGS RATE label
    merge(0, 5, 6, 8, 10), // SAVINGS RATE value

    // KPI labels row (row 5)
    rc(0, 4, 5, 0, 12, {
      backgroundColor: C.cardBg,
      textFormat: { foregroundColorStyle: { rgbColor: C.muted }, bold: true, fontSize: 9, fontFamily: 'Inter' },
      horizontalAlignment: 'CENTER', verticalAlignment: 'MIDDLE',
    }),
    rowH(0, 4, 5, 24),

    // KPI value: Income (green)
    rc(0, 5, 6, 1, 3, {
      backgroundColor: C.cardBg,
      textFormat: { foregroundColorStyle: { rgbColor: C.green }, bold: true, fontSize: 22, fontFamily: 'Inter' },
      horizontalAlignment: 'CENTER', verticalAlignment: 'MIDDLE',
      numberFormat: { type: 'CURRENCY', pattern: '"$"#,##0' },
    }),
    // KPI value: Spent (red)
    rc(0, 5, 6, 3, 5, {
      backgroundColor: C.cardBg,
      textFormat: { foregroundColorStyle: { rgbColor: C.red }, bold: true, fontSize: 22, fontFamily: 'Inter' },
      horizontalAlignment: 'CENTER', verticalAlignment: 'MIDDLE',
      numberFormat: { type: 'CURRENCY', pattern: '"$"#,##0' },
    }),
    // KPI value: Net Savings (gold)
    rc(0, 5, 6, 5, 8, {
      backgroundColor: C.cardBg,
      textFormat: { foregroundColorStyle: { rgbColor: C.gold }, bold: true, fontSize: 22, fontFamily: 'Inter' },
      horizontalAlignment: 'CENTER', verticalAlignment: 'MIDDLE',
      numberFormat: { type: 'CURRENCY', pattern: '"$"#,##0' },
    }),
    // KPI value: Savings Rate (blue)
    rc(0, 5, 6, 8, 10, {
      backgroundColor: C.cardBg,
      textFormat: { foregroundColorStyle: { rgbColor: C.blue }, bold: true, fontSize: 22, fontFamily: 'Inter' },
      horizontalAlignment: 'CENTER', verticalAlignment: 'MIDDLE',
      numberFormat: { type: 'PERCENT', pattern: '0%' },
    }),
    // Fill remaining KPI area cells
    rc(0, 5, 6, 0, 1, { backgroundColor: C.cardBg }),
    rc(0, 5, 6, 10, 12, { backgroundColor: C.cardBg }),
    rowH(0, 5, 6, 56),

    // Row 7: Spacer
    rc(0, 6, 7, 0, 12, { backgroundColor: C.darkBg }),
    rowH(0, 6, 7, 8),

    // Section headers (row 8)
    merge(0, 7, 8, 1, 6),
    rc(0, 7, 8, 1, 6, {
      backgroundColor: C.rose,
      textFormat: { foregroundColorStyle: { rgbColor: C.white }, bold: true, fontSize: 12, fontFamily: 'Inter' },
      horizontalAlignment: 'CENTER', verticalAlignment: 'MIDDLE',
    }),
    merge(0, 7, 8, 7, 12),
    rc(0, 7, 8, 7, 12, {
      backgroundColor: C.navy,
      textFormat: { foregroundColorStyle: { rgbColor: C.white }, bold: true, fontSize: 12, fontFamily: 'Inter' },
      horizontalAlignment: 'CENTER', verticalAlignment: 'MIDDLE',
    }),
    rc(0, 7, 8, 0, 1, { backgroundColor: C.darkBg }),
    rc(0, 7, 8, 6, 7, { backgroundColor: C.darkBg }),
    rowH(0, 7, 8, 36),

    // Column headers (row 9)
    rc(0, 8, 9, 1, 6, {
      backgroundColor: C.navy,
      textFormat: { foregroundColorStyle: { rgbColor: C.white }, bold: true, fontSize: 9, fontFamily: 'Inter' },
      horizontalAlignment: 'CENTER', verticalAlignment: 'MIDDLE',
      borders: { bottom: solidBorder(C.muted) },
    }),
    rc(0, 8, 9, 7, 12, {
      backgroundColor: C.navy,
      textFormat: { foregroundColorStyle: { rgbColor: C.white }, bold: true, fontSize: 9, fontFamily: 'Inter' },
      horizontalAlignment: 'CENTER', verticalAlignment: 'MIDDLE',
      borders: { bottom: solidBorder(C.muted) },
    }),
    rc(0, 8, 9, 0, 1, { backgroundColor: C.darkBg }),
    rc(0, 8, 9, 6, 7, { backgroundColor: C.darkBg }),

    // Data rows: Savings Goals (rows 10-14)
    rc(0, 9, 14, 1, 6, {
      backgroundColor: C.cardBg,
      textFormat: { foregroundColorStyle: { rgbColor: C.white }, fontSize: 10, fontFamily: 'Inter' },
      verticalAlignment: 'MIDDLE',
      numberFormat: { type: 'CURRENCY', pattern: '"$"#,##0' },
    }),
    // Progress column as percentage
    rc(0, 9, 14, 5, 6, {
      backgroundColor: C.cardBg,
      textFormat: { foregroundColorStyle: { rgbColor: C.green }, bold: true, fontSize: 10, fontFamily: 'Inter' },
      horizontalAlignment: 'CENTER', verticalAlignment: 'MIDDLE',
      numberFormat: { type: 'PERCENT', pattern: '0%' },
    }),

    // Data rows: Money Went (rows 10-13)
    rc(0, 9, 13, 7, 12, {
      backgroundColor: C.cardBg,
      textFormat: { foregroundColorStyle: { rgbColor: C.white }, fontSize: 10, fontFamily: 'Inter' },
      verticalAlignment: 'MIDDLE',
      numberFormat: { type: 'CURRENCY', pattern: '"$"#,##0' },
    }),

    // Spacer columns
    rc(0, 9, 15, 0, 1, { backgroundColor: C.darkBg }),
    rc(0, 9, 15, 6, 7, { backgroundColor: C.darkBg }),

    // Totals rows
    rc(0, 14, 15, 1, 6, {
      backgroundColor: C.totalsBg,
      textFormat: { foregroundColorStyle: { rgbColor: C.white }, bold: true, fontSize: 10, fontFamily: 'Inter' },
      horizontalAlignment: 'CENTER', verticalAlignment: 'MIDDLE',
      numberFormat: { type: 'CURRENCY', pattern: '"$"#,##0' },
      borders: { top: solidBorder(C.muted) },
    }),
    rc(0, 13, 14, 7, 12, {
      backgroundColor: C.totalsBg,
      textFormat: { foregroundColorStyle: { rgbColor: C.white }, bold: true, fontSize: 10, fontFamily: 'Inter' },
      verticalAlignment: 'MIDDLE',
      numberFormat: { type: 'CURRENCY', pattern: '"$"#,##0' },
      borders: { top: solidBorder(C.muted) },
    }),

    // Row 16: Spacer
    rc(0, 15, 16, 0, 12, { backgroundColor: C.darkBg }),
    rowH(0, 15, 16, 8),

    // Goal Allocation section header (row 17)
    merge(0, 16, 17, 1, 6),
    rc(0, 16, 17, 1, 6, {
      backgroundColor: C.gold,
      textFormat: { foregroundColorStyle: { rgbColor: C.white }, bold: true, fontSize: 12, fontFamily: 'Inter' },
      horizontalAlignment: 'CENTER', verticalAlignment: 'MIDDLE',
    }),
    rc(0, 16, 17, 0, 1, { backgroundColor: C.darkBg }),
    rc(0, 16, 17, 6, 12, { backgroundColor: C.darkBg }),
    rowH(0, 16, 17, 36),

    // Goal allocation headers (row 18)
    rc(0, 17, 18, 1, 6, {
      backgroundColor: C.navy,
      textFormat: { foregroundColorStyle: { rgbColor: C.white }, bold: true, fontSize: 9, fontFamily: 'Inter' },
      horizontalAlignment: 'CENTER', verticalAlignment: 'MIDDLE',
    }),
    rc(0, 17, 18, 0, 1, { backgroundColor: C.darkBg }),
    rc(0, 17, 18, 6, 12, { backgroundColor: C.darkBg }),

    // Goal allocation data (rows 19-22)
    rc(0, 18, 22, 1, 6, {
      backgroundColor: C.cardBg,
      textFormat: { foregroundColorStyle: { rgbColor: C.white }, fontSize: 10, fontFamily: 'Inter' },
      verticalAlignment: 'MIDDLE',
    }),
    // % columns as percent
    rc(0, 18, 22, 2, 3, { numberFormat: { type: 'PERCENT', pattern: '0%' } }),
    rc(0, 18, 22, 3, 4, { numberFormat: { type: 'CURRENCY', pattern: '"$"#,##0' } }),
    rc(0, 18, 22, 4, 5, { numberFormat: { type: 'PERCENT', pattern: '0%' } }),
    rc(0, 18, 22, 5, 6, { numberFormat: { type: 'CURRENCY', pattern: '"$"#,##0' } }),
    rc(0, 18, 22, 0, 1, { backgroundColor: C.darkBg }),
    rc(0, 18, 22, 6, 12, { backgroundColor: C.darkBg }),

    // Goal allocation totals (row 23)
    rc(0, 22, 23, 1, 6, {
      backgroundColor: C.totalsBg,
      textFormat: { foregroundColorStyle: { rgbColor: C.white }, bold: true, fontSize: 10, fontFamily: 'Inter' },
      horizontalAlignment: 'CENTER', verticalAlignment: 'MIDDLE',
      borders: { top: solidBorder(C.muted) },
    }),
    rc(0, 22, 23, 0, 1, { backgroundColor: C.darkBg }),
    rc(0, 22, 23, 6, 12, { backgroundColor: C.darkBg }),

    // Remaining dashboard area: dark background
    rc(0, 23, 50, 0, 12, { backgroundColor: C.darkBg }),

    // ═══ TRANSACTIONS (sheetId: 1) ═══
    rc(1, 0, 1, 0, 8, {
      backgroundColor: C.navy,
      textFormat: { foregroundColorStyle: { rgbColor: C.white }, bold: true, fontSize: 10, fontFamily: 'Inter' },
      horizontalAlignment: 'CENTER', verticalAlignment: 'MIDDLE',
    }),
    rowH(1, 0, 1, 34),
    colW(1, 0, 1, 40),
    colW(1, 1, 2, 110),
    colW(1, 2, 3, 200),
    colW(1, 3, 4, 100),
    colW(1, 4, 8, 120),
    rc(1, 1, 200, 3, 4, { numberFormat: { type: 'CURRENCY', pattern: '"$"#,##0.00' } }),
    // Banded rows
    { addBanding: { bandedRange: { range: { sheetId: 1, startRowIndex: 1, endRowIndex: 200, startColumnIndex: 0, endColumnIndex: 8 }, rowProperties: { firstBandColorStyle: { rgbColor: C.pure }, secondBandColorStyle: { rgbColor: C.lightGray } } } } },

    // ═══ BUDGET SETUP (sheetId: 2) ═══
    colW(2, 0, 1, 30),
    colW(2, 1, 5, 180),
    // Title
    merge(2, 1, 2, 1, 4),
    rc(2, 1, 2, 1, 4, {
      backgroundColor: C.navy,
      textFormat: { foregroundColorStyle: { rgbColor: C.white }, bold: true, fontSize: 14, fontFamily: 'Inter' },
      horizontalAlignment: 'CENTER', verticalAlignment: 'MIDDLE',
    }),
    rowH(2, 1, 2, 40),
    // Income cell
    rc(2, 2, 3, 2, 3, {
      backgroundColor: C.green,
      textFormat: { foregroundColorStyle: { rgbColor: C.white }, bold: true, fontSize: 16, fontFamily: 'Inter' },
      horizontalAlignment: 'CENTER', verticalAlignment: 'MIDDLE',
      numberFormat: { type: 'CURRENCY', pattern: '"$"#,##0.00' },
    }),
    // Bucket header
    merge(2, 4, 5, 1, 4),
    rc(2, 4, 5, 1, 4, {
      backgroundColor: C.gold,
      textFormat: { foregroundColorStyle: { rgbColor: C.white }, bold: true, fontSize: 11, fontFamily: 'Inter' },
      horizontalAlignment: 'CENTER',
    }),
    rc(2, 5, 6, 1, 4, {
      backgroundColor: C.navy,
      textFormat: { foregroundColorStyle: { rgbColor: C.white }, bold: true, fontSize: 9, fontFamily: 'Inter' },
      horizontalAlignment: 'CENTER',
    }),
    rc(2, 6, 10, 3, 4, { numberFormat: { type: 'CURRENCY', pattern: '"$"#,##0.00' } }),
    rc(2, 10, 11, 1, 4, {
      textFormat: { bold: true },
      borders: { top: solidBorder(C.navy, 'SOLID_MEDIUM') },
    }),
    // Goals header
    merge(2, 12, 13, 1, 4),
    rc(2, 12, 13, 1, 4, {
      backgroundColor: C.rose,
      textFormat: { foregroundColorStyle: { rgbColor: C.white }, bold: true, fontSize: 11, fontFamily: 'Inter' },
      horizontalAlignment: 'CENTER',
    }),
    rc(2, 13, 14, 1, 4, {
      backgroundColor: C.navy,
      textFormat: { foregroundColorStyle: { rgbColor: C.white }, bold: true, fontSize: 9, fontFamily: 'Inter' },
      horizontalAlignment: 'CENTER',
    }),
    rc(2, 14, 19, 2, 4, { numberFormat: { type: 'CURRENCY', pattern: '"$"#,##0' } }),

    // ═══ MONTHLY SUMMARY (sheetId: 3) ═══
    rc(3, 0, 1, 0, 8, {
      backgroundColor: C.navy,
      textFormat: { foregroundColorStyle: { rgbColor: C.white }, bold: true, fontSize: 10, fontFamily: 'Inter' },
      horizontalAlignment: 'CENTER', verticalAlignment: 'MIDDLE',
    }),
    rowH(3, 0, 1, 34),
    colW(3, 0, 1, 40),
    colW(3, 1, 8, 110),
    rc(3, 1, 15, 2, 8, { numberFormat: { type: 'CURRENCY', pattern: '"$"#,##0' } }),
    rc(3, 14, 15, 0, 8, {
      textFormat: { bold: true },
      borders: { top: solidBorder(C.navy, 'SOLID_MEDIUM') },
    }),
    { addBanding: { bandedRange: { range: { sheetId: 3, startRowIndex: 1, endRowIndex: 13, startColumnIndex: 0, endColumnIndex: 8 }, rowProperties: { firstBandColorStyle: { rgbColor: C.pure }, secondBandColorStyle: { rgbColor: C.lightGray } } } } },

    // ═══ SAVINGS GOALS (sheetId: 4) ═══
    rc(4, 0, 1, 0, 7, {
      backgroundColor: C.navy,
      textFormat: { foregroundColorStyle: { rgbColor: C.white }, bold: true, fontSize: 10, fontFamily: 'Inter' },
      horizontalAlignment: 'CENTER', verticalAlignment: 'MIDDLE',
    }),
    rowH(4, 0, 1, 34),
    colW(4, 0, 1, 40),
    colW(4, 1, 7, 140),
    rc(4, 1, 6, 2, 5, { numberFormat: { type: 'CURRENCY', pattern: '"$"#,##0' } }),
    rc(4, 1, 6, 5, 6, { numberFormat: { type: 'PERCENT', pattern: '0%' } }),
    { addBanding: { bandedRange: { range: { sheetId: 4, startRowIndex: 1, endRowIndex: 6, startColumnIndex: 0, endColumnIndex: 7 }, rowProperties: { firstBandColorStyle: { rgbColor: C.pure }, secondBandColorStyle: { rgbColor: C.lightGray } } } } },

    // ═══ SETUP & INSTRUCTIONS (sheetId: 5) ═══
    merge(5, 0, 1, 1, 7),
    rc(5, 0, 1, 1, 7, {
      backgroundColor: C.navy,
      textFormat: { foregroundColorStyle: { rgbColor: C.white }, bold: true, fontSize: 14, fontFamily: 'Inter' },
      horizontalAlignment: 'CENTER', verticalAlignment: 'MIDDLE',
    }),
    rowH(5, 0, 1, 44),
    colW(5, 0, 1, 30),
    colW(5, 1, 8, 120),
    rc(5, 2, 4, 1, 7, {
      textFormat: { foregroundColorStyle: { rgbColor: C.navy }, fontSize: 11, fontFamily: 'Inter' },
    }),
    rc(5, 5, 6, 1, 7, {
      backgroundColor: C.gold,
      textFormat: { foregroundColorStyle: { rgbColor: C.white }, bold: true, fontSize: 12, fontFamily: 'Inter' },
    }),
    rc(5, 13, 14, 1, 7, {
      backgroundColor: C.navy,
      textFormat: { foregroundColorStyle: { rgbColor: C.white }, bold: true, fontSize: 12, fontFamily: 'Inter' },
    }),

    // ═══ DATA VALIDATION ═══
    { setDataValidation: {
      range: { sheetId: 0, startRowIndex: 2, endRowIndex: 3, startColumnIndex: 2, endColumnIndex: 3 },
      rule: { condition: { type: 'ONE_OF_LIST', values: ['January','February','March','April','May','June','July','August','September','October','November','December'].map(v => ({ userEnteredValue: v })) }, strict: true, showCustomUi: true },
    }},
    { setDataValidation: {
      range: { sheetId: 1, startRowIndex: 1, endRowIndex: 200, startColumnIndex: 5, endColumnIndex: 6 },
      rule: { condition: { type: 'ONE_OF_LIST', values: ['Income','Savings','Needs','Wants','Bills'].map(v => ({ userEnteredValue: v })) }, strict: true, showCustomUi: true },
    }},
    { setDataValidation: {
      range: { sheetId: 1, startRowIndex: 1, endRowIndex: 200, startColumnIndex: 7, endColumnIndex: 8 },
      rule: { condition: { type: 'ONE_OF_LIST', values: ['January','February','March','April','May','June','July','August','September','October','November','December'].map(v => ({ userEnteredValue: v })) }, strict: true, showCustomUi: true },
    }},

    // ═══ CONDITIONAL FORMATTING ═══
    ...['Income','Savings','Needs','Wants','Bills'].map((cat, i) => ({
      addConditionalFormatRule: {
        rule: {
          ranges: [{ sheetId: 1, startRowIndex: 1, endRowIndex: 200, startColumnIndex: 5, endColumnIndex: 6 }],
          booleanRule: {
            condition: { type: 'TEXT_EQ', values: [{ userEnteredValue: cat }] },
            format: { backgroundColor: { ...([C.green, C.blue, C.warning, C.purple, C.red][i]), alpha: 0.13 } },
          },
        },
        index: i,
      },
    })),
    // Savings Goals progress gradient
    { addConditionalFormatRule: {
      rule: {
        ranges: [{ sheetId: 4, startRowIndex: 1, endRowIndex: 6, startColumnIndex: 5, endColumnIndex: 6 }],
        gradientRule: {
          minpoint: { color: C.red, type: 'MIN' },
          midpoint: { color: C.warning, type: 'PERCENTILE', value: '50' },
          maxpoint: { color: C.green, type: 'MAX' },
        },
      },
      index: 0,
    }},

    // ═══ CHARTS ═══
    // Chart 1: Donut — Savings Goal Progress
    { addChart: { chart: {
      position: { overlayPosition: { anchorCell: { sheetId: 0, rowIndex: 24, columnIndex: 1 }, widthPixels: 480, heightPixels: 380 } },
      spec: {
        title: 'Savings Goal Progress',
        titleTextFormat: { fontSize: 12, bold: true, foregroundColorStyle: { rgbColor: C.white } },
        pieChart: {
          legendPosition: 'BOTTOM_LEGEND',
          domain: { sourceRange: { sources: [{ sheetId: 4, startRowIndex: 1, endRowIndex: 6, startColumnIndex: 1, endColumnIndex: 2 }] } },
          series: { sourceRange: { sources: [{ sheetId: 4, startRowIndex: 1, endRowIndex: 6, startColumnIndex: 3, endColumnIndex: 4 }] } },
          pieHole: 0.5,
        },
        backgroundColorStyle: { rgbColor: C.darkBg },
        fontName: 'Inter',
      },
    }}},
    // Chart 2: Donut — Where Money Went
    { addChart: { chart: {
      position: { overlayPosition: { anchorCell: { sheetId: 0, rowIndex: 24, columnIndex: 6 }, widthPixels: 480, heightPixels: 380 } },
      spec: {
        title: 'Where My Money Went',
        titleTextFormat: { fontSize: 12, bold: true, foregroundColorStyle: { rgbColor: C.white } },
        pieChart: {
          legendPosition: 'BOTTOM_LEGEND',
          domain: { sourceRange: { sources: [{ sheetId: 0, startRowIndex: 9, endRowIndex: 13, startColumnIndex: 7, endColumnIndex: 8 }] } },
          series: { sourceRange: { sources: [{ sheetId: 0, startRowIndex: 9, endRowIndex: 13, startColumnIndex: 9, endColumnIndex: 10 }] } },
          pieHole: 0.5,
        },
        backgroundColorStyle: { rgbColor: C.darkBg },
        fontName: 'Inter',
      },
    }}},
    // Chart 3: Column — Goal vs Actual
    { addChart: { chart: {
      position: { overlayPosition: { anchorCell: { sheetId: 0, rowIndex: 36, columnIndex: 1 }, widthPixels: 900, heightPixels: 380 } },
      spec: {
        title: 'Goal vs Actual by Bucket',
        titleTextFormat: { fontSize: 12, bold: true, foregroundColorStyle: { rgbColor: C.white } },
        basicChart: {
          chartType: 'COLUMN',
          legendPosition: 'TOP_LEGEND',
          axis: [
            { position: 'BOTTOM_AXIS' },
            { position: 'LEFT_AXIS', format: { fontFamily: 'Inter', fontSize: 9 } },
          ],
          domains: [{ domain: { sourceRange: { sources: [{ sheetId: 0, startRowIndex: 18, endRowIndex: 22, startColumnIndex: 1, endColumnIndex: 2 }] } } }],
          series: [
            { series: { sourceRange: { sources: [{ sheetId: 0, startRowIndex: 18, endRowIndex: 22, startColumnIndex: 3, endColumnIndex: 4 }] } }, targetAxis: 'LEFT_AXIS', colorStyle: { rgbColor: C.navy } },
            { series: { sourceRange: { sources: [{ sheetId: 0, startRowIndex: 18, endRowIndex: 22, startColumnIndex: 5, endColumnIndex: 6 }] } }, targetAxis: 'LEFT_AXIS', colorStyle: { rgbColor: C.gold } },
          ],
          headerCount: 0,
        },
        backgroundColorStyle: { rgbColor: C.darkBg },
        fontName: 'Inter',
      },
    }}},
  ];

  await sheets.spreadsheets.batchUpdate({
    spreadsheetId: ID,
    requestBody: { requests },
  });
  console.log('✅ All formatting, validation, conditional formatting, and charts applied\n');

  // ── Done ──────────────────────────────────────────────────
  console.log('═══════════════════════════════════════════════════════════');
  console.log('  🎉 BUILD COMPLETE!');
  console.log('');
  console.log(`  📊 Pay Yourself First — Budget Tracker`);
  console.log(`  🔗 https://docs.google.com/spreadsheets/d/${ID}`);
  console.log('');
  console.log('  7 tabs | 4 KPIs | 3 charts | 20 sample transactions');
  console.log('  Dark premium theme | Dropdowns | Conditional formatting');
  console.log('═══════════════════════════════════════════════════════════');
}

main().catch((err) => {
  console.error('❌ Build failed:', err.message);
  if (err.response?.data) console.error(JSON.stringify(err.response.data, null, 2));
  process.exit(1);
});
