#!/bin/bash
# ══════════════════════════════════════════════════════════════
# Pay Yourself First — Budget Tracker
# GWS CLI Build Script
#
# Creates a premium Google Sheets product via Sheets API.
# Prerequisites: gws auth login -s drive,sheets
# ══════════════════════════════════════════════════════════════

set -euo pipefail

echo "═══════════════════════════════════════════════════"
echo "  Pay Yourself First — Budget Tracker Builder"
echo "  Using GWS CLI v$(gws --version 2>&1 | head -1 | awk '{print $2}')"
echo "═══════════════════════════════════════════════════"
echo ""

# ── Step 1: Create the spreadsheet ──────────────────────────
echo "📄 Creating spreadsheet..."
CREATE_RESULT=$(gws sheets spreadsheets create --json '{
  "properties": {
    "title": "Pay Yourself First — Budget Tracker ✨",
    "locale": "en_US",
    "defaultFormat": {
      "textFormat": {
        "fontFamily": "Arial",
        "fontSize": 10
      }
    }
  },
  "sheets": [
    {
      "properties": {
        "sheetId": 0,
        "title": "Dashboard",
        "tabColorStyle": {"rgbColor": {"red": 0.106, "green": 0.227, "blue": 0.361}},
        "gridProperties": {"rowCount": 50, "columnCount": 12, "frozenRowCount": 3}
      }
    },
    {
      "properties": {
        "sheetId": 1,
        "title": "Transactions",
        "tabColorStyle": {"rgbColor": {"red": 0.580, "green": 0.639, "blue": 0.722}},
        "gridProperties": {"rowCount": 200, "columnCount": 8, "frozenRowCount": 1}
      }
    },
    {
      "properties": {
        "sheetId": 2,
        "title": "Budget Setup",
        "tabColorStyle": {"rgbColor": {"red": 0.831, "green": 0.686, "blue": 0.216}},
        "gridProperties": {"rowCount": 25, "columnCount": 5, "frozenRowCount": 1}
      }
    },
    {
      "properties": {
        "sheetId": 3,
        "title": "Monthly Summary",
        "tabColorStyle": {"rgbColor": {"red": 0.133, "green": 0.773, "blue": 0.369}},
        "gridProperties": {"rowCount": 16, "columnCount": 8, "frozenRowCount": 1}
      }
    },
    {
      "properties": {
        "sheetId": 4,
        "title": "Savings Goals",
        "tabColorStyle": {"rgbColor": {"red": 0.800, "green": 0.400, "blue": 0.400}},
        "gridProperties": {"rowCount": 10, "columnCount": 7, "frozenRowCount": 1}
      }
    },
    {
      "properties": {
        "sheetId": 5,
        "title": "Setup & Instructions",
        "tabColorStyle": {"rgbColor": {"red": 0.278, "green": 0.337, "blue": 0.412}},
        "gridProperties": {"rowCount": 30, "columnCount": 6}
      }
    },
    {
      "properties": {
        "sheetId": 6,
        "title": "Reference",
        "hidden": true,
        "tabColorStyle": {"rgbColor": {"red": 0.2, "green": 0.2, "blue": 0.2}},
        "gridProperties": {"rowCount": 22, "columnCount": 3}
      }
    }
  ]
}' 2>&1)

# Extract spreadsheet ID
SHEET_ID=$(echo "$CREATE_RESULT" | python3 -c "import sys,json; print(json.load(sys.stdin)['spreadsheetId'])")
echo "✅ Spreadsheet created: $SHEET_ID"
echo "🔗 https://docs.google.com/spreadsheets/d/$SHEET_ID"
echo ""

# ── Step 2: Populate Reference tab (hidden) ──────────────────
echo "📝 Populating Reference tab..."
gws sheets spreadsheets values batchUpdate \
  --params "{\"spreadsheetId\": \"$SHEET_ID\", \"valueInputOption\": \"RAW\"}" \
  --json '{
    "data": [
      {
        "range": "Reference!A1:A13",
        "values": [["Month"],["January"],["February"],["March"],["April"],["May"],["June"],["July"],["August"],["September"],["October"],["November"],["December"]]
      },
      {
        "range": "Reference!B1:B6",
        "values": [["Bucket"],["Income"],["Savings"],["Needs"],["Wants"],["Bills"]]
      },
      {
        "range": "Reference!C1:C21",
        "values": [["Sub-Category"],["Salary"],["Freelance"],["Emergency"],["Travel"],["Retirement"],["HY Savings"],["Car/Tech"],["Rent"],["Groceries"],["Gas"],["Insurance"],["Health"],["Coffee"],["Amazon"],["Nails"],["Shopping"],["Internet"],["Streaming"],["Phone"],["Student Loans"],["Gym"]]
      }
    ]
  }' > /dev/null 2>&1
echo "✅ Reference tab populated"

# ── Step 3: Populate Budget Setup tab ────────────────────────
echo "📝 Populating Budget Setup..."
gws sheets spreadsheets values batchUpdate \
  --params "{\"spreadsheetId\": \"$SHEET_ID\", \"valueInputOption\": \"USER_ENTERED\"}" \
  --json '{
    "data": [
      {
        "range": "'Budget Setup'!A1:E1",
        "values": [["","","","",""]]
      },
      {
        "range": "'Budget Setup'!B3:C3",
        "values": [["💰 MONTHLY INCOME", 4200]]
      },
      {
        "range": "'Budget Setup'!B5:D5",
        "values": [["📊 BUCKET ALLOCATION","",""]]
      },
      {
        "range": "'Budget Setup'!B6:D6",
        "values": [["Bucket", "% of Income", "$ Amount"]]
      },
      {
        "range": "'Budget Setup'!B7:D10",
        "values": [
          ["Savings", 25, "=C7/100*$C$3"],
          ["Needs", 35, "=C8/100*$C$3"],
          ["Wants", 20, "=C9/100*$C$3"],
          ["Bills", 20, "=C10/100*$C$3"]
        ]
      },
      {
        "range": "'Budget Setup'!B11:D11",
        "values": [["TOTAL", "=SUM(C7:C10)", "=SUM(D7:D10)"]]
      },
      {
        "range": "'Budget Setup'!B13:D13",
        "values": [["🎯 SAVINGS GOALS","",""]]
      },
      {
        "range": "'Budget Setup'!B14:D14",
        "values": [["Goal", "Target", "Monthly Contribution"]]
      },
      {
        "range": "'Budget Setup'!B15:D19",
        "values": [
          ["Emergency Fund", 5000, 400],
          ["Travel Fund", 3500, 200],
          ["Retirement Roth IRA", 6500, 250],
          ["High-Yield Savings", 2000, 150],
          ["Sinking Fund Car/Tech", 1500, 100]
        ]
      }
    ]
  }' > /dev/null 2>&1
echo "✅ Budget Setup populated"

# ── Step 4: Populate Savings Goals tab ───────────────────────
echo "📝 Populating Savings Goals..."
gws sheets spreadsheets values batchUpdate \
  --params "{\"spreadsheetId\": \"$SHEET_ID\", \"valueInputOption\": \"USER_ENTERED\"}" \
  --json '{
    "data": [
      {
        "range": "'Savings Goals'!A1:G1",
        "values": [["#", "Goal Name", "Target", "Saved", "Remaining", "Progress", "Status"]]
      },
      {
        "range": "'Savings Goals'!A2:G6",
        "values": [
          [1, "Emergency Fund", 5000, 1100, "=C2-D2", "=IF(C2>0,D2/C2,0)", "=IF(F2>=1,\"✅ Funded\",IF(F2>=0.5,\"⏳ Halfway\",\"🚀 In Progress\"))"],
          [2, "Travel Fund", 3500, 800, "=C3-D3", "=IF(C3>0,D3/C3,0)", "=IF(F3>=1,\"✅ Funded\",IF(F3>=0.5,\"⏳ Halfway\",\"🚀 In Progress\"))"],
          [3, "Retirement Roth IRA", 6500, 2500, "=C4-D4", "=IF(C4>0,D4/C4,0)", "=IF(F4>=1,\"✅ Funded\",IF(F4>=0.5,\"⏳ Halfway\",\"🚀 In Progress\"))"],
          [4, "High-Yield Savings", 2000, 900, "=C5-D5", "=IF(C5>0,D5/C5,0)", "=IF(F5>=1,\"✅ Funded\",IF(F5>=0.5,\"⏳ Halfway\",\"🚀 In Progress\"))"],
          [5, "Sinking Fund Car/Tech", 1500, 600, "=C6-D6", "=IF(C6>0,D6/C6,0)", "=IF(F6>=1,\"✅ Funded\",IF(F6>=0.5,\"⏳ Halfway\",\"🚀 In Progress\"))"]
        ]
      }
    ]
  }' > /dev/null 2>&1
echo "✅ Savings Goals populated"

# ── Step 5: Populate Transactions tab ────────────────────────
echo "📝 Populating Transactions (20 sample entries)..."
gws sheets spreadsheets values batchUpdate \
  --params "{\"spreadsheetId\": \"$SHEET_ID\", \"valueInputOption\": \"USER_ENTERED\"}" \
  --json '{
    "data": [
      {
        "range": "Transactions!A1:H1",
        "values": [["#", "Date", "Description", "Amount", "Sub-Category", "Category", "Bucket", "Month"]]
      },
      {
        "range": "Transactions!A2:H21",
        "values": [
          [1, "2026-01-01", "Monthly salary", 4200, "Salary", "Income", "Income", "January"],
          [2, "2026-01-02", "Emergency Fund", 400, "Emergency", "Savings", "Savings", "January"],
          [3, "2026-01-02", "Roth IRA contribution", 250, "Retirement", "Savings", "Savings", "January"],
          [4, "2026-01-02", "High-yield savings", 150, "HY Savings", "Savings", "Savings", "January"],
          [5, "2026-01-02", "Travel fund", 200, "Travel", "Savings", "Savings", "January"],
          [6, "2026-01-02", "Sinking fund (car)", 100, "Car/Tech", "Savings", "Savings", "January"],
          [7, "2026-01-03", "Rent payment", 1200, "Rent", "Needs", "Needs", "January"],
          [8, "2026-01-05", "Whole Foods groceries", 62, "Groceries", "Needs", "Needs", "January"],
          [9, "2026-01-10", "Gas fill up", 45, "Gas", "Needs", "Needs", "January"],
          [10, "2026-01-14", "Car insurance", 145, "Insurance", "Needs", "Needs", "January"],
          [11, "2026-01-20", "Therapy session", 40, "Health", "Needs", "Needs", "January"],
          [12, "2026-01-06", "Starbucks", 32.50, "Coffee", "Wants", "Wants", "January"],
          [13, "2026-01-08", "Amazon phone case", 22, "Amazon", "Wants", "Wants", "January"],
          [14, "2026-01-12", "Nail appointment", 50, "Nails", "Wants", "Wants", "January"],
          [15, "2026-01-18", "Target run", 55, "Shopping", "Wants", "Wants", "January"],
          [16, "2026-01-01", "Internet", 59.99, "Internet", "Bills", "Bills", "January"],
          [17, "2026-01-01", "Netflix + Spotify", 32.48, "Streaming", "Bills", "Bills", "January"],
          [18, "2026-01-05", "Phone plan", 85, "Phone", "Bills", "Bills", "January"],
          [19, "2026-01-15", "Student loans", 280, "Loans", "Bills", "Bills", "January"],
          [20, "2026-01-20", "Gym membership", 45, "Gym", "Bills", "Bills", "January"]
        ]
      }
    ]
  }' > /dev/null 2>&1
