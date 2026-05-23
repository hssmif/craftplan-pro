// Background service worker — message router, storage, CSV export, classification
importScripts(
  '../shared/constants.js',
  '../shared/utils.js',
  '../shared/analysis.js',
  '../shared/csv.js'
);

var KEYS = EtsyConstants.STORAGE_KEYS;
var LIMITS = EtsyConstants.LIMITS;

// --- Storage helpers ---

function storageGet(key) {
  return new Promise(function (resolve) {
    chrome.storage.local.get(key, function (result) {
      resolve(result[key] || null);
    });
  });
}

function storageSet(key, value) {
  var obj = {};
  obj[key] = value;
  return new Promise(function (resolve) {
    chrome.storage.local.set(obj, resolve);
  });
}

// --- Forward message to active tab ---

function forwardToActiveTab(msg, sendResponse) {
  chrome.tabs.query({ active: true, currentWindow: true }, function (tabs) {
    if (tabs[0] && tabs[0].id) {
      chrome.tabs.sendMessage(tabs[0].id, msg, function (response) {
        if (chrome.runtime.lastError) {
          sendResponse({ error: 'Could not reach page. Make sure you are on etsy.com.' });
        } else {
          sendResponse(response || {});
        }
      });
    } else {
      sendResponse({ error: 'No active tab' });
    }
  });
}

// --- Message handler ---

chrome.runtime.onMessage.addListener(function (message, sender, sendResponse) {
  var action = message.action;

  if (action === 'saveScanResults') {
    handleSaveScanResults(message.data).then(sendResponse);
    return true;
  }

  if (action === 'getStoredData') {
    handleGetStoredData(message.request).then(sendResponse);
    return true;
  }

  if (action === 'getClassifiedData') {
    handleGetClassifiedData(message.request).then(sendResponse);
    return true;
  }

  if (action === 'classifyItems') {
    handleClassifyItems(message.request).then(sendResponse);
    return true;
  }

  if (action === 'triggerScan') {
    forwardToActiveTab({ action: 'scanPage' }, sendResponse);
    return true;
  }

  if (action === 'openDashboard') {
    forwardToActiveTab({ action: 'openDashboard' }, sendResponse);
    return true;
  }

  if (action === 'getPageInfo') {
    forwardToActiveTab({ action: 'getPageInfo' }, sendResponse);
    return true;
  }

  if (action === 'getCurrentListings') {
    forwardToActiveTab({ action: 'getCurrentListings' }, sendResponse);
    return true;
  }

  if (action === 'exportCSV') {
    handleExportCSV(message.dataType).then(sendResponse);
    return true;
  }

  if (action === 'clearData') {
    handleClearData(message.dataType).then(sendResponse);
    return true;
  }

  if (action === 'fetchListingAge') {
    handleFetchListingAge(message.listingId).then(sendResponse);
    return true;
  }

  if (action === 'fetchWaybackAge') {
    handleFetchWaybackAge(message.listingId).then(sendResponse);
    return true;
  }

  if (action === 'saveEtsyApiKey') {
    storageSet('lv_etsy_api_key', message.apiKey).then(function () {
      sendResponse({ success: true });
    });
    return true;
  }

  if (action === 'getEtsyApiKey') {
    storageGet('lv_etsy_api_key').then(function (key) {
      sendResponse({ apiKey: key || '' });
    });
    return true;
  }

  // --- CraftPlan Integration ---

  if (action === 'saveCraftPlanUrl') {
    storageSet('lv_craftplan_url', message.url).then(function () {
      sendResponse({ success: true });
    });
    return true;
  }

  if (action === 'getCraftPlanUrl') {
    storageGet('lv_craftplan_url').then(function (url) {
      sendResponse({ url: url || 'http://localhost:3461' });
    });
    return true;
  }

  if (action === 'testCraftPlanConnection') {
    handleTestCraftPlan().then(sendResponse);
    return true;
  }

  if (action === 'sendToCraftPlan') {
    handleSendToCraftPlan(message.listingIds).then(sendResponse);
    return true;
  }

  // --- Deep Scan: scrape top N listing pages sequentially ---
  if (action === 'deepScanListings') {
    handleDeepScan(message.listingIds, message.urls, sender.tab ? sender.tab.id : null).then(sendResponse);
    return true;
  }

  // --- Send single listing to CraftPlan (from injected card button) ---
  if (action === 'sendSingleToCraftPlan') {
    handleSendToCraftPlan([message.listingId]).then(sendResponse);
    return true;
  }

  // --- Send top winners to CraftPlan ---
  if (action === 'sendWinnersToCraftPlan') {
    handleSendToCraftPlan(message.listingIds).then(sendResponse);
    return true;
  }

  // --- Send single listing to POD Builder ---
  if (action === 'sendToPodBuilder') {
    handleSendToPodBuilder(message.listingId).then(sendResponse);
    return true;
  }

  // --- Form filler progress relay (from content script to CraftPlan app) ---
  if (message.type === 'LISTING_PROGRESS') {
    chrome.storage.local.set({ listingProgress: message });
    // Notify any CraftPlan tabs
    chrome.tabs.query({ url: 'http://localhost:3461/*' }, function (tabs) {
      tabs.forEach(function (tab) {
        if (tab.id) {
          chrome.tabs.sendMessage(tab.id, message).catch(function () {});
        }
      });
    });
  }

  // --- Form filler completed ---
  if (message.type === 'LISTING_READY') {
    chrome.storage.local.set({ listingProgress: Object.assign({}, message, { status: 'done' }) });
  }
});

// --- External messages (from CraftPlan Digital at localhost:3461) ---

chrome.runtime.onMessageExternal.addListener(function (msg, sender, sendResponse) {
  // Health check / ping
  if (msg.type === 'PING') {
    sendResponse({
      ok: true,
      version: chrome.runtime.getManifest().version,
      name: 'ListingView + CraftPlan POD',
    });
    return;
  }

  // CraftPlan wants to list on Etsy via browser automation
  if (msg.type === 'LIST_ON_ETSY') {
    var payload = msg.payload;
    chrome.storage.local.set({ pendingEtsyListing: payload }, function () {
      // Open Etsy listing creation page
      chrome.tabs.create(
        { url: 'https://www.etsy.com/your/shops/me/tools/listings/create' },
        function (tab) {
          console.log('[ListingView BG] Opened Etsy listing page, tab ' + (tab && tab.id));
          sendResponse({ ok: true, tabId: tab && tab.id });
        }
      );
    });
    return true; // async
  }

  // CraftPlan requests listing progress
  if (msg.type === 'GET_LISTING_PROGRESS') {
    chrome.storage.local.get('listingProgress', function (data) {
      sendResponse({ progress: data.listingProgress || null });
    });
    return true;
  }
});

// --- Handlers ---

