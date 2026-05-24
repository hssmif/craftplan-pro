# Etsy Keyword Research — Chrome Extension

Discover trending keywords, analyze best-selling listings, and build your Etsy SEO strategy directly from your browser. No API keys, no accounts, no external services — everything runs locally.

## Extension Role

This is the **ListingView / v1** browser extension. It is the original Etsy page scanner and publishing helper for CraftPlan Pro, and it is still needed.

Use this extension for:

- Scanning Etsy search, listing, and shop pages
- Powering research, radar, and opportunity workflows from live Etsy pages
- Handling external `PING`, `LIST_ON_ETSY`, and listing progress messages from the CraftPlan app
- Filling Etsy listing forms through the included Etsy form-filler

Do not delete this folder just because `src/extension/` also exists. The two extensions cover different Etsy surfaces and app workflows.

## Features

- **Page Detection** — Automatically detects search results, listing pages, and shop pages on Etsy
- **DOM Scraping** — Extracts title, price, favorites, reviews, bestseller badge, shop name, tags, and category from visible page data
- **Keyword Extraction** — N-gram analysis with frequency counting, stopword filtering, and keyword clustering
- **Demand & Competition Scoring** — Computed from favorites, reviews, and bestseller signals
- **Popup Dashboard** — 4-tab UI: Scan, Listings, Keywords, History with sort/filter
- **Sidebar Overlay** — Toggleable panel on Etsy pages for quick scanning
- **CSV Export** — Download listings and keywords as CSV files
- **Local Storage** — All data saved in chrome.storage.local (2000 listings, 500 keywords max)

## Setup

1. Clone or download this repository
2. Open Chrome and navigate to `chrome://extensions`
3. Enable **Developer mode** (toggle in top-right)
4. Click **Load unpacked**
5. Select the `etsy-keyword-research/` directory
6. The extension icon (orange circle) appears in your toolbar

## Usage

1. Navigate to any Etsy page (search, listing, or shop)
2. Click the extension icon to open the popup
3. Click **Scan This Page** to extract data
4. Browse results in the **Listings** and **Keywords** tabs
5. Use **Export CSV** to download your data
6. Click **Toggle Sidebar** for an on-page panel

## Architecture

```
manifest.json (MV3)
├── Content Scripts (injected on etsy.com)
│   ├── shared/     — Constants, utils, keyword engine, analysis, storage, CSV
│   ├── detector    — Page type detection (search/listing/shop)
│   ├── scrapers    — DOM extraction per page type
│   ├── sidebar     — Shadow DOM overlay panel
│   └── main        — Entry point, message handling, MutationObserver
├── Background (service worker)
│   └── Message routing, storage management, CSV export via downloads API
└── Popup (extension popup)
    └── 4-tab UI: Scan, Listings, Keywords, History
```

## Tech Stack

- **Manifest V3** — Modern Chrome extension format
- **Vanilla JS** — No frameworks, no bundler, IIFE namespaces
- **Shadow DOM** — Sidebar isolated from Etsy styles
- **chrome.storage.local** — Persistent local storage with LRU eviction
- **chrome.downloads** — CSV export via data URIs

## Selector Maintenance

All DOM selectors are centralized in `src/shared/constants.js` under the `SELECTORS` object. If Etsy changes their page structure, update selectors there.

## Limits

- Max 2,000 stored listings (LRU eviction by last_seen)
- Max 500 stored keywords (LRU eviction by last_updated)
- Max 50 scan history entries