echo "✅ Transactions populated"

# ── Step 6: Populate Monthly Summary tab ─────────────────────
echo "📝 Populating Monthly Summary..."
gws sheets spreadsheets values batchUpdate \
  --params "{\"spreadsheetId\": \"$SHEET_ID\", \"valueInputOption\": \"USER_ENTERED\"}" \
  --json '{
    "data": [
      {
        "range": "'Monthly Summary'!A1:H1",
        "values": [["#", "Month", "Income", "Savings", "Needs", "Wants", "Bills", "Net"]]
      },
      {
        "range": "'Monthly Summary'!A2:H13",
        "values": [
          [1, "January", "=SUMIFS(Transactions!D:D,Transactions!F:F,\"Income\",Transactions!H:H,B2)", "=SUMIFS(Transactions!D:D,Transactions!G:G,\"Savings\",Transactions!H:H,B2)", "=SUMIFS(Transactions!D:D,Transactions!G:G,\"Needs\",Transactions!H:H,B2)", "=SUMIFS(Transactions!D:D,Transactions!G:G,\"Wants\",Transactions!H:H,B2)", "=SUMIFS(Transactions!D:D,Transactions!G:G,\"Bills\",Transactions!H:H,B2)", "=C2-D2-E2-F2-G2"],
          [2, "February", "=SUMIFS(Transactions!D:D,Transactions!F:F,\"Income\",Transactions!H:H,B3)", "=SUMIFS(Transactions!D:D,Transactions!G:G,\"Savings\",Transactions!H:H,B3)", "=SUMIFS(Transactions!D:D,Transactions!G:G,\"Needs\",Transactions!H:H,B3)", "=SUMIFS(Transactions!D:D,Transactions!G:G,\"Wants\",Transactions!H:H,B3)", "=SUMIFS(Transactions!D:D,Transactions!G:G,\"Bills\",Transactions!H:H,B3)", "=C3-D3-E3-F3-G3"],
          [3, "March", "=SUMIFS(Transactions!D:D,Transactions!F:F,\"Income\",Transactions!H:H,B4)", "=SUMIFS(Transactions!D:D,Transactions!G:G,\"Savings\",Transactions!H:H,B4)", "=SUMIFS(Transactions!D:D,Transactions!G:G,\"Needs\",Transactions!H:H,B4)", "=SUMIFS(Transactions!D:D,Transactions!G:G,\"Wants\",Transactions!H:H,B4)", "=SUMIFS(Transactions!D:D,Transactions!G:G,\"Bills\",Transactions!H:H,B4)", "=C4-D4-E4-F4-G4"],
          [4, "April", "=SUMIFS(Transactions!D:D,Transactions!F:F,\"Income\",Transactions!H:H,B5)", "=SUMIFS(Transactions!D:D,Transactions!G:G,\"Savings\",Transactions!H:H,B5)", "=SUMIFS(Transactions!D:D,Transactions!G:G,\"Needs\",Transactions!H:H,B5)", "=SUMIFS(Transactions!D:D,Transactions!G:G,\"Wants\",Transactions!H:H,B5)", "=SUMIFS(Transactions!D:D,Transactions!G:G,\"Bills\",Transactions!H:H,B5)", "=C5-D5-E5-F5-G5"],
          [5, "May", "=SUMIFS(Transactions!D:D,Transactions!F:F,\"Income\",Transactions!H:H,B6)", "=SUMIFS(Transactions!D:D,Transactions!G:G,\"Savings\",Transactions!H:H,B6)", "=SUMIFS(Transactions!D:D,Transactions!G:G,\"Needs\",Transactions!H:H,B6)", "=SUMIFS(Transactions!D:D,Transactions!G:G,\"Wants\",Transactions!H:H,B6)", "=SUMIFS(Transactions!D:D,Transactions!G:G,\"Bills\",Transactions!H:H,B6)", "=C6-D6-E6-F6-G6"],
          [6, "June", "=SUMIFS(Transactions!D:D,Transactions!F:F,\"Income\",Transactions!H:H,B7)", "=SUMIFS(Transactions!D:D,Transactions!G:G,\"Savings\",Transactions!H:H,B7)", "=SUMIFS(Transactions!D:D,Transactions!G:G,\"Needs\",Transactions!H:H,B7)", "=SUMIFS(Transactions!D:D,Transactions!G:G,\"Wants\",Transactions!H:H,B7)", "=SUMIFS(Transactions!D:D,Transactions!G:G,\"Bills\",Transactions!H:H,B7)", "=C7-D7-E7-F7-G7"],
          [7, "July", "=SUMIFS(Transactions!D:D,Transactions!F:F,\"Income\",Transactions!H:H,B8)", "=SUMIFS(Transactions!D:D,Transactions!G:G,\"Savings\",Transactions!H:H,B8)", "=SUMIFS(Transactions!D:D,Transactions!G:G,\"Needs\",Transactions!H:H,B8)", "=SUMIFS(Transactions!D:D,Transactions!G:G,\"Wants\",Transactions!H:H,B8)", "=SUMIFS(Transactions!D:D,Transactions!G:G,\"Bills\",Transactions!H:H,B8)", "=C8-D8-E8-F8-G8"],
          [8, "August", "=SUMIFS(Transactions!D:D,Transactions!F:F,\"Income\",Transactions!H:H,B9)", "=SUMIFS(Transactions!D:D,Transactions!G:G,\"Savings\",Transactions!H:H,B9)", "=SUMIFS(Transactions!D:D,Transactions!G:G,\"Needs\",Transactions!H:H,B9)", "=SUMIFS(Transactions!D:D,Transactions!G:G,\"Wants\",Transactions!H:H,B9)", "=SUMIFS(Transactions!D:D,Transactions!G:G,\"Bills\",Transactions!H:H,B9)", "=C9-D9-E9-F9-G9"],
          [9, "September", "=SUMIFS(Transactions!D:D,Transactions!F:F,\"Income\",Transactions!H:H,B10)", "=SUMIFS(Transactions!D:D,Transactions!G:G,\"Savings\",Transactions!H:H,B10)", "=SUMIFS(Transactions!D:D,Transactions!G:G,\"Needs\",Transactions!H:H,B10)", "=SUMIFS(Transactions!D:D,Transactions!G:G,\"Wants\",Transactions!H:H,B10)", "=SUMIFS(Transactions!D:D,Transactions!G:G,\"Bills\",Transactions!H:H,B10)", "=C10-D10-E10-F10-G10"],
          [10, "October", "=SUMIFS(Transactions!D:D,Transactions!F:F,\"Income\",Transactions!H:H,B11)", "=SUMIFS(Transactions!D:D,Transactions!G:G,\"Savings\",Transactions!H:H,B11)", "=SUMIFS(Transactions!D:D,Transactions!G:G,\"Needs\",Transactions!H:H,B11)", "=SUMIFS(Transactions!D:D,Transactions!G:G,\"Wants\",Transactions!H:H,B11)", "=SUMIFS(Transactions!D:D,Transactions!G:G,\"Bills\",Transactions!H:H,B11)", "=C11-D11-E11-F11-G11"],
          [11, "November", "=SUMIFS(Transactions!D:D,Transactions!F:F,\"Income\",Transactions!H:H,B12)", "=SUMIFS(Transactions!D:D,Transactions!G:G,\"Savings\",Transactions!H:H,B12)", "=SUMIFS(Transactions!D:D,Transactions!G:G,\"Needs\",Transactions!H:H,B12)", "=SUMIFS(Transactions!D:D,Transactions!G:G,\"Wants\",Transactions!H:H,B12)", "=SUMIFS(Transactions!D:D,Transactions!G:G,\"Bills\",Transactions!H:H,B12)", "=C12-D12-E12-F12-G12"],
          [12, "December", "=SUMIFS(Transactions!D:D,Transactions!F:F,\"Income\",Transactions!H:H,B13)", "=SUMIFS(Transactions!D:D,Transactions!G:G,\"Savings\",Transactions!H:H,B13)", "=SUMIFS(Transactions!D:D,Transactions!G:G,\"Needs\",Transactions!H:H,B13)", "=SUMIFS(Transactions!D:D,Transactions!G:G,\"Wants\",Transactions!H:H,B13)", "=SUMIFS(Transactions!D:D,Transactions!G:G,\"Bills\",Transactions!H:H,B13)", "=C13-D13-E13-F13-G13"]
        ]
      },
      {
        "range": "'Monthly Summary'!A15:H15",
        "values": [["", "TOTAL", "=SUM(C2:C13)", "=SUM(D2:D13)", "=SUM(E2:E13)", "=SUM(F2:F13)", "=SUM(G2:G13)", "=SUM(H2:H13)"]]
      }
    ]
  }' > /dev/null 2>&1
echo "✅ Monthly Summary populated"