async function handleSaveScanResults(data) {
  try {
    // Save listings with deduplication
    var existing = (await storageGet(KEYS.listings)) || {};
    var nowStr = new Date().toISOString();
    var newCount = 0;

    for (var i = 0; i < (data.listings || []).length; i++) {
      var l = data.listings[i];
      var id = l.listing_id;
      if (!id) continue;

      if (existing[id]) {
        // Preserve richer data from previous listing page visits
        var prev = existing[id];
        var preserveTags = Array.isArray(prev.tags) && prev.tags.length > 0 &&
          (!Array.isArray(l.tags) || l.tags.length === 0);
        var preserveFavs = (prev.favorites > 0) && (!l.favorites || l.favorites === 0);
        var preserveViews = (prev.views_24h != null && prev.views_24h > 0) && (l.views_24h == null);

        // Date merge: prefer API > earlier date > any date > none
        var srcPriority = { 'api': 0, 'json-ld': 1, 'internal-state': 2, 'wayback': 3, 'page-text': 4, 'review-approx': 5 };
        var prevPri = srcPriority[prev.listing_age_source] != null ? srcPriority[prev.listing_age_source] : 9;
        var newPri = srcPriority[l.listing_age_source] != null ? srcPriority[l.listing_age_source] : 9;
        var useNewDate = false;
        if (l.date_published && !prev.date_published) {
          useNewDate = true;
        } else if (l.date_published && prev.date_published) {
          // Prefer API source always; otherwise prefer the EARLIER date
          if (newPri < prevPri) useNewDate = true;
          else if (newPri === prevPri && l.date_published < prev.date_published) useNewDate = true;
        }

        existing[id] = Object.assign({}, prev, l, {
          first_seen: prev.first_seen,
          last_seen: nowStr,
        });

        if (!useNewDate && prev.date_published) {
          existing[id].date_published = prev.date_published;
          existing[id].listing_age_source = prev.listing_age_source;
        }
        if (preserveTags) existing[id].tags = prev.tags;
        if (preserveFavs) existing[id].favorites = prev.favorites;
        if (preserveViews) existing[id].views_24h = prev.views_24h;
      } else {
        newCount++;
        existing[id] = Object.assign({}, l, {
          first_seen: nowStr,
          last_seen: nowStr,
        });
      }
    }

    // LRU eviction
    var ids = Object.keys(existing);
    if (ids.length > LIMITS.maxListings) {
      ids.sort(function (a, b) {
        return (existing[a].last_seen || '').localeCompare(existing[b].last_seen || '');
      });
      var toRemove = ids.length - LIMITS.maxListings;
      for (var r = 0; r < toRemove; r++) {
        delete existing[ids[r]];
      }
    }

    await storageSet(KEYS.listings, existing);

    // Save keywords
    var existingKw = (await storageGet(KEYS.keywords)) || {};
    for (var k = 0; k < (data.keywords || []).length; k++) {
      var kw = data.keywords[k];
      var key = kw.keyword;
      if (!key) continue;

      if (existingKw[key]) {
        existingKw[key].frequency = (existingKw[key].frequency || 0) + (kw.frequency || 1);
        existingKw[key].last_updated = nowStr;
        if (kw.avg_price) existingKw[key].avg_price = kw.avg_price;
        if (kw.avg_favorites) existingKw[key].avg_favorites = kw.avg_favorites;
        if (kw.demand_score != null) existingKw[key].demand_score = kw.demand_score;
        if (kw.competition_level) existingKw[key].competition_level = kw.competition_level;
        if (kw.listings_count) existingKw[key].listings_count = kw.listings_count;
      } else {
        existingKw[key] = Object.assign({}, kw, {
          first_seen: nowStr,
          last_updated: nowStr,
        });
      }
    }

    // Keyword eviction
    var kwKeys = Object.keys(existingKw);
    if (kwKeys.length > LIMITS.maxKeywords) {
      kwKeys.sort(function (a, b) {
        return (existingKw[a].last_updated || '').localeCompare(existingKw[b].last_updated || '');
      });
      var kwRemove = kwKeys.length - LIMITS.maxKeywords;
      for (var kr = 0; kr < kwRemove; kr++) {
        delete existingKw[kwKeys[kr]];
      }
    }

    await storageSet(KEYS.keywords, existingKw);

    // Save scan record
    var scans = (await storageGet(KEYS.scans)) || [];
    scans.unshift({
      scan_id: data.scan_id,
      timestamp: data.timestamp,
      page_type: data.page_type,
      page_url: data.page_url,
      query: data.query || '',
      listings_found: (data.listings || []).length,
      keywords_extracted: (data.keywords || []).length,
      bestsellers_found: data.bestsellers_found || 0,
      duration_ms: data.duration_ms || 0,
      total_results: data.total_results || null,
      listing_ids: data.listing_ids || [],
      keyword_strings: data.keyword_strings || [],
    });
    if (scans.length > LIMITS.maxScanHistory) scans = scans.slice(0, LIMITS.maxScanHistory);
    await storageSet(KEYS.scans, scans);

    return {
      success: true,
      listings_saved: (data.listings || []).length,
      new_listings: newCount,
      total_listings: Object.keys(existing).length,
      keywords_saved: (data.keywords || []).length,
      scans: scans,
    };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

async function handleGetStoredData(request) {
  var type = (request || {}).type || 'all';
  var result = {};

  if (type === 'listings' || type === 'all') {
    result.listings = (await storageGet(KEYS.listings)) || {};
  }
  if (type === 'keywords' || type === 'all') {
    result.keywords = (await storageGet(KEYS.keywords)) || {};
  }
  if (type === 'scans' || type === 'all') {
    result.scans = (await storageGet(KEYS.scans)) || [];
  }

  return result;
}

async function handleGetClassifiedData(request) {
  var type = (request || {}).type || 'all';
  var timeWindow = (request || {}).timeWindow || 'monthly';
  var scans = (await storageGet(KEYS.scans)) || [];
  var result = {};

  if (type === 'listings' || type === 'all') {
    var listings = (await storageGet(KEYS.listings)) || {};
    var listingArr = Object.values(listings);
    // Full enrichment with outlier, top producer, etc.
    EtsyAnalysis.enrichAllListings(listingArr, scans, timeWindow);
    result.listings = {};
    for (var j = 0; j < listingArr.length; j++) {
      result.listings[listingArr[j].listing_id] = listingArr[j];
    }
    result.stats = EtsyAnalysis.computeAggregateStats(listingArr);
  }
  if (type === 'keywords' || type === 'all') {
    var keywords = (await storageGet(KEYS.keywords)) || {};
    var kwArr = Object.values(keywords);
    for (var k = 0; k < kwArr.length; k++) {
      kwArr[k].classification = EtsyAnalysis.classifyKeyword(kwArr[k], scans, timeWindow);
    }
    result.keywords = {};
    for (var m = 0; m < kwArr.length; m++) {
      result.keywords[kwArr[m].keyword] = kwArr[m];
    }
  }
  if (type === 'scans' || type === 'all') {
    result.scans = scans;
  }

  return result;
}

async function handleClassifyItems(request) {
  var timeWindow = (request || {}).timeWindow || 'monthly';
  var scans = (await storageGet(KEYS.scans)) || [];
  var listings = (await storageGet(KEYS.listings)) || {};
  var keywords = (await storageGet(KEYS.keywords)) || {};

  var listingArr = Object.values(listings);
  // Full enrichment
  EtsyAnalysis.enrichAllListings(listingArr, scans, timeWindow);
  var stats = EtsyAnalysis.computeAggregateStats(listingArr);

  // Classify keywords
  var kwArr = Object.values(keywords);
  var kwEvergreen = 0, kwTrending = 0, kwNew = 0;
  for (var k = 0; k < kwArr.length; k++) {
    var kwCls = EtsyAnalysis.classifyKeyword(kwArr[k], scans, timeWindow);
    kwArr[k].classification = kwCls;
    if (kwCls === 'evergreen') kwEvergreen++;
    else if (kwCls === 'trending') kwTrending++;
    else kwNew++;
  }

  // Get most recent total_results
  var totalResults = null;
  for (var s = 0; s < scans.length; s++) {
    if (scans[s].total_results) {
      totalResults = scans[s].total_results;
      break;
    }
  }

  return {
    totalResults: totalResults,
    evergreenCount: stats.evergreen,
    trendingCount: stats.trending,
    newCount: stats.new_count,
    bestsellerCount: stats.bestseller,
    topProducerCount: stats.top_producer,
    avgPrice: stats.avg_price,
    totalRevenue: stats.total_revenue,
    avgDemand: stats.avg_demand,
    kwEvergreenCount: kwEvergreen,
    kwTrendingCount: kwTrending,
    kwNewCount: kwNew,
  };
}

async function handleExportCSV(dataType) {
  try {
    var csv, filename, count;
    var timestamp = new Date().toISOString().slice(0, 10);

    if (dataType === 'listings') {
      var listings = (await storageGet(KEYS.listings)) || {};
      csv = EtsyCSV.listingsToCSV(listings);
      filename = 'listingview-listings-' + timestamp + '.csv';
      count = Object.keys(listings).length;
    } else {
      var keywords = (await storageGet(KEYS.keywords)) || {};
      csv = EtsyCSV.keywordsToCSV(keywords);
      filename = 'listingview-keywords-' + timestamp + '.csv';
      count = Object.keys(keywords).length;
    }

    var base64 = btoa(unescape(encodeURIComponent(csv)));
    var dataUri = 'data:text/csv;base64,' + base64;

    chrome.downloads.download({
      url: dataUri,
      filename: filename,
      saveAs: true,
    });

    return { success: true, filename: filename, count: count };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

/**
 * Etsy API rate-limit state.
 * QPD: 100,000/day (sliding 24h window) — tracked via response headers.
 * QPS: 150/sec — tracked via response headers.
 * On 429: use retry-after header with exponential backoff.
 */
var rateLimitState = {
  remainingToday: null,    // from x-remaining-today header
  remainingThisSecond: null, // from x-remaining-this-second header
  retryAfter: 0,           // timestamp (ms) before which we should NOT call the API
  consecutiveRetries: 0,   // for exponential backoff
};

function updateRateLimitHeaders(resp) {
  var rToday = resp.headers.get('x-remaining-today');
  var rSecond = resp.headers.get('x-remaining-this-second');
  if (rToday != null) rateLimitState.remainingToday = parseInt(rToday, 10);
  if (rSecond != null) rateLimitState.remainingThisSecond = parseInt(rSecond, 10);
  if (resp.ok) rateLimitState.consecutiveRetries = 0;
}

function isRateLimited() {
  return Date.now() < rateLimitState.retryAfter;
}

/**
 * Fetch listing creation date from Etsy Open API v3.
 * Requires an API key stored in lv_etsy_api_key.
 * Returns { date_published, listing_age_source } or { error }.
 *
 * Rate-limit aware:
 * - Checks stored listing first (cache hit = skip API call)
 * - Respects 429 retry-after + exponential backoff
 * - Reads x-remaining-today / x-remaining-this-second headers
 */
async function handleFetchListingAge(listingId) {
  try {
    // Cache check: if listing already has API-sourced date, skip API call
    var listings = (await storageGet(KEYS.listings)) || {};
    if (listings[listingId] && listings[listingId].listing_age_source === 'api' && listings[listingId].date_published) {
      return {
        date_published: listings[listingId].date_published,
        listing_age_source: 'api',
        cached: true,
      };
    }

    var apiKey = await storageGet('lv_etsy_api_key');
    if (!apiKey) return { error: 'no_api_key', message: 'No Etsy API key configured' };

    // Respect rate limit backoff
    if (isRateLimited()) {
      var waitSec = Math.ceil((rateLimitState.retryAfter - Date.now()) / 1000);
      return { error: 'rate_limited', message: 'Rate limited. Retry in ' + waitSec + 's' };
    }

    var url = 'https://openapi.etsy.com/v3/application/listings/' + listingId;
    var resp = await fetch(url, {
      headers: { 'x-api-key': apiKey }
    });

    // Always read rate-limit headers
    updateRateLimitHeaders(resp);

    if (resp.status === 429) {
      // Rate limited — use retry-after header with exponential backoff
      var retryAfterSec = parseInt(resp.headers.get('retry-after') || '5', 10);
      rateLimitState.consecutiveRetries++;
      var backoff = retryAfterSec * Math.pow(2, Math.min(rateLimitState.consecutiveRetries - 1, 5));
      rateLimitState.retryAfter = Date.now() + (backoff * 1000);
      return { error: 'rate_limited', message: 'Rate limited. Retry in ' + backoff + 's' };
    }

    if (!resp.ok) {
      if (resp.status === 401 || resp.status === 403) {
        return { error: 'invalid_api_key', message: 'Invalid or expired Etsy API key' };
      }
      return { error: 'api_error', message: 'Etsy API returned ' + resp.status };
    }

    var data = await resp.json();
    var ts = data.original_creation_timestamp || data.created_timestamp;
    if (!ts) return { error: 'no_timestamp', message: 'No creation timestamp in API response' };

    // Etsy API returns Unix timestamps in seconds
    var dateObj = new Date(ts * 1000);
    if (isNaN(dateObj.getTime())) return { error: 'invalid_date', message: 'Could not parse timestamp' };

    var isoDate = dateObj.toISOString().slice(0, 10);

    // Update the stored listing with the accurate date (acts as cache)
    listings = (await storageGet(KEYS.listings)) || {};
    if (listings[listingId]) {
      listings[listingId].date_published = isoDate;
      listings[listingId].listing_age_source = 'api';
      await storageSet(KEYS.listings, listings);
    }

    return { date_published: isoDate, listing_age_source: 'api' };
  } catch (err) {
    return { error: 'fetch_error', message: err.message };
  }
}

/**
 * Fetch earliest Wayback Machine snapshot for an Etsy listing URL.
 * Uses the CDX API (no key required) to find when the listing was first archived.
 * Returns { date_published, listing_age_source } or { error }.
 */
async function handleFetchWaybackAge(listingId) {
  try {
    // Cache check: if listing already has API or wayback-sourced date, skip
    var listings = (await storageGet(KEYS.listings)) || {};
    var existing = listings[listingId];
    if (existing && existing.listing_age_source === 'api' && existing.date_published) {
      return { date_published: existing.date_published, listing_age_source: 'api', cached: true };
    }
    if (existing && existing.listing_age_source === 'wayback' && existing.date_published) {
      return { date_published: existing.date_published, listing_age_source: 'wayback', cached: true };
    }

    // CDX API: fetch ALL snapshots (CDX doesn't guarantee chronological order with limit=1)
    var etsyUrl = 'etsy.com/listing/' + listingId;
    var cdxUrl = 'https://web.archive.org/cdx/search/cdx?url=' +
      encodeURIComponent(etsyUrl) +
      '&matchType=prefix&output=json&fl=timestamp&filter=statuscode:200';

    var resp = await fetch(cdxUrl);
    if (!resp.ok) {
      return { error: 'wayback_error', message: 'Wayback Machine returned ' + resp.status };
    }

    var data = await resp.json();
    // CDX returns [[header], [row1], [row2], ...] — first row is header
    if (!data || data.length < 2) {
      return { error: 'no_snapshot', message: 'No Wayback Machine snapshots found for this listing' };
    }

    // Find the EARLIEST timestamp across all snapshots (CDX order is not guaranteed)
    var earliestTs = null;
    for (var si = 1; si < data.length; si++) {
      var snapTs = data[si] && data[si][0];
      if (snapTs && (!earliestTs || snapTs < earliestTs)) {
        earliestTs = snapTs;
      }
    }
    if (!earliestTs) {
      return { error: 'no_snapshot', message: 'No valid snapshots found' };
    }

    // Parse timestamp format: YYYYMMDDhhmmss
    var ts = earliestTs;
    var year = ts.slice(0, 4);
    var month = ts.slice(4, 6);
    var day = ts.slice(6, 8);
    var isoDate = year + '-' + month + '-' + day;

    var dateObj = new Date(isoDate);
    if (isNaN(dateObj.getTime())) {
      return { error: 'invalid_date', message: 'Could not parse Wayback timestamp: ' + ts };
    }

    // Only update storage if this date is EARLIER than what we already have
    listings = (await storageGet(KEYS.listings)) || {};
    if (listings[listingId]) {
      var srcPriority = { 'api': 0, 'json-ld': 1, 'internal-state': 2, 'wayback': 3, 'page-text': 4, 'review-approx': 5 };
      var curPri = srcPriority[listings[listingId].listing_age_source] != null ? srcPriority[listings[listingId].listing_age_source] : 9;
      var newPri = srcPriority['wayback'];
      var useNew = false;

      if (!listings[listingId].date_published) {
        useNew = true;
      } else if (isoDate < listings[listingId].date_published) {
        // Wayback found an earlier date — use it (it's a better minimum age)
        useNew = true;
      } else if (isoDate === listings[listingId].date_published && newPri < curPri) {
        useNew = true;
      }

      if (useNew) {
        listings[listingId].date_published = isoDate;
        listings[listingId].listing_age_source = 'wayback';
        await storageSet(KEYS.listings, listings);
      }
    }

    return { date_published: isoDate, listing_age_source: 'wayback' };
  } catch (err) {
    return { error: 'wayback_fetch_error', message: err.message };
  }
}

// --- CraftPlan Integration Functions ---

async function handleTestCraftPlan() {
  try {
    var url = (await storageGet('lv_craftplan_url')) || 'http://localhost:3461';
    url = url.replace(/\/+$/, '');
    var resp = await fetch(url + '/api/products', { method: 'GET', signal: AbortSignal.timeout(5000) });
    if (resp.ok) {
      return { success: true, url: url, status: resp.status };
    }
    return { success: false, error: 'Server returned ' + resp.status, url: url };
  } catch (err) {
    return { success: false, error: err.message || 'Connection failed', url: '' };
  }
}

async function handleSendToCraftPlan(listingIds) {
  try {
    var url = (await storageGet('lv_craftplan_url')) || 'http://localhost:3461';
    url = url.replace(/\/+$/, '');
    var endpoint = url + '/api/integrations/etsy/import';

    // Gather listings
    var allListings = (await storageGet(KEYS.listings)) || {};
    var listingsArr = [];
    if (listingIds && listingIds.length > 0) {
      for (var i = 0; i < listingIds.length; i++) {
        if (allListings[listingIds[i]]) listingsArr.push(allListings[listingIds[i]]);
      }
    } else {
      var keys = Object.keys(allListings);
      for (var k = 0; k < keys.length; k++) {
        listingsArr.push(allListings[keys[k]]);
      }
    }

    // Gather keywords
    var allKeywords = (await storageGet(KEYS.keywords)) || {};
    var keywordsArr = [];
    var kwKeys = Object.keys(allKeywords);
    for (var ki = 0; ki < kwKeys.length; ki++) {
      var kw = allKeywords[kwKeys[ki]];
      keywordsArr.push({
        keyword: kw.keyword || kwKeys[ki],
        frequency: kw.frequency || kw.count || 1,
        cluster_id: kw.cluster_id || null,
        classification: kw.classification || null,
        demand_score: kw.demand_score || 0,
        avg_price: kw.avg_price || 0,
        avg_favorites: kw.avg_favorites || 0,
        competition_level: kw.competition_level || null,
        listings_count: kw.listings_count || 0,
        scanned_at: kw.scanned_at || new Date().toISOString(),
      });
    }

    // Ensure enrichment before mapping
    if (typeof EtsyAnalysis !== 'undefined' && EtsyAnalysis.enrichAllListings) {
      var scans = (await storageGet(KEYS.scans)) || [];
      EtsyAnalysis.enrichAllListings(listingsArr, scans, 'monthly');
      EtsyAnalysis.rankListings(listingsArr);
    }

    // Map listings to CraftPlan schema
    function mapListing(l) {
      return {
        listing_id: l.listing_id || '',
        url: l.url || '',
        title: l.title || '',
        shop_name: l.shop_name || '',
        shop_url: l.shop_url || '',
        price: l.price || 0,
        original_price: l.original_price || null,
        currency: 'USD',
        rating: l.rating || 0,
        reviews: l.reviews || 0,
        favorites: l.favorites || 0,
        is_bestseller: l.is_bestseller ? 1 : 0,
        is_etsy_pick: l.is_etsy_pick ? 1 : 0,
        is_star_seller: l.is_star_seller ? 1 : 0,
        tags: typeof l.tags === 'string' ? l.tags : JSON.stringify(l.tags || []),
        category: l.category || '',
        source_keyword: l.source_keyword || '',
        listing_age_days: l.listing_age_days || 0,
        listing_age_source: l.listing_age_source || '',
        views_24h: l.views_24h || 0,
        daily_sales: l.daily_sales || 0,
        weekly_sales: l.weekly_sales || 0,
        monthly_sales: l.monthly_sales || 0,
        revenue_estimate: l.revenue_estimate || 0,
        total_revenue: l.total_revenue || 0,
        demand_score: l.demand_score || 0,
        opportunity_score: l.opportunity_score || 0,
        velocity_score: l.velocity_score || 0,
        monthly_trend: l.monthly_trend || '',
        confidence: l.confidence || '',
        classification: l.classification || '',
        scanned_at: l.last_seen || l.scanned_at || new Date().toISOString(),
        // Phase 1: Enhanced extraction fields
        description_raw: (l.description_raw || '').slice(0, 5000),
        description_sections: l.description_sections ? JSON.stringify(l.description_sections) : null,
        image_count: l.image_count || 0,
        image_urls: l.image_urls ? JSON.stringify(l.image_urls) : null,
        has_video: l.has_video ? 1 : 0,
        digital_file_types: l.digital_file_types ? JSON.stringify(l.digital_file_types) : null,
        description_quality_score: l.description_quality_score || 0,
        image_quality_score: l.image_quality_score || 0,
        trust_score: l.trust_score || 0,
        feature_density: l.feature_density || 0,
        moat_score: l.moat_score || 0,
        review_signals: l.review_signals ? JSON.stringify(l.review_signals) : null,
        // Winner ranking fields
        winner_score: l.winner_score || 0,
        winner_tier: l.winner_tier || 'SKIP',
        winner_rank: l.winner_rank || 0,
        deep_scanned: l.deep_scanned ? 1 : 0,
        // Extra enriched fields
        date_published: l.date_published || null,
        daily_views: l.daily_views || 0,
        conversion_rate: l.conversion_rate || 0,
        daily_sales: l.daily_sales || 0,
        total_revenue: l.total_revenue || 0,
      };
    }

    // Batch into chunks of 50
    var BATCH_SIZE = 50;
    var mappedListings = listingsArr.map(mapListing);
    var importId = null;
    var totalImported = 0;
    var totalDeduped = 0;

    for (var bi = 0; bi < mappedListings.length || bi === 0; bi += BATCH_SIZE) {
      var batch = mappedListings.slice(bi, bi + BATCH_SIZE);
      var payload = {
        listings: batch,
        keywords: bi === 0 ? keywordsArr : [], // send keywords only with first batch
      };
      if (importId) payload.import_id = importId;

      // Retry with exponential backoff (3 attempts)
      var success = false;
      for (var attempt = 0; attempt < 3; attempt++) {
        try {
          var resp = await fetch(endpoint, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
            signal: AbortSignal.timeout(15000),
          });
          if (resp.ok) {
            var result = await resp.json();
            if (!importId) importId = result.import_id;
            totalImported += result.imported_listings || 0;
            totalDeduped += result.deduped_listings || 0;
            success = true;
            break;
          }
        } catch (e) {
          // Retry after delay
        }
        if (attempt < 2) {
          await new Promise(function (r) { setTimeout(r, Math.pow(2, attempt) * 1000); });
        }
      }
      if (!success) {
        return {
          success: false,
          error: 'Failed to send batch ' + (Math.floor(bi / BATCH_SIZE) + 1) + ' after 3 attempts',
          import_id: importId,
          total_sent: bi,
          total_imported: totalImported,
        };
      }
      // If no listings, break after first iteration (just keywords)
      if (mappedListings.length === 0) break;
    }

    return {
      success: true,
      import_id: importId,
      total_sent: mappedListings.length,
      total_imported: totalImported,
      total_deduped: totalDeduped,
      keywords_sent: keywordsArr.length,
      craftplan_url: url,
    };
  } catch (err) {
    return { success: false, error: err.message || 'Unknown error' };
  }
}

/**
 * Deep scan: open each listing URL in a background tab, wait for the content script
 * to scrape it (scraper-listing.js), then close the tab. Sequential to avoid overload.
 * Reports progress back to the calling tab via messages.
 *
 * @param {string[]} listingIds - Array of listing IDs to deep scan
 * @param {string[]} urls - Corresponding URLs for each listing
 * @param {number|null} callerTabId - The tab that requested the scan (for progress updates)
 * @returns {Object} result with enriched listings count
 */
async function handleDeepScan(listingIds, urls, callerTabId) {
  if (!listingIds || !listingIds.length || !urls || !urls.length) {
    return { success: false, error: 'No listings to scan' };
  }

  var maxConcurrent = 1; // Sequential to be safe
  var scanDelay = 2000;  // 2s between tabs to avoid detection
  var tabTimeout = 15000; // 15s max per tab
  var scanned = 0;
  var failed = 0;
  var results = [];

  for (var i = 0; i < listingIds.length; i++) {
    var listingId = listingIds[i];
    var url = urls[i];

    // Notify caller of progress
    if (callerTabId) {
      try {
        chrome.tabs.sendMessage(callerTabId, {
          action: 'deepScanProgress',
          current: i + 1,
          total: listingIds.length,
          listingId: listingId,
          status: 'scanning',
        });
      } catch (e) { /* ignore */ }
    }

    try {
      var result = await deepScanSingleListing(listingId, url, tabTimeout);
      if (result && result.listing) {
        scanned++;
        results.push(result.listing);

        // Save enriched data back to storage
        var listings = (await storageGet(KEYS.listings)) || {};
        if (listings[listingId]) {
          // Merge deep-scan data with existing
          var prev = listings[listingId];
          listings[listingId] = Object.assign({}, prev, result.listing, {
            first_seen: prev.first_seen,
            last_seen: new Date().toISOString(),
            deep_scanned: true,
          });
          // Preserve earlier date
          if (prev.date_published && result.listing.date_published) {
            if (prev.date_published < result.listing.date_published) {
              listings[listingId].date_published = prev.date_published;
              listings[listingId].listing_age_source = prev.listing_age_source;
            }
          }
          await storageSet(KEYS.listings, listings);
        }
      } else {
        failed++;
      }
    } catch (err) {
      failed++;
    }

    // Delay between scans
    if (i < listingIds.length - 1) {
      await new Promise(function (r) { setTimeout(r, scanDelay); });
    }
  }

  // Notify caller that scan is complete
  if (callerTabId) {
    try {
      chrome.tabs.sendMessage(callerTabId, {
        action: 'deepScanComplete',
        scanned: scanned,
        failed: failed,
        total: listingIds.length,
      });
    } catch (e) { /* ignore */ }
  }

  return {
    success: true,
    scanned: scanned,
    failed: failed,
    total: listingIds.length,
  };
}

/**
 * Open a single listing in a background tab, scrape it, close the tab.
 */
function deepScanSingleListing(listingId, url, timeout) {
  return new Promise(function (resolve) {
    var tabId = null;
    var timer = null;
    var resolved = false;

    function cleanup() {
      if (resolved) return;
      resolved = true;
      clearTimeout(timer);
      chrome.runtime.onMessage.removeListener(onMessage);
      if (tabId) {
        try { chrome.tabs.remove(tabId); } catch (e) { /* ignore */ }
      }
    }

    function onMessage(msg, sender) {
      if (msg.action === 'deepScanResult' && msg.listingId === listingId && sender.tab && sender.tab.id === tabId) {
        cleanup();
        resolve({ listing: msg.listing });
      }
    }

    chrome.runtime.onMessage.addListener(onMessage);

    // Timeout fallback
    timer = setTimeout(function () {
      cleanup();
      resolve(null);
    }, timeout);

    // Create background tab
    chrome.tabs.create({ url: url, active: false }, function (tab) {
      if (chrome.runtime.lastError || !tab) {
        cleanup();
        resolve(null);
        return;
      }
      tabId = tab.id;

      // The content script (content-main.js) will auto-detect it's a listing page
      // and scrape it. We add a listener for the result.
      // Also inject a message to tell it we want a deep-scan response.
      chrome.tabs.onUpdated.addListener(function onUpdated(updatedTabId, changeInfo) {
        if (updatedTabId === tabId && changeInfo.status === 'complete') {
          chrome.tabs.onUpdated.removeListener(onUpdated);
          // Small delay to let content scripts run
          setTimeout(function () {
            try {
              chrome.tabs.sendMessage(tabId, { action: 'deepScanScrape', listingId: listingId });
            } catch (e) {
              cleanup();
              resolve(null);
            }
          }, 1500);
        }
      });
    });
  });
}

// --- POD Builder Helper Functions ---

// Words to strip when extracting design *theme* keywords
var POD_PRODUCT_WORDS = [
  'shirt', 'tshirt', 't-shirt', 'tee', 'hoodie', 'sweatshirt', 'mug',
  'poster', 'print', 'canvas', 'tote', 'bag', 'case', 'phone', 'sticker',
  'notebook', 'journal', 'wall', 'decor', 'decoration', 'cup',
];
var POD_AUDIENCE_WORDS = [
  'men', 'women', 'her', 'him', 'mom', 'dad', 'kids', 'boys', 'girls',
  'unisex', 'adult', 'toddler', 'baby', 'youth', 'ladies', 'mens', 'womens',
];
var POD_OCCASION_WORDS = [
  'gift', 'gifts', 'birthday', 'christmas', 'holiday', 'valentines',
  'mothers', 'fathers', 'day', 'idea', 'ideas', 'present',
  'easter', 'halloween', 'thanksgiving', 'anniversary', 'wedding',
];
var POD_FILLER_WORDS = [
  'for', 'with', 'and', 'the', 'a', 'an', 'of', 'in', 'on', 'to',
  'is', 'it', 'or', 'by', 'my', 'be', 'so', 'do', 'if', 'no',
  'best', 'great', 'perfect', 'awesome', 'cool', 'new', 'trendy', 'popular',
  'custom', 'personalized', 'unique', 'graphic', 'printed', 'design',
];

// STRONG text indicators — these words almost always mean a text/saying design
var TEXT_STRONG_WORDS = [
  'saying', 'quote', 'sarcastic', 'sassy', 'witty', 'hilarious',
  'comedy', 'pun', 'meme', 'slogan', 'typography', 'lettering',
  'phrase', 'motivational', 'inspirational',
];
// WEAK text indicators — ambiguous, could be text OR graphic
var TEXT_WEAK_WORDS = [
  'funny', 'humor', 'humorous', 'joke', 'retro', 'vintage', 'distressed',
  'text', 'word', 'words',
];

// STRONG graphic indicators — specific subject matter that must be illustrated
var GRAPHIC_STRONG_WORDS = [
  // Animals
  'cat', 'kitten', 'dog', 'puppy', 'sloth', 'bear', 'fox', 'wolf', 'owl',
  'unicorn', 'dinosaur', 'dragon', 'bird', 'bunny', 'rabbit', 'panda',
  'penguin', 'frog', 'bee', 'butterfly', 'whale', 'shark', 'turtle',
  'elephant', 'lion', 'tiger', 'deer', 'raccoon', 'otter', 'axolotl',
  'corgi', 'dachshund', 'pug', 'french bulldog', 'golden retriever',
  // Art styles
  'illustration', 'drawing', 'painting', 'watercolor', 'sketch',
  'kawaii', 'anime', 'cartoon', 'chibi', 'pixel art',
  // Design subjects
  'floral', 'flower', 'botanical', 'landscape', 'portrait',
  'mandala', 'tribal', 'celestial', 'space', 'galaxy', 'mushroom',
  'skeleton', 'skull', 'witch', 'ghost', 'monster',
  'mountain', 'sunset', 'ocean', 'forest', 'garden',
];
// WEAK graphic indicators
var GRAPHIC_WEAK_WORDS = [
  'animal', 'nature', 'wildlife', 'abstract', 'pattern', 'geometric',
  'boho', 'bohemian', 'minimalist', 'aesthetic', 'cottagecore',
];

/**
 * Detect whether a listing is primarily a text/typography design
 * or a graphic/illustration design.
 * Returns 'typography', 'graphic', or 'mixed'.
 */
function detectDesignType(title) {
  var lower = title.toLowerCase();
  var textScore = 0, graphicScore = 0;

  // Strong indicators are worth 3 points
  for (var i = 0; i < TEXT_STRONG_WORDS.length; i++) {
    if (lower.indexOf(TEXT_STRONG_WORDS[i]) !== -1) textScore += 3;
  }
  for (var j = 0; j < GRAPHIC_STRONG_WORDS.length; j++) {
    if (lower.indexOf(GRAPHIC_STRONG_WORDS[j]) !== -1) graphicScore += 3;
  }
  // Weak indicators are worth 1 point
  for (var k = 0; k < TEXT_WEAK_WORDS.length; k++) {
    if (lower.indexOf(TEXT_WEAK_WORDS[k]) !== -1) textScore += 1;
  }
  for (var m = 0; m < GRAPHIC_WEAK_WORDS.length; m++) {
    if (lower.indexOf(GRAPHIC_WEAK_WORDS[m]) !== -1) graphicScore += 1;
  }

  // Quoted text in title is a strong typography signal (e.g. 'Admit It')
  if (/['"\u2018\u2019\u201c\u201d][^'"\u2018\u2019\u201c\u201d]{3,}['"\u2018\u2019\u201c\u201d]/.test(title)) {
    // But only if the quoted text doesn't match an animal/subject
    var quoted = title.match(/['"\u2018\u2019\u201c\u201d]([^'"\u2018\u2019\u201c\u201d]{3,})['"\u2018\u2019\u201c\u201d]/);
    var quotedLower = quoted ? quoted[1].toLowerCase() : '';
    var isSubjectQuote = false;
    for (var q = 0; q < GRAPHIC_STRONG_WORDS.length; q++) {
      if (quotedLower.indexOf(GRAPHIC_STRONG_WORDS[q]) !== -1) { isSubjectQuote = true; break; }
    }
    if (!isSubjectQuote) textScore += 4;
  }

  // Pipe-separated titles (brand | product | details) lean graphic
  if ((lower.match(/\|/g) || []).length >= 2) graphicScore += 2;

  if (graphicScore > textScore) return 'graphic';
  if (textScore > graphicScore) return 'typography';
  // Default to graphic — it's safer to illustrate than to generate random text
  return 'graphic';
}

/**
 * Extract quoted phrases from a title, e.g. 'Admit It' → ['Admit It']
 */
function extractQuotedText(title) {
  var results = [];
  var re = /['"\u2018\u2019\u201c\u201d]([^'"\u2018\u2019\u201c\u201d]{3,})['"\u2018\u2019\u201c\u201d]/g;
  var match;
  while ((match = re.exec(title)) !== null) {
    results.push(match[1].trim());
  }
  return results;
}

/**
 * Extract the design theme/concept from the title.
 * Strips product types, audience, occasion, and filler words.
 * Preserves meaningful descriptors that define the DESIGN itself.
 *
 * For pipe-separated titles (e.g. 'Printed T-Shirt | "Sloth" | FairWear'),
 * analyzes each segment to find the one with the actual subject.
 */
function extractDesignTheme(title) {
  var allStripWords = POD_PRODUCT_WORDS.concat(POD_AUDIENCE_WORDS, POD_OCCASION_WORDS, POD_FILLER_WORDS);

  // Handle pipe-separated titles: find the segment with the most meaningful content
  var segments = title.split(/\s*\|\s*/);
  var bestSegment = title;
  if (segments.length >= 2) {
    // Score each segment: prefer ones with graphic/subject keywords
    var bestScore = -1;
    for (var s = 0; s < segments.length; s++) {
      var seg = segments[s].trim();
      var segLower = seg.toLowerCase();
      var score = 0;
      // Check for graphic subject words
      for (var g = 0; g < GRAPHIC_STRONG_WORDS.length; g++) {
        if (segLower.indexOf(GRAPHIC_STRONG_WORDS[g]) !== -1) score += 5;
      }
      // Check for quoted subject
      if (/['"\u2018\u2019\u201c\u201d]/.test(seg)) score += 3;
      // Penalize product-type segments
      for (var p = 0; p < POD_PRODUCT_WORDS.length; p++) {
        if (segLower.indexOf(POD_PRODUCT_WORDS[p]) !== -1) score -= 2;
      }
      // Penalize brand/material segments
      if (segLower.indexOf('organic') !== -1 || segLower.indexOf('cotton') !== -1) score -= 2;
      if (segLower.indexOf('fairwear') !== -1 || segLower.indexOf('quality') !== -1) score -= 2;
      if (score > bestScore) {
        bestScore = score;
        bestSegment = seg;
      }
    }
  }

  // Clean the best segment
  var cleaned = bestSegment
    .replace(/^[^:]+:\s*/i, '') // remove prefix like "Funny Saying T-Shirt:"
    .replace(/['"\u2018\u2019\u201c\u201d]/g, '') // remove quote marks
    .replace(/\(.*?\)/g, '') // remove parenthetical info
    .trim();

  // If too short, fall back to full title
  if (cleaned.length < 3) cleaned = title;

  var words = cleaned.toLowerCase()
    .replace(/[^a-z0-9\s'-]/g, ' ')
    .split(/\s+/)
    .filter(function (w) { return w.length > 2 && allStripWords.indexOf(w) === -1; });

  var seen = {};
  var result = [];
  for (var i = 0; i < words.length && result.length < 8; i++) {
    if (!seen[words[i]]) {
      seen[words[i]] = true;
      result.push(words[i]);
    }
  }
  return result;
}

var POD_TYPE_KEYWORDS = {
  tshirt: ['t-shirt', 'tshirt', 'tee', 'shirt', 'graphic tee'],
  hoodie: ['hoodie', 'hooded', 'pullover'],
  sweatshirt: ['sweatshirt', 'crewneck', 'crew neck'],
  mug: ['mug', 'coffee mug', 'ceramic', '11oz', '15oz', 'cup'],
  poster: ['poster', 'wall art', 'art print', 'wall decor'],
  canvas: ['canvas', 'canvas print', 'gallery wrap'],
  tote: ['tote', 'tote bag', 'canvas bag', 'shopping bag'],
  phone_case: ['phone case', 'iphone case', 'samsung case'],
  sticker: ['sticker', 'vinyl sticker', 'laptop sticker', 'sticker sheet'],
  notebook: ['notebook', 'journal', 'spiral notebook'],
};

function classifyPodProductType(title) {
  var lower = title.toLowerCase();
  var types = Object.keys(POD_TYPE_KEYWORDS);
  for (var i = 0; i < types.length; i++) {
    var kws = POD_TYPE_KEYWORDS[types[i]];
    for (var j = 0; j < kws.length; j++) {
      if (lower.indexOf(kws[j]) !== -1) return types[i];
    }
  }
  return 'tshirt';
}

/**
 * Detect the main visual subject from the title (animal, object, etc.)
 */
function detectMainSubject(title) {
  var lower = title.toLowerCase();
  // Check for specific animals/subjects in order of specificity
  var subjects = [
    'french bulldog', 'golden retriever', 'dachshund', 'corgi', 'pug',
    'axolotl', 'butterfly', 'penguin', 'raccoon', 'unicorn', 'dinosaur',
    'elephant', 'skeleton', 'mushroom',
    'kitten', 'puppy', 'bunny', 'rabbit',
    'sloth', 'dragon', 'panda', 'turtle', 'whale', 'shark',
    'otter', 'deer', 'wolf', 'bear', 'bird', 'frog',
    'owl', 'bee', 'fox', 'lion', 'tiger',
    'cat', 'dog',
    'skull', 'witch', 'ghost', 'monster',
    'mountain', 'sunset', 'ocean', 'forest', 'garden',
  ];
  for (var i = 0; i < subjects.length; i++) {
    if (lower.indexOf(subjects[i]) !== -1) return subjects[i];
  }
  return null;
}

/**
 * Extract the full saying/quote from listing description.
 * Many Etsy text-based tee listings include the full saying in the description.
 */
function extractFullSaying(description) {
  if (!description) return null;
  var text = description.slice(0, 2000); // Limit for performance

  // Try to find text in quotation marks in the description
  var quotePatterns = [
    /[""\u201c\u201d]([^""\u201c\u201d]{10,80})[""\u201c\u201d]/g,
    /[''\u2018\u2019]([^''\u2018\u2019]{10,80})[''\u2018\u2019]/g,
  ];
  var candidates = [];
  for (var p = 0; p < quotePatterns.length; p++) {
    var match;
    while ((match = quotePatterns[p].exec(text)) !== null) {
      var phrase = match[1].trim();
      // Skip phrases that look like product descriptions, policies, legal, file formats
      var phraseLower = phrase.toLowerCase();
      if (phraseLower.indexOf('shipping') !== -1) continue;
      if (phraseLower.indexOf('return') !== -1) continue;
      if (phraseLower.indexOf('size') !== -1 && phraseLower.indexOf('chart') !== -1) continue;
      if (phraseLower.indexOf('order') !== -1) continue;
      if (phraseLower.indexOf('cotton') !== -1) continue;
      if (phraseLower.indexOf('wash') !== -1) continue;
      if (phraseLower.indexOf('policy') !== -1) continue;
      if (phraseLower.indexOf('commercial') !== -1) continue;
      if (phraseLower.indexOf('license') !== -1) continue;
      if (phraseLower.indexOf('copyright') !== -1) continue;
      if (phraseLower.indexOf('refund') !== -1) continue;
      if (phraseLower.indexOf('digital download') !== -1) continue;
      if (phraseLower.indexOf('instant download') !== -1) continue;
      if (phraseLower.indexOf('please') !== -1) continue;
      if (phraseLower.indexOf('thank you') !== -1) continue;
      if (phraseLower.indexOf('disclaimer') !== -1) continue;
      if (phraseLower.indexOf('terms') !== -1) continue;
      if (phraseLower.indexOf('svg') !== -1) continue;
      if (phraseLower.indexOf('png') !== -1) continue;
      if (phraseLower.indexOf('pdf') !== -1) continue;
      if (phraseLower.indexOf('zip') !== -1) continue;
      if (phraseLower.indexOf('file') !== -1) continue;
      if (phraseLower.indexOf('format') !== -1) continue;
      // Prefer phrases that look like sayings (multiple words, not too long)
      var wordCount = phrase.split(/\s+/).length;
      if (wordCount >= 3 && wordCount <= 15) {
        candidates.push(phrase);
      }
    }
  }

  // Also check for lines that look like all-caps sayings
  var lines = text.split(/[\n\r]+/);
  for (var i = 0; i < Math.min(lines.length, 30); i++) {
    var line = lines[i].trim();
    // All-caps lines with 3+ words are likely the main saying
    var lineLower = line.toLowerCase();
    if (line.length >= 10 && line.length <= 80 && /^[A-Z\s!?.,'''\-]+$/.test(line)) {
      // Skip policy/legal/file-format all-caps lines
      if (lineLower.indexOf('policy') !== -1 || lineLower.indexOf('commercial') !== -1 ||
          lineLower.indexOf('license') !== -1 || lineLower.indexOf('copyright') !== -1 ||
          lineLower.indexOf('shipping') !== -1 || lineLower.indexOf('return') !== -1 ||
          lineLower.indexOf('disclaimer') !== -1 || lineLower.indexOf('terms') !== -1) {
        // skip
      } else {
        var wc = line.split(/\s+/).length;
        if (wc >= 3 && wc <= 15) {
          candidates.unshift(line); // prioritize all-caps
        }
      }
    }
    // Lines starting with ★ or • that contain the saying
    if (/^[★•●▸►]/.test(line) && line.length > 10) {
      var cleanLine = line.replace(/^[★•●▸►]\s*/, '').replace(/[""\u201c\u201d'']/g, '').trim();
      if (cleanLine.length >= 10 && cleanLine.length <= 80) {
        var lwc = cleanLine.split(/\s+/).length;
        if (lwc >= 3 && lwc <= 15) {
          candidates.push(cleanLine);
        }
      }
    }
  }

  return candidates.length > 0 ? candidates[0] : null;
}

/**
 * Generate a high-quality design prompt based on the listing analysis.
 * Produces very different prompts for typography vs. graphic designs.
 */
function generatePodPrompt(title, designType, quotedPhrases, themeKeywords, productType, description) {
  var lower = title.toLowerCase();

  // For typography/text-based products (funny sayings, quotes, slogans)
  if (designType === 'typography') {
    // Try to extract the full saying from the description first
    var fullSaying = extractFullSaying(description);

    // Fall back to quoted phrases from title, then keywords
    var quoteText = fullSaying
      || (quotedPhrases.length > 0 ? quotedPhrases[0] : null)
      || themeKeywords.slice(0, 4).join(' ');

    // Determine the tone
    var tone = 'bold and expressive';
    if (lower.indexOf('sarcastic') !== -1 || lower.indexOf('sassy') !== -1) tone = 'sarcastic and bold';
    if (lower.indexOf('funny') !== -1 || lower.indexOf('humor') !== -1) tone = 'funny and eye-catching';
    if (lower.indexOf('motivational') !== -1 || lower.indexOf('inspirational') !== -1) tone = 'inspirational and uplifting';
    if (lower.indexOf('retro') !== -1 || lower.indexOf('vintage') !== -1) tone = 'retro vintage';

    // If we found the full saying, tell the AI to create a UNIQUE saying with a similar vibe
    var textInstruction = '';
    if (fullSaying) {
      textInstruction = 'The original product features the saying: "' + fullSaying + '". ' +
        'Create a UNIQUE, ORIGINAL saying with a similar ' + tone + ' vibe and theme — ' +
        'DO NOT copy the original text. Invent a new phrase that would appeal to the same audience. ';
    } else {
      textInstruction = 'Create a ' + tone + ' saying inspired by the theme "' + quoteText + '". ' +
        'The saying should be 4-10 words, catchy, and memorable. ';
    }

    return 'Create a bold typography design for a ' + productType + '. ' +
      textInstruction +
      'Use stacked text layout with a mix of bold block letters and script/handwritten accents. ' +
      'Distressed vintage texture. High contrast, white text on dark transparent background. ' +
      'Centered composition, print-ready, no mockup — just the design artwork.';
  }

  // For graphic/illustration products — detect the main subject
  var mainSubject = detectMainSubject(title);
  var subject = mainSubject
    ? mainSubject + (themeKeywords.length > 0 ? ', ' + themeKeywords.slice(0, 3).join(', ') : '')
    : themeKeywords.slice(0, 5).join(', ');

  // Detect art style hints from the title
  var artStyle = 'clean modern illustration, vibrant bold colors, strong outlines';
  if (lower.indexOf('watercolor') !== -1) artStyle = 'soft watercolor painting, artistic brushstrokes, gentle washes';
  else if (lower.indexOf('vintage') !== -1 || lower.indexOf('retro') !== -1) artStyle = 'vintage retro illustration, aged texture, muted warm palette';
  else if (lower.indexOf('cute') !== -1 || lower.indexOf('kawaii') !== -1) artStyle = 'cute kawaii style, soft rounded shapes, pastel colors, adorable expression';
  else if (lower.indexOf('minimalist') !== -1 || lower.indexOf('minimal') !== -1) artStyle = 'minimalist line drawing, clean simple shapes, limited palette';
  else if (lower.indexOf('funny') !== -1 || lower.indexOf('humor') !== -1) artStyle = 'humorous cartoon illustration, expressive character, bold playful style';
  else if (lower.indexOf('sketch') !== -1 || lower.indexOf('hand drawn') !== -1) artStyle = 'detailed hand-drawn sketch, pen and ink style, fine line work';

  // Build the prompt with the actual subject front and center
  var prompt = 'Create a ' + (mainSubject ? mainSubject : 'themed') + ' illustration for a print-on-demand ' + productType + '. ';
  if (mainSubject) {
    prompt += 'Draw a charming, detailed ' + mainSubject + ' as the main subject. ';
  }
  prompt += 'Design concept: ' + subject + '. ';
  prompt += 'Art style: ' + artStyle + '. ';
  prompt += 'White or transparent background, centered composition, high resolution. ';
  prompt += 'This should be standalone artwork ready to print — NOT a product mockup.';

  return prompt;
}

/**
 * Send a single listing to the CraftPlan POD Builder.
 * Extracts design keywords from the title, generates an AI prompt,
 * then opens the POD Builder in a new tab with the payload injected.
 */
async function handleSendToPodBuilder(listingId) {
  try {
    var url = (await storageGet('lv_craftplan_url')) || 'http://localhost:3461';
    url = url.replace(/\/+$/, '');

    // Get listing from storage
    var allListings = (await storageGet(KEYS.listings)) || {};
    var listing = allListings[listingId];
    if (!listing) {
      return { success: false, error: 'Listing not found in storage' };
    }

    var title = listing.title || '';
    var description = listing.description_raw || '';

    // Smart analysis
    var designType = detectDesignType(title);
    var quotedPhrases = extractQuotedText(title);
    var themeKeywords = extractDesignTheme(title);
    var productType = classifyPodProductType(title);

    // Generate high-quality AI prompt (pass description for full saying extraction)
    var suggestedPrompt = generatePodPrompt(title, designType, quotedPhrases, themeKeywords, productType, description);

    // Auto-select appropriate style preset
    var lowerTitle = title.toLowerCase();
    var suggestedStyle = 'vintage'; // default for typography
    if (designType === 'graphic') {
      if (lowerTitle.indexOf('watercolor') !== -1) suggestedStyle = 'watercolor';
      else if (lowerTitle.indexOf('botanical') !== -1 || lowerTitle.indexOf('floral') !== -1) suggestedStyle = 'botanical';
      else if (lowerTitle.indexOf('boho') !== -1 || lowerTitle.indexOf('bohemian') !== -1) suggestedStyle = 'boho';
      else if (lowerTitle.indexOf('minimal') !== -1) suggestedStyle = 'minimalist';
      else if (lowerTitle.indexOf('line art') !== -1 || lowerTitle.indexOf('sketch') !== -1) suggestedStyle = 'line_art';
      else if (lowerTitle.indexOf('abstract') !== -1 || lowerTitle.indexOf('geometric') !== -1) suggestedStyle = 'abstract';
      else if (lowerTitle.indexOf('cute') !== -1 || lowerTitle.indexOf('kawaii') !== -1) suggestedStyle = 'watercolor';
      else if (lowerTitle.indexOf('funny') !== -1 || lowerTitle.indexOf('humor') !== -1) suggestedStyle = 'abstract';
      else suggestedStyle = 'line_art'; // clean line art is a safe default for illustrations
    }

    // Get image URL (first image from listing data)
    var imageUrl = '';
    if (listing.image_urls) {
      try {
        var imgs = typeof listing.image_urls === 'string' ? JSON.parse(listing.image_urls) : listing.image_urls;
        if (Array.isArray(imgs) && imgs.length > 0) imageUrl = imgs[0];
      } catch (e) { /* ignore */ }
    }
    if (!imageUrl && listing.image_url) imageUrl = listing.image_url;

    // Build payload for Product Studio
    var payload = {
      keyword: themeKeywords[0] || listing.source_keyword || '',
      designKeywords: themeKeywords,
      suggestedPrompt: suggestedPrompt,
      suggestedStyle: suggestedStyle,
      designType: designType,
      productType: productType,
      quotedPhrases: quotedPhrases,
      sourceListing: {
        title: title,
        url: listing.url || '',
        imageUrl: imageUrl,
        podScore: listing.winner_score || 0,
        reviews: listing.reviews || 0,
        rating: listing.rating || 0,
        isBestseller: !!listing.is_bestseller,
        price: listing.price || 0,
        shopName: listing.shop_name || '',
      },
      searchQuery: listing.source_keyword || '',
    };

    // Open Product Studio tab
    var podUrl = url + '/product-studio?source=extension';

    var tab = await new Promise(function (resolve) {
      chrome.tabs.create({ url: podUrl, active: true }, function (t) {
        resolve(t);
      });
    });

    if (!tab || !tab.id) {
      return { success: false, error: 'Could not create tab' };
    }

    // Wait for tab to finish loading
    await new Promise(function (resolve) {
      function onUpdated(tabId, changeInfo) {
        if (tabId === tab.id && changeInfo.status === 'complete') {
          chrome.tabs.onUpdated.removeListener(onUpdated);
          resolve();
        }
      }
      chrome.tabs.onUpdated.addListener(onUpdated);
      // Timeout fallback
      setTimeout(function () {
        chrome.tabs.onUpdated.removeListener(onUpdated);
        resolve();
      }, 10000);
    });

    // Small delay for React to hydrate
    await new Promise(function (r) { setTimeout(r, 1500); });

    // Inject payload into localStorage via executeScript
    await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: function (payloadStr) {
        localStorage.setItem('craftplan_sensei_payload', payloadStr);
        window.dispatchEvent(new CustomEvent('craftplan-sensei-ready'));
      },
      args: [JSON.stringify(payload)],
    });

    return { success: true, tabId: tab.id };
  } catch (err) {
    return { success: false, error: err.message || 'Unknown error' };
  }
}

async function handleClearData(dataType) {
  if (dataType === 'listings') {
    await storageSet(KEYS.listings, {});
  } else if (dataType === 'keywords') {
    await storageSet(KEYS.keywords, {});
  } else {
    await storageSet(KEYS.listings, {});
    await storageSet(KEYS.keywords, {});
    await storageSet(KEYS.scans, []);
  }
  return { success: true };
}
