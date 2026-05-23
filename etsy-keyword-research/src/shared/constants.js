(function () {
  'use strict';

  // --- Stopwords: common English + Etsy-specific noise ---
  var STOPWORDS = new Set([
    'the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for',
    'of', 'with', 'by', 'from', 'as', 'is', 'was', 'are', 'be', 'been',
    'this', 'that', 'it', 'its', 'my', 'your', 'our', 'not', 'no', 'so',
    'if', 'up', 'out', 'about', 'just', 'than', 'then', 'also', 'very',
    'can', 'will', 'do', 'has', 'have', 'had', 'would', 'could',
    'instant', 'download', 'downloadable', 'editable', 'custom',
    'personalized', 'handmade', 'unique', 'new', 'best', 'top',
    'great', 'perfect', 'cute', 'beautiful', 'set', 'pack', 'bundle',
    'pdf', 'png', 'svg', 'jpg', 'jpeg', 'zip', 'file', 'files',
    'x', 'inch', 'inches', 'cm', 'mm', 'size',
  ]);

  // --- DOM selector configs ---
  var SELECTORS = {
    search: {
      resultsContainer: [
        '[data-search-results]',
        'div[data-search-results-lg]',
        '.search-listings-group',
        'ul.responsive-listing-grid',
      ],
      listingCard: [
        '.v2-listing-card',
        'div[data-listing-card-v2]',
        'li[data-listing-id]',
        '.listing-link',
        '.wt-card',
        'a.wt-transparent-card',
        'div.wt-transparent-card',
        'button.wt-transparent-card',
        'a.wt-card--transparent',
        'div.wt-card--transparent',
        'button.wt-card--transparent',
        '.js-merch-stash-check-listing',
        '.web-home-hub-card__listing-gallery-card',
      ],
      listingId: {
        attr: ['data-listing-id', 'data-listing-card-v2'],
        hrefPattern: /\/listing\/(\d+)\//,
      },
      title: [
        'h3.v2-listing-card__title',
        '.v2-listing-card__info h3',
        'a[title]',
        'h3',
      ],
      price: [
        'span.currency-value',
        '.lc-price span.currency-value',
        'p.search-collage-promotion-price span',
        'span[class*="currency"]',
      ],
      shopName: [
        'p.v2-listing-card__shop span',
        '.v2-listing-card__shop',
        'p[class*="shop-name"]',
      ],
      image: [
        'img[data-listing-card-hovered]',
        '.v2-listing-card img',
        'img[loading]',
      ],
      bestseller: [
        'span.v2-listing-card__badge span',
        'span[class*="bestseller"]',
        'div[class*="badge"]',
      ],
      reviewCount: [
        '.v2-listing-card__rating span',
        'span[class*="review-count"]',
      ],
      rating: [
        '.v2-listing-card__rating input[name="rating"]',
        'span[class*="stars"]',
      ],
      totalResults: [
        'span.wt-text-caption[data-search-pagination]',
        'span[class*="search-pagination-counter"]',
        'div[class*="search-header"] span',
        'h1[class*="search-header"]',
        'div[data-results-count]',
        'span[data-search-results-count]',
      ],
      etsyPick: [
        'span[class*="etsy-pick"]',
        'span[class*="etsys-pick"]',
        'div[class*="badge"] span',
      ],
      favorites: [
        'span[class*="favorite"]',
        'button[aria-label*="favorite"] span',
      ],
      shopId: '[data-shop-id]',
      searchPagination: '#async-search-results-scroll-pagination',
      cardImage: '.v2-listing-card__img',
      cardInfo: '.v2-listing-card__info',
    },

    listing: {
      title: [
        'h1[data-buy-box-listing-title]',
        'h1.wt-text-body-03',
        'h1',
      ],
      price: [
        'div[data-buy-box-region="price"] p[class*="currency"]',
        'div[data-buy-box-region="price"] span',
        'p[class*="override-listing-price"]',
      ],
      priceMeta: 'meta[property="product:price:amount"]',
      favorites: [
        'a[href="#reviews"] + span',
        'span[class*="favorite-count"]',
      ],
      reviewCount: [
        'a[href="#reviews"]',
        'button[data-reviews-pagination]',
      ],
      rating: [
        'input[name="rating"]',
        'span[class*="stars-svg"]',
      ],
      category: 'nav[aria-label*="Breadcrumb"] a, nav[aria-label*="breadcrumb"] a',
      tags: 'a[href*="/search?q="][class*="tag"]',
      shopName: [
        'a[href*="/shop/"][class*="shop-name"]',
        'div[data-buy-box-region="seller"] a',
        'a[aria-label*="shop"]',
      ],
      description: [
        'div[data-id="description-text"]',
        'p[class*="description"]',
        'div[class*="listing-page-description"]',
      ],
      image: [
        'img[data-listing-page-image]',
        'ul[class*="carousel"] img',
        'div[class*="image-carousel"] img',
      ],
      imageMeta: 'meta[property="og:image"]',
      views24h: [
        'span[data-appears-component-name*="views"]',
        'div[data-appears-component-name*="views"]',
        'span[class*="trust-signal"]',
        'div[class*="trust-signal"]',
        'span[class*="social-proof"]',
        'div[class*="social-proof"]',
      ],
      etsyPick: [
        'span[class*="etsy-pick"]',
        'span[class*="etsys-pick"]',
        'div[class*="badge"] span',
      ],
    },

    shop: {
      shopName: [
        'h1[class*="shop-name"]',
        'div[class*="shop-header"] h1',
        'h1',
      ],
      totalSales: [
        'span[class*="shop-sales-info"]',
        'div[class*="sales-count"]',
      ],
      shopHeader: '[data-selector="shop-header-container"]',
      listings: 'div[class*="shop-listings"] .listing-card, ul[class*="listing-grid"] li',
    },
  };

  // --- Badge colors (exact match from ListingView reference CSS) ---
  var BADGE_COLORS = {
    new:             { bg: '#d1fab3', color: '#217005', border: '#a8f170', label: 'New' },
    trending:        { bg: '#fde9ee', color: '#c0123c', border: '#fbd3dc', label: 'Trending' },
    evergreen:       { bg: '#b3f5e5', color: '#007f5f', border: '#70e5c1', label: 'Evergreen' },
    top_producer:    { bg: '#fbd992', color: '#7a5300', border: '#fbd992', label: 'Top Producer' },
    outlier_low:     { bg: '#e2f9f8', color: '#00768c', border: '#a2d9ce', label: 'Outlier Low' },
    outlier_mid:     { bg: '#fef5e7', color: '#935116', border: '#f5cba7', label: 'Outlier Mid' },
    outlier_high:    { bg: '#f5eef8', color: '#6c3483', border: '#d7bde2', label: 'Outlier High' },
    outlier_extreme: { bg: '#fde9ee', color: '#c0123c', border: '#fbd3dc', label: 'Outlier Extreme' },
    bestseller:      { bg: '#fef5e7', color: '#935116', border: '#f5cba7', label: 'Bestseller' },
    etsy_pick:       { bg: '#EEF0FF', color: '#615AF1', border: '#E1DFFD', label: "Etsy's Pick" },
  };

  // --- Trend colors ---
  var TREND_COLORS = {
    up: '#5CC489',
    down: '#DE8F88',
    flat: '#333333',
  };

  // --- Outlier thresholds (z-score) ---
  var OUTLIER_THRESHOLDS = { low: -1, mid_high: 1, high: 2 };

  // --- Top producer minimum appearances ---
  var TOP_PRODUCER_MIN = 3;

  // --- Storage keys ---
  var STORAGE_KEYS = {
    listings: 'lv_listings',
    keywords: 'lv_keywords',
    scans: 'lv_scans',
    settings: 'lv_settings',
    tabCache: 'lv_tab_',
    floatingPos: 'listing-view-floating-tools',
  };

  // --- Limits ---
  var LIMITS = {
    maxListings: 2000,
    maxKeywords: 500,
    maxScanHistory: 100,
  };

  // --- Classification thresholds ---
  var CLASSIFICATION = {
    evergreenMinScans: 3,
    evergreenMinAgeDays: 30,
    trendingFrequencyIncreasePercent: 50,
    trendingRecentDays: 7,
    newMaxAgeDays: 60,
    timeWindows: {
      daily: 1,
      weekly: 7,
      monthly: 30,
    },
  };

  // --- Font import for shadow DOM stylesheets ---
  var FONT_IMPORT = "@import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800&display=swap');";

  globalThis.EtsyConstants = {
    STOPWORDS: STOPWORDS,
    SELECTORS: SELECTORS,
    BADGE_COLORS: BADGE_COLORS,
    TREND_COLORS: TREND_COLORS,
    OUTLIER_THRESHOLDS: OUTLIER_THRESHOLDS,
    TOP_PRODUCER_MIN: TOP_PRODUCER_MIN,
    STORAGE_KEYS: STORAGE_KEYS,
    LIMITS: LIMITS,
    CLASSIFICATION: CLASSIFICATION,
    FONT_IMPORT: FONT_IMPORT,
  };
})();
