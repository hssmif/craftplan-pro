(function () {
  'use strict';

  var BADGE_COLORS = (globalThis.EtsyConstants || {}).BADGE_COLORS || {};
  var TREND_COLORS = (globalThis.EtsyConstants || {}).TREND_COLORS || { up: '#5CC489', down: '#DE8F88', flat: '#333333' };
  var FONT_IMPORT = (globalThis.EtsyConstants || {}).FONT_IMPORT || '';
  var HOST_ID = 'lv-top-dashboard-host';
  var DETAIL_HOST_ID = 'lv-listing-detail-host';
  var CONF_COLORS = { high: { bg: '#d1fab3', color: '#217005' }, med: { bg: '#fef5e7', color: '#935116' }, low: { bg: '#f3f4f6', color: '#6b7280' } };

  // ===================== State =====================
  var hostEl = null;
  var shadowRoot = null;
  var collapsed = false;
  var activeTab = 'listings'; // 'listings' | 'keywords' | 'history'
  var currentListings = [];
  var currentStats = null;
  var currentTotalResults = null;
  var filters = { bestseller: false, etsy_pick: false, priceMin: 0, priceMax: Infinity, minReviews: 0, ageMax: Infinity };
  var sortKey = 'revenue_estimate';
  var sortDir = 'desc';
  var timeWindow = 'monthly';

  // DOM references (for in-place updates)
  var refs = {};

  // ===================== Helpers =====================
  function fmtNum(n) {
    if (n == null) return 'N/A';
    if (n >= 1000000) return (n / 1000000).toFixed(1) + 'M';
    if (n >= 1000) return (n / 1000).toFixed(1) + 'K';
    return String(Math.round(n));
  }
  function fmtCur(n) {
    if (n == null || n === 0) return '$0';
    if (n >= 1000) return '$' + (n / 1000).toFixed(1) + 'K';
    return '$' + n.toFixed(2);
  }
  function fmtAge(days) {
    if (days == null) return 'N/A';
    if (days < 30) return days + 'd';
    if (days < 365) return Math.round(days / 30) + 'mo';
    return (days / 365).toFixed(1) + 'y';
  }
  function escHtml(s) { return s ? s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;') : ''; }
  function escAttr(s) { return s ? s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;') : ''; }
  function truncate(s, n) { return s && s.length > n ? s.slice(0, n) + '...' : (s || ''); }

  function badgePill(key) {
    var c = BADGE_COLORS[key];
    if (!c) return '';
    return '<span class="lv-badge-pill" style="background:' + c.bg + ';color:' + c.color + ';border-color:' + c.border + ';">' + c.label + '</span>';
  }

  function confPill(conf) {
    var c = CONF_COLORS[conf] || CONF_COLORS.low;
    return '<span class="lv-conf-pill" style="background:' + c.bg + ';color:' + c.color + ';">' + (conf || 'low').toUpperCase() + '</span>';
  }

  function trendIcon(trend) {
    if (trend === 'up') return '<span style="color:' + TREND_COLORS.up + ';font-weight:700">&#9650;</span>';
    if (trend === 'down') return '<span style="color:' + TREND_COLORS.down + ';font-weight:700">&#9660;</span>';
    return '<span style="color:' + TREND_COLORS.flat + '">&#9654;</span>';
  }

  function copyText(text, btn) {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(function () { showCopied(btn); }).catch(function () { fallbackCopy(text, btn); });
    } else { fallbackCopy(text, btn); }
  }
  function fallbackCopy(text, btn) {
    var ta = document.createElement('textarea');
    ta.value = text; ta.style.cssText = 'position:fixed;left:-9999px;';
    document.body.appendChild(ta); ta.select();
    try { document.execCommand('copy'); showCopied(btn); } catch (e) { /* ignore */ }
    document.body.removeChild(ta);
  }
  function showCopied(btn) {
    if (!btn) return;
    btn.textContent = '\u2713 Copied'; btn.classList.add('copied');
    setTimeout(function () { btn.textContent = btn.getAttribute('data-label') || 'Copy'; btn.classList.remove('copied'); }, 1500);
  }

  // ===================== CSS =====================
  function getCSS() {
    return FONT_IMPORT + '\n' +
    ':host { all: initial; display: block; margin: 16px 0; font-family: "Inter", sans-serif; }' +
    '*, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }' +

    /* Topbar container */
    '.lv-topbar { background: #fff; border-radius: 14px; box-shadow: 0 2px 12px rgba(0,0,0,0.08); overflow: hidden; border: 1px solid #e5e7eb; }' +

    /* Header */
    '.lv-topbar-header { display: flex; align-items: center; gap: 10px; padding: 12px 20px; cursor: pointer; user-select: none; }' +
    '.lv-topbar-icon { width: 24px; height: 24px; border-radius: 6px; background: linear-gradient(135deg, #667eea, #764ba2); display: flex; align-items: center; justify-content: center; flex-shrink: 0; }' +
    '.lv-topbar-icon svg { width: 14px; height: 14px; fill: #fff; }' +
    '.lv-topbar-title { font-size: 15px; font-weight: 700; color: #030712; }' +
    '.lv-topbar-count { font-size: 12px; background: #f3f4f6; padding: 3px 10px; border-radius: 10px; color: #6366f1; font-weight: 600; }' +
    '.lv-topbar-chevron { margin-left: auto; width: 28px; height: 28px; border: none; background: #f3f4f6; border-radius: 6px; cursor: pointer; font-size: 12px; color: #6b7280; display: flex; align-items: center; justify-content: center; transition: transform 0.2s; }' +
    '.lv-topbar-chevron.collapsed { transform: rotate(180deg); }' +

    /* Body (collapsible) */
    '.lv-topbar-body { overflow: hidden; transition: max-height 0.3s ease; }' +
    '.lv-topbar-body.open { max-height: 2000px; }' +
    '.lv-topbar-body.closed { max-height: 0; }' +

    /* Summary row */
    '.lv-summary { display: flex; flex-wrap: wrap; align-items: center; gap: 12px; padding: 0 20px 14px; }' +
    '.lv-pills { display: flex; gap: 6px; flex-shrink: 0; }' +
    '.lv-pill { font-size: 12px; font-weight: 600; padding: 4px 12px; border-radius: 10px; white-space: nowrap; }' +
    '.lv-pill--new { background: #d1fab3; color: #217005; }' +
    '.lv-pill--evergreen { background: #b3f5e5; color: #007f5f; }' +
    '.lv-pill--trending { background: #fde9ee; color: #c0123c; }' +
    '.lv-metrics { display: flex; gap: 8px; flex: 1; justify-content: center; flex-wrap: wrap; }' +
    '.lv-tile { text-align: center; padding: 6px 10px; border-radius: 8px; background: #f9fafb; border: 1px solid #e5e7eb; min-width: 75px; }' +
    '.lv-tile-val { font-size: 17px; font-weight: 700; color: #030712; line-height: 1.2; }' +
    '.lv-tile-lbl { font-size: 9px; font-weight: 500; color: #6b7280; text-transform: uppercase; letter-spacing: 0.3px; margin-top: 2px; }' +
    '.lv-est { font-size: 8px; color: #9ca3af; font-style: italic; font-weight: 400; }' +
    '.lv-tile--est { border-style: dashed; background: #fefefe; }' +
    '.lv-tile--real { border-left: 3px solid #667eea; }' +
    '.lv-ld-tile--est { border-style: dashed; background: #fefefe; }' +
    '.lv-ld-tile--real { border-left: 3px solid #667eea; }' +
    '.lv-actual-badge { font-size: 8px; color: #667eea; font-weight: 700; text-transform: uppercase; }' +
    '.lv-est-conf { font-size: 8px; display: inline-block; padding: 1px 4px; border-radius: 3px; margin-left: 2px; font-weight: 500; }' +
    '.lv-est-conf--high { background: #d1fab3; color: #217005; }' +
    '.lv-est-conf--med { background: #fef5e7; color: #935116; }' +
    '.lv-est-conf--low { background: #f3f4f6; color: #6b7280; }' +
    '.lv-controls { display: flex; gap: 6px; align-items: center; flex-shrink: 0; flex-wrap: wrap; }' +
    '.lv-select { padding: 4px 8px; border-radius: 6px; border: 1px solid #e5e7eb; font-size: 11px; font-family: "Inter",sans-serif; color: #374151; background: #fff; }' +
    '.lv-toggle { padding: 4px 10px; border-radius: 6px; border: 1px solid #e5e7eb; background: #fff; cursor: pointer; font-size: 11px; font-family: "Inter",sans-serif; color: #374151; transition: all 0.15s; }' +
    '.lv-toggle.active { background: #030712; color: #fff; border-color: #030712; }' +

    /* Tabs */
    '.lv-tabs { display: flex; gap: 4px; padding: 0 20px 10px; border-bottom: 1px solid #e5e7eb; }' +
    '.lv-tab { padding: 6px 16px; border-radius: 8px; border: none; background: transparent; cursor: pointer; font-size: 12px; font-weight: 500; color: #6b7280; font-family: "Inter",sans-serif; transition: all 0.15s; }' +
    '.lv-tab:hover { background: #f3f4f6; }' +
    '.lv-tab.active { background: #667eea; color: #fff; }' +

    /* Tab content */
    '.lv-tab-content { display: none; }' +
    '.lv-tab-content.active { display: block; }' +

    /* Listings filters row */
    '.lv-filters { display: flex; flex-wrap: wrap; gap: 8px; padding: 10px 20px; align-items: center; border-bottom: 1px solid #f3f4f6; }' +
    '.lv-filter-input { width: 70px; padding: 4px 6px; border-radius: 6px; border: 1px solid #e5e7eb; font-size: 11px; font-family: "Inter",sans-serif; }' +
    '.lv-filter-label { font-size: 11px; color: #6b7280; }' +

    /* Table */
    '.lv-table-wrap { max-height: 420px; overflow: auto; }' +
    '.lv-table { width: 100%; border-collapse: collapse; font-size: 12px; }' +
    '.lv-table thead { position: sticky; top: 0; z-index: 2; }' +
    '.lv-table th { background: #f9fafb; padding: 8px 8px; text-align: left; font-weight: 600; color: #374151; border-bottom: 1px solid #e5e7eb; cursor: pointer; white-space: nowrap; user-select: none; font-size: 11px; }' +
    '.lv-table th:hover { background: #f0f0f0; }' +
    '.lv-table th .sa { font-size: 9px; margin-left: 3px; }' +
    '.lv-table td { padding: 6px 8px; border-bottom: 1px solid #f3f4f6; color: #030712; vertical-align: middle; }' +
    '.lv-table tr:hover td { background: #f9fafb; }' +
    '.lv-title-cell { max-width: 200px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }' +
    '.lv-title-cell a { color: #667eea; text-decoration: none; }' +
    '.lv-title-cell a:hover { text-decoration: underline; }' +

    /* Badge pills inline */
    '.lv-badge-pill { display: inline-block; font-size: 9px; font-weight: 600; padding: 1px 5px; border-radius: 1rem; margin-right: 2px; border: 1px solid; white-space: nowrap; }' +
    '.lv-conf-pill { display: inline-block; font-size: 9px; font-weight: 600; padding: 2px 6px; border-radius: 4px; }' +

    /* Expand icon */
    '.lv-exp { cursor: pointer; font-size: 9px; color: #6b7280; transition: transform 0.15s; display: inline-block; }' +
    '.lv-exp.open { transform: rotate(90deg); }' +

    /* Tag row */
    '.lv-tag-row td { padding: 8px; background: #fafafa; }' +
    '.lv-tags-box { background: #f5f5f5; border: 1px solid #F0F0F0; border-radius: 9px; padding: 8px 10px; display: flex; flex-wrap: wrap; gap: 5px; align-items: center; }' +
    '.lv-tag-chip { font-size: 10px; padding: 2px 8px; border-radius: 5px; background: #fff; border: 1px solid #e5e7eb; color: #374151; white-space: nowrap; cursor: pointer; }' +
    '.lv-tag-chip:hover { background: #e5e7eb; }' +
    '.lv-copy-btn { padding: 3px 10px; border-radius: 5px; border: 1px solid #667eea; background: transparent; color: #667eea; font-size: 10px; font-weight: 600; cursor: pointer; font-family: "Inter",sans-serif; white-space: nowrap; margin-left: auto; transition: all 0.15s; }' +
    '.lv-copy-btn:hover { background: #667eea; color: #fff; }' +
    '.lv-copy-btn.copied { border-color: #5CC489; color: #5CC489; }' +

    /* Keywords table */
    '.lv-kw-bar-bg { height: 6px; border-radius: 3px; background: #e5e7eb; width: 70px; display: inline-block; vertical-align: middle; }' +
    '.lv-kw-bar { height: 6px; border-radius: 3px; background: #667eea; display: block; }' +

    /* History */
    '.lv-hist-detail { background: #f9fafb; padding: 8px 12px; font-size: 11px; color: #374151; }' +
    '.lv-hist-detail ul { list-style: none; margin: 4px 0; padding: 0; }' +
    '.lv-hist-detail li { padding: 2px 0; }' +

    /* Listing detail panel */
    '.lv-ld { background: #fff; border-radius: 14px; box-shadow: 0 2px 12px rgba(0,0,0,0.08); border: 1px solid #e5e7eb; padding: 16px 20px; margin-bottom: 16px; font-family: "Inter",sans-serif; }' +
    '.lv-ld-header { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; margin-bottom: 14px; }' +
    '.lv-ld-metrics { display: flex; gap: 8px; flex-wrap: wrap; }' +
    '.lv-ld-tile { text-align: center; padding: 6px 10px; border-radius: 8px; background: #f9fafb; border: 1px solid #e5e7eb; min-width: 80px; }' +
    '.lv-ld-tile-val { font-size: 16px; font-weight: 700; color: #030712; }' +
    '.lv-ld-tile-lbl { font-size: 9px; font-weight: 500; color: #6b7280; text-transform: uppercase; margin-top: 2px; }' +
    '.lv-ld-section { margin-top: 12px; }' +
    '.lv-ld-section h4 { font-size: 12px; font-weight: 600; color: #374151; margin-bottom: 8px; }' +
    '.lv-kw-insight { display: flex; align-items: center; gap: 8px; padding: 3px 0; font-size: 11px; }' +
    '.lv-kw-insight-tag { font-weight: 500; color: #030712; }' +
    '.lv-kw-insight-score { font-size: 10px; color: #6b7280; }' +
    '.lv-notes-area { width: 100%; min-height: 60px; padding: 8px; border: 1px solid #e5e7eb; border-radius: 8px; font-size: 12px; font-family: "Inter",sans-serif; resize: vertical; }' +
    '.lv-notes-saved { font-size: 10px; color: #5CC489; font-weight: 500; margin-left: 8px; opacity: 0; transition: opacity 0.3s; }' +
    '.lv-notes-saved.show { opacity: 1; }' +

    /* Footer */
    '.lv-footer { display: flex; align-items: center; justify-content: space-between; padding: 8px 20px; border-top: 1px solid #e5e7eb; }' +
    '.lv-footer-info { font-size: 11px; color: #6b7280; }' +
    '.lv-export-btn { padding: 5px 14px; border-radius: 6px; border: none; background: #667eea; color: #fff; font-size: 11px; font-weight: 500; cursor: pointer; font-family: "Inter",sans-serif; }' +
    '.lv-export-btn:hover { background: #5a6fd6; }';
  }

  // ===================== Injection =====================
  function findInjectionPoint() {
    var sels = ['[data-search-results]', 'div[data-search-results-lg]', '.search-listings-group', 'ul.responsive-listing-grid'];
    for (var i = 0; i < sels.length; i++) {
      var el = document.querySelector(sels[i]);
      if (el && el.parentNode) return { parent: el.parentNode, before: el };
    }
    var main = document.querySelector('main');
    if (main) return { parent: main, before: main.firstChild };
    return null;
  }

  // ===================== Create Host =====================
  function createHost() {
    hostEl = document.createElement('div');
    hostEl.id = HOST_ID;
    shadowRoot = hostEl.attachShadow({ mode: 'closed' });

    var style = document.createElement('style');
    style.textContent = getCSS();
    shadowRoot.appendChild(style);

    var topbar = document.createElement('div');
    topbar.className = 'lv-topbar';

    // Header
    var header = document.createElement('div');
    header.className = 'lv-topbar-header';
    header.innerHTML =
      '<div class="lv-topbar-icon"><svg viewBox="0 0 24 24"><path d="M3 13h2v-2H3v2zm0 4h2v-2H3v2zm0-8h2V7H3v2zm4 4h14v-2H7v2zm0 4h14v-2H7v2zM7 7v2h14V7H7z"/></svg></div>' +
      '<span class="lv-topbar-title">ListingView</span>' +
      '<span class="lv-topbar-count" id="lv-count">0 listings</span>';
    var chevron = document.createElement('button');
    chevron.className = 'lv-topbar-chevron' + (collapsed ? ' collapsed' : '');
    chevron.innerHTML = '&#9650;';
    chevron.addEventListener('click', function (e) {
      e.stopPropagation();
      collapsed = !collapsed;
      chevron.classList.toggle('collapsed', collapsed);
      body.className = 'lv-topbar-body ' + (collapsed ? 'closed' : 'open');
      try { localStorage.setItem('lv-topbar-collapsed', collapsed ? '1' : ''); } catch (e) {}
    });
    header.appendChild(chevron);
    header.addEventListener('click', function () { chevron.click(); });
    topbar.appendChild(header);

    // Restore collapsed state
    try { collapsed = !!localStorage.getItem('lv-topbar-collapsed'); } catch (e) {}

    // Body
    var body = document.createElement('div');
    body.className = 'lv-topbar-body ' + (collapsed ? 'closed' : 'open');

    // Summary row
    var summary = document.createElement('div');
    summary.className = 'lv-summary';
    summary.innerHTML =
      '<div class="lv-pills">' +
        '<span class="lv-pill lv-pill--new" id="lv-pill-new">New: 0</span>' +
        '<span class="lv-pill lv-pill--evergreen" id="lv-pill-eg">Evergreen: 0</span>' +
        '<span class="lv-pill lv-pill--trending" id="lv-pill-tr">Trending: 0</span>' +
      '</div>' +
      '<div class="lv-metrics" id="lv-metrics"></div>' +
      '<div class="lv-controls" id="lv-controls"></div>';
    body.appendChild(summary);

    // Tabs
    var tabsRow = document.createElement('div');
    tabsRow.className = 'lv-tabs';
    var tabNames = [{ k: 'listings', l: 'Listings' }, { k: 'keywords', l: 'Keywords' }, { k: 'history', l: 'History' }];
    for (var ti = 0; ti < tabNames.length; ti++) {
      (function (tk, tl) {
        var btn = document.createElement('button');
        btn.className = 'lv-tab' + (activeTab === tk ? ' active' : '');
        btn.textContent = tl;
        btn.setAttribute('data-tab', tk);
        btn.addEventListener('click', function () {
          activeTab = tk;
          renderTabContent();
          var allTabs = shadowRoot.querySelectorAll('.lv-tab');
          for (var x = 0; x < allTabs.length; x++) allTabs[x].classList.toggle('active', allTabs[x].getAttribute('data-tab') === tk);
        });
        tabsRow.appendChild(btn);
      })(tabNames[ti].k, tabNames[ti].l);
    }
    body.appendChild(tabsRow);

    // Tab content container
    var tabContent = document.createElement('div');
    tabContent.id = 'lv-tab-content';
    body.appendChild(tabContent);

    // Footer
    var footer = document.createElement('div');
    footer.className = 'lv-footer';
    footer.innerHTML = '<span class="lv-footer-info" id="lv-footer-info"></span>';
    var exportBtn = document.createElement('button');
    exportBtn.className = 'lv-export-btn';
    exportBtn.textContent = 'Export CSV';
    exportBtn.addEventListener('click', function () {
      var type = activeTab === 'keywords' ? 'keywords' : 'listings';
      chrome.runtime.sendMessage({ action: 'exportCSV', dataType: type });
    });
    footer.appendChild(exportBtn);
    body.appendChild(footer);

    topbar.appendChild(body);
    shadowRoot.appendChild(topbar);
  }

  // ===================== Render Summary Metrics =====================
  function renderSummary() {
    if (!shadowRoot) return;
    var listings = getFilteredListings();
    var stats = currentStats;
    if (!stats && globalThis.EtsyAnalysis && currentListings.length > 0) {
      stats = globalThis.EtsyAnalysis.computeAggregateStats(listings);
    }
    if (!stats) stats = {};

    // Count pill
    var countEl = shadowRoot.getElementById('lv-count');
    if (countEl) countEl.textContent = currentListings.length + ' listings';

    // Classification pills
    var counts = globalThis.EtsyAnalysis ? globalThis.EtsyAnalysis.computeClassificationCounts(currentListings) : { new: 0, evergreen: 0, trending: 0 };
    var pillNew = shadowRoot.getElementById('lv-pill-new');
    var pillEg = shadowRoot.getElementById('lv-pill-eg');
    var pillTr = shadowRoot.getElementById('lv-pill-tr');
    if (pillNew) pillNew.textContent = 'New: ' + (counts.new || 0);
    if (pillEg) pillEg.textContent = 'Evergreen: ' + (counts.evergreen || 0);
    if (pillTr) pillTr.textContent = 'Trending: ' + (counts.trending || 0);

    // Metric tiles
    var metricsEl = shadowRoot.getElementById('lv-metrics');
    if (metricsEl) {
      // Re-compute stats for filtered set
      if (globalThis.EtsyAnalysis && listings.length > 0) {
        stats = globalThis.EtsyAnalysis.computeAggregateStats(listings);
      }
      var total = stats.total || listings.length || 1;
      var outlierCount = 0;
      var upCount = 0, downCount = 0;
      for (var i = 0; i < listings.length; i++) {
        if (listings[i].outlier_class) outlierCount++;
        if (listings[i].monthly_trend === 'up') upCount++;
        else if (listings[i].monthly_trend === 'down') downCount++;
      }
      var avgTrend = upCount > downCount ? 'up' : downCount > upCount ? 'down' : 'flat';

      // Determine majority confidence across filtered listings
      var confCounts = { high: 0, med: 0, low: 0 };
      for (var ci = 0; ci < listings.length; ci++) {
        var c = listings[ci].confidence || 'low';
        if (confCounts[c] != null) confCounts[c]++;
      }
      var avgConf = confCounts.high >= confCounts.med && confCounts.high >= confCounts.low ? 'high'
        : confCounts.med >= confCounts.low ? 'med' : 'low';
      var confTag = '<span class="lv-est-conf lv-est-conf--' + avgConf + '">' + avgConf.toUpperCase() + '</span>';

      var tiles = [
        { v: fmtNum(currentTotalResults || total), l: 'Competition', real: true },
        { v: fmtAge(stats.avg_listing_age_days), l: 'Avg Age', real: stats.avg_listing_age_days != null },
        { v: String(outlierCount), l: 'Outliers', real: true },
        { v: '', l: 'Avg Mo Trend', html: trendIcon(avgTrend), real: false },
        { v: (total > 0 ? ((stats.total_daily_sales || 0) / total).toFixed(1) : '0'), l: 'Avg Daily Sales <span class="lv-est">Est.</span> ' + confTag, real: false },
        { v: (total > 0 ? ((stats.total_weekly_sales || 0) / total).toFixed(1) : '0'), l: 'Avg Wk Sales <span class="lv-est">Est.</span> ' + confTag, real: false },
        { v: fmtNum(total > 0 ? Math.round((stats.total_monthly_sales || 0) / total) : 0), l: 'Avg Mo Sales <span class="lv-est">Est.</span> ' + confTag, real: false },
        { v: fmtCur(total > 0 ? Math.round((stats.total_revenue || 0) / total) : 0), l: 'Avg Mo Rev <span class="lv-est">Est.</span> ' + confTag, real: false },
        { v: stats.avg_conversion != null ? stats.avg_conversion.toFixed(1) + '%' : 'N/A', l: 'Avg Conv <span class="lv-est">Est.</span> ' + confTag, real: false },
        { v: fmtNum(stats.total_favorites || 0), l: 'Favorites', real: true },
      ];
      var html = '';
      for (var t = 0; t < tiles.length; t++) {
        var tileCls = 'lv-tile' + (tiles[t].real ? ' lv-tile--real' : ' lv-tile--est');
        html += '<div class="' + tileCls + '"><div class="lv-tile-val">' + (tiles[t].html || escHtml(tiles[t].v)) + '</div><div class="lv-tile-lbl">' + tiles[t].l + '</div></div>';
      }
      metricsEl.innerHTML = html;
    }

    // Controls
    var ctrlEl = shadowRoot.getElementById('lv-controls');
    if (ctrlEl && !ctrlEl.hasChildNodes()) {
      // Time window select
      var twSel = document.createElement('select');
      twSel.className = 'lv-select';
      var twOpts = [{ v: 'daily', l: 'Daily' }, { v: 'weekly', l: 'Weekly' }, { v: 'monthly', l: 'Monthly' }];
      for (var tw = 0; tw < twOpts.length; tw++) {
        var o = document.createElement('option');
        o.value = twOpts[tw].v; o.textContent = twOpts[tw].l;
        if (twOpts[tw].v === timeWindow) o.selected = true;
        twSel.appendChild(o);
      }
      twSel.addEventListener('change', function () {
        timeWindow = twSel.value;
        document.dispatchEvent(new CustomEvent('lv-time-window-change', { detail: { timeWindow: timeWindow } }));
      });
      ctrlEl.appendChild(twSel);

      // Bestseller toggle
      var bsBtn = document.createElement('button');
      bsBtn.className = 'lv-toggle'; bsBtn.textContent = 'Bestsellers';
      bsBtn.addEventListener('click', function () {
        filters.bestseller = !filters.bestseller;
        bsBtn.classList.toggle('active', filters.bestseller);
        renderAll();
      });
      ctrlEl.appendChild(bsBtn);

      // Etsy's Picks toggle
      var epBtn = document.createElement('button');
      epBtn.className = 'lv-toggle'; epBtn.textContent = "Etsy's Picks";
      epBtn.addEventListener('click', function () {
        filters.etsy_pick = !filters.etsy_pick;
        epBtn.classList.toggle('active', filters.etsy_pick);
        renderAll();
      });
      ctrlEl.appendChild(epBtn);
    }
  }

  // ===================== Filter =====================
  function getFilteredListings() {
    var result = currentListings;
    if (filters.bestseller) result = result.filter(function (l) { return l.is_bestseller; });
    if (filters.etsy_pick) result = result.filter(function (l) { return l.is_etsy_pick; });
    if (filters.priceMin > 0) result = result.filter(function (l) { return (l.price || 0) >= filters.priceMin; });
    if (filters.priceMax < Infinity) result = result.filter(function (l) { return (l.price || 0) <= filters.priceMax; });
    if (filters.minReviews > 0) result = result.filter(function (l) { return (l.reviews || 0) >= filters.minReviews; });
    if (filters.ageMax < Infinity) result = result.filter(function (l) { return (l.listing_age_days || 0) <= filters.ageMax; });
    return result;
  }

  function sortListings(arr) {
    var k = sortKey, d = sortDir === 'asc' ? 1 : -1;
    arr.sort(function (a, b) {
      var va = a[k], vb = b[k];
      if (va == null) va = k === 'conversion_rate' ? -1 : 0;
      if (vb == null) vb = k === 'conversion_rate' ? -1 : 0;
      if (typeof va === 'string') return d * (va || '').localeCompare(vb || '');
      return d * (va - vb);
    });
  }

  // ===================== Listings Tab =====================
  function renderListingsTab(container) {
    var filtered = getFilteredListings();
    sortListings(filtered);

    // Filters row
    var filtersHtml = '<div class="lv-filters">' +
      '<span class="lv-filter-label">Price:</span>' +
      '<input class="lv-filter-input" type="number" id="lv-f-pmin" placeholder="Min" value="' + (filters.priceMin || '') + '">' +
      '<span class="lv-filter-label">-</span>' +
      '<input class="lv-filter-input" type="number" id="lv-f-pmax" placeholder="Max" value="' + (filters.priceMax < Infinity ? filters.priceMax : '') + '">' +
      '<span class="lv-filter-label">Min Reviews:</span>' +
      '<input class="lv-filter-input" type="number" id="lv-f-rev" placeholder="0" value="' + (filters.minReviews || '') + '">' +
      '<span class="lv-filter-label">Age:</span>' +
      '<select class="lv-select" id="lv-f-age">' +
        '<option value="">Any</option>' +
        '<option value="30"' + (filters.ageMax === 30 ? ' selected' : '') + '>&lt; 30d</option>' +
        '<option value="90"' + (filters.ageMax === 90 ? ' selected' : '') + '>&lt; 3mo</option>' +
        '<option value="365"' + (filters.ageMax === 365 ? ' selected' : '') + '>&lt; 1y</option>' +
      '</select>' +
      '<span class="lv-filter-label">Sort:</span>' +
      '<select class="lv-select" id="lv-f-sort">' +
        sortOpt('revenue_estimate', 'Mo. Revenue') +
        sortOpt('total_revenue', 'Total Revenue') +
        sortOpt('daily_sales', 'Daily Sales') +
        sortOpt('weekly_sales', 'Wk. Sales') +
        sortOpt('monthly_sales', 'Mo. Sales') +
        sortOpt('favorites', 'Favorites') +
        sortOpt('reviews', 'Reviews') +
        sortOpt('listing_age_days', 'Age') +
        sortOpt('price', 'Price') +
        sortOpt('confidence', 'Confidence') +
        sortOpt('demand_score', 'Demand') +
      '</select>' +
      '</div>';

    function sortOpt(v, l) {
      return '<option value="' + v + '"' + (sortKey === v ? ' selected' : '') + '>' + l + '</option>';
    }

    // Table
    var cols = 15;
    var tableHtml = '<div class="lv-table-wrap"><table class="lv-table"><thead><tr>' +
      '<th style="width:22px"></th>' +
      th('Title', 'title', 180) + th('Price', 'price', 55) +
      th('Reviews', 'reviews', 60) + th('Favs', 'favorites', 50) +
      '<th style="width:100px">Badges</th>' +
      th('Age', 'listing_age_days', 45) +
      thEst('Daily', 'daily_sales', 50) + thEst('Weekly', 'weekly_sales', 55) +
      thEst('Mo Sales', 'monthly_sales', 55) + thEst('Mo Rev', 'revenue_estimate', 60) +
      '<th style="width:35px">Trend</th>' +
      thEst('Total Rev', 'total_revenue', 60) + thEst('Conv', 'conversion_rate', 45) +
      th('Conf', 'confidence', 45) +
      '</tr></thead><tbody>';

    for (var i = 0; i < filtered.length; i++) {
      var l = filtered[i];
      var badges = (l.badges || []).map(function (b) { return badgePill(b); }).join('');
      var hasTags = Array.isArray(l.tags) && l.tags.length > 0;
      var exp = hasTags ? '<span class="lv-exp" data-row="' + i + '">&#9654;</span>' : '';
      var conv = l.conversion_rate != null ? l.conversion_rate.toFixed(1) + '%' : 'N/A';

      tableHtml += '<tr data-lr="' + i + '">' +
        '<td>' + exp + '</td>' +
        '<td class="lv-title-cell"><a href="' + escAttr(l.url || '') + '" target="_blank">' + escHtml(truncate(l.title, 40)) + '</a></td>' +
        '<td>$' + (l.price || 0).toFixed(2) + '</td>' +
        '<td>' + (l.reviews || 0) + ' <span style="color:#6b7280;font-size:10px">' + (l.rating ? '\u2605' + l.rating.toFixed(1) : '') + '</span></td>' +
        '<td>' + (l.favorites || 0) + '</td>' +
        '<td>' + badges + '</td>' +
        '<td' + (l.listing_age_source ? ' title="Source: ' + escAttr(l.listing_age_source) + '"' : (!l.date_published ? ' title="Age unknown" style="color:#9ca3af;font-style:italic"' : '')) + '>' + escHtml(l.listing_age_label || 'N/A') + '</td>' +
        '<td style="font-style:italic;color:#6b7280">' + (l.daily_sales || 0).toFixed(1) + '</td>' +
        '<td style="font-style:italic;color:#6b7280">' + (l.weekly_sales || 0).toFixed(1) + '</td>' +
        '<td style="font-style:italic;color:#6b7280">' + (l.monthly_sales || 0).toFixed(1) + '</td>' +
        '<td style="font-style:italic;color:#6b7280">' + fmtCur(l.revenue_estimate) + '</td>' +
        '<td>' + trendIcon(l.monthly_trend) + '</td>' +
        '<td style="font-style:italic;color:#6b7280">' + fmtCur(l.total_revenue) + '</td>' +
        '<td style="font-style:italic;color:#6b7280">' + conv + '</td>' +
        '<td>' + confPill(l.confidence) + '</td>' +
        '</tr>';

      if (hasTags) {
        tableHtml += '<tr class="lv-tag-row" data-tr="' + i + '" style="display:none"><td colspan="' + cols + '"><div class="lv-tags-box">';
        for (var tg = 0; tg < l.tags.length; tg++) {
          tableHtml += '<span class="lv-tag-chip" data-tag="' + escAttr(l.tags[tg]) + '" title="Click to copy">' + escHtml(l.tags[tg]) + '</span>';
        }
        tableHtml += '<button class="lv-copy-btn" data-label="Copy Tags" data-ti="' + i + '">Copy Tags</button></div></td></tr>';
      }
    }
    tableHtml += '</tbody></table></div>';

    container.innerHTML = filtersHtml + tableHtml;

    // Footer info
    var info = shadowRoot.getElementById('lv-footer-info');
    if (info) info.textContent = filtered.length + ' of ' + currentListings.length + ' listings shown';

    // Wire filter inputs
    wireFilterInputs(container, filtered);
  }

  function th(label, key, w) {
    var arrow = sortKey === key ? '<span class="sa">' + (sortDir === 'asc' ? '&#9650;' : '&#9660;') + '</span>' : '';
    return '<th data-sort="' + key + '" style="width:' + w + 'px">' + label + arrow + '</th>';
  }

  function thEst(label, key, w) {
    var arrow = sortKey === key ? '<span class="sa">' + (sortDir === 'asc' ? '&#9650;' : '&#9660;') + '</span>' : '';
    return '<th data-sort="' + key + '" style="width:' + w + 'px;font-style:italic">' + label + ' <span class="lv-est">Est.</span>' + arrow + '</th>';
  }

  function wireFilterInputs(container, filtered) {
    // Sort headers
    var ths = container.querySelectorAll('th[data-sort]');
    for (var s = 0; s < ths.length; s++) {
      ths[s].addEventListener('click', function () {
        var k = this.getAttribute('data-sort');
        if (sortKey === k) sortDir = sortDir === 'asc' ? 'desc' : 'asc';
        else { sortKey = k; sortDir = 'desc'; }
        renderAll();
      });
    }

    // Expand toggles
    var exps = container.querySelectorAll('.lv-exp');
    for (var e = 0; e < exps.length; e++) {
      exps[e].addEventListener('click', function (ev) {
        ev.stopPropagation();
        var idx = this.getAttribute('data-row');
        var tr = container.querySelector('tr[data-tr="' + idx + '"]');
        if (tr) {
          var isOpen = tr.style.display !== 'none';
          tr.style.display = isOpen ? 'none' : 'table-row';
          this.classList.toggle('open', !isOpen);
        }
      });
    }

    // Copy tag buttons
    var copyBtns = container.querySelectorAll('.lv-copy-btn');
    for (var cb = 0; cb < copyBtns.length; cb++) {
      copyBtns[cb].addEventListener('click', function (ev) {
        ev.stopPropagation();
        var idx = parseInt(this.getAttribute('data-ti'), 10);
        if (filtered[idx] && filtered[idx].tags) copyText(filtered[idx].tags.join('\n'), this);
      });
    }

    // Single tag copy
    var chips = container.querySelectorAll('.lv-tag-chip');
    for (var ch = 0; ch < chips.length; ch++) {
      chips[ch].addEventListener('click', function () {
        var tag = this.getAttribute('data-tag');
        if (tag) {
          copyText(tag, null);
          var orig = this.style.background;
          this.style.background = '#d1fab3';
          var self = this;
          setTimeout(function () { self.style.background = orig || ''; }, 600);
        }
      });
    }

    // Filter inputs
    var pmin = container.querySelector('#lv-f-pmin');
    var pmax = container.querySelector('#lv-f-pmax');
    var rev = container.querySelector('#lv-f-rev');
    var age = container.querySelector('#lv-f-age');
    var sortSel = container.querySelector('#lv-f-sort');

    function applyFilters() {
      filters.priceMin = parseFloat(pmin.value) || 0;
      filters.priceMax = parseFloat(pmax.value) || Infinity;
      filters.minReviews = parseInt(rev.value, 10) || 0;
      var ageVal = age.value;
      filters.ageMax = ageVal ? parseInt(ageVal, 10) : Infinity;
      renderAll();
    }

    if (pmin) pmin.addEventListener('change', applyFilters);
    if (pmax) pmax.addEventListener('change', applyFilters);
    if (rev) rev.addEventListener('change', applyFilters);
    if (age) age.addEventListener('change', applyFilters);
    if (sortSel) sortSel.addEventListener('change', function () {
      sortKey = sortSel.value;
      sortDir = 'desc';
      renderAll();
    });
  }

  // ===================== Keywords Tab =====================
  function renderKeywordsTab(container) {
    container.innerHTML = '<div style="padding:12px 20px;color:#6b7280;font-size:12px;">Loading keywords...</div>';

    chrome.runtime.sendMessage({
      action: 'getClassifiedData',
      request: { type: 'all', timeWindow: timeWindow },
    }, function (response) {
      if (!response) { container.innerHTML = '<div style="padding:12px 20px">No data</div>'; return; }
      var kws = response.keywords ? Object.values(response.keywords) : [];
      kws.sort(function (a, b) { return (b.frequency || 0) - (a.frequency || 0); });
      var maxFreq = kws.length > 0 ? (kws[0].frequency || 1) : 1;

      // Get stored listings for example matching
      var storedListings = response.listings ? Object.values(response.listings) : [];

      var html = '<div class="lv-table-wrap"><table class="lv-table"><thead><tr>' +
        '<th>Keyword</th><th style="width:70px">Freq</th><th style="width:80px">Class</th>' +
        '<th style="width:55px">Demand</th><th style="width:65px">Avg Price</th>' +
        '<th style="width:80px">Competition</th><th style="width:90px">Cluster</th>' +
        '<th style="width:55px">Listings</th><th style="width:70px">Visual</th>' +
        '</tr></thead><tbody>';

      for (var i = 0; i < kws.length; i++) {
        var k = kws[i];
        var pct = Math.round(((k.frequency || 0) / maxFreq) * 100);
        var cls = k.classification || '';
        var clsPill = cls ? badgePill(cls) : '';

        // Count matching listings
        var matchCount = 0;
        for (var mi = 0; mi < storedListings.length; mi++) {
          if ((storedListings[mi].title || '').toLowerCase().indexOf(k.keyword) !== -1) matchCount++;
        }

        html += '<tr class="lv-kw-row" data-ki="' + i + '">' +
          '<td>' + '<span class="lv-exp" data-kwrow="' + i + '">&#9654;</span> ' + escHtml(k.keyword) + '</td>' +
          '<td>' + (k.frequency || 0) + '</td>' +
          '<td>' + clsPill + '</td>' +
          '<td>' + (k.demand_score || 0) + '</td>' +
          '<td>' + (k.avg_price ? '$' + k.avg_price.toFixed(2) : 'N/A') + '</td>' +
          '<td>' + escHtml(k.competition_level || '') + '</td>' +
          '<td style="font-size:10px;color:#6b7280">' + escHtml(truncate(k.cluster_id || '', 20)) + '</td>' +
          '<td>' + matchCount + '</td>' +
          '<td><div class="lv-kw-bar-bg"><div class="lv-kw-bar" style="width:' + pct + '%"></div></div></td>' +
          '</tr>';

        // Expandable example listings
        html += '<tr data-kwdetail="' + i + '" style="display:none"><td colspan="9"><div class="lv-hist-detail"><strong>Example listings:</strong><ul>';
        var exCount = 0;
        for (var ei = 0; ei < storedListings.length && exCount < 5; ei++) {
          if ((storedListings[ei].title || '').toLowerCase().indexOf(k.keyword) !== -1) {
            html += '<li>' + escHtml(truncate(storedListings[ei].title, 60)) + ' — $' + (storedListings[ei].price || 0).toFixed(2) + '</li>';
            exCount++;
          }
        }
        if (exCount === 0) html += '<li>No matching listings found</li>';
        html += '</ul></div></td></tr>';
      }

      html += '</tbody></table></div>';
      container.innerHTML = html;

      // Footer info
      var info = shadowRoot.getElementById('lv-footer-info');
      if (info) info.textContent = kws.length + ' keywords';

      // Wire expand
      var kwExps = container.querySelectorAll('.lv-exp[data-kwrow]');
      for (var ke = 0; ke < kwExps.length; ke++) {
        kwExps[ke].addEventListener('click', function (ev) {
          ev.stopPropagation();
          var idx = this.getAttribute('data-kwrow');
          var detail = container.querySelector('tr[data-kwdetail="' + idx + '"]');
          if (detail) {
            var open = detail.style.display !== 'none';
            detail.style.display = open ? 'none' : 'table-row';
            this.classList.toggle('open', !open);
          }
        });
      }
    });
  }

  // ===================== History Tab =====================
  function renderHistoryTab(container) {
    container.innerHTML = '<div style="padding:12px 20px;color:#6b7280;font-size:12px;">Loading history...</div>';

    chrome.runtime.sendMessage({
      action: 'getStoredData',
      request: { type: 'all' },
    }, function (response) {
      if (!response) { container.innerHTML = '<div style="padding:12px 20px">No data</div>'; return; }
      var scans = response.scans || [];
      var allListings = response.listings || {};

      var html = '<div class="lv-table-wrap"><table class="lv-table"><thead><tr>' +
        '<th style="width:22px"></th><th>Time</th><th>Query</th><th style="width:60px">Type</th>' +
        '<th style="width:55px">Listings</th><th style="width:55px">Keywords</th>' +
        '<th style="width:60px">Duration</th>' +
        '</tr></thead><tbody>';

      for (var i = 0; i < scans.length; i++) {
        var sc = scans[i];
        var time = sc.timestamp ? new Date(sc.timestamp).toLocaleString() : 'Unknown';
        html += '<tr><td><span class="lv-exp" data-hi="' + i + '">&#9654;</span></td>' +
          '<td style="font-size:11px">' + escHtml(time) + '</td>' +
          '<td>' + escHtml(truncate(sc.query || '(none)', 30)) + '</td>' +
          '<td>' + escHtml(sc.page_type || '') + '</td>' +
          '<td>' + (sc.listings_found || 0) + '</td>' +
          '<td>' + (sc.keywords_extracted || 0) + '</td>' +
          '<td>' + (sc.duration_ms || 0) + 'ms</td>' +
          '</tr>';

        // Detail row
        html += '<tr data-hdetail="' + i + '" style="display:none"><td colspan="7"><div class="lv-hist-detail">';
        var ids = sc.listing_ids || [];
        if (ids.length > 0) {
          html += '<strong>Listings (' + ids.length + '):</strong><ul>';
          for (var li = 0; li < Math.min(ids.length, 10); li++) {
            var stored = allListings[ids[li]];
            html += '<li>' + (stored ? escHtml(truncate(stored.title, 50)) + ' — $' + (stored.price || 0).toFixed(2) : 'ID: ' + ids[li]) + '</li>';
          }
          if (ids.length > 10) html += '<li>... and ' + (ids.length - 10) + ' more</li>';
          html += '</ul>';
        }
        var kwStrings = sc.keyword_strings || [];
        if (kwStrings.length > 0) {
          html += '<strong>Keywords (' + kwStrings.length + '):</strong> ' + escHtml(kwStrings.slice(0, 20).join(', '));
          if (kwStrings.length > 20) html += '...';
        }
        html += '</div></td></tr>';
      }

      html += '</tbody></table></div>';
      container.innerHTML = html;

      // Footer info
      var info = shadowRoot.getElementById('lv-footer-info');
      if (info) info.textContent = scans.length + ' scan sessions';

      // Wire expand
      var hExps = container.querySelectorAll('.lv-exp[data-hi]');
      for (var he = 0; he < hExps.length; he++) {
        hExps[he].addEventListener('click', function (ev) {
          ev.stopPropagation();
          var idx = this.getAttribute('data-hi');
          var detail = container.querySelector('tr[data-hdetail="' + idx + '"]');
          if (detail) {
            var open = detail.style.display !== 'none';
            detail.style.display = open ? 'none' : 'table-row';
            this.classList.toggle('open', !open);
          }
        });
      }
    });
  }

  // ===================== Tab Content Router =====================
  function renderTabContent() {
    if (!shadowRoot) return;
    var container = shadowRoot.getElementById('lv-tab-content');
    if (!container) return;

    if (activeTab === 'listings') renderListingsTab(container);
    else if (activeTab === 'keywords') renderKeywordsTab(container);
    else if (activeTab === 'history') renderHistoryTab(container);
  }

  // ===================== Render All =====================
  function renderAll() {
    renderSummary();
    renderTabContent();
  }

  // ===================== Public: render (search/shop pages) =====================
  function render(listings, stats, totalResults) {
    currentListings = listings || [];
    currentStats = stats || null;
    if (totalResults != null) currentTotalResults = totalResults;

    if (!hostEl) {
      createHost();
      var point = findInjectionPoint();
      if (point) {
        point.parent.insertBefore(hostEl, point.before);
      } else {
        document.body.insertBefore(hostEl, document.body.firstChild);
      }
    }

    renderAll();
  }

  function remove() {
    var existing = document.getElementById(HOST_ID);
    if (existing && existing.parentNode) existing.parentNode.removeChild(existing);
    hostEl = null;
    shadowRoot = null;
    currentListings = [];
    currentStats = null;
    currentTotalResults = null;
  }

  // ===================== Listing Detail Panel =====================
  function findListingInjectionPoint() {
    var sels = ['h1[data-buy-box-listing-title]', 'h1.wt-text-body-03', 'div[data-buy-box-region="title"]'];
    for (var i = 0; i < sels.length; i++) {
      var el = document.querySelector(sels[i]);
      if (el && el.parentNode) return { parent: el.parentNode, before: el };
    }
    var h1 = document.querySelector('main h1');
    if (h1 && h1.parentNode) return { parent: h1.parentNode, before: h1 };
    return null;
  }

  function renderListingDetail(listing) {
    if (!listing) return;
    removeListingDetail();

    var point = findListingInjectionPoint();
    if (!point) return;

    var host = document.createElement('div');
    host.id = DETAIL_HOST_ID;
    var shadow = host.attachShadow({ mode: 'closed' });

    var style = document.createElement('style');
    style.textContent = FONT_IMPORT + '\n' +
      ':host { all: initial; display: block; margin-bottom: 16px; font-family: "Inter",sans-serif; }' +
      '*, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }' +
      getCSS(); // reuse all styles
    shadow.appendChild(style);

    var panel = document.createElement('div');
    panel.className = 'lv-ld';

    // Header: badge + metrics
    var header = document.createElement('div');
    header.className = 'lv-ld-header';
    var clsPill = listing.classification ? badgePill(listing.classification) : '';
    var conf = listing.confidence ? confPill(listing.confidence) : '';
    header.innerHTML = clsPill + ' ' + conf;

    var metrics = document.createElement('div');
    metrics.className = 'lv-ld-metrics';
    var conf = listing.confidence || 'low';
    var confBadge = '<span class="lv-est-conf lv-est-conf--' + conf + '">' + conf.toUpperCase() + '</span>';

    // Age source label
    var ageLabel = 'Listing Age';
    var ageSource = listing.listing_age_source;
    var ageIsReal = false;
    if (ageSource === 'api') { ageLabel = 'Listing Age <span class="lv-est" style="color:#217005">(Etsy API)</span>'; ageIsReal = true; }
    else if (ageSource === 'internal-state') { ageLabel = 'Listing Age <span class="lv-est" style="color:#217005">(Etsy data)</span>'; ageIsReal = true; }
    else if (ageSource === 'json-ld') { ageLabel = 'Listing Age <span class="lv-est" style="color:#217005">(structured data)</span>'; ageIsReal = true; }
    else if (ageSource === 'wayback') { ageLabel = 'Listing Age <span class="lv-est" style="color:#1a6db0">(Wayback Machine)</span>'; ageIsReal = true; }
    else if (ageSource === 'page-text') { ageLabel = 'Listing Age <span class="lv-est" style="color:#935116">(~renewal date)</span>'; ageIsReal = false; }
    else if (ageSource === 'review-approx') { ageLabel = 'Listing Age <span class="lv-est">~approx from reviews</span>'; }
    else { ageLabel = 'Listing Age'; }

    // Format age value — show N/A in gray italic when unknown
    var ageDisplayVal = listing.listing_age_label || 'N/A';
    if (!listing.date_published) ageDisplayVal = '<span style="color:#9ca3af;font-style:italic" title="Age unknown — no creation date found in page data">N/A</span>';

    var tiles = [
      { v: fmtNum(listing.favorites || 0), l: 'Favorites', real: true },
      { v: ageDisplayVal, l: ageLabel, real: ageIsReal },
    ];
    // If views_24h is available, highlight it prominently as REAL data
    if (listing.views_24h != null && listing.views_24h > 0) {
      tiles.push({ v: fmtNum(listing.views_24h), l: '24h Views <span class="lv-actual-badge">ACTUAL</span>', real: true });
    } else {
      tiles.push({ v: fmtNum(listing.daily_views || 0), l: 'Daily Views <span class="lv-est">Est.</span> ' + confBadge, real: false });
    }
    tiles.push(
      { v: (listing.daily_sales || 0).toFixed(1), l: 'Daily Sales <span class="lv-est">Est.</span> ' + confBadge, real: false },
      { v: (listing.weekly_sales || 0).toFixed(1), l: 'Wk Sales <span class="lv-est">Est.</span> ' + confBadge, real: false },
      { v: fmtNum(listing.monthly_sales || 0), l: 'Mo Sales <span class="lv-est">Est.</span> ' + confBadge, real: false },
      { v: fmtCur(listing.revenue_estimate || 0), l: 'Mo Revenue <span class="lv-est">Est.</span> ' + confBadge, real: false },
      { v: listing.conversion_rate != null ? listing.conversion_rate.toFixed(1) + '%' : 'N/A', l: 'Conversion <span class="lv-est">Est.</span> ' + confBadge, real: false },
      { v: fmtCur(listing.total_revenue || 0), l: 'Total Revenue <span class="lv-est">Est.</span> ' + confBadge, real: false },
      { v: '', l: 'Trend <span class="lv-est">Est.</span>', html: trendIcon(listing.monthly_trend), real: false }
    );
    for (var ti = 0; ti < tiles.length; ti++) {
      var ldTileCls = 'lv-ld-tile' + (tiles[ti].real ? ' lv-ld-tile--real' : ' lv-ld-tile--est');
      metrics.innerHTML += '<div class="' + ldTileCls + '"><div class="lv-ld-tile-val">' + (tiles[ti].html || escHtml(tiles[ti].v)) + '</div><div class="lv-ld-tile-lbl">' + tiles[ti].l + '</div></div>';
    }
    header.appendChild(metrics);
    panel.appendChild(header);

    // Tags section
    var tags = listing.tags || [];
    if (tags.length > 0) {
      var tagSec = document.createElement('div');
      tagSec.className = 'lv-ld-section';
      var tagHtml = '<h4>Tags (' + tags.length + ')</h4><div class="lv-tags-box">';
      for (var tg = 0; tg < tags.length; tg++) {
        tagHtml += '<span class="lv-tag-chip" data-tag="' + escAttr(tags[tg]) + '" title="Click to copy">' + escHtml(tags[tg]) + '</span>';
      }
      tagHtml += '<button class="lv-copy-btn" data-label="Copy All" id="lv-ld-copy-all">Copy All</button></div>';
      tagSec.innerHTML = tagHtml;
      panel.appendChild(tagSec);
    }

    // Keyword insights
    if (tags.length > 0) {
      var kwSec = document.createElement('div');
      kwSec.className = 'lv-ld-section';
      var kwHtml = '<h4>Keyword Insights</h4>';
      for (var ki = 0; ki < tags.length; ki++) {
        // Simple demand score from tag frequency across stored listings
        var tagText = tags[ki];
        var kwObj = { keyword: tagText, first_seen: listing.first_seen || null };
        kwHtml += '<div class="lv-kw-insight">' +
          '<span class="lv-kw-insight-tag">' + escHtml(tagText) + '</span>' +
          '<span class="lv-kw-insight-score">Demand data requires scan history</span>' +
          '</div>';
      }
      kwSec.innerHTML = kwHtml;
      panel.appendChild(kwSec);

      // Try to get classified keyword data
      chrome.runtime.sendMessage({
        action: 'getClassifiedData',
        request: { type: 'keywords', timeWindow: 'monthly' },
      }, function (response) {
        if (!response || !response.keywords) return;
        var kwData = response.keywords;
        var insights = kwSec.querySelectorAll('.lv-kw-insight');
        for (var ii = 0; ii < insights.length && ii < tags.length; ii++) {
          var t = tags[ii].toLowerCase();
          var kd = kwData[t];
          if (kd) {
            var clsBadge = kd.classification ? badgePill(kd.classification) : '';
            insights[ii].querySelector('.lv-kw-insight-score').innerHTML =
              'Demand: ' + (kd.demand_score || 0) + ' | Freq: ' + (kd.frequency || 0) + ' ' + clsBadge;
          } else {
            insights[ii].querySelector('.lv-kw-insight-score').innerHTML = 'No historical data';
          }
        }
      });
    }

    // Notes section
    var notesSec = document.createElement('div');
    notesSec.className = 'lv-ld-section';
    notesSec.innerHTML = '<h4>Notes <span class="lv-notes-saved" id="lv-notes-saved">Saved \u2713</span></h4>' +
      '<textarea class="lv-notes-area" id="lv-notes-input" placeholder="Add your notes about this listing..."></textarea>';
    panel.appendChild(notesSec);

    shadow.appendChild(panel);
    point.parent.insertBefore(host, point.before);

    // Wire tag copy
    var tagChips = shadow.querySelectorAll('.lv-tag-chip');
    for (var tc = 0; tc < tagChips.length; tc++) {
      tagChips[tc].addEventListener('click', function () {
        var t = this.getAttribute('data-tag');
        if (t) {
          copyText(t, null);
          var orig = this.style.background;
          this.style.background = '#d1fab3';
          var self = this;
          setTimeout(function () { self.style.background = orig || ''; }, 600);
        }
      });
    }

    var copyAllBtn = shadow.getElementById('lv-ld-copy-all');
    if (copyAllBtn) {
      copyAllBtn.addEventListener('click', function () {
        copyText(tags.join('\n'), this);
      });
    }

    // Wire notes
    var notesInput = shadow.getElementById('lv-notes-input');
    var notesSaved = shadow.getElementById('lv-notes-saved');
    var noteKey = 'lv_notes_' + listing.listing_id;
    var saveTimer = null;

    // Load existing notes
    chrome.storage.local.get(noteKey, function (result) {
      if (result[noteKey] && notesInput) notesInput.value = result[noteKey];
    });

    if (notesInput) {
      notesInput.addEventListener('input', function () {
        clearTimeout(saveTimer);
        saveTimer = setTimeout(function () {
          var obj = {};
          obj[noteKey] = notesInput.value;
          chrome.storage.local.set(obj, function () {
            if (notesSaved) {
              notesSaved.classList.add('show');
              setTimeout(function () { notesSaved.classList.remove('show'); }, 1500);
            }
          });
        }, 1000);
      });
    }
  }

  function removeListingDetail() {
    var existing = document.getElementById(DETAIL_HOST_ID);
    if (existing && existing.parentNode) existing.parentNode.removeChild(existing);
  }

  // ===================== Public API =====================
  globalThis.LVListingStats = {
    render: render,
    remove: remove,
    renderListingDetail: renderListingDetail,
    removeListingDetail: removeListingDetail,
  };
})();