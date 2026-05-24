(function () {
  'use strict';

  var KEYS = (globalThis.EtsyConstants || {}).STORAGE_KEYS || {
    listings: 'lv_listings',
    keywords: 'lv_keywords',
    scans: 'lv_scans',
    settings: 'lv_settings',
    tabCache: 'lv_tab_',
  };
  var LIMITS = (globalThis.EtsyConstants || {}).LIMITS || {
    maxListings: 2000,
    maxKeywords: 500,
    maxScanHistory: 100,
  };

  function getData(key) {
    return new Promise(function (resolve) {
      chrome.storage.local.get(key, function (result) {
        resolve(result[key] || null);
      });
    });
  }

  function setData(key, value) {
    var obj = {};
    obj[key] = value;
    return new Promise(function (resolve) {
      chrome.storage.local.set(obj, resolve);
    });
  }

  // --- Listings ---

  function getListings() {
    return getData(KEYS.listings).then(function (data) { return data || {}; });
  }

  function saveListings(newListings) {
    return getListings().then(function (existing) {
      var now = new Date().toISOString();
      for (var i = 0; i < newListings.length; i++) {
        var l = newListings[i];
        var id = l.listing_id;
        if (!id) continue;
        if (existing[id]) {
          existing[id] = Object.assign({}, existing[id], l, {
            first_seen: existing[id].first_seen,
            last_seen: now,
          });
        } else {
          existing[id] = Object.assign({}, l, { first_seen: now, last_seen: now });
        }
      }
      var ids = Object.keys(existing);
      if (ids.length > LIMITS.maxListings) {
        ids.sort(function (a, b) {
          return (existing[a].last_seen || '').localeCompare(existing[b].last_seen || '');
        });
        var toRemove = ids.length - LIMITS.maxListings;
        for (var r = 0; r < toRemove; r++) delete existing[ids[r]];
      }
      return setData(KEYS.listings, existing).then(function () {
        return { saved: newListings.length, total: Object.keys(existing).length };
      });
    });
  }

  // --- Keywords ---

  function getKeywords() {
    return getData(KEYS.keywords).then(function (data) { return data || {}; });
  }

  function saveKeywords(keywordArray) {
    return getKeywords().then(function (existing) {
      var now = new Date().toISOString();
      for (var i = 0; i < keywordArray.length; i++) {
        var kw = keywordArray[i];
        var key = kw.keyword;
        if (!key) continue;
        if (existing[key]) {
          existing[key].frequency = (existing[key].frequency || 0) + (kw.frequency || 1);
          existing[key].last_updated = now;
          if (kw.avg_price) existing[key].avg_price = kw.avg_price;
          if (kw.demand_score != null) existing[key].demand_score = kw.demand_score;
          if (kw.competition_level) existing[key].competition_level = kw.competition_level;
          if (kw.listings_count) existing[key].listings_count = kw.listings_count;
        } else {
          existing[key] = Object.assign({}, kw, { first_seen: now, last_updated: now });
        }
      }
      var keys = Object.keys(existing);
      if (keys.length > LIMITS.maxKeywords) {
        keys.sort(function (a, b) {
          return (existing[a].last_updated || '').localeCompare(existing[b].last_updated || '');
        });
        var toRemove = keys.length - LIMITS.maxKeywords;
        for (var r = 0; r < toRemove; r++) delete existing[keys[r]];
      }
      return setData(KEYS.keywords, existing);
    });
  }

  // --- Scans ---

  function getScans() {
    return getData(KEYS.scans).then(function (data) { return data || []; });
  }

  function saveScan(scanRecord) {
    return getScans().then(function (scans) {
      scans.unshift(scanRecord);
      if (scans.length > LIMITS.maxScanHistory) {
        scans = scans.slice(0, LIMITS.maxScanHistory);
      }
      return setData(KEYS.scans, scans).then(function () { return scans; });
    });
  }

  // --- Per-tab cache ---

  function setTabCache(tabId, data) {
    return setData(KEYS.tabCache + tabId, data);
  }

  function getTabCache(tabId) {
    return getData(KEYS.tabCache + tabId);
  }

  function clearTabCache(tabId) {
    return new Promise(function (resolve) {
      chrome.storage.local.remove(KEYS.tabCache + tabId, resolve);
    });
  }

  // --- Settings ---

  function getSettings() {
    return getData(KEYS.settings).then(function (data) {
      return Object.assign({ auto_scan: true }, data || {});
    });
  }

  function saveSettings(settings) {
    return setData(KEYS.settings, settings);
  }

  // --- Clear ---

  function clearAll() {
    return new Promise(function (resolve) {
      chrome.storage.local.remove([KEYS.listings, KEYS.keywords, KEYS.scans], resolve);
    });
  }

  function clearListings() { return setData(KEYS.listings, {}); }
  function clearKeywords() { return setData(KEYS.keywords, {}); }

  globalThis.EtsyStorage = {
    getListings: getListings,
    saveListings: saveListings,
    getKeywords: getKeywords,
    saveKeywords: saveKeywords,
    getScans: getScans,
    saveScan: saveScan,
    setTabCache: setTabCache,
    getTabCache: getTabCache,
    clearTabCache: clearTabCache,
    getSettings: getSettings,
    saveSettings: saveSettings,
    clearAll: clearAll,
    clearListings: clearListings,
    clearKeywords: clearKeywords,
  };
})();
