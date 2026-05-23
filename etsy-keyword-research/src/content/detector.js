(function () {
  'use strict';

  /**
   * Detect which type of Etsy page the user is currently on.
   * Returns { type: 'search'|'listing'|'shop'|'unknown', query?, listingId?, shopName? }
   */
  function detect() {
    var url = window.location.href;
    var pathname = window.location.pathname;

    // --- Search results page ---
    if (pathname.startsWith('/search') || pathname.startsWith('/c/')) {
      var params = new URLSearchParams(window.location.search);
      var query = params.get('q') || '';
      // /c/category-slug pages are also search-like
      if (!query && pathname.startsWith('/c/')) {
        query = pathname.replace('/c/', '').replace(/-/g, ' ');
      }
      return { type: 'search', query: query, url: url };
    }

    // --- Individual listing page ---
    var listingMatch = pathname.match(/^\/listing\/(\d+)/);
    if (listingMatch) {
      return { type: 'listing', listingId: listingMatch[1], url: url };
    }

    // --- Shop page ---
    var shopMatch = pathname.match(/^\/shop\/([^/?#]+)/);
    if (shopMatch) {
      return { type: 'shop', shopName: shopMatch[1], url: url };
    }

    // Some shops use vanity URLs like etsy.com/ShopName
    // Check if the page has shop header elements
    var shopHeader = document.querySelector('[data-shop-id], div[class*="shop-header"]');
    if (shopHeader) {
      var nameEl = document.querySelector('h1');
      return {
        type: 'shop',
        shopName: nameEl ? nameEl.textContent.trim() : pathname.replace(/^\//, ''),
        url: url,
      };
    }

    return { type: 'unknown', url: url };
  }

  globalThis.EtsyDetector = {
    detect: detect,
  };
})();