# ── Step 7: Populate Dashboard tab ───────────────────────────
echo "📝 Populating Dashboard..."
gws sheets spreadsheets values batchUpdate \
  --params "{\"spreadsheetId\": \"$SHEET_ID\", \"valueInputOption\": \"USER_ENTERED\"}" \
  --json '{
    "data": [
      {
        "range": "Dashboard!A1:K1",
        "values": [["💰 PAY YOURSELF FIRST — BUDGET DASHBOARD","","","","","","","","","",""]]
      },
      {
        "range": "Dashboard!A2:K2",
        "values": [["Monthly Budget Tracker","","","","","","","","","",""]]
      },
      {
        "range": "Dashboard!B3:I3",
        "values": [["📅 SELECT MONTH", "January", "", "", "", "", "💰 MONTHLY INCOME", "='"'"'Budget Setup'"'"'!C3"]]
      },
      {
        "range": "Dashboard!B5:J5",
        "values": [["TOTAL INCOME", "", "TOTAL SPENT", "", "", "NET SAVINGS", "", "SAVINGS RATE", "", ""]]
      },
      {
        "range": "Dashboard!B6:J6",
        "values": [["=IFERROR(SUMIFS(Transactions!D:D,Transactions!G:G,\"Income\",Transactions!H:H,$C$3),0)", "", "=IFERROR(SUMIFS(Transactions!D:D,Transactions!G:G,\"<>Income\",Transactions!H:H,$C$3),0)", "", "", "=B6-D6", "", "=IF(B6>0,(B6-D6)/B6,0)", "", ""]]
      },
      {
        "range": "Dashboard!B8:F8",
        "values": [["🎯 SAVINGS GOALS","","","",""]]
      },
      {
        "range": "Dashboard!H8:L8",
        "values": [["💳 WHERE YOUR MONEY WENT","","","",""]]
      },
      {
        "range": "Dashboard!B9:F9",
        "values": [["Goal", "Target", "Saved", "Remaining", "Progress"]]
      },
      {
        "range": "Dashboard!H9:L9",
        "values": [["Category", "Budgeted", "Spent", "Left", "Status"]]
      },
      {
        "range": "Dashboard!B10:F14",
        "values": [
          ["='"'"'Savings Goals'"'"'!B2", "='"'"'Savings Goals'"'"'!C2", "='"'"'Savings Goals'"'"'!D2", "='"'"'Savings Goals'"'"'!E2", "='"'"'Savings Goals'"'"'!F2"],
          ["='"'"'Savings Goals'"'"'!B3", "='"'"'Savings Goals'"'"'!C3", "='"'"'Savings Goals'"'"'!D3", "='"'"'Savings Goals'"'"'!E3", "='"'"'Savings Goals'"'"'!F3"],
          ["='"'"'Savings Goals'"'"'!B4", "='"'"'Savings Goals'"'"'!C4", "='"'"'Savings Goals'"'"'!D4", "='"'"'Savings Goals'"'"'!E4", "='"'"'Savings Goals'"'"'!F4"],
          ["='"'"'Savings Goals'"'"'!B5", "='"'"'Savings Goals'"'"'!C5", "='"'"'Savings Goals'"'"'!D5", "='"'"'Savings Goals'"'"'!E5", "='"'"'Savings Goals'"'"'!F5"],
          ["='"'"'Savings Goals'"'"'!B6", "='"'"'Savings Goals'"'"'!C6", "='"'"'Savings Goals'"'"'!D6", "='"'"'Savings Goals'"'"'!E6", "='"'"'Savings Goals'"'"'!F6"]
        ]
      },
      {
        "range": "Dashboard!B15:F15",
        "values": [["TOTAL", "=SUM(C10:C14)", "=SUM(D10:D14)", "=SUM(E10:E14)", ""]]
      },
      {
        "range": "Dashboard!H10:L13",
        "values": [
          ["Savings", "='"'"'Budget Setup'"'"'!D7", "=IFERROR(SUMIFS(Transactions!D:D,Transactions!G:G,H10,Transactions!H:H,$C$3),0)", "=I10-J10", "=IF(J10=0,\"—\",IF(J10<=I10,\"✅ On Track\",IF(J10<=I10*1.15,\"⚠️ \"&TEXT(J10/I10,\"0%\"),\"🔴 Over\")))"],
          ["Needs", "='"'"'Budget Setup'"'"'!D8", "=IFERROR(SUMIFS(Transactions!D:D,Transactions!G:G,H11,Transactions!H:H,$C$3),0)", "=I11-J11", "=IF(J11=0,\"—\",IF(J11<=I11,\"✅ On Track\",IF(J11<=I11*1.15,\"⚠️ \"&TEXT(J11/I11,\"0%\"),\"🔴 Over\")))"],
          ["Wants", "='"'"'Budget Setup'"'"'!D9", "=IFERROR(SUMIFS(Transactions!D:D,Transactions!G:G,H12,Transactions!H:H,$C$3),0)", "=I12-J12", "=IF(J12=0,\"—\",IF(J12<=I12,\"✅ On Track\",IF(J12<=I12*1.15,\"⚠️ \"&TEXT(J12/I12,\"0%\"),\"🔴 Over\")))"],
          ["Bills", "='"'"'Budget Setup'"'"'!D10", "=IFERROR(SUMIFS(Transactions!D:D,Transactions!G:G,H13,Transactions!H:H,$C$3),0)", "=I13-J13", "=IF(J13=0,\"—\",IF(J13<=I13,\"✅ On Track\",IF(J13<=I13*1.15,\"⚠️ \"&TEXT(J13/I13,\"0%\"),\"🔴 Over\")))"]
        ]
      },
      {
        "range": "Dashboard!H14:L14",
        "values": [["TOTAL SPENT", "", "=SUM(J10:J13)", "", ""]]
      },
      {
        "range": "Dashboard!B17:F17",
        "values": [["📊 MY GOAL ALLOCATION","","","",""]]
      },
      {
        "range": "Dashboard!B18:F18",
        "values": [["Bucket", "% Goal", "$ Goal", "% Actual", "$ Actual"]]
      },
      {
        "range": "Dashboard!B19:F22",
        "values": [
          ["Savings", "='"'"'Budget Setup'"'"'!C7/100", "='"'"'Budget Setup'"'"'!D7", "=IF($I$3>0,J10/$I$3,0)", "=J10"],
          ["Needs", "='"'"'Budget Setup'"'"'!C8/100", "='"'"'Budget Setup'"'"'!D8", "=IF($I$3>0,J11/$I$3,0)", "=J11"],
          ["Wants", "='"'"'Budget Setup'"'"'!C9/100", "='"'"'Budget Setup'"'"'!D9", "=IF($I$3>0,J12/$I$3,0)", "=J12"],
          ["Bills", "='"'"'Budget Setup'"'"'!C10/100", "='"'"'Budget Setup'"'"'!D10", "=IF($I$3>0,J13/$I$3,0)", "=J13"]
        ]
      },
      {
        "range": "Dashboard!B23:F23",
        "values": [["TOTAL", "=SUM(C19:C22)", "=SUM(D19:D22)", "=SUM(E19:E22)", "=SUM(F19:F22)"]]
      }
    ]
  }' > /dev/null 2>&1
echo "✅ Dashboard populated"

# ── Step 8: Populate Setup & Instructions tab ────────────────
echo "📝 Populating Setup & Instructions..."
gws sheets spreadsheets values batchUpdate \
  --params "{\"spreadsheetId\": \"$SHEET_ID\", \"valueInputOption\": \"RAW\"}" \
  --json '{
    "data": [
      {
        "range": "'Setup & Instructions'!A1:F1",
        "values": [["📋 SETUP & INSTRUCTIONS","","","","",""]]
      },
      {
        "range": "'Setup & Instructions'!A3:B3",
        "values": [["","Welcome to Pay Yourself First!"]]
      },
      {
        "range": "'Setup & Instructions'!A5:B15",
        "values": [
          ["", "🚀 GETTING STARTED"],
          ["", ""],
          ["", "Step 1 → Go to the Budget Setup tab and enter your monthly income."],
          ["", "Step 2 → Adjust the savings/needs/wants/bills percentages to fit your life."],
          ["", "Step 3 → Set your savings goals and monthly contributions."],
          ["", "Step 4 → Log every transaction in the Transactions tab (income AND expenses)."],
          ["", "Step 5 → Check the Dashboard to see your budget health at a glance."],
          ["", ""],
          ["", "📂 TAB GUIDE"],
          ["", ""],
          ["", "Dashboard — Your financial command center. KPIs, goals, and allocation tracking."]
        ]
      },
      {
        "range": "'Setup & Instructions'!B16:B21",
        "values": [
          ["Transactions — Log every dollar in and out. Uses dropdowns for easy entry."],
          ["Budget Setup — Set your income and bucket allocation percentages."],
          ["Monthly Summary — Automatic month-by-month breakdown of all spending."],
          ["Savings Goals — Track progress toward each of your financial goals."],
          [""],
          ["💡 TIP: Use the month selector on the Dashboard to view any month!"]
        ]
      }
    ]
  }' > /dev/null 2>&1
echo "✅ Setup & Instructions populated"

echo ""
echo "═══════════════════════════════════════════════════"
echo "  ✅ DATA POPULATION COMPLETE"
echo "  Spreadsheet ID: $SHEET_ID"
echo "  Next: Running formatting pass..."
echo "═══════════════════════════════════════════════════"
echo ""

# ══════════════════════════════════════════════════════════════
# FORMATTING PASS — Premium Visual Layer
# ══════════════════════════════════════════════════════════════

