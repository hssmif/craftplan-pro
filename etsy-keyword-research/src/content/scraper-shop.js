(function () {
  'use strict';

  var SEL = ((globalThis.EtsyConstants || {}).SELECTORS || {}).shop || {};
  var trySelectors = (globalThis.EtsyUtils || {}).trySelectors;
  var extractNumber = (globalThis.EtsyUtils || {}).extractNumber;

  /**
   * Scrape data from an Etsy shop page
   */
  function scrape() {
    // Shop name
    var shopName = trySelectors(document, SEL.shopName || [], 'text');
    if (!shopName) {
      var h1 = document.querySelector('h1');
      if (h1) shopName = h1.textContent.trim();
    }

    // Total sales
    var salesText = trySelectors(document, SEL.totalSales || [], 'text') || '';
    var totalSales = 0;
    var salesMatch = (salesText || document.body.innerText.slice(0, 3000) || '').match(/([\d,]+)\s*sales/i);
    if (salesMatch) totalSales = parseInt(salesMatch[1].replace(/,/g, ''), 10) || 0;

    // Scrape visible listings — reuse search scraper card logic
    var listings = [];
    if (globalThis.EtsySearchScraper) {
      listings = globalThis.EtsySearchScraper.scrape();
      // Tag all with shop name
      for (var i = 0; i < listings.length; i++) {
        listings[i].shop_name = shopName || listings[i].shop_name;
      }
    }

    return {
      shop_name: shopName || '',
      total_sales: totalSales,
      listing_count: listings.length,
      listings: listings,
    };
  }

  globalThis.EtsyShopScraper = {
    scrape: scrape,
  };
})();
