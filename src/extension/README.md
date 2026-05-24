# CraftPlan Research — Chrome Extension

This is the **CraftPlan Research / v2** browser extension. It is separate from the ListingView / v1 extension in `etsy-keyword-research/`, and it is still needed.

Use this extension for:

- Scanning Etsy Marketplace Insights pages
- Posting captured insight data to `/api/research/insights-capture`
- Supporting external `PING` and `RELOAD_EXTENSION` messages from the CraftPlan app
- Powering insight terms, anchors, ideas, and freshness signals in the research workflow

This extension focuses on Etsy Marketplace Insights data. It does not replace the ListingView / v1 extension, which still owns Etsy search/listing/shop scanning and the Etsy form-filler flow.

## Source And Build Output

- Source lives in `src/extension/`.
- Build output is generated into `public/extension/dist/`.
- Do not edit generated files in `public/extension/dist/` by hand.