echo "🎨 Applying premium formatting — Dashboard..."
gws sheets spreadsheets batchUpdate \
  --params "{\"spreadsheetId\": \"$SHEET_ID\"}" \
  --json '{
    "requests": [
      {
        "updateDimensionProperties": {
          "range": {"sheetId": 0, "dimension": "COLUMNS", "startIndex": 0, "endIndex": 1},
          "properties": {"pixelSize": 30},
          "fields": "pixelSize"
        }
      },
      {
        "updateDimensionProperties": {
          "range": {"sheetId": 0, "dimension": "COLUMNS", "startIndex": 1, "endIndex": 6},
          "properties": {"pixelSize": 140},
          "fields": "pixelSize"
        }
      },
      {
        "updateDimensionProperties": {
          "range": {"sheetId": 0, "dimension": "COLUMNS", "startIndex": 6, "endIndex": 7},
          "properties": {"pixelSize": 30},
          "fields": "pixelSize"
        }
      },
      {
        "updateDimensionProperties": {
          "range": {"sheetId": 0, "dimension": "COLUMNS", "startIndex": 7, "endIndex": 12},
          "properties": {"pixelSize": 140},
          "fields": "pixelSize"
        }
      },

      {"mergeCells": {"range": {"sheetId": 0, "startRowIndex": 0, "endRowIndex": 1, "startColumnIndex": 0, "endColumnIndex": 12}, "mergeType": "MERGE_ALL"}},
      {"repeatCell": {
        "range": {"sheetId": 0, "startRowIndex": 0, "endRowIndex": 1, "startColumnIndex": 0, "endColumnIndex": 12},
        "cell": {"userEnteredFormat": {
          "backgroundColor": {"red": 0.106, "green": 0.227, "blue": 0.361},
          "textFormat": {"foregroundColor": {"red": 0.973, "green": 0.980, "blue": 0.988}, "bold": true, "fontSize": 16, "fontFamily": "Arial"},
          "horizontalAlignment": "CENTER",
          "verticalAlignment": "MIDDLE",
          "padding": {"top": 12, "bottom": 12}
        }},
        "fields": "userEnteredFormat(backgroundColor,textFormat,horizontalAlignment,verticalAlignment,padding)"
      }},
      {"updateDimensionProperties": {
        "range": {"sheetId": 0, "dimension": "ROWS", "startIndex": 0, "endIndex": 1},
        "properties": {"pixelSize": 56},
        "fields": "pixelSize"
      }},

      {"mergeCells": {"range": {"sheetId": 0, "startRowIndex": 1, "endRowIndex": 2, "startColumnIndex": 0, "endColumnIndex": 12}, "mergeType": "MERGE_ALL"}},
      {"repeatCell": {
        "range": {"sheetId": 0, "startRowIndex": 1, "endRowIndex": 2, "startColumnIndex": 0, "endColumnIndex": 12},
        "cell": {"userEnteredFormat": {
          "backgroundColor": {"red": 0.059, "green": 0.090, "blue": 0.165},
          "textFormat": {"foregroundColor": {"red": 0.580, "green": 0.639, "blue": 0.722}, "fontSize": 11, "fontFamily": "Arial"},
          "horizontalAlignment": "CENTER",
          "verticalAlignment": "MIDDLE"
        }},
        "fields": "userEnteredFormat(backgroundColor,textFormat,horizontalAlignment,verticalAlignment)"
      }},

      {"repeatCell": {
        "range": {"sheetId": 0, "startRowIndex": 2, "endRowIndex": 3, "startColumnIndex": 0, "endColumnIndex": 12},
        "cell": {"userEnteredFormat": {
          "backgroundColor": {"red": 0.086, "green": 0.125, "blue": 0.200},
          "textFormat": {"foregroundColor": {"red": 0.973, "green": 0.980, "blue": 0.988}, "bold": true, "fontSize": 10, "fontFamily": "Arial"},
          "verticalAlignment": "MIDDLE"
        }},
        "fields": "userEnteredFormat(backgroundColor,textFormat,verticalAlignment)"
      }},
      {"updateDimensionProperties": {
        "range": {"sheetId": 0, "dimension": "ROWS", "startIndex": 2, "endIndex": 3},
        "properties": {"pixelSize": 36},
        "fields": "pixelSize"
      }},

      {"repeatCell": {
        "range": {"sheetId": 0, "startRowIndex": 3, "endRowIndex": 4, "startColumnIndex": 0, "endColumnIndex": 12},
        "cell": {"userEnteredFormat": {
          "backgroundColor": {"red": 0.059, "green": 0.090, "blue": 0.165}
        }},
        "fields": "userEnteredFormat(backgroundColor)"
      }},
      {"updateDimensionProperties": {
        "range": {"sheetId": 0, "dimension": "ROWS", "startIndex": 3, "endIndex": 4},
        "properties": {"pixelSize": 10},
        "fields": "pixelSize"
      }},

      {"mergeCells": {"range": {"sheetId": 0, "startRowIndex": 4, "endRowIndex": 5, "startColumnIndex": 1, "endColumnIndex": 3}, "mergeType": "MERGE_ALL"}},
      {"mergeCells": {"range": {"sheetId": 0, "startRowIndex": 5, "endRowIndex": 6, "startColumnIndex": 1, "endColumnIndex": 3}, "mergeType": "MERGE_ALL"}},
      {"mergeCells": {"range": {"sheetId": 0, "startRowIndex": 4, "endRowIndex": 5, "startColumnIndex": 3, "endColumnIndex": 5}, "mergeType": "MERGE_ALL"}},
      {"mergeCells": {"range": {"sheetId": 0, "startRowIndex": 5, "endRowIndex": 6, "startColumnIndex": 3, "endColumnIndex": 5}, "mergeType": "MERGE_ALL"}},
      {"mergeCells": {"range": {"sheetId": 0, "startRowIndex": 4, "endRowIndex": 5, "startColumnIndex": 5, "endColumnIndex": 8}, "mergeType": "MERGE_ALL"}},
      {"mergeCells": {"range": {"sheetId": 0, "startRowIndex": 5, "endRowIndex": 6, "startColumnIndex": 5, "endColumnIndex": 8}, "mergeType": "MERGE_ALL"}},
      {"mergeCells": {"range": {"sheetId": 0, "startRowIndex": 4, "endRowIndex": 5, "startColumnIndex": 8, "endColumnIndex": 10}, "mergeType": "MERGE_ALL"}},
      {"mergeCells": {"range": {"sheetId": 0, "startRowIndex": 5, "endRowIndex": 6, "startColumnIndex": 8, "endColumnIndex": 10}, "mergeType": "MERGE_ALL"}},

      {"repeatCell": {
        "range": {"sheetId": 0, "startRowIndex": 4, "endRowIndex": 5, "startColumnIndex": 0, "endColumnIndex": 12},
        "cell": {"userEnteredFormat": {
          "backgroundColor": {"red": 0.086, "green": 0.125, "blue": 0.200},
          "textFormat": {"foregroundColor": {"red": 0.580, "green": 0.639, "blue": 0.722}, "bold": true, "fontSize": 9, "fontFamily": "Arial"},
          "horizontalAlignment": "CENTER",
          "verticalAlignment": "MIDDLE"
        }},
        "fields": "userEnteredFormat(backgroundColor,textFormat,horizontalAlignment,verticalAlignment)"
      }},
      {"updateDimensionProperties": {
        "range": {"sheetId": 0, "dimension": "ROWS", "startIndex": 4, "endIndex": 5},
        "properties": {"pixelSize": 24},
        "fields": "pixelSize"
      }},

      {"repeatCell": {
        "range": {"sheetId": 0, "startRowIndex": 5, "endRowIndex": 6, "startColumnIndex": 1, "endColumnIndex": 3},
        "cell": {"userEnteredFormat": {
          "backgroundColor": {"red": 0.086, "green": 0.125, "blue": 0.200},
          "textFormat": {"foregroundColor": {"red": 0.133, "green": 0.773, "blue": 0.369}, "bold": true, "fontSize": 18, "fontFamily": "Arial"},
          "horizontalAlignment": "CENTER",
          "verticalAlignment": "MIDDLE",
          "numberFormat": {"type": "CURRENCY", "pattern": "$#,##0"}
        }},
        "fields": "userEnteredFormat(backgroundColor,textFormat,horizontalAlignment,verticalAlignment,numberFormat)"
      }},
      {"repeatCell": {
        "range": {"sheetId": 0, "startRowIndex": 5, "endRowIndex": 6, "startColumnIndex": 3, "endColumnIndex": 5},
        "cell": {"userEnteredFormat": {
          "backgroundColor": {"red": 0.086, "green": 0.125, "blue": 0.200},
          "textFormat": {"foregroundColor": {"red": 0.937, "green": 0.267, "blue": 0.267}, "bold": true, "fontSize": 18, "fontFamily": "Arial"},
          "horizontalAlignment": "CENTER",
          "verticalAlignment": "MIDDLE",
          "numberFormat": {"type": "CURRENCY", "pattern": "$#,##0"}
        }},
        "fields": "userEnteredFormat(backgroundColor,textFormat,horizontalAlignment,verticalAlignment,numberFormat)"
      }},
      {"repeatCell": {
        "range": {"sheetId": 0, "startRowIndex": 5, "endRowIndex": 6, "startColumnIndex": 5, "endColumnIndex": 8},
        "cell": {"userEnteredFormat": {
          "backgroundColor": {"red": 0.086, "green": 0.125, "blue": 0.200},
          "textFormat": {"foregroundColor": {"red": 0.831, "green": 0.686, "blue": 0.216}, "bold": true, "fontSize": 18, "fontFamily": "Arial"},
          "horizontalAlignment": "CENTER",
          "verticalAlignment": "MIDDLE",
          "numberFormat": {"type": "CURRENCY", "pattern": "$#,##0"}
        }},
        "fields": "userEnteredFormat(backgroundColor,textFormat,horizontalAlignment,verticalAlignment,numberFormat)"
      }},
      {"repeatCell": {
        "range": {"sheetId": 0, "startRowIndex": 5, "endRowIndex": 6, "startColumnIndex": 8, "endColumnIndex": 10},
        "cell": {"userEnteredFormat": {
          "backgroundColor": {"red": 0.086, "green": 0.125, "blue": 0.200},
          "textFormat": {"foregroundColor": {"red": 0.376, "green": 0.647, "blue": 0.980}, "bold": true, "fontSize": 18, "fontFamily": "Arial"},
          "horizontalAlignment": "CENTER",
          "verticalAlignment": "MIDDLE",
          "numberFormat": {"type": "PERCENT", "pattern": "0%"}
        }},
        "fields": "userEnteredFormat(backgroundColor,textFormat,horizontalAlignment,verticalAlignment,numberFormat)"
      }},
      {"updateDimensionProperties": {
        "range": {"sheetId": 0, "dimension": "ROWS", "startIndex": 5, "endIndex": 6},
        "properties": {"pixelSize": 52},
        "fields": "pixelSize"
      }},

      {"repeatCell": {
        "range": {"sheetId": 0, "startRowIndex": 5, "endRowIndex": 6, "startColumnIndex": 0, "endColumnIndex": 1},
        "cell": {"userEnteredFormat": {"backgroundColor": {"red": 0.086, "green": 0.125, "blue": 0.200}}},
        "fields": "userEnteredFormat(backgroundColor)"
      }},
      {"repeatCell": {
        "range": {"sheetId": 0, "startRowIndex": 5, "endRowIndex": 6, "startColumnIndex": 10, "endColumnIndex": 12},
        "cell": {"userEnteredFormat": {"backgroundColor": {"red": 0.086, "green": 0.125, "blue": 0.200}}},
        "fields": "userEnteredFormat(backgroundColor)"
      }},

      {"repeatCell": {
        "range": {"sheetId": 0, "startRowIndex": 6, "endRowIndex": 7, "startColumnIndex": 0, "endColumnIndex": 12},
        "cell": {"userEnteredFormat": {"backgroundColor": {"red": 0.059, "green": 0.090, "blue": 0.165}}},
        "fields": "userEnteredFormat(backgroundColor)"
      }},
      {"updateDimensionProperties": {
        "range": {"sheetId": 0, "dimension": "ROWS", "startIndex": 6, "endIndex": 7},
        "properties": {"pixelSize": 10},
        "fields": "pixelSize"
      }},

      {"mergeCells": {"range": {"sheetId": 0, "startRowIndex": 7, "endRowIndex": 8, "startColumnIndex": 1, "endColumnIndex": 6}, "mergeType": "MERGE_ALL"}},
      {"repeatCell": {
        "range": {"sheetId": 0, "startRowIndex": 7, "endRowIndex": 8, "startColumnIndex": 1, "endColumnIndex": 6},
        "cell": {"userEnteredFormat": {
          "backgroundColor": {"red": 0.800, "green": 0.400, "blue": 0.400},
          "textFormat": {"foregroundColor": {"red": 1, "green": 1, "blue": 1}, "bold": true, "fontSize": 12, "fontFamily": "Arial"},
          "horizontalAlignment": "CENTER",
          "verticalAlignment": "MIDDLE"
        }},
        "fields": "userEnteredFormat(backgroundColor,textFormat,horizontalAlignment,verticalAlignment)"
      }},
      {"mergeCells": {"range": {"sheetId": 0, "startRowIndex": 7, "endRowIndex": 8, "startColumnIndex": 7, "endColumnIndex": 12}, "mergeType": "MERGE_ALL"}},
      {"repeatCell": {
        "range": {"sheetId": 0, "startRowIndex": 7, "endRowIndex": 8, "startColumnIndex": 7, "endColumnIndex": 12},
        "cell": {"userEnteredFormat": {
          "backgroundColor": {"red": 0.106, "green": 0.227, "blue": 0.361},
          "textFormat": {"foregroundColor": {"red": 1, "green": 1, "blue": 1}, "bold": true, "fontSize": 12, "fontFamily": "Arial"},
          "horizontalAlignment": "CENTER",
          "verticalAlignment": "MIDDLE"
        }},
        "fields": "userEnteredFormat(backgroundColor,textFormat,horizontalAlignment,verticalAlignment)"
      }},
      {"repeatCell": {
        "range": {"sheetId": 0, "startRowIndex": 7, "endRowIndex": 8, "startColumnIndex": 0, "endColumnIndex": 1},
        "cell": {"userEnteredFormat": {"backgroundColor": {"red": 0.059, "green": 0.090, "blue": 0.165}}},
        "fields": "userEnteredFormat(backgroundColor)"
      }},
      {"repeatCell": {
        "range": {"sheetId": 0, "startRowIndex": 7, "endRowIndex": 8, "startColumnIndex": 6, "endColumnIndex": 7},
        "cell": {"userEnteredFormat": {"backgroundColor": {"red": 0.059, "green": 0.090, "blue": 0.165}}},
        "fields": "userEnteredFormat(backgroundColor)"
      }},

      {"repeatCell": {
        "range": {"sheetId": 0, "startRowIndex": 8, "endRowIndex": 9, "startColumnIndex": 1, "endColumnIndex": 6},
        "cell": {"userEnteredFormat": {
          "backgroundColor": {"red": 0.106, "green": 0.227, "blue": 0.361},
          "textFormat": {"foregroundColor": {"red": 1, "green": 1, "blue": 1}, "bold": true, "fontSize": 9, "fontFamily": "Arial"},
          "horizontalAlignment": "CENTER",
          "verticalAlignment": "MIDDLE"
        }},
        "fields": "userEnteredFormat(backgroundColor,textFormat,horizontalAlignment,verticalAlignment)"
      }},
      {"repeatCell": {
        "range": {"sheetId": 0, "startRowIndex": 8, "endRowIndex": 9, "startColumnIndex": 7, "endColumnIndex": 12},
        "cell": {"userEnteredFormat": {
          "backgroundColor": {"red": 0.106, "green": 0.227, "blue": 0.361},
          "textFormat": {"foregroundColor": {"red": 1, "green": 1, "blue": 1}, "bold": true, "fontSize": 9, "fontFamily": "Arial"},
          "horizontalAlignment": "CENTER",
          "verticalAlignment": "MIDDLE"
        }},
        "fields": "userEnteredFormat(backgroundColor,textFormat,horizontalAlignment,verticalAlignment)"
      }},
      {"repeatCell": {
        "range": {"sheetId": 0, "startRowIndex": 8, "endRowIndex": 9, "startColumnIndex": 0, "endColumnIndex": 1},
        "cell": {"userEnteredFormat": {"backgroundColor": {"red": 0.059, "green": 0.090, "blue": 0.165}}},
        "fields": "userEnteredFormat(backgroundColor)"
      }},
      {"repeatCell": {
        "range": {"sheetId": 0, "startRowIndex": 8, "endRowIndex": 9, "startColumnIndex": 6, "endColumnIndex": 7},
        "cell": {"userEnteredFormat": {"backgroundColor": {"red": 0.059, "green": 0.090, "blue": 0.165}}},
        "fields": "userEnteredFormat(backgroundColor)"
      }},

      {"repeatCell": {
        "range": {"sheetId": 0, "startRowIndex": 9, "endRowIndex": 14, "startColumnIndex": 1, "endColumnIndex": 6},
        "cell": {"userEnteredFormat": {
          "backgroundColor": {"red": 0.086, "green": 0.125, "blue": 0.200},
          "textFormat": {"foregroundColor": {"red": 0.973, "green": 0.980, "blue": 0.988}, "fontSize": 10, "fontFamily": "Arial"},
          "verticalAlignment": "MIDDLE",
          "numberFormat": {"type": "CURRENCY", "pattern": "$#,##0"}
        }},
        "fields": "userEnteredFormat(backgroundColor,textFormat,verticalAlignment,numberFormat)"
      }},
      {"repeatCell": {
        "range": {"sheetId": 0, "startRowIndex": 9, "endRowIndex": 14, "startColumnIndex": 5, "endColumnIndex": 6},
        "cell": {"userEnteredFormat": {
          "numberFormat": {"type": "PERCENT", "pattern": "0%"},
          "textFormat": {"foregroundColor": {"red": 0.133, "green": 0.773, "blue": 0.369}, "bold": true, "fontSize": 10}
        }},
        "fields": "userEnteredFormat(numberFormat,textFormat)"
      }},

      {"repeatCell": {
        "range": {"sheetId": 0, "startRowIndex": 9, "endRowIndex": 14, "startColumnIndex": 7, "endColumnIndex": 12},
        "cell": {"userEnteredFormat": {
          "backgroundColor": {"red": 0.086, "green": 0.125, "blue": 0.200},
          "textFormat": {"foregroundColor": {"red": 0.973, "green": 0.980, "blue": 0.988}, "fontSize": 10, "fontFamily": "Arial"},
          "verticalAlignment": "MIDDLE",
          "numberFormat": {"type": "CURRENCY", "pattern": "$#,##0"}
        }},
        "fields": "userEnteredFormat(backgroundColor,textFormat,verticalAlignment,numberFormat)"
      }},

      {"repeatCell": {
        "range": {"sheetId": 0, "startRowIndex": 9, "endRowIndex": 14, "startColumnIndex": 0, "endColumnIndex": 1},
        "cell": {"userEnteredFormat": {"backgroundColor": {"red": 0.059, "green": 0.090, "blue": 0.165}}},
        "fields": "userEnteredFormat(backgroundColor)"
      }},
      {"repeatCell": {
        "range": {"sheetId": 0, "startRowIndex": 9, "endRowIndex": 14, "startColumnIndex": 6, "endColumnIndex": 7},
        "cell": {"userEnteredFormat": {"backgroundColor": {"red": 0.059, "green": 0.090, "blue": 0.165}}},
        "fields": "userEnteredFormat(backgroundColor)"
      }},

      {"repeatCell": {
        "range": {"sheetId": 0, "startRowIndex": 14, "endRowIndex": 15, "startColumnIndex": 1, "endColumnIndex": 6},
        "cell": {"userEnteredFormat": {
          "backgroundColor": {"red": 0.118, "green": 0.161, "blue": 0.239},
          "textFormat": {"foregroundColor": {"red": 0.973, "green": 0.980, "blue": 0.988}, "bold": true, "fontSize": 10, "fontFamily": "Arial"},
          "horizontalAlignment": "CENTER",
          "verticalAlignment": "MIDDLE",
          "numberFormat": {"type": "CURRENCY", "pattern": "$#,##0"},
          "borders": {"top": {"style": "SOLID", "color": {"red": 0.580, "green": 0.639, "blue": 0.722}}}
        }},
        "fields": "userEnteredFormat(backgroundColor,textFormat,horizontalAlignment,verticalAlignment,numberFormat,borders)"
      }},
      {"repeatCell": {
        "range": {"sheetId": 0, "startRowIndex": 14, "endRowIndex": 15, "startColumnIndex": 0, "endColumnIndex": 1},
        "cell": {"userEnteredFormat": {"backgroundColor": {"red": 0.059, "green": 0.090, "blue": 0.165}}},
        "fields": "userEnteredFormat(backgroundColor)"
      }},
      {"repeatCell": {
        "range": {"sheetId": 0, "startRowIndex": 14, "endRowIndex": 15, "startColumnIndex": 6, "endColumnIndex": 7},
        "cell": {"userEnteredFormat": {"backgroundColor": {"red": 0.059, "green": 0.090, "blue": 0.165}}},
        "fields": "userEnteredFormat(backgroundColor)"
      }},

      {"repeatCell": {
        "range": {"sheetId": 0, "startRowIndex": 13, "endRowIndex": 14, "startColumnIndex": 7, "endColumnIndex": 12},
        "cell": {"userEnteredFormat": {
          "backgroundColor": {"red": 0.118, "green": 0.161, "blue": 0.239},
          "textFormat": {"foregroundColor": {"red": 0.973, "green": 0.980, "blue": 0.988}, "bold": true, "fontSize": 10, "fontFamily": "Arial"},
          "verticalAlignment": "MIDDLE",
          "numberFormat": {"type": "CURRENCY", "pattern": "$#,##0"},
          "borders": {"top": {"style": "SOLID", "color": {"red": 0.580, "green": 0.639, "blue": 0.722}}}
        }},
        "fields": "userEnteredFormat(backgroundColor,textFormat,verticalAlignment,numberFormat,borders)"
      }},

      {"repeatCell": {
        "range": {"sheetId": 0, "startRowIndex": 15, "endRowIndex": 16, "startColumnIndex": 0, "endColumnIndex": 12},
        "cell": {"userEnteredFormat": {"backgroundColor": {"red": 0.059, "green": 0.090, "blue": 0.165}}},
        "fields": "userEnteredFormat(backgroundColor)"
      }},
      {"updateDimensionProperties": {
        "range": {"sheetId": 0, "dimension": "ROWS", "startIndex": 15, "endIndex": 16},
        "properties": {"pixelSize": 10},
        "fields": "pixelSize"
      }},

      {"mergeCells": {"range": {"sheetId": 0, "startRowIndex": 16, "endRowIndex": 17, "startColumnIndex": 1, "endColumnIndex": 6}, "mergeType": "MERGE_ALL"}},
      {"repeatCell": {
        "range": {"sheetId": 0, "startRowIndex": 16, "endRowIndex": 17, "startColumnIndex": 1, "endColumnIndex": 6},
        "cell": {"userEnteredFormat": {
          "backgroundColor": {"red": 0.831, "green": 0.686, "blue": 0.216},
          "textFormat": {"foregroundColor": {"red": 1, "green": 1, "blue": 1}, "bold": true, "fontSize": 12, "fontFamily": "Arial"},
          "horizontalAlignment": "CENTER",
          "verticalAlignment": "MIDDLE"
        }},
        "fields": "userEnteredFormat(backgroundColor,textFormat,horizontalAlignment,verticalAlignment)"
      }},
      {"repeatCell": {
        "range": {"sheetId": 0, "startRowIndex": 16, "endRowIndex": 17, "startColumnIndex": 0, "endColumnIndex": 1},
        "cell": {"userEnteredFormat": {"backgroundColor": {"red": 0.059, "green": 0.090, "blue": 0.165}}},
        "fields": "userEnteredFormat(backgroundColor)"
      }},
      {"repeatCell": {
        "range": {"sheetId": 0, "startRowIndex": 16, "endRowIndex": 17, "startColumnIndex": 6, "endColumnIndex": 12},
        "cell": {"userEnteredFormat": {"backgroundColor": {"red": 0.059, "green": 0.090, "blue": 0.165}}},
        "fields": "userEnteredFormat(backgroundColor)"
      }},

      {"repeatCell": {
        "range": {"sheetId": 0, "startRowIndex": 17, "endRowIndex": 18, "startColumnIndex": 1, "endColumnIndex": 6},
        "cell": {"userEnteredFormat": {
          "backgroundColor": {"red": 0.106, "green": 0.227, "blue": 0.361},
          "textFormat": {"foregroundColor": {"red": 1, "green": 1, "blue": 1}, "bold": true, "fontSize": 9, "fontFamily": "Arial"},
          "horizontalAlignment": "CENTER",
          "verticalAlignment": "MIDDLE"
        }},
        "fields": "userEnteredFormat(backgroundColor,textFormat,horizontalAlignment,verticalAlignment)"
      }},
      {"repeatCell": {
        "range": {"sheetId": 0, "startRowIndex": 17, "endRowIndex": 18, "startColumnIndex": 0, "endColumnIndex": 1},
        "cell": {"userEnteredFormat": {"backgroundColor": {"red": 0.059, "green": 0.090, "blue": 0.165}}},
        "fields": "userEnteredFormat(backgroundColor)"
      }},
      {"repeatCell": {
        "range": {"sheetId": 0, "startRowIndex": 17, "endRowIndex": 18, "startColumnIndex": 6, "endColumnIndex": 12},
        "cell": {"userEnteredFormat": {"backgroundColor": {"red": 0.059, "green": 0.090, "blue": 0.165}}},
        "fields": "userEnteredFormat(backgroundColor)"
      }},

      {"repeatCell": {
        "range": {"sheetId": 0, "startRowIndex": 18, "endRowIndex": 22, "startColumnIndex": 1, "endColumnIndex": 6},
        "cell": {"userEnteredFormat": {
          "backgroundColor": {"red": 0.086, "green": 0.125, "blue": 0.200},
          "textFormat": {"foregroundColor": {"red": 0.973, "green": 0.980, "blue": 0.988}, "fontSize": 10, "fontFamily": "Arial"},
          "verticalAlignment": "MIDDLE"
        }},
        "fields": "userEnteredFormat(backgroundColor,textFormat,verticalAlignment)"
      }},
      {"repeatCell": {
        "range": {"sheetId": 0, "startRowIndex": 18, "endRowIndex": 22, "startColumnIndex": 2, "endColumnIndex": 3},
        "cell": {"userEnteredFormat": {"numberFormat": {"type": "PERCENT", "pattern": "0%"}}},
        "fields": "userEnteredFormat(numberFormat)"
      }},
      {"repeatCell": {
        "range": {"sheetId": 0, "startRowIndex": 18, "endRowIndex": 22, "startColumnIndex": 3, "endColumnIndex": 4},
        "cell": {"userEnteredFormat": {"numberFormat": {"type": "CURRENCY", "pattern": "$#,##0"}}},
        "fields": "userEnteredFormat(numberFormat)"
      }},
      {"repeatCell": {
        "range": {"sheetId": 0, "startRowIndex": 18, "endRowIndex": 22, "startColumnIndex": 4, "endColumnIndex": 5},
        "cell": {"userEnteredFormat": {"numberFormat": {"type": "PERCENT", "pattern": "0%"}}},
        "fields": "userEnteredFormat(numberFormat)"
      }},
      {"repeatCell": {
        "range": {"sheetId": 0, "startRowIndex": 18, "endRowIndex": 22, "startColumnIndex": 5, "endColumnIndex": 6},
        "cell": {"userEnteredFormat": {"numberFormat": {"type": "CURRENCY", "pattern": "$#,##0"}}},
        "fields": "userEnteredFormat(numberFormat)"
      }},
      {"repeatCell": {
        "range": {"sheetId": 0, "startRowIndex": 18, "endRowIndex": 22, "startColumnIndex": 0, "endColumnIndex": 1},
        "cell": {"userEnteredFormat": {"backgroundColor": {"red": 0.059, "green": 0.090, "blue": 0.165}}},
        "fields": "userEnteredFormat(backgroundColor)"
      }},
      {"repeatCell": {
        "range": {"sheetId": 0, "startRowIndex": 18, "endRowIndex": 22, "startColumnIndex": 6, "endColumnIndex": 12},
        "cell": {"userEnteredFormat": {"backgroundColor": {"red": 0.059, "green": 0.090, "blue": 0.165}}},
        "fields": "userEnteredFormat(backgroundColor)"
      }},

      {"repeatCell": {
        "range": {"sheetId": 0, "startRowIndex": 22, "endRowIndex": 23, "startColumnIndex": 1, "endColumnIndex": 6},
        "cell": {"userEnteredFormat": {
          "backgroundColor": {"red": 0.118, "green": 0.161, "blue": 0.239},
          "textFormat": {"foregroundColor": {"red": 0.973, "green": 0.980, "blue": 0.988}, "bold": true, "fontSize": 10, "fontFamily": "Arial"},
          "horizontalAlignment": "CENTER",
          "verticalAlignment": "MIDDLE",
          "borders": {"top": {"style": "SOLID", "color": {"red": 0.580, "green": 0.639, "blue": 0.722}}}
        }},
        "fields": "userEnteredFormat(backgroundColor,textFormat,horizontalAlignment,verticalAlignment,borders)"
      }},
      {"repeatCell": {
        "range": {"sheetId": 0, "startRowIndex": 22, "endRowIndex": 23, "startColumnIndex": 0, "endColumnIndex": 1},
        "cell": {"userEnteredFormat": {"backgroundColor": {"red": 0.059, "green": 0.090, "blue": 0.165}}},
        "fields": "userEnteredFormat(backgroundColor)"
      }},
      {"repeatCell": {
        "range": {"sheetId": 0, "startRowIndex": 22, "endRowIndex": 23, "startColumnIndex": 6, "endColumnIndex": 12},
        "cell": {"userEnteredFormat": {"backgroundColor": {"red": 0.059, "green": 0.090, "blue": 0.165}}},
        "fields": "userEnteredFormat(backgroundColor)"
      }},

      {"repeatCell": {
        "range": {"sheetId": 0, "startRowIndex": 23, "endRowIndex": 50, "startColumnIndex": 0, "endColumnIndex": 12},
        "cell": {"userEnteredFormat": {"backgroundColor": {"red": 0.059, "green": 0.090, "blue": 0.165}}},
        "fields": "userEnteredFormat(backgroundColor)"
      }}
    ]
  }' > /dev/null 2>&1
