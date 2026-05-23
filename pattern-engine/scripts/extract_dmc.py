"""
Extract DMC color tuples from src/lib/dmc-colors.ts into dmc_colors.json.

The .ts file remains the source of truth (it's used by browser code too).
This script produces a JSON derivative that the Python service reads at
startup. Run after any DMC palette change:

    python pattern-engine/scripts/extract_dmc.py
"""
from __future__ import annotations

import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
TS_FILE = ROOT / "src" / "lib" / "dmc-colors.ts"
OUT_FILE = ROOT / "pattern-engine" / "dmc_colors.json"

# Matches:  ["310", "Black", "#000000"],
TUPLE_RE = re.compile(
    r'\[\s*"([^"]+)"\s*,\s*"([^"]+)"\s*,\s*"(#[0-9A-Fa-f]{6})"\s*\]'
)


def main() -> None:
    text = TS_FILE.read_text()
    # Only parse entries inside the DMC_COLORS array, not other regex literals.
    start = text.index("DMC_COLORS")
    end = text.index("];", start)
    block = text[start:end]

    entries: list[dict[str, str]] = []
    seen_codes: set[str] = set()
    for code, name, hex_color in TUPLE_RE.findall(block):
        if code in seen_codes:
            # Source file has a duplicate "310" entry (line 4 and line 29).
            # Keep the first occurrence only.
            continue
        seen_codes.add(code)
        entries.append({"code": code, "name": name, "hex": hex_color})

    OUT_FILE.parent.mkdir(parents=True, exist_ok=True)
    OUT_FILE.write_text(json.dumps(entries, indent=2) + "\n")

    print(f"Wrote {len(entries)} DMC entries to {OUT_FILE.relative_to(ROOT)}")


if __name__ == "__main__":
    main()
