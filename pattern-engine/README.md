# Pattern Engine (Python)

FastAPI service that converts an image into a cross-stitch pattern.
Replaces the JS `convertToPattern` pipeline in `src/app/cross-stitch/page.tsx`.

## Why Python

- NumPy for vectorised pixel ops (100× faster than JS loops)
- scikit-learn KMeans in LAB color space (deterministic, perceptually uniform)
- scikit-image for CIEDE-correct color conversions
- Pillow for image I/O

## First-time setup

From the repo root:

```bash
cd pattern-engine
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
```

The `.venv` folder is gitignored.  Re-source it in each new shell.

## Run

```bash
# From pattern-engine/, with venv active:
uvicorn main:app --reload --port 8000
```

Or from the repo root with `npm run dev` (which also starts Next.js — see
the root `package.json`).

Hit `http://localhost:8000/health` to confirm it's up.

## API

### `POST /convert`

Request:

```json
{
  "image": "data:image/png;base64,iVBORw0KGgo...",
  "grid_size": 150,
  "max_colors": 24,
  "merge_de": 3.5
}
```

Response:

```json
{
  "grid": [["310", "White", "310", ...], ...],
  "colors": [
    { "dmc": "310", "name": "Black", "hex": "#000000", "symbol": "X", "count": 1234 },
    ...
  ],
  "width": 150,
  "height": 150,
  "totalStitches": 8421,
  "backgroundDmc": "White",
  "engineMs": 340
}
```

The shape matches the `PatternData` TypeScript type in `src/app/cross-stitch/page.tsx`
so the Next.js UI renders it without changes.

## Regenerating the DMC palette

The DMC thread palette is the source of truth in `src/lib/dmc-colors.ts`.
To sync it into the Python service:

```bash
python3 pattern-engine/scripts/extract_dmc.py
```

Produces `pattern-engine/dmc_colors.json`.  Commit the resulting JSON.