echo "✅ Dashboard formatting applied"

# ── Step 9: Format Transactions tab ──────────────────────────
echo "🎨 Formatting Transactions tab..."
gws sheets spreadsheets batchUpdate \
  --params "{\"spreadsheetId\": \"$SHEET_ID\"}" \
  --json '{
    "requests": [
      {"repeatCell": {
        "range": {"sheetId": 1, "startRowIndex": 0, "endRowIndex": 1, "startColumnIndex": 0, "endColumnIndex": 8},
        "cell": {"userEnteredFormat": {
          "backgroundColor": {"red": 0.106, "green": 0.227, "blue": 0.361},
          "textFormat": {"foregroundColor": {"red": 1, "green": 1, "blue": 1}, "bold": true, "fontSize": 10, "fontFamily": "Arial"},
          "horizontalAlignment": "CENTER",
          "verticalAlignment": "MIDDLE"
        }},
        "fields": "userEnteredFormat(backgroundColor,textFormat,horizontalAlignment,verticalAlignment)"
      }},
      {"updateDimensionProperties": {
        "range": {"sheetId": 1, "dimension": "ROWS", "startIndex": 0, "endIndex": 1},
        "properties": {"pixelSize": 32},
        "fields": "pixelSize"
      }},
      {"repeatCell": {
        "range": {"sheetId": 1, "startRowIndex": 1, "endRowIndex": 200, "startColumnIndex": 3, "endColumnIndex": 4},
        "cell": {"userEnteredFormat": {"numberFormat": {"type": "CURRENCY", "pattern": "$#,##0.00"}}},
        "fields": "userEnteredFormat(numberFormat)"
      }},
      {"updateDimensionProperties": {
        "range": {"sheetId": 1, "dimension": "COLUMNS", "startIndex": 0, "endIndex": 1},
        "properties": {"pixelSize": 40},
        "fields": "pixelSize"
      }},
      {"updateDimensionProperties": {
        "range": {"sheetId": 1, "dimension": "COLUMNS", "startIndex": 1, "endIndex": 2},
        "properties": {"pixelSize": 110},
        "fields": "pixelSize"
      }},
      {"updateDimensionProperties": {
        "range": {"sheetId": 1, "dimension": "COLUMNS", "startIndex": 2, "endIndex": 3},
        "properties": {"pixelSize": 200},
        "fields": "pixelSize"
      }},
      {"updateDimensionProperties": {
        "range": {"sheetId": 1, "dimension": "COLUMNS", "startIndex": 3, "endIndex": 4},
        "properties": {"pixelSize": 100},
        "fields": "pixelSize"
      }},
      {"updateDimensionProperties": {
        "range": {"sheetId": 1, "dimension": "COLUMNS", "startIndex": 4, "endIndex": 8},
        "properties": {"pixelSize": 110},
        "fields": "pixelSize"
      }},
      {"addBanding": {
        "bandedRange": {
          "range": {"sheetId": 1, "startRowIndex": 1, "endRowIndex": 200, "startColumnIndex": 0, "endColumnIndex": 8},
          "rowProperties": {
            "firstBandColorStyle": {"rgbColor": {"red": 1, "green": 1, "blue": 1}},
            "secondBandColorStyle": {"rgbColor": {"red": 0.95, "green": 0.96, "blue": 0.97}}
          }
        }
      }}
    ]
  }' > /dev/null 2>&1
