(function () {
  'use strict';

  var BADGE_COLORS = (globalThis.EtsyConstants || {}).BADGE_COLORS || {};
  var TREND_COLORS = (globalThis.EtsyConstants || {}).TREND_COLORS || { up: '#5CC489', down: '#DE8F88', flat: '#333333' };
  var FONT_IMPORT = (globalThis.EtsyConstants || {}).FONT_IMPORT || '';
  var HOST_ID = 'lv-dashboard-shadow-host';

  var hostEl = null;
  var shadowRoot = null;

  // Current state
  var state = {
    tab: 'listings',       // 'listings' | 'keywords'
    filter: 'all',         // 'all' | badge key
    sortKey: 'revenue_estimate',
    sortDir: 'desc',
    timeWindow: 'monthly',
    listings: [],
    keywords: [],
    stats: null,
  };

  // ===================== CSS =====================

  function getCSS() {
    return FONT_IMPORT + '\n' +
    ':host { all: initial; }' +
    '*, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }' +

    '.lv-backdrop { ' +
      'position: fixed; inset: 0; background: rgba(0,0,0,0.4); z-index: 2147483648; ' +
      'display: flex; justify-content: flex-end; ' +
      'font-family: "Inter", sans-serif; ' +
    '}' +

    '.lv-panel { ' +
      'width: 75%; max-width: 1400px; height: 100vh; background: #fff; ' +
      'border-radius: 15px 0 0 15px; overflow: hidden; ' +
      'display: flex; flex-direction: column; ' +
      'animation: lv-slide-in 0.3s ease-out; ' +
    '}' +
    '@keyframes lv-slide-in { from { transform: translateX(100%); } to { transform: translateX(0); } }' +

    /* Header */
    '.lv-header { ' +
      'display: flex; align-items: center; gap: 12px; padding: 18px 24px; ' +
      'border-bottom: 1px solid #e5e7eb; flex-shrink: 0; ' +
    '}' +
    '.lv-title { font-size: 18px; font-weight: 600; color: #030712; }' +
    '.lv-pill { ' +
      'font-size: 12px; font-weight: 500; padding: 4px 12px; border-radius: 12px; ' +
      'background: #f3f4f6; color: #6366f1; ' +
    '}' +
    '.lv-close { ' +
      'margin-left: auto; width: 32px; height: 32px; border: none; background: #f3f4f6; ' +
      'border-radius: 8px; cursor: pointer; font-size: 16px; color: #6b7280; ' +
      'display: flex; align-items: center; justify-content: center; ' +
    '}' +
    '.lv-close:hover { background: #e5e7eb; }' +

    /* Toolbar */
    '.lv-toolbar { ' +
      'display: flex; flex-wrap: wrap; align-items: center; gap: 8px; padding: 12px 24px; ' +
      'border-bottom: 1px solid #e5e7eb; flex-shrink: 0; ' +
    '}' +
    '.lv-tab-btn { ' +
      'padding: 6px 16px; border-radius: 8px; border: 1px solid #e5e7eb; ' +
      'background: #fff; cursor: pointer; font-size: 13px; font-weight: 500; color: #374151; ' +
      'font-family: "Inter", sans-serif; ' +
    '}' +
    '.lv-tab-btn.active { background: #667eea; color: #fff; border-color: #667eea; }' +
    '.lv-filter-chip { ' +
      'padding: 4px 12px; border-radius: 1rem; border: 1px solid #e5e7eb; ' +
      'background: #fff; cursor: pointer; font-size: 12px; font-weight: 500; color: #374151; ' +
      'font-family: "Inter", sans-serif; ' +
    '}' +
    '.lv-filter-chip.active { background: #030712; color: #fff; border-color: #030712; }' +
    '.lv-select { ' +
      'padding: 5px 10px; border-radius: 8px; border: 1px solid #e5e7eb; ' +
      'font-size: 12px; font-family: "Inter", sans-serif; color: #374151; background: #fff; ' +
    '}' +
    '.lv-separator { width: 1px; height: 24px; background: #e5e7eb; }' +

    /* Metric summary row */
    '.lv-metric-row { ' +
      'display: flex; flex-wrap: wrap; gap: 12px; padding: 16px 24px; ' +
      'border-bottom: 1px solid #e5e7eb; flex-shrink: 0; ' +
    '}' +
    '.lv-metric-card { ' +
      'flex: 1 1 140px; text-align: center; padding: 12px 8px; ' +
      'border-radius: 10px; background: #f9fafb; border: 1px solid #e5e7eb; ' +
    '}' +
    '.lv-metric-value { font-size: 22px; font-weight: 700; color: #030712; }' +
    '.lv-metric-label { font-size: 11px; font-weight: 500; color: #6b7280; margin-top: 2px; text-transform: uppercase; letter-spacing: 0.3px; }' +

    /* Trend arrows */
    '.trend-up { color: ' + TREND_COLORS.up + '; font-weight: 700; }' +
    '.trend-down { color: ' + TREND_COLORS.down + '; font-weight: 700; }' +
    '.trend-flat { color: #333; font-weight: 500; }' +

    /* Tags expandable row */
    '.lv-expand-icon { cursor: pointer; font-size: 10px; margin-right: 4px; color: #6b7280; transition: transform 0.15s; display: inline-block; }' +
    '.lv-expand-icon.open { transform: rotate(90deg); }' +
    '.lv-tag-row td { padding: 8px 12px 12px; background: #fafafa; border-bottom: 1px solid #e5e7eb; }' +
    '.lv-tags-container { ' +
      'background: #f5f5f5; border: 1px solid #F0F0F0; border-radius: 9px; ' +
      'padding: 10px 12px; display: flex; flex-wrap: wrap; gap: 6px; align-items: center; ' +
    '}' +
    '.lv-tag-pill { ' +
      'font-size: 11px; padding: 3px 10px; border-radius: 6px; background: #fff; ' +
      'border: 1px solid #e5e7eb; color: #374151; white-space: nowrap; ' +
    '}' +
    '.lv-copy-tags-btn { ' +
      'margin-left: auto; padding: 5px 14px; border-radius: 6px; border: 1px solid #667eea; ' +
      'background: transparent; color: #667eea; font-size: 11px; font-weight: 600; ' +
      'cursor: pointer; font-family: "Inter", sans-serif; white-space: nowrap; transition: all 0.15s; ' +
    '}' +
    '.lv-copy-tags-btn:hover { background: #667eea; color: #fff; }' +
    '.lv-copy-tags-btn.copied { border-color: #5CC489; color: #5CC489; background: transparent; }' +

    /* Table */
    '.lv-table-wrap { flex: 1; overflow: auto; }' +
    '.lv-table { width: 100%; border-collapse: collapse; font-size: 13px; }' +
    '.lv-table thead { position: sticky; top: 0; z-index: 2; }' +
    '.lv-table th { ' +
      'background: #f9fafb; padding: 10px 12px; text-align: left; font-weight: 600; ' +
      'color: #374151; border-bottom: 1px solid #e5e7eb; cursor: pointer; white-space: nowrap; ' +
      'user-select: none; ' +
    '}' +
    '.lv-table th:hover { background: #f3f4f6; }' +
    '.lv-table th .sort-arrow { font-size: 10px; margin-left: 4px; }' +
    '.lv-table td { padding: 8px 12px; border-bottom: 1px solid #f3f4f6; color: #030712; vertical-align: middle; }' +
    '.lv-table tr:hover td { background: #f9fafb; }' +
    '.lv-table .img-cell img { width: 50px; height: 40px; object-fit: cover; border-radius: 4px; }' +
    '.lv-table .title-cell { max-width: 280px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }' +
    '.lv-table .title-cell a { color: #667eea; text-decoration: none; }' +
    '.lv-table .title-cell a:hover { text-decoration: underline; }' +
    '.lv-badge-inline { ' +
      'display: inline-block; font-size: 10px; font-weight: 600; padding: 2px 6px; ' +
      'border-radius: 1rem; margin-right: 3px; margin-bottom: 2px; ' +
      'border-width: 1px; border-style: solid; white-space: nowrap; ' +
    '}' +

    /* Keywords table */
    '.lv-kw-bar { height: 6px; border-radius: 3px; background: #667eea; }' +
    '.lv-kw-bar-bg { height: 6px; border-radius: 3px; background: #e5e7eb; width: 80px; }' +

    /* Footer */
    '.lv-footer { ' +
      'display: flex; align-items: center; justify-content: space-between; ' +
      'padding: 12px 24px; border-top: 1px solid #e5e7eb; flex-shrink: 0; ' +
    '}' +
    '.lv-footer-info { font-size: 12px; color: #6b7280; }' +
    '.lv-export-btn { ' +
      'padding: 8px 20px; border-radius: 8px; border: none; ' +
      'background: #667eea; color: #fff; font-size: 13px; font-weight: 500; ' +
      'cursor: pointer; font-family: "Inter", sans-serif; ' +
    '}' +
    '.lv-export-btn:hover { background: #5a6fd6; }' +
    '.lv-send-cp-btn { ' +
      'padding: 8px 20px; border-radius: 8px; border: none; ' +
      'background: #8b5cf6; color: #fff; font-size: 13px; font-weight: 500; ' +
      'cursor: pointer; font-family: "Inter", sans-serif; margin-left: 8px; ' +
    '}' +
    '.lv-send-cp-btn:hover { background: #7c3aed; }' +
    '.lv-send-cp-btn:disabled { opacity: 0.5; cursor: not-allowed; }' +

    /* Winner tier badges in table */
    '.lv-tier { font-size: 10px; font-weight: 700; padding: 2px 8px; border-radius: 4px; white-space: nowrap; letter-spacing: 0.5px; }' +
    '.lv-tier-buy { background: #22c55e; color: #fff; }' +
    '.lv-tier-monitor { background: #f59e0b; color: #fff; }' +
    '.lv-tier-skip { background: #9ca3af; color: #fff; }' +
    '.lv-send-winners-btn { ' +
      'padding: 8px 20px; border-radius: 8px; border: none; ' +
      'background: #22c55e; color: #fff; font-size: 13px; font-weight: 500; ' +
      'cursor: pointer; font-family: "Inter", sans-serif; margin-left: 8px; ' +
    '}' +
    '.lv-send-winners-btn:hover { background: #16a34a; }' +
    '.lv-send-winners-btn:disabled { opacity: 0.5; cursor: not-allowed; }';
  }

  // ===================== Badge helpers =====================

  function badgePill(key) {
    var c = BADGE_COLORS[key];
    if (!c) return '';
    return '<span class="lv-badge-inline" style="background:' + c.bg + ';color:' + c.color +
      ';border-color:' + c.border + ';">' + c.label + '</span>';
  }

  // ===================== Build UI =====================

  function buildPanel() {
    var panel = document.createElement('div');
    panel.className = 'lv-panel';

    // Header
    var header = document.createElement('div');
    header.className = 'lv-header';
    header.innerHTML = '<span class="lv-title">Database</span>' +
      '<span class="lv-pill">Extension View</span>';
    var closeBtn = document.createElement('button');
    closeBtn.className = 'lv-close';
    closeBtn.innerHTML = '&#10005;';
    closeBtn.addEventListener('click', close);
    header.appendChild(closeBtn);
    panel.appendChild(header);

    // Toolbar
    var toolbar = document.createElement('div');
    toolbar.className = 'lv-toolbar';
    toolbar.id = 'lv-toolbar';

    // Tab buttons
    var tabListings = createBtn('Listings', 'lv-tab-btn' + (state.tab === 'listings' ? ' active' : ''), function () {
      state.tab = 'listings';
      renderContent();
    });
    var tabKeywords = createBtn('Keywords', 'lv-tab-btn' + (state.tab === 'keywords' ? ' active' : ''), function () {
      state.tab = 'keywords';
      renderContent();
    });
    toolbar.appendChild(tabListings);
    toolbar.appendChild(tabKeywords);

    // Separator
    toolbar.appendChild(createSeparator());

    // Filter chips (only for listings tab)
    var filters = ['all', 'buy', 'monitor', 'trending', 'evergreen', 'new', 'top_producer', 'bestseller', 'etsy_pick', 'outlier_high', 'outlier_extreme'];
    var filterLabels = { all: 'All', buy: '🏆 BUY', monitor: '👀 MONITOR', trending: 'Trending', evergreen: 'Evergreen', new: 'New', top_producer: 'Top Producer', bestseller: 'Bestseller', etsy_pick: "Etsy's Pick", outlier_high: 'Outlier High', outlier_extreme: 'Outlier Extreme' };
    for (var f = 0; f < filters.length; f++) {
      (function (fk) {
        var chip = createBtn(filterLabels[fk] || fk, 'lv-filter-chip' + (state.filter === fk ? ' active' : ''), function () {
          state.filter = fk;
          renderContent();
        });
        chip.setAttribute('data-filter', fk);
        toolbar.appendChild(chip);
      })(filters[f]);
    }

    toolbar.appendChild(createSeparator());

    // Sort dropdown
    var sortSelect = document.createElement('select');
    sortSelect.className = 'lv-select';
    var sortOptions = [
      { v: 'revenue_estimate', l: 'Mo. Revenue' },
      { v: 'total_revenue', l: 'Total Revenue' },
      { v: 'price', l: 'Price' },
      { v: 'demand_score', l: 'Demand' },
      { v: 'monthly_sales', l: 'Mo. Sales' },
      { v: 'favorites', l: 'Favorites' },
      { v: 'conversion_rate', l: 'Conversion' },
      { v: 'listing_age_days', l: 'Listing Age' },
      { v: 'reviews', l: 'Reviews' },
      { v: 'velocity_score', l: 'Velocity' },
    ];
    for (var so = 0; so < sortOptions.length; so++) {
      var opt = document.createElement('option');
      opt.value = sortOptions[so].v;
      opt.textContent = 'Sort: ' + sortOptions[so].l;
      if (state.sortKey === sortOptions[so].v) opt.selected = true;
      sortSelect.appendChild(opt);
    }
    sortSelect.addEventListener('change', function () {
      state.sortKey = sortSelect.value;
      renderContent();
    });
    toolbar.appendChild(sortSelect);

    // Time window dropdown
    var timeSelect = document.createElement('select');
    timeSelect.className = 'lv-select';
    var timeOptions = [
      { v: 'daily', l: 'Daily' },
      { v: 'weekly', l: 'Weekly' },
      { v: 'monthly', l: 'Monthly' },
    ];
    for (var to = 0; to < timeOptions.length; to++) {
      var topt = document.createElement('option');
      topt.value = timeOptions[to].v;
      topt.textContent = timeOptions[to].l;
      if (state.timeWindow === timeOptions[to].v) topt.selected = true;
      timeSelect.appendChild(topt);
    }
    timeSelect.addEventListener('change', function () {
      state.timeWindow = timeSelect.value;
      // Re-request data with new time window
      requestData();
    });
    toolbar.appendChild(timeSelect);

    panel.appendChild(toolbar);

    // Metric summary row
    var metricRow = document.createElement('div');
    metricRow.className = 'lv-metric-row';
    metricRow.id = 'lv-metric-row';
    panel.appendChild(metricRow);

    // Table wrapper
    var tableWrap = document.createElement('div');
    tableWrap.className = 'lv-table-wrap';
    tableWrap.id = 'lv-table-wrap';
    panel.appendChild(tableWrap);

    // Footer
    var footer = document.createElement('div');
    footer.className = 'lv-footer';
    footer.id = 'lv-footer';
    footer.innerHTML = '<span class="lv-footer-info" id="lv-footer-info"></span>';
    var exportBtn = document.createElement('button');
    exportBtn.className = 'lv-export-btn';
    exportBtn.textContent = 'Export CSV';
    exportBtn.addEventListener('click', function () {
      var type = state.tab === 'keywords' ? 'keywords' : 'listings';
      chrome.runtime.sendMessage({ action: 'exportCSV', dataType: type });
    });
    footer.appendChild(exportBtn);

    // Send to CraftPlan button (all listings)
    var sendCpBtn = document.createElement('button');
    sendCpBtn.className = 'lv-send-cp-btn';
    sendCpBtn.textContent = '🚀 Send All to CraftPlan';
    sendCpBtn.addEventListener('click', function () {
      sendCpBtn.disabled = true;
      sendCpBtn.textContent = '⏳ Sending...';
      chrome.runtime.sendMessage({ action: 'sendToCraftPlan' }, function (resp) {
        sendCpBtn.disabled = false;
        if (resp && resp.success) {
          sendCpBtn.textContent = '✓ Sent ' + resp.total_sent + ' listings!';
          sendCpBtn.style.background = '#22c55e';
          setTimeout(function () {
            sendCpBtn.textContent = '🚀 Send All to CraftPlan';
            sendCpBtn.style.background = '';
          }, 4000);
        } else {
          sendCpBtn.textContent = '✗ ' + ((resp && resp.error) || 'Failed');
          sendCpBtn.style.background = '#ef4444';
          setTimeout(function () {
            sendCpBtn.textContent = '🚀 Send All to CraftPlan';
            sendCpBtn.style.background = '';
          }, 4000);
        }
      });
    });
    footer.appendChild(sendCpBtn);

    // Send TOP Winners button (BUY + MONITOR only)
    var sendWinnersBtn = document.createElement('button');
    sendWinnersBtn.className = 'lv-send-winners-btn';
    sendWinnersBtn.textContent = '🏆 Send Winners to CraftPlan';
    sendWinnersBtn.addEventListener('click', function () {
      var winners = (state.listings || []).filter(function (l) {
        return l.winner_tier === 'BUY' || l.winner_tier === 'MONITOR';
      });
      if (winners.length === 0) {
        sendWinnersBtn.textContent = 'No winners found';
        setTimeout(function () { sendWinnersBtn.textContent = '🏆 Send Winners to CraftPlan'; }, 2000);
        return;
      }
      var winnerIds = winners.map(function (l) { return l.listing_id; });
      sendWinnersBtn.disabled = true;
      sendWinnersBtn.textContent = '⏳ Sending ' + winnerIds.length + '...';
      chrome.runtime.sendMessage({
        action: 'sendWinnersToCraftPlan',
        listingIds: winnerIds,
      }, function (resp) {
        sendWinnersBtn.disabled = false;
        if (resp && resp.success) {
          sendWinnersBtn.textContent = '✓ Sent ' + (resp.total_sent || winnerIds.length) + ' winners!';
          sendWinnersBtn.style.background = '#16a34a';
          setTimeout(function () {
            sendWinnersBtn.textContent = '🏆 Send Winners to CraftPlan';
            sendWinnersBtn.style.background = '';
          }, 4000);
        } else {
          sendWinnersBtn.textContent = '✗ ' + ((resp && resp.error) || 'Failed');
          sendWinnersBtn.style.background = '#ef4444';
          setTimeout(function () {
            sendWinnersBtn.textContent = '🏆 Send Winners to CraftPlan';
            sendWinnersBtn.style.background = '';
          }, 4000);
        }
      });
    });
    footer.appendChild(sendWinnersBtn);

    panel.appendChild(footer);

    return panel;
  }

  function createBtn(text, className, onClick) {
    var btn = document.createElement('button');
    btn.className = className;
    btn.textContent = text;
    btn.addEventListener('click', onClick);
    return btn;
  }

  function createSeparator() {
    var sep = document.createElement('div');
    sep.className = 'lv-separator';
    return sep;
  }

  // ===================== Render content =====================

  function renderMetricCards() {
    var row = shadowRoot ? shadowRoot.getElementById('lv-metric-row') : null;
    if (!row) return;
    var listings = state.listings || [];
    var stats = null;
    if (globalThis.EtsyAnalysis && listings.length > 0) {
      stats = globalThis.EtsyAnalysis.computeAggregateStats(listings);
    }
    if (!stats) {
      row.innerHTML = '';
      return;
    }

    var cards = [
      { label: 'Mo. Sales', value: (stats.total_monthly_sales || 0).toLocaleString() },
      { label: 'Mo. Revenue', value: '$' + (stats.total_revenue || 0).toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 }) },
      { label: 'Avg Conversion', value: stats.avg_conversion != null ? stats.avg_conversion.toFixed(1) + '%' : 'N/A' },
      { label: 'Total Revenue', value: '$' + (stats.total_lifetime_revenue || 0).toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 }) },
      { label: 'Avg Listing Age', value: stats.avg_listing_age_days != null ? (stats.avg_listing_age_days < 30 ? stats.avg_listing_age_days + 'd' : stats.avg_listing_age_days < 365 ? Math.round(stats.avg_listing_age_days / 30) + 'mo' : (stats.avg_listing_age_days / 365).toFixed(1) + 'y') : 'N/A' },
      { label: 'Favorites', value: (stats.total_favorites || 0).toLocaleString() },
    ];

    var html = '';
    for (var i = 0; i < cards.length; i++) {
      html += '<div class="lv-metric-card">' +
        '<div class="lv-metric-value">' + cards[i].value + '</div>' +
        '<div class="lv-metric-label">' + cards[i].label + '</div>' +
        '</div>';
    }
    row.innerHTML = html;
  }

  function renderContent() {
    if (!shadowRoot) return;

    // Update tab buttons
    var tabs = shadowRoot.querySelectorAll('.lv-tab-btn');
    for (var t = 0; t < tabs.length; t++) {
      tabs[t].classList.toggle('active', tabs[t].textContent.toLowerCase() === state.tab);
    }

    // Update filter chips
    var chips = shadowRoot.querySelectorAll('.lv-filter-chip');
    for (var c = 0; c < chips.length; c++) {
      chips[c].classList.toggle('active', chips[c].getAttribute('data-filter') === state.filter);
    }

    // Metric cards
    renderMetricCards();

    var wrap = shadowRoot.getElementById('lv-table-wrap');
    if (!wrap) return;

    if (state.tab === 'listings') {
      renderListingsTable(wrap);
    } else {
      renderKeywordsTable(wrap);
    }
  }

  function trendIcon(trend) {
    if (trend === 'up') return '<span class="trend-up" title="Trending Up">&#9650;</span>';
    if (trend === 'down') return '<span class="trend-down" title="Trending Down">&#9660;</span>';
    return '<span class="trend-flat" title="Flat">&#9654;</span>';
  }

  function fmtCurrency(n) {
    if (n == null || n === 0) return '$0';
    if (n >= 1000) return '$' + (n / 1000).toFixed(1) + 'k';
    return '$' + n.toFixed(2);
  }

  function copyTagsToClipboard(tags, btn) {
    var text = tags.join('\n');
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(function () {
        showCopyFeedback(btn);
      }).catch(function () {
        fallbackCopy(text, btn);
      });
    } else {
      fallbackCopy(text, btn);
    }
  }

  function fallbackCopy(text, btn) {
    var ta = document.createElement('textarea');
    ta.value = text;
    ta.style.cssText = 'position:fixed;left:-9999px;';
    document.body.appendChild(ta);
    ta.select();
    try { document.execCommand('copy'); showCopyFeedback(btn); } catch (e) { /* ignore */ }
    document.body.removeChild(ta);
  }

  function showCopyFeedback(btn) {
    btn.textContent = '\u2713 Copied';
    btn.classList.add('copied');
    setTimeout(function () {
      btn.textContent = 'Copy Tags';
      btn.classList.remove('copied');
    }, 2000);
  }

  function renderListingsTable(wrap) {
    var filtered = filterListings(state.listings);
    sortListings(filtered);

    var colCount = 15;
    var html = '<table class="lv-table"><thead><tr>' +
      '<th style="width:30px"></th>' +
      thSortable('Tier', 'winner_score', 55) +
      '<th style="width:50px">Image</th>' +
      thSortable('Title', 'title', 200) +
      thSortable('Shop', 'shop_name', 90) +
      thSortable('Price', 'price', 65) +
      '<th style="width:120px">Badges</th>' +
      thSortable('Favs', 'favorites', 55) +
      thSortable('Mo.Sales', 'monthly_sales', 60) +
      thSortable('Mo.Rev', 'revenue_estimate', 70) +
      '<th style="width:40px">Trend</th>' +
      thSortable('Total Rev', 'total_revenue', 70) +
      thSortable('Age', 'listing_age_days', 50) +
      thSortable('Conv', 'conversion_rate', 50) +
      thSortable('Demand', 'demand_score', 50) +
      thSortable('Score', 'winner_score', 50) +
      '</tr></thead><tbody>';

    for (var i = 0; i < filtered.length; i++) {
      var l = filtered[i];
      var badges = (l.badges || []).map(function (b) { return badgePill(b); }).join('');
      var hasTags = Array.isArray(l.tags) && l.tags.length > 0;
      var expandIcon = hasTags ? '<span class="lv-expand-icon" data-row="' + i + '">&#9654;</span>' : '';
      var convText = l.conversion_rate != null ? l.conversion_rate.toFixed(1) + '%' : 'N/A';

      var tierClass = 'lv-tier-skip';
      if (l.winner_tier === 'BUY') tierClass = 'lv-tier-buy';
      else if (l.winner_tier === 'MONITOR') tierClass = 'lv-tier-monitor';

      html += '<tr data-listing-row="' + i + '">' +
        '<td>' + expandIcon + '</td>' +
        '<td><span class="lv-tier ' + tierClass + '">' + escHtml(l.winner_tier || 'SKIP') + '</span></td>' +
        '<td class="img-cell"><img src="' + escAttr(l.image_url || '') + '" alt="" loading="lazy"></td>' +
        '<td class="title-cell"><a href="' + escAttr(l.url || '') + '" target="_blank">' + escHtml(truncate(l.title || '', 50)) + '</a></td>' +
        '<td>' + escHtml(truncate(l.shop_name || '', 18)) + '</td>' +
        '<td>$' + (l.price || 0).toFixed(2) + '</td>' +
        '<td>' + badges + '</td>' +
        '<td>' + (l.favorites || 0) + '</td>' +
        '<td>' + (l.monthly_sales || 0) + '</td>' +
        '<td>' + fmtCurrency(l.revenue_estimate) + '</td>' +
        '<td>' + trendIcon(l.monthly_trend) + '</td>' +
        '<td>' + fmtCurrency(l.total_revenue) + '</td>' +
        '<td>' + escHtml(l.listing_age_label || 'N/A') + '</td>' +
        '<td>' + convText + '</td>' +
        '<td>' + (l.demand_score || 0) + '</td>' +
        '<td>' + (l.winner_score || 0) + '</td>' +
        '</tr>';

      // Hidden tag expansion row
      if (hasTags) {
        html += '<tr class="lv-tag-row" data-tag-row="' + i + '" style="display:none;">' +
          '<td colspan="' + (colCount + 1) + '">' +
          '<div class="lv-tags-container">';
        for (var tg = 0; tg < l.tags.length; tg++) {
          html += '<span class="lv-tag-pill">' + escHtml(l.tags[tg]) + '</span>';
        }
        html += '<button class="lv-copy-tags-btn" data-tags-idx="' + i + '">Copy Tags</button>' +
          '</div></td></tr>';
      }
    }

    html += '</tbody></table>';
    wrap.innerHTML = html;

    // Attach sort listeners
    var ths = wrap.querySelectorAll('th[data-sort]');
    for (var s = 0; s < ths.length; s++) {
      ths[s].addEventListener('click', function () {
        var key = this.getAttribute('data-sort');
        if (state.sortKey === key) {
          state.sortDir = state.sortDir === 'asc' ? 'desc' : 'asc';
        } else {
          state.sortKey = key;
          state.sortDir = 'desc';
        }
        renderContent();
      });
    }

    // Attach expand toggle listeners
    var expandIcons = wrap.querySelectorAll('.lv-expand-icon');
    for (var ei = 0; ei < expandIcons.length; ei++) {
      expandIcons[ei].addEventListener('click', function (e) {
        e.stopPropagation();
        var rowIdx = this.getAttribute('data-row');
        var tagRow = wrap.querySelector('tr[data-tag-row="' + rowIdx + '"]');
        if (tagRow) {
          var isOpen = tagRow.style.display !== 'none';
          tagRow.style.display = isOpen ? 'none' : 'table-row';
          this.classList.toggle('open', !isOpen);
        }
      });
    }

    // Attach copy tags listeners
    var copyBtns = wrap.querySelectorAll('.lv-copy-tags-btn');
    for (var cb = 0; cb < copyBtns.length; cb++) {
      copyBtns[cb].addEventListener('click', function (e) {
        e.stopPropagation();
        var idx = parseInt(this.getAttribute('data-tags-idx'), 10);
        var listing = filtered[idx];
        if (listing && listing.tags) {
          copyTagsToClipboard(listing.tags, this);
        }
      });
    }

    // Update footer
    var info = shadowRoot.getElementById('lv-footer-info');
    if (info) info.textContent = filtered.length + ' of ' + state.listings.length + ' listings';
  }

  function renderKeywordsTable(wrap) {
    var kws = state.keywords.slice();
    // Sort by frequency desc
    kws.sort(function (a, b) { return (b.frequency || 0) - (a.frequency || 0); });
    var maxFreq = kws.length > 0 ? (kws[0].frequency || 1) : 1;

    var html = '<table class="lv-table"><thead><tr>' +
      '<th>Keyword</th>' +
      '<th style="width:90px">Frequency</th>' +
      '<th style="width:80px">Avg Price</th>' +
      '<th style="width:80px">Demand</th>' +
      '<th style="width:100px">Competition</th>' +
      '<th style="width:100px">Trend</th>' +
      '<th style="width:120px">Visual</th>' +
      '</tr></thead><tbody>';

    for (var i = 0; i < kws.length; i++) {
      var k = kws[i];
      var pct = Math.round(((k.frequency || 0) / maxFreq) * 100);
      var clsBadge = k.classification ? badgePill(k.classification) : '';
      html += '<tr>' +
        '<td>' + escHtml(k.keyword || '') + '</td>' +
        '<td>' + (k.frequency || 0) + '</td>' +
        '<td>$' + (k.avg_price || 0).toFixed(2) + '</td>' +
        '<td>' + (k.demand_score || 0) + '</td>' +
        '<td>' + escHtml(k.competition_level || '') + '</td>' +
        '<td>' + clsBadge + '</td>' +
        '<td><div class="lv-kw-bar-bg"><div class="lv-kw-bar" style="width:' + pct + '%"></div></div></td>' +
        '</tr>';
    }

    html += '</tbody></table>';
    wrap.innerHTML = html;

    var info = shadowRoot.getElementById('lv-footer-info');
    if (info) info.textContent = kws.length + ' keywords';
  }

  function thSortable(label, key, width) {
    var arrow = '';
    if (state.sortKey === key) {
      arrow = '<span class="sort-arrow">' + (state.sortDir === 'asc' ? '&#9650;' : '&#9660;') + '</span>';
    }
    return '<th data-sort="' + key + '" style="width:' + width + 'px">' + label + arrow + '</th>';
  }

  // ===================== Filter & Sort =====================

  function filterListings(listings) {
    if (state.filter === 'all') return listings.slice();
    if (state.filter === 'buy') return listings.filter(function (l) { return l.winner_tier === 'BUY'; });
    if (state.filter === 'monitor') return listings.filter(function (l) { return l.winner_tier === 'MONITOR'; });
    return listings.filter(function (l) {
      return l.badges && l.badges.indexOf(state.filter) !== -1;
    });
  }

  function sortListings(arr) {
    var key = state.sortKey;
    var dir = state.sortDir === 'asc' ? 1 : -1;
    arr.sort(function (a, b) {
      var va = a[key], vb = b[key];
      if (typeof va === 'string') return dir * (va || '').localeCompare(vb || '');
      return dir * ((va || 0) - (vb || 0));
    });
  }

  // ===================== Data request =====================

  function requestData() {
    chrome.runtime.sendMessage({
      action: 'getClassifiedData',
      request: { type: 'all', timeWindow: state.timeWindow },
    }, function (response) {
      if (!response) return;
      if (response.listings) {
        state.listings = Object.values(response.listings);
      }
      if (response.keywords) {
        state.keywords = Object.values(response.keywords);
      }
      if (response.stats) {
        state.stats = response.stats;
      }
      renderContent();
    });
  }

  // ===================== Public API =====================

  function open() {
    if (document.getElementById(HOST_ID)) return;

    hostEl = document.createElement('div');
    hostEl.id = HOST_ID;
    hostEl.style.cssText = 'position:fixed;inset:0;z-index:2147483648;';

    shadowRoot = hostEl.attachShadow({ mode: 'closed' });

    var style = document.createElement('style');
    style.textContent = getCSS();
    shadowRoot.appendChild(style);

    // Backdrop
    var backdrop = document.createElement('div');
    backdrop.className = 'lv-backdrop';
    backdrop.addEventListener('click', function (e) {
      if (e.target === backdrop) close();
    });

    // Panel
    var panel = buildPanel();
    backdrop.appendChild(panel);
    shadowRoot.appendChild(backdrop);

    document.body.appendChild(hostEl);

    // Escape key
    document.addEventListener('keydown', onEscape);

    // Request data
    requestData();
  }

  function close() {
    document.removeEventListener('keydown', onEscape);
    var host = document.getElementById(HOST_ID);
    if (host && host.parentNode) host.parentNode.removeChild(host);
    hostEl = null;
    shadowRoot = null;
  }

  function onEscape(e) {
    if (e.key === 'Escape') close();
  }

  function isOpen() {
    return !!document.getElementById(HOST_ID);
  }

  /**
   * Refresh with already-enriched listings (from content-main after a scan).
   */
  function refresh(listings) {
    if (!isOpen()) return;
    if (listings) state.listings = listings;
    renderContent();
  }

  // ===================== Helpers =====================

  function escHtml(s) {
    if (!s) return '';
    return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  function escAttr(s) {
    if (!s) return '';
    return s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  function truncate(s, n) {
    return s.length > n ? s.slice(0, n) + '...' : s;
  }

  globalThis.LVDashboard = {
    open: open,
    close: close,
    isOpen: isOpen,
    refresh: refresh,
  };
})();
