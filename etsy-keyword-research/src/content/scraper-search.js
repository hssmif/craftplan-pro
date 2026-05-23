(function () {
  'use strict';

  var SEL = ((globalThis.EtsyConstants || {}).SELECTORS || {}).search || {};
  var trySelectors = (globalThis.EtsyUtils || {}).trySelectors;
  var extractListingIdFromUrl = (globalThis.EtsyUtils || {}).extractListingIdFromUrl;
  var extractPrice = (globalThis.EtsyUtils || {}).extractPrice;
  var extractNumber = (globalThis.EtsyUtils || {}).extractNumber;

  /**
   * Find the results container on the page
   */
  function findResultsContainer() {
    var containers = SEL.resultsContainer || [];
    for (var i = 0; i < containers.length; i++) {
      var el = document.querySelector(containers[i]);
      if (el) return el;
    }
    return null;
  }

  /**
   * Find all listing card elements on the page
   */
  function findListingCards() {
    var selectors = SEL.listingCard || [];
    for (var i = 0; i < selectors.length; i++) {
      var cards = document.querySelectorAll(selectors[i]);
      if (cards.length > 0) return Array.from(cards);
    }

    // Fallback: find any links containing /listing/ in the main content area
    var links = document.querySelectorAll('a[href*="/listing/"]');
    var seen = {};
    var result = [];
    for (var j = 0; j < links.length; j++) {
      var id = extractListingIdFromUrl(links[j].href);
      // Use the closest parent that looks like a card
      var card = links[j].closest('li, div[class*="card"], div[class*="listing"]') || links[j];
      if (id && !seen[id]) {
        seen[id] = true;
        result.push(card);
      }
    }
    return result;
  }

  /**
   * Scrape a single listing card element
   */
  function scrapeCard(card) {
    // Listing ID: from data attribute or href
    var listingId = card.getAttribute('data-listing-id') ||
      card.getAttribute('data-listing-card-v2');
    if (!listingId) {
      var link = card.querySelector('a[href*="/listing/"]');
      if (link) listingId = extractListingIdFromUrl(link.href);
    }
    if (!listingId) return null;

    // Title
    var title = trySelectors(card, SEL.title || [], 'text');
    if (!title) {
      // Try img alt
      var img = card.querySelector('img');
      if (img) title = img.getAttribute('alt');
    }
    if (!title) return null; // Skip cards with no title

    // Price
    var priceText = trySelectors(card, SEL.price || [], 'text');
    var price = extractPrice(priceText);

    // If no price from selectors, try regex on full card text
    if (price == null) {
      var cardText = card.textContent || '';
      var priceMatch = cardText.match(/\$\s*(\d+[.,]?\d*)/);
      if (priceMatch) price = parseFloat(priceMatch[1].replace(',', ''));
    }

    // Shop name & shop ID
    var shopName = trySelectors(card, SEL.shopName || [], 'text') || '';
    var shopIdEl = card.querySelector(SEL.shopId || '[data-shop-id]');
    var shopId = shopIdEl ? shopIdEl.getAttribute('data-shop-id') : '';

    // Image
    var imageUrl = trySelectors(card, SEL.image || [], 'src');
    if (!imageUrl) {
      var imgEl = card.querySelector('img');
      if (imgEl) imageUrl = imgEl.src || imgEl.getAttribute('data-src') || '';
    }

    // Bestseller badge
    var badgeText = trySelectors(card, SEL.bestseller || [], 'text') || '';
    var isBestseller = /bestseller/i.test(badgeText) || /best\s*seller/i.test(card.textContent || '');

    // Etsy's Picks badge
    var isEtsyPick = false;
    var etsyPickSelectors = SEL.etsyPick || [];
    for (var ep = 0; ep < etsyPickSelectors.length; ep++) {
      var pickEl = card.querySelector(etsyPickSelectors[ep]);
      if (pickEl && /etsy.?s?\s*pick/i.test(pickEl.textContent)) {
        isEtsyPick = true;
        break;
      }
    }
    if (!isEtsyPick) {
      isEtsyPick = /etsy.?s?\s*pick/i.test(card.textContent || '');
    }

    // Reviews + Rating — primary: aria-label "X.X star rating with Xk reviews"
    var reviews = 0;
    var rating = null;
    var ratingAriaEl = card.querySelector('[aria-label*="star rating"]');
    if (ratingAriaEl) {
      var ariaStr = ratingAriaEl.getAttribute('aria-label') || '';
      // Extract rating: "4.9 star rating..."
      var ratingM = ariaStr.match(/([\d.]+)\s*star/i);
      if (ratingM) rating = parseFloat(ratingM[1]);
      // Extract reviews: "...with 6.1k reviews" or "...with 31,400 reviews"
      var revM = ariaStr.match(/with\s+([\d,.]+)(k?)\s*review/i);
      if (revM) {
        var revNum = parseFloat(revM[1].replace(/,/g, ''));
        if (revM[2].toLowerCase() === 'k') revNum = Math.round(revNum * 1000);
        reviews = revNum;
      }
    }
    // Fallback: old selectors
    if (!reviews) {
      var reviewText = trySelectors(card, SEL.reviewCount || [], 'text') || '';
      reviews = extractNumber(reviewText) || 0;
    }
    if (!rating) {
      var ratingVal = trySelectors(card, SEL.rating || [], 'value');
      rating = ratingVal ? parseFloat(ratingVal) : null;
    }
    if (!rating) {
      // Fallback: count star SVGs
      var stars = card.querySelectorAll('svg[class*="star"], path[d*="star"]');
      if (stars.length > 0) rating = stars.length;
    }

    // Favorites — try to extract from search card (Etsy sometimes shows)
    var favorites = 0;
    var favSelectors = SEL.favorites || [];
    for (var fvi = 0; fvi < favSelectors.length; fvi++) {
      var favEl = card.querySelector(favSelectors[fvi]);
      if (favEl) {
        var favNum = extractNumber(favEl.textContent);
        if (favNum > 0) { favorites = favNum; break; }
      }
    }
    // Strategy 2: aria-label on favorite button e.g. "Add to favorites (1,234)"
    if (favorites === 0) {
      var favBtn = card.querySelector('button[aria-label*="favorite"], button[aria-label*="Favorite"]');
      if (favBtn) {
        var ariaLabel = favBtn.getAttribute('aria-label') || '';
        var favMatch = ariaLabel.match(/([\d,]+)/);
        if (favMatch) favorites = parseInt(favMatch[1].replace(/,/g, ''), 10) || 0;
      }
    }

    // URL
    var url = '';
    var mainLink = card.querySelector('a[href*="/listing/"]');
    if (mainLink) url = mainLink.href;
    else url = 'https://www.etsy.com/listing/' + listingId;

    return {
      listing_id: String(listingId),
      title: title.trim(),
      price: price || 0,
      favorites: favorites,
      reviews: reviews || 0,
      rating: rating || 0,
      shop_name: shopName.trim(),
      shop_id: shopId,
      url: url,
      image_url: imageUrl || '',
      is_bestseller: isBestseller,
      is_etsy_pick: isEtsyPick,
      tags: [],
      category: '',
      views_24h: null,
      search_position: 0,
    };
  }

  /**
   * Parse Etsy's total results count from search page header
   */
  function parseTotalResults() {
    // Strategy 1: Try dedicated selectors
    var totalSelectors = SEL.totalResults || [];
    for (var i = 0; i < totalSelectors.length; i++) {
      var el = document.querySelector(totalSelectors[i]);
      if (el) {
        var num = extractNumber(el.textContent);
        if (num && num > 0) return num;
      }
    }

    // Strategy 2: Regex scan of page header for "X,XXX results"
    var headerArea = document.querySelector('div[class*="search-header"]')
      || document.querySelector('div[class*="search-listings"]')
      || document.querySelector('main');
    if (headerArea) {
      var text = headerArea.textContent.slice(0, 2000);
      var match = text.match(/([\d,]+)\s+results?/i);
      if (match) return parseInt(match[1].replace(/,/g, ''), 10);
    }

    // Strategy 3: Check data attributes
    var dataEl = document.querySelector('[data-results-count], [data-total-count]');
    if (dataEl) {
      var count = parseInt(dataEl.getAttribute('data-results-count')
        || dataEl.getAttribute('data-total-count'), 10);
      if (count > 0) return count;
    }

    return null;
  }

  /**
   * Scrape all visible listings from the current search results page
   */
  function scrape() {
    var cards = findListingCards();
    var listings = [];
    var seen = {};

    var positionIndex = 0;
    for (var i = 0; i < cards.length; i++) {
      var listing = scrapeCard(cards[i]);
      if (listing && !seen[listing.listing_id]) {
        seen[listing.listing_id] = true;
        positionIndex++;
        listing.search_position = positionIndex;
        // Enrich with analysis
        if (globalThis.EtsyAnalysis) {
          globalThis.EtsyAnalysis.enrichListing(listing);
        }
        listings.push(listing);
      }
    }

    return listings;
  }

  /**
   * Get the results container for MutationObserver
   */
  function getContainer() {
    return findResultsContainer();
  }

  /**
   * Scrape listings plus total results metadata
   */
  function scrapeWithMeta() {
    return {
      listings: scrape(),
      total_results: parseTotalResults(),
    };
  }

  globalThis.EtsySearchScraper = {
    scrape: scrape,
    scrapeWithMeta: scrapeWithMeta,
    scrapeCard: scrapeCard,
    getContainer: getContainer,
    findListingCards: findListingCards,
    parseTotalResults: parseTotalResults,
  };
})();