echo "✅ Transactions formatted"

# ── Step 10: Format Budget Setup tab ─────────────────────────
echo "🎨 Formatting Budget Setup tab..."
gws sheets spreadsheets batchUpdate \
  --params "{\"spreadsheetId\": \"$SHEET_ID\"}" \
  --json '{
    "requests": [
      {"repeatCell": {
        "range": {"sheetId": 2, "startRowIndex": 2, "endRowIndex": 3, "startColumnIndex": 1, "endColumnIndex": 2},
        "cell": {"userEnteredFormat": {
          "textFormat": {"bold": true, "fontSize": 12, "fontFamily": "Arial"},
          "verticalAlignment": "MIDDLE"
        }},
        "fields": "userEnteredFormat(textFormat,verticalAlignment)"
      }},
      {"repeatCell": {
        "range": {"sheetId": 2, "startRowIndex": 2, "endRowIndex": 3, "startColumnIndex": 2, "endColumnIndex": 3},
        "cell": {"userEnteredFormat": {
          "backgroundColor": {"red": 0.133, "green": 0.773, "blue": 0.369},
          "textFormat": {"foregroundColor": {"red": 1, "green": 1, "blue": 1}, "bold": true, "fontSize": 14, "fontFamily": "Arial"},
          "horizontalAlignment": "CENTER",
          "verticalAlignment": "MIDDLE",
          "numberFormat": {"type": "CURRENCY", "pattern": "$#,##0.00"}
        }},
        "fields": "userEnteredFormat(backgroundColor,textFormat,horizontalAlignment,verticalAlignment,numberFormat)"
      }},
      {"repeatCell": {
        "range": {"sheetId": 2, "startRowIndex": 4, "endRowIndex": 5, "startColumnIndex": 1, "endColumnIndex": 4},
        "cell": {"userEnteredFormat": {
          "backgroundColor": {"red": 0.831, "green": 0.686, "blue": 0.216},
          "textFormat": {"foregroundColor": {"red": 1, "green": 1, "blue": 1}, "bold": true, "fontSize": 11, "fontFamily": "Arial"},
          "horizontalAlignment": "CENTER"
        }},
        "fields": "userEnteredFormat(backgroundColor,textFormat,horizontalAlignment)"
      }},
      {"repeatCell": {
        "range": {"sheetId": 2, "startRowIndex": 5, "endRowIndex": 6, "startColumnIndex": 1, "endColumnIndex": 4},
        "cell": {"userEnteredFormat": {
          "backgroundColor": {"red": 0.106, "green": 0.227, "blue": 0.361},
          "textFormat": {"foregroundColor": {"red": 1, "green": 1, "blue": 1}, "bold": true, "fontSize": 9, "fontFamily": "Arial"},
          "horizontalAlignment": "CENTER"
        }},
        "fields": "userEnteredFormat(backgroundColor,textFormat,horizontalAlignment)"
      }},
      {"repeatCell": {
        "range": {"sheetId": 2, "startRowIndex": 6, "endRowIndex": 10, "startColumnIndex": 3, "endColumnIndex": 4},
        "cell": {"userEnteredFormat": {"numberFormat": {"type": "CURRENCY", "pattern": "$#,##0.00"}}},
        "fields": "userEnteredFormat(numberFormat)"
      }},
      {"repeatCell": {
        "range": {"sheetId": 2, "startRowIndex": 10, "endRowIndex": 11, "startColumnIndex": 1, "endColumnIndex": 4},
        "cell": {"userEnteredFormat": {
          "textFormat": {"bold": true},
          "borders": {"top": {"style": "SOLID", "color": {"red": 0.106, "green": 0.227, "blue": 0.361}}}
        }},
        "fields": "userEnteredFormat(textFormat,borders)"
      }},
      {"repeatCell": {
        "range": {"sheetId": 2, "startRowIndex": 12, "endRowIndex": 13, "startColumnIndex": 1, "endColumnIndex": 4},
        "cell": {"userEnteredFormat": {
          "backgroundColor": {"red": 0.800, "green": 0.400, "blue": 0.400},
          "textFormat": {"foregroundColor": {"red": 1, "green": 1, "blue": 1}, "bold": true, "fontSize": 11, "fontFamily": "Arial"},
          "horizontalAlignment": "CENTER"
        }},
        "fields": "userEnteredFormat(backgroundColor,textFormat,horizontalAlignment)"
      }},
      {"repeatCell": {
        "range": {"sheetId": 2, "startRowIndex": 13, "endRowIndex": 14, "startColumnIndex": 1, "endColumnIndex": 4},
        "cell": {"userEnteredFormat": {
          "backgroundColor": {"red": 0.106, "green": 0.227, "blue": 0.361},
          "textFormat": {"foregroundColor": {"red": 1, "green": 1, "blue": 1}, "bold": true, "fontSize": 9, "fontFamily": "Arial"},
          "horizontalAlignment": "CENTER"
        }},
        "fields": "userEnteredFormat(backgroundColor,textFormat,horizontalAlignment)"
      }},
      {"repeatCell": {
        "range": {"sheetId": 2, "startRowIndex": 14, "endRowIndex": 19, "startColumnIndex": 2, "endColumnIndex": 4},
        "cell": {"userEnteredFormat": {"numberFormat": {"type": "CURRENCY", "pattern": "$#,##0"}}},
        "fields": "userEnteredFormat(numberFormat)"
      }},
      {"updateDimensionProperties": {
        "range": {"sheetId": 2, "dimension": "COLUMNS", "startIndex": 1, "endIndex": 4},
        "properties": {"pixelSize": 180},
        "fields": "pixelSize"
      }}
    ]
  }' > /dev/null 2>&1
