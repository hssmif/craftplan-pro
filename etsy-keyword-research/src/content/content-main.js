(function () {
  'use strict';

  var debounce = (globalThis.EtsyUtils || {}).debounce;
  var generateId = (globalThis.EtsyUtils || {}).generateId;
  var now = (globalThis.EtsyUtils || {}).now;

  var observer = null;
  var currentListings = [];
  var processedIds = {};
  var lastUrl = location.href;
  var urlCheckInterval = null;

  // ===================== Scan logic =====================

  /**
   * Run a scan on the current page, return raw results.
   */
  function scanPage() {
    var pageInfo = globalThis.EtsyDetector.detect();
    var scanId = generateId();
    var startTime = Date.now();
    var result = {
      scan_id: scanId,
      timestamp: now(),
      page_type: pageInfo.type,
      page_url: pageInfo.url,
      query: pageInfo.query || '',
      listings: [],
      keywords: [],
      bestsellers_found: 0,
      duration_ms: 0,
      total_results: null,
      listing_ids: [],
      keyword_strings: [],
    };

    try {
      if (pageInfo.type === 'search') {
        var searchResult = globalThis.EtsySearchScraper.scrapeWithMeta();
        result.listings = searchResult.listings;
        result.total_results = searchResult.total_results;
        result.query = pageInfo.query || '';
      } else if (pageInfo.type === 'listing') {
        var listing = globalThis.EtsyListingScraper.scrape();
        if (listing) result.listings = [listing];
      } else if (pageInfo.type === 'shop') {
        var shopData = globalThis.EtsyShopScraper.scrape();
        result.listings = shopData.listings || [];
        result.query = shopData.shop_name || '';
      }

      // Set source keyword
      for (var i = 0; i < result.listings.length; i++) {
        result.listings[i].source_keyword = result.query;
      }

      // Count bestsellers
      result.bestsellers_found = result.listings.filter(function (l) {
        return l.is_bestseller;
      }).length;

      // Extract keywords
      if (globalThis.EtsyKeywords && result.listings.length > 0) {
        var rawKeywords = globalThis.EtsyKeywords.analyzeKeywordFrequency(result.listings);
        for (var k = 0; k < rawKeywords.length && k < 100; k++) {
          var kw = rawKeywords[k];
          var matching = result.listings.filter(function (l) {
            return l.title.toLowerCase().indexOf(kw.keyword) !== -1;
          });
          if (globalThis.EtsyAnalysis && matching.length > 0) {
            var stats = globalThis.EtsyAnalysis.computeKeywordStats(kw.keyword, matching);
            Object.assign(kw, stats);
          }
          kw.sources = [pageInfo.type];
        }
        result.keywords = rawKeywords.slice(0, 100);

        if (rawKeywords.length > 0) {
          var clusters = globalThis.EtsyKeywords.clusterKeywords(rawKeywords);
          for (var ci = 0; ci < clusters.length; ci++) {
            for (var cj = 0; cj < clusters[ci].keywords.length; cj++) {
              clusters[ci].keywords[cj].cluster_id = clusters[ci].id;
            }
          }
        }
      }

      result.listing_ids = result.listings.map(function (l) { return l.listing_id; });
      result.keyword_strings = result.keywords.map(function (k) { return k.keyword; });
    } catch (err) {
      console.error('[ListingView] Scan error:', err);
    }

    result.duration_ms = Date.now() - startTime;
    return result;
  }

  // ===================== Search scan pipeline =====================

  function runSearchScan() {
    var result = scanPage();

    // Save to background, get back scan history
    chrome.runtime.sendMessage({
      action: 'saveScanResults',
      data: result,
    }, function (response) {
      if (chrome.runtime.lastError) {
        console.warn('[ListingView] Background error:', chrome.runtime.lastError.message);
        return;
      }

      var scans = (response && response.scans) || [];

      // Full enrichment with history
      if (globalThis.EtsyAnalysis) {
        globalThis.EtsyAnalysis.enrichAllListings(result.listings, scans, 'monthly');
      }

      currentListings = result.listings;
      trackProcessedIds(result.listings);

      // Rank listings (BUY/MONITOR/SKIP)
      if (globalThis.EtsyAnalysis) {
        globalThis.EtsyAnalysis.rankListings(result.listings);
      }

      // Inject badges
      if (globalThis.LVBadgeInjector) {
        globalThis.LVBadgeInjector.injectBadges(result.listings);
      }

      // Inject per-card action buttons (Send to CraftPlan + tier label)
      if (globalThis.LVCardButtons) {
        globalThis.LVCardButtons.injectAll(result.listings);
      }

      // Render top dashboard bar (full data)
      if (globalThis.LVListingStats && globalThis.EtsyAnalysis) {
        var stats = globalThis.EtsyAnalysis.computeAggregateStats(result.listings);
        globalThis.LVListingStats.render(result.listings, stats, result.total_results);
      }

      // Refresh dashboard if open
      if (globalThis.LVDashboard && globalThis.LVDashboard.isOpen()) {
        globalThis.LVDashboard.refresh(result.listings);
      }
    });

    return result;
  }

  function runListingScan() {
    var result = scanPage();
    chrome.runtime.sendMessage({
      action: 'saveScanResults',
      data: result,
    }, function (response) {
      if (chrome.runtime.lastError) return;
      var scans = (response && response.scans) || [];
      var listing = result.listings[0];
      if (listing && globalThis.EtsyAnalysis) {
        globalThis.EtsyAnalysis.enrichAllListings(result.listings, scans, 'monthly');
        if (globalThis.LVListingStats) {
          globalThis.LVListingStats.renderListingDetail(listing);
        }
        // After initial render, try to fetch accurate age (async upgrade)
        // Priority: Etsy API (best) → Wayback Machine (good fallback) → keep DOM data
        if (listing.listing_id && listing.listing_age_source !== 'api') {
          chrome.runtime.sendMessage({
            action: 'fetchListingAge',
            listingId: listing.listing_id,
          }, function (apiResult) {
            if (chrome.runtime.lastError) apiResult = { error: 'runtime_error' };
            // If API succeeded, use it
            if (apiResult && apiResult.date_published) {
              listing.date_published = apiResult.date_published;
              listing.listing_age_source = apiResult.listing_age_source || 'api';
              globalThis.EtsyAnalysis.enrichListing(listing);
              if (globalThis.LVListingStats) {
                globalThis.LVListingStats.renderListingDetail(listing);
              }
              return;
            }
            // API failed or no key — try Wayback Machine as fallback
            if (listing.listing_age_source !== 'wayback') {
              chrome.runtime.sendMessage({
                action: 'fetchWaybackAge',
                listingId: listing.listing_id,
              }, function (wbResult) {
                if (chrome.runtime.lastError || !wbResult || wbResult.error) return;
                if (wbResult.date_published) {
                  // Only upgrade if Wayback date is earlier than current
                  if (!listing.date_published || wbResult.date_published < listing.date_published) {
                    listing.date_published = wbResult.date_published;
                    listing.listing_age_source = wbResult.listing_age_source || 'wayback';
                    globalThis.EtsyAnalysis.enrichListing(listing);
                    if (globalThis.LVListingStats) {
                      globalThis.LVListingStats.renderListingDetail(listing);
                    }
                  }
                }
              });
            }
          });
        }
      }
    });
    return result;
  }

  function runShopScan() {
    var result = scanPage();
    chrome.runtime.sendMessage({
      action: 'saveScanResults',
      data: result,
    }, function (response) {
      if (chrome.runtime.lastError) {
        console.warn('[ListingView] Background error:', chrome.runtime.lastError.message);
        return;
      }
      var scans = (response && response.scans) || [];
      if (globalThis.EtsyAnalysis) {
        globalThis.EtsyAnalysis.enrichAllListings(result.listings, scans, 'monthly');
      }
      currentListings = result.listings;
      trackProcessedIds(result.listings);
      if (globalThis.LVBadgeInjector) {
        globalThis.LVBadgeInjector.injectBadges(result.listings);
      }
      if (globalThis.LVListingStats && globalThis.EtsyAnalysis) {
        var stats = globalThis.EtsyAnalysis.computeAggregateStats(result.listings);
        globalThis.LVListingStats.render(result.listings, stats, null);
      }
      if (globalThis.LVDashboard && globalThis.LVDashboard.isOpen()) {
        globalThis.LVDashboard.refresh(result.listings);
      }
    });
    return result;
  }

  function trackProcessedIds(listings) {
    for (var i = 0; i < listings.length; i++) {
      processedIds[listings[i].listing_id] = true;
    }
  }

  // ===================== MutationObserver =====================

  function setupObserver() {
    var pageInfo = globalThis.EtsyDetector.detect();
    if (pageInfo.type !== 'search' && pageInfo.type !== 'shop') return;

    // Observe body with subtree for maximum coverage
    if (observer) observer.disconnect();

    var debounceMs = 200;
    var fastAfterMs = 1500;
    var initTime = Date.now();

    var handleMutation = function () {
      var elapsed = Date.now() - initTime;
      var delay = elapsed > fastAfterMs ? 50 : debounceMs;
      clearTimeout(handleMutation._timer);
      handleMutation._timer = setTimeout(function () {
        onNewCards();
      }, delay);
    };
    handleMutation._timer = null;

    observer = new MutationObserver(handleMutation);
    observer.observe(document.body, { childList: true, subtree: true });
  }

  function onNewCards() {
    if (!globalThis.EtsySearchScraper) return;

    var cards = globalThis.EtsySearchScraper.findListingCards();
    var newListings = [];

    for (var i = 0; i < cards.length; i++) {
      var listing = globalThis.EtsySearchScraper.scrapeCard(cards[i]);
      if (listing && !processedIds[listing.listing_id]) {
        if (globalThis.EtsyAnalysis) {
          globalThis.EtsyAnalysis.enrichListing(listing);
        }
        newListings.push(listing);
        processedIds[listing.listing_id] = true;
      }
    }

    if (newListings.length === 0) return;

    // Merge with current
    currentListings = currentListings.concat(newListings);

    // Re-enrich all for accurate outlier/top-producer detection
    chrome.runtime.sendMessage({
      action: 'getStoredData',
      request: { type: 'scans' },
    }, function (response) {
      var scans = (response && response.scans) || [];
      if (globalThis.EtsyAnalysis) {
        globalThis.EtsyAnalysis.enrichAllListings(currentListings, scans, 'monthly');
      }

      // Re-inject badges for new cards only
      if (globalThis.LVBadgeInjector) {
        globalThis.LVBadgeInjector.injectBadges(newListings);
      }

      // Update top dashboard bar (full data)
      if (globalThis.LVListingStats && globalThis.EtsyAnalysis) {
        var stats = globalThis.EtsyAnalysis.computeAggregateStats(currentListings);
        globalThis.LVListingStats.render(currentListings, stats, null);
      }

      // Refresh dashboard
      if (globalThis.LVDashboard && globalThis.LVDashboard.isOpen()) {
        globalThis.LVDashboard.refresh(currentListings);
      }
    });
  }

  // ===================== URL change detection =====================

  function setupUrlWatcher() {
    if (urlCheckInterval) clearInterval(urlCheckInterval);
    urlCheckInterval = setInterval(function () {
      if (location.href !== lastUrl) {
        lastUrl = location.href;
        onUrlChange();
      }
    }, 500);
  }

  function onUrlChange() {
    // Cleanup
    if (observer) observer.disconnect();
    if (globalThis.LVBadgeInjector) globalThis.LVBadgeInjector.removeAllBadges();
    if (globalThis.LVCardButtons) globalThis.LVCardButtons.removeAll();
    if (globalThis.LVListingStats) {
      globalThis.LVListingStats.remove();
      globalThis.LVListingStats.removeListingDetail();
    }
    currentListings = [];
    processedIds = {};

    // Re-init after DOM settles
    setTimeout(init, 200);
  }

  // ===================== Message listener =====================

  chrome.runtime.onMessage.addListener(function (message, sender, sendResponse) {
    if (message.action === 'scanPage') {
      var result = runSearchScan();
      sendResponse({
        success: true,
        listings_count: result.listings.length,
        keywords_count: result.keywords.length,
        bestsellers_count: result.bestsellers_found,
        page_type: result.page_type,
        duration_ms: result.duration_ms,
        total_results: result.total_results,
      });
      return true;
    }

    if (message.action === 'getPageInfo') {
      sendResponse(globalThis.EtsyDetector.detect());
      return true;
    }

    if (message.action === 'getCurrentListings') {
      sendResponse({ listings: currentListings });
      return true;
    }

    if (message.action === 'openDashboard') {
      if (globalThis.LVDashboard) {
        globalThis.LVDashboard.open();
      }
      sendResponse({ success: true });
      return true;
    }

    // --- Deep scan: scrape this listing page and return data to service worker ---
    if (message.action === 'deepScanScrape') {
      var pageInfo = globalThis.EtsyDetector.detect();
      if (pageInfo.type === 'listing' && globalThis.EtsyListingScraper) {
        var deepListing = globalThis.EtsyListingScraper.scrape();
        if (deepListing && globalThis.EtsyAnalysis) {
          globalThis.EtsyAnalysis.enrichListing(deepListing);
        }
        chrome.runtime.sendMessage({
          action: 'deepScanResult',
          listingId: message.listingId,
          listing: deepListing,
        });
      }
      sendResponse({ success: true });
      return true;
    }

    // --- Deep scan progress notifications (update UI) ---
    if (message.action === 'deepScanProgress') {
      if (globalThis.LVCardButtons) {
        globalThis.LVCardButtons.updateDeepScanProgress(message);
      }
      return;
    }

    if (message.action === 'deepScanComplete') {
      if (globalThis.LVCardButtons) {
        globalThis.LVCardButtons.onDeepScanComplete(message);
      }
      // Re-enrich and re-render after deep scan
      chrome.runtime.sendMessage({
        action: 'getClassifiedData',
        request: { type: 'listings', timeWindow: 'monthly' },
      }, function (response) {
        if (response && response.listings) {
          currentListings = Object.values(response.listings);
          // Re-rank
          if (globalThis.EtsyAnalysis) {
            globalThis.EtsyAnalysis.rankListings(currentListings);
          }
          // Re-inject card buttons with updated data
          if (globalThis.LVCardButtons) {
            globalThis.LVCardButtons.injectAll(currentListings);
          }
          // Refresh badge injector
          if (globalThis.LVBadgeInjector) {
            globalThis.LVBadgeInjector.removeAllBadges();
            globalThis.LVBadgeInjector.injectBadges(currentListings);
          }
          // Update stats bar
          if (globalThis.LVListingStats && globalThis.EtsyAnalysis) {
            var stats = globalThis.EtsyAnalysis.computeAggregateStats(currentListings);
            globalThis.LVListingStats.render(currentListings, stats, null);
          }
        }
      });
      return;
    }
  });

  // ===================== Init =====================

  function init() {
    var pageInfo = globalThis.EtsyDetector.detect();
    if (pageInfo.type === 'unknown') return;

    // Floating tool on all Etsy pages
    if (globalThis.LVFloatingTool) {
      globalThis.LVFloatingTool.init(function () {
        if (globalThis.LVDashboard) {
          globalThis.LVDashboard.open();
        }
      });
    }

    // Page-specific behavior
    if (pageInfo.type === 'search') {
      var searchInit = function () { runSearchScan(); setupObserver(); };
      if (typeof requestIdleCallback === 'function') {
        requestIdleCallback(searchInit, { timeout: 200 });
      } else {
        setTimeout(searchInit, 150);
      }
    } else if (pageInfo.type === 'listing') {
      runListingScan();
    } else if (pageInfo.type === 'shop') {
      var shopInit = function () { runShopScan(); setupObserver(); };
      if (typeof requestIdleCallback === 'function') {
        requestIdleCallback(shopInit, { timeout: 200 });
      } else {
        setTimeout(shopInit, 150);
      }
    }
  }

  // Listen for time-window changes from the top bar
  document.addEventListener('lv-time-window-change', function (e) {
    var tw = (e.detail || {}).timeWindow || 'monthly';
    if (currentListings.length === 0) return;
    chrome.runtime.sendMessage({
      action: 'getStoredData',
      request: { type: 'scans' },
    }, function (response) {
      var scans = (response && response.scans) || [];
      if (globalThis.EtsyAnalysis) {
        globalThis.EtsyAnalysis.enrichAllListings(currentListings, scans, tw);
        var stats = globalThis.EtsyAnalysis.computeAggregateStats(currentListings);
        if (globalThis.LVListingStats) {
          globalThis.LVListingStats.render(currentListings, stats, null);
        }
      }
    });
  });

  // Start
  init();
  setupUrlWatcher();
})();