echo "✅ Budget Setup formatted"

# ── Step 11: Format Savings Goals tab ────────────────────────
echo "🎨 Formatting Savings Goals tab..."
gws sheets spreadsheets batchUpdate \
  --params "{\"spreadsheetId\": \"$SHEET_ID\"}" \
  --json '{
    "requests": [
      {"repeatCell": {
        "range": {"sheetId": 4, "startRowIndex": 0, "endRowIndex": 1, "startColumnIndex": 0, "endColumnIndex": 7},
        "cell": {"userEnteredFormat": {
          "backgroundColor": {"red": 0.106, "green": 0.227, "blue": 0.361},
          "textFormat": {"foregroundColor": {"red": 1, "green": 1, "blue": 1}, "bold": true, "fontSize": 10, "fontFamily": "Arial"},
          "horizontalAlignment": "CENTER",
          "verticalAlignment": "MIDDLE"
        }},
        "fields": "userEnteredFormat(backgroundColor,textFormat,horizontalAlignment,verticalAlignment)"
      }},
      {"updateDimensionProperties": {
        "range": {"sheetId": 4, "dimension": "ROWS", "startIndex": 0, "endIndex": 1},
        "properties": {"pixelSize": 32},
        "fields": "pixelSize"
      }},
      {"repeatCell": {
        "range": {"sheetId": 4, "startRowIndex": 1, "endRowIndex": 6, "startColumnIndex": 2, "endColumnIndex": 5},
        "cell": {"userEnteredFormat": {"numberFormat": {"type": "CURRENCY", "pattern": "$#,##0"}}},
        "fields": "userEnteredFormat(numberFormat)"
      }},
      {"repeatCell": {
        "range": {"sheetId": 4, "startRowIndex": 1, "endRowIndex": 6, "startColumnIndex": 5, "endColumnIndex": 6},
        "cell": {"userEnteredFormat": {"numberFormat": {"type": "PERCENT", "pattern": "0%"}}},
        "fields": "userEnteredFormat(numberFormat)"
      }},
      {"updateDimensionProperties": {
        "range": {"sheetId": 4, "dimension": "COLUMNS", "startIndex": 1, "endIndex": 7},
        "properties": {"pixelSize": 140},
        "fields": "pixelSize"
      }},
      {"addBanding": {
        "bandedRange": {
          "range": {"sheetId": 4, "startRowIndex": 1, "endRowIndex": 6, "startColumnIndex": 0, "endColumnIndex": 7},
          "rowProperties": {
            "firstBandColorStyle": {"rgbColor": {"red": 1, "green": 1, "blue": 1}},
            "secondBandColorStyle": {"rgbColor": {"red": 0.95, "green": 0.96, "blue": 0.97}}
          }
        }
      }}
    ]
  }' > /dev/null 2>&1
echo "✅ Savings Goals formatted"

# ── Step 12: Format Monthly Summary tab ──────────────────────
echo "🎨 Formatting Monthly Summary tab..."
gws sheets spreadsheets batchUpdate \
  --params "{\"spreadsheetId\": \"$SHEET_ID\"}" \
  --json '{
    "requests": [
      {"repeatCell": {
        "range": {"sheetId": 3, "startRowIndex": 0, "endRowIndex": 1, "startColumnIndex": 0, "endColumnIndex": 8},
        "cell": {"userEnteredFormat": {
          "backgroundColor": {"red": 0.106, "green": 0.227, "blue": 0.361},
          "textFormat": {"foregroundColor": {"red": 1, "green": 1, "blue": 1}, "bold": true, "fontSize": 10, "fontFamily": "Arial"},
          "horizontalAlignment": "CENTER",
          "verticalAlignment": "MIDDLE"
        }},
        "fields": "userEnteredFormat(backgroundColor,textFormat,horizontalAlignment,verticalAlignment)"
      }},
      {"updateDimensionProperties": {
        "range": {"sheetId": 3, "dimension": "ROWS", "startIndex": 0, "endIndex": 1},
        "properties": {"pixelSize": 32},
        "fields": "pixelSize"
      }},
      {"repeatCell": {
        "range": {"sheetId": 3, "startRowIndex": 1, "endRowIndex": 15, "startColumnIndex": 2, "endColumnIndex": 8},
        "cell": {"userEnteredFormat": {"numberFormat": {"type": "CURRENCY", "pattern": "$#,##0"}}},
        "fields": "userEnteredFormat(numberFormat)"
      }},
      {"repeatCell": {
        "range": {"sheetId": 3, "startRowIndex": 14, "endRowIndex": 15, "startColumnIndex": 0, "endColumnIndex": 8},
        "cell": {"userEnteredFormat": {
          "textFormat": {"bold": true},
          "borders": {"top": {"style": "SOLID_MEDIUM", "color": {"red": 0.106, "green": 0.227, "blue": 0.361}}}
        }},
        "fields": "userEnteredFormat(textFormat,borders)"
      }},
      {"updateDimensionProperties": {
        "range": {"sheetId": 3, "dimension": "COLUMNS", "startIndex": 1, "endIndex": 8},
        "properties": {"pixelSize": 110},
        "fields": "pixelSize"
      }},
      {"addBanding": {
        "bandedRange": {
          "range": {"sheetId": 3, "startRowIndex": 1, "endRowIndex": 13, "startColumnIndex": 0, "endColumnIndex": 8},
          "rowProperties": {
            "firstBandColorStyle": {"rgbColor": {"red": 1, "green": 1, "blue": 1}},
            "secondBandColorStyle": {"rgbColor": {"red": 0.95, "green": 0.96, "blue": 0.97}}
          }
        }
      }}
    ]
  }' > /dev/null 2>&1
echo "✅ Monthly Summary formatted"

# ── Step 13: Data Validation (Dropdowns) ─────────────────────
echo "📋 Adding data validation dropdowns..."
gws sheets spreadsheets batchUpdate \
  --params "{\"spreadsheetId\": \"$SHEET_ID\"}" \
  --json '{
    "requests": [
      {"setDataValidation": {
        "range": {"sheetId": 0, "startRowIndex": 2, "endRowIndex": 3, "startColumnIndex": 2, "endColumnIndex": 3},
        "rule": {
          "condition": {"type": "ONE_OF_LIST", "values": [{"userEnteredValue": "January"},{"userEnteredValue": "February"},{"userEnteredValue": "March"},{"userEnteredValue": "April"},{"userEnteredValue": "May"},{"userEnteredValue": "June"},{"userEnteredValue": "July"},{"userEnteredValue": "August"},{"userEnteredValue": "September"},{"userEnteredValue": "October"},{"userEnteredValue": "November"},{"userEnteredValue": "December"}]},
          "strict": true,
          "showCustomUi": true
        }
      }},
      {"setDataValidation": {
        "range": {"sheetId": 1, "startRowIndex": 1, "endRowIndex": 200, "startColumnIndex": 5, "endColumnIndex": 6},
        "rule": {
          "condition": {"type": "ONE_OF_LIST", "values": [{"userEnteredValue": "Income"},{"userEnteredValue": "Savings"},{"userEnteredValue": "Needs"},{"userEnteredValue": "Wants"},{"userEnteredValue": "Bills"}]},
          "strict": true,
          "showCustomUi": true
        }
      }},
      {"setDataValidation": {
        "range": {"sheetId": 1, "startRowIndex": 1, "endRowIndex": 200, "startColumnIndex": 7, "endColumnIndex": 8},
        "rule": {
          "condition": {"type": "ONE_OF_LIST", "values": [{"userEnteredValue": "January"},{"userEnteredValue": "February"},{"userEnteredValue": "March"},{"userEnteredValue": "April"},{"userEnteredValue": "May"},{"userEnteredValue": "June"},{"userEnteredValue": "July"},{"userEnteredValue": "August"},{"userEnteredValue": "September"},{"userEnteredValue": "October"},{"userEnteredValue": "November"},{"userEnteredValue": "December"}]},
          "strict": true,
          "showCustomUi": true
        }
      }}
    ]
  }' > /dev/null 2>&1
echo "✅ Data validation added"

# ── Step 14: Conditional Formatting ──────────────────────────
echo "🎨 Adding conditional formatting..."
gws sheets spreadsheets batchUpdate \
  --params "{\"spreadsheetId\": \"$SHEET_ID\"}" \
  --json '{
    "requests": [
      {"addConditionalFormatRule": {
        "rule": {
          "ranges": [{"sheetId": 1, "startRowIndex": 1, "endRowIndex": 200, "startColumnIndex": 5, "endColumnIndex": 6}],
          "booleanRule": {
            "condition": {"type": "TEXT_EQ", "values": [{"userEnteredValue": "Income"}]},
            "format": {"backgroundColor": {"red": 0.133, "green": 0.773, "blue": 0.369, "alpha": 0.13}}
          }
        },
        "index": 0
      }},
      {"addConditionalFormatRule": {
        "rule": {
          "ranges": [{"sheetId": 1, "startRowIndex": 1, "endRowIndex": 200, "startColumnIndex": 5, "endColumnIndex": 6}],
          "booleanRule": {
            "condition": {"type": "TEXT_EQ", "values": [{"userEnteredValue": "Savings"}]},
            "format": {"backgroundColor": {"red": 0.376, "green": 0.647, "blue": 0.980, "alpha": 0.13}}
          }
        },
        "index": 1
      }},
      {"addConditionalFormatRule": {
        "rule": {
          "ranges": [{"sheetId": 1, "startRowIndex": 1, "endRowIndex": 200, "startColumnIndex": 5, "endColumnIndex": 6}],
          "booleanRule": {
            "condition": {"type": "TEXT_EQ", "values": [{"userEnteredValue": "Needs"}]},
            "format": {"backgroundColor": {"red": 0.961, "green": 0.620, "blue": 0.043, "alpha": 0.13}}
          }
        },
        "index": 2
      }},
      {"addConditionalFormatRule": {
        "rule": {
          "ranges": [{"sheetId": 1, "startRowIndex": 1, "endRowIndex": 200, "startColumnIndex": 5, "endColumnIndex": 6}],
          "booleanRule": {
            "condition": {"type": "TEXT_EQ", "values": [{"userEnteredValue": "Wants"}]},
            "format": {"backgroundColor": {"red": 0.655, "green": 0.545, "blue": 0.980, "alpha": 0.13}}
          }
        },
        "index": 3
      }},
      {"addConditionalFormatRule": {
        "rule": {
          "ranges": [{"sheetId": 1, "startRowIndex": 1, "endRowIndex": 200, "startColumnIndex": 5, "endColumnIndex": 6}],
          "booleanRule": {
            "condition": {"type": "TEXT_EQ", "values": [{"userEnteredValue": "Bills"}]},
            "format": {"backgroundColor": {"red": 0.937, "green": 0.267, "blue": 0.267, "alpha": 0.13}}
          }
        },
        "index": 4
      }},
      {"addConditionalFormatRule": {
        "rule": {
          "ranges": [{"sheetId": 4, "startRowIndex": 1, "endRowIndex": 6, "startColumnIndex": 5, "endColumnIndex": 6}],
          "gradientRule": {
            "minpoint": {"color": {"red": 0.937, "green": 0.267, "blue": 0.267}, "type": "MIN"},
            "midpoint": {"color": {"red": 0.961, "green": 0.620, "blue": 0.043}, "type": "PERCENTILE", "value": "50"},
            "maxpoint": {"color": {"red": 0.133, "green": 0.773, "blue": 0.369}, "type": "MAX"}
          }
        },
        "index": 0
      }}
    ]
  }' > /dev/null 2>&1
echo "✅ Conditional formatting added"

# ── Step 15: Charts ──────────────────────────────────────────
echo "📊 Adding charts..."
gws sheets spreadsheets batchUpdate \
  --params "{\"spreadsheetId\": \"$SHEET_ID\"}" \
  --json '{
    "requests": [
      {"addChart": {
        "chart": {
          "position": {"overlayPosition": {"anchorCell": {"sheetId": 0, "rowIndex": 24, "columnIndex": 1}, "widthPixels": 480, "heightPixels": 380}},
          "spec": {
            "title": "Savings Goal Progress",
            "titleTextFormat": {"fontSize": 12, "bold": true},
            "pieChart": {
              "legendPosition": "BOTTOM_LEGEND",
              "domain": {"sourceRange": {"sources": [{"sheetId": 4, "startRowIndex": 1, "endRowIndex": 6, "startColumnIndex": 1, "endColumnIndex": 2}]}},
              "series": {"sourceRange": {"sources": [{"sheetId": 4, "startRowIndex": 1, "endRowIndex": 6, "startColumnIndex": 3, "endColumnIndex": 4}]}},
              "pieHole": 0.5
            },
            "backgroundColor": {"red": 0.059, "green": 0.090, "blue": 0.165},
            "titleTextPosition": {"horizontalAlignment": "CENTER"},
            "fontName": "Arial"
          }
        }
      }},
      {"addChart": {
        "chart": {
          "position": {"overlayPosition": {"anchorCell": {"sheetId": 0, "rowIndex": 24, "columnIndex": 6}, "widthPixels": 480, "heightPixels": 380}},
          "spec": {
            "title": "Where My Money Went",
            "titleTextFormat": {"fontSize": 12, "bold": true},
            "pieChart": {
              "legendPosition": "BOTTOM_LEGEND",
              "domain": {"sourceRange": {"sources": [{"sheetId": 0, "startRowIndex": 9, "endRowIndex": 13, "startColumnIndex": 7, "endColumnIndex": 8}]}},
              "series": {"sourceRange": {"sources": [{"sheetId": 0, "startRowIndex": 9, "endRowIndex": 13, "startColumnIndex": 9, "endColumnIndex": 10}]}},
              "pieHole": 0.5
            },
            "backgroundColor": {"red": 0.059, "green": 0.090, "blue": 0.165},
            "fontName": "Arial"
          }
        }
      }},
      {"addChart": {
        "chart": {
          "position": {"overlayPosition": {"anchorCell": {"sheetId": 0, "rowIndex": 36, "columnIndex": 1}, "widthPixels": 900, "heightPixels": 380}},
          "spec": {
            "title": "Goal vs Actual by Bucket",
            "titleTextFormat": {"fontSize": 12, "bold": true},
            "basicChart": {
              "chartType": "COLUMN",
              "legendPosition": "TOP_LEGEND",
              "axis": [
                {"position": "BOTTOM_AXIS"},
                {"position": "LEFT_AXIS", "format": {"fontFamily": "Arial", "fontSize": 9}}
              ],
              "domains": [{"domain": {"sourceRange": {"sources": [{"sheetId": 0, "startRowIndex": 18, "endRowIndex": 22, "startColumnIndex": 1, "endColumnIndex": 2}]}}}],
              "series": [
                {
                  "series": {"sourceRange": {"sources": [{"sheetId": 0, "startRowIndex": 18, "endRowIndex": 22, "startColumnIndex": 3, "endColumnIndex": 4}]}},
                  "targetAxis": "LEFT_AXIS",
                  "colorStyle": {"rgbColor": {"red": 0.106, "green": 0.227, "blue": 0.361}}
                },
                {
                  "series": {"sourceRange": {"sources": [{"sheetId": 0, "startRowIndex": 18, "endRowIndex": 22, "startColumnIndex": 5, "endColumnIndex": 6}]}},
                  "targetAxis": "LEFT_AXIS",
                  "colorStyle": {"rgbColor": {"red": 0.831, "green": 0.686, "blue": 0.216}}
                }
              ],
              "headerCount": 0
            },
            "backgroundColor": {"red": 0.059, "green": 0.090, "blue": 0.165},
            "fontName": "Arial"
          }
        }
      }}
    ]
  }' > /dev/null 2>&1
echo "✅ Charts added"

echo ""
echo "═══════════════════════════════════════════════════════════"
echo "  🎉 BUILD COMPLETE!"
echo ""
echo "  📊 Pay Yourself First — Budget Tracker"
echo "  🔗 https://docs.google.com/spreadsheets/d/$SHEET_ID"
echo ""
echo "  Tabs: Dashboard, Transactions, Budget Setup,"
echo "        Monthly Summary, Savings Goals,"
echo "        Setup & Instructions, Reference (hidden)"
echo ""
echo "  Features:"
echo "  ✅ 7 tabs with real formulas"
echo "  ✅ 20 sample transactions"
echo "  ✅ 4 KPI cards with live data"
echo "  ✅ Month selector dropdown"
echo "  ✅ Savings goals with progress tracking"
echo "  ✅ Budget vs actual by bucket"
echo "  ✅ 3 charts (2 donuts + 1 bar)"
echo "  ✅ Conditional formatting"
echo "  ✅ Data validation dropdowns"
echo "  ✅ Dark premium theme"
echo "  ✅ Frozen headers"
echo "═══════════════════════════════════════════════════════════"
