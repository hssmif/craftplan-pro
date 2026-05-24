(function () {
  'use strict';

  var FONT_IMPORT = (globalThis.EtsyConstants || {}).FONT_IMPORT || '';
  var SEL = ((globalThis.EtsyConstants || {}).SELECTORS || {}).search || {};

  var injectedIds = {};
  var deepScanProgressEl = null;

  // Winner tier colors
  var TIER_COLORS = {
    BUY:     { bg: '#22c55e', color: '#fff', border: '#16a34a', label: 'BUY' },
    MONITOR: { bg: '#f59e0b', color: '#fff', border: '#d97706', label: 'MONITOR' },
    SKIP:    { bg: '#9ca3af', color: '#fff', border: '#6b7280', label: 'SKIP' },
  };

  function cardButtonCSS() {
    return FONT_IMPORT + '\n' +
      ':host { all: initial; display: block; }' +
      '.lv-card-actions { ' +
        'display: flex; align-items: center; gap: 6px; padding: 6px 8px; ' +
        'font-family: "Inter", sans-serif; ' +
        'background: rgba(255,255,255,0.95); border-top: 1px solid #e5e7eb; ' +
      '}' +
      '.lv-tier-badge { ' +
        'font-size: 10px; font-weight: 700; line-height: 1; ' +
        'padding: 3px 8px; border-radius: 4px; white-space: nowrap; ' +
        'letter-spacing: 0.5px; ' +
      '}' +
      '.lv-score { ' +
        'font-size: 10px; color: #6b7280; font-weight: 500; ' +
      '}' +
      '.lv-send-btn { ' +
        'margin-left: auto; padding: 4px 10px; border-radius: 6px; border: none; ' +
        'background: #8b5cf6; color: #fff; font-size: 10px; font-weight: 600; ' +
        'cursor: pointer; font-family: "Inter", sans-serif; white-space: nowrap; ' +
        'transition: all 0.15s; ' +
      '}' +
      '.lv-send-btn:hover { background: #7c3aed; transform: scale(1.03); }' +
      '.lv-send-btn:disabled { opacity: 0.5; cursor: not-allowed; transform: none; }' +
      '.lv-send-btn.sent { background: #22c55e; }' +
      '.lv-send-btn.error { background: #ef4444; }' +
      '.lv-pod-btn { ' +
        'padding: 4px 10px; border-radius: 6px; border: none; ' +
        'background: linear-gradient(135deg, #a855f7, #ec4899); color: #fff; font-size: 10px; font-weight: 600; ' +
        'cursor: pointer; font-family: "Inter", sans-serif; white-space: nowrap; ' +
        'transition: all 0.15s; ' +
      '}' +
      '.lv-pod-btn:hover { filter: brightness(1.1); transform: scale(1.03); }' +
      '.lv-pod-btn:disabled { opacity: 0.5; cursor: not-allowed; transform: none; }' +
      '.lv-pod-btn.sent { background: #22c55e; }' +
      '.lv-pod-btn.error { background: #ef4444; }' +
      '.lv-deep-scan-btn { ' +
        'padding: 4px 10px; border-radius: 6px; border: 1px solid #667eea; ' +
        'background: transparent; color: #667eea; font-size: 10px; font-weight: 600; ' +
        'cursor: pointer; font-family: "Inter", sans-serif; white-space: nowrap; ' +
        'transition: all 0.15s; ' +
      '}' +
      '.lv-deep-scan-btn:hover { background: #667eea; color: #fff; }' +
      '.lv-deep-scan-btn:disabled { opacity: 0.5; cursor: not-allowed; }';
  }

  /**
   * Find the card DOM element for a given listing_id.
   */
  function findCardByListingId(listingId) {
    var el = document.querySelector('[data-listing-id="' + listingId + '"]');
    if (el) return el;
    el = document.querySelector('[data-listing-card-v2="' + listingId + '"]');
    if (el) return el;
    var links = document.querySelectorAll('a[href*="/listing/' + listingId + '/"]');
    if (links.length > 0) {
      var card = links[0].closest('.v2-listing-card, li[data-listing-id], div[class*="card"], li');
      return card || links[0];
    }
    return null;
  }

  /**
   * Inject action buttons onto a single search card.
   */
  function injectCard(listing) {
    var id = listing.listing_id;
    if (!id) return;
    var hostId = 'lv-card-btn-host-' + id;

    // Remove existing if re-injecting (e.g. after deep scan)
    if (injectedIds[id]) {
      var existing = document.getElementById(hostId);
      if (existing && existing.parentNode) existing.parentNode.removeChild(existing);
      delete injectedIds[id];
    }

    var card = findCardByListingId(id);
    if (!card) return;

    // Find the info area (below the image)
    var infoArea = card.querySelector(SEL.cardInfo || '.v2-listing-card__info');
    var target = infoArea || card;

    // Create shadow host
    var host = document.createElement('div');
    host.id = hostId;
    host.style.cssText = 'width:100%;';

    var shadow = host.attachShadow({ mode: 'closed' });

    var style = document.createElement('style');
    style.textContent = cardButtonCSS();
    shadow.appendChild(style);

    var row = document.createElement('div');
    row.className = 'lv-card-actions';

    // Tier badge
    var tier = listing.winner_tier || 'SKIP';
    var tierColors = TIER_COLORS[tier] || TIER_COLORS.SKIP;
    var tierBadge = document.createElement('span');
    tierBadge.className = 'lv-tier-badge';
    tierBadge.textContent = tierColors.label;
    tierBadge.style.cssText = 'background:' + tierColors.bg + ';color:' + tierColors.color + ';border:1px solid ' + tierColors.border + ';';
    row.appendChild(tierBadge);

    // Score
    var scoreEl = document.createElement('span');
    scoreEl.className = 'lv-score';
    scoreEl.textContent = (listing.winner_score || 0) + '/100';
    row.appendChild(scoreEl);

    // Send to CraftPlan button (only for BUY and MONITOR)
    if (tier === 'BUY' || tier === 'MONITOR') {
      var sendBtn = document.createElement('button');
      sendBtn.className = 'lv-send-btn';
      sendBtn.textContent = '🚀 CraftPlan';
      sendBtn.addEventListener('click', function (e) {
        e.preventDefault();
        e.stopPropagation();
        sendBtn.disabled = true;
        sendBtn.textContent = '⏳...';
        chrome.runtime.sendMessage({
          action: 'sendSingleToCraftPlan',
          listingId: id,
        }, function (resp) {
          sendBtn.disabled = false;
          if (resp && resp.success) {
            sendBtn.textContent = '✓ Sent!';
            sendBtn.classList.add('sent');
            setTimeout(function () {
              sendBtn.textContent = '🚀 CraftPlan';
              sendBtn.classList.remove('sent');
            }, 3000);
          } else {
            sendBtn.textContent = '✗ Error';
            sendBtn.classList.add('error');
            setTimeout(function () {
              sendBtn.textContent = '🚀 CraftPlan';
              sendBtn.classList.remove('error');
            }, 3000);
          }
        });
      });
      row.appendChild(sendBtn);

      // Send to Product Studio button
      var podBtn = document.createElement('button');
      podBtn.className = 'lv-pod-btn';
      podBtn.textContent = '🎨 Studio';
      podBtn.title = 'Send to Product Studio';
      podBtn.addEventListener('click', function (e) {
        e.preventDefault();
        e.stopPropagation();
        podBtn.disabled = true;
        podBtn.textContent = '⏳...';
        chrome.runtime.sendMessage({
          action: 'sendToPodBuilder',
          listingId: id,
        }, function (resp) {
          podBtn.disabled = false;
          if (resp && resp.success) {
            podBtn.textContent = '✓ Opened!';
            podBtn.classList.add('sent');
            setTimeout(function () {
              podBtn.textContent = '🎨 Studio';
              podBtn.classList.remove('sent');
            }, 3000);
          } else {
            podBtn.textContent = '✗ Error';
            podBtn.classList.add('error');
            setTimeout(function () {
              podBtn.textContent = '🎨 Studio';
              podBtn.classList.remove('error');
            }, 3000);
          }
        });
      });
      row.appendChild(podBtn);
    }

    shadow.appendChild(row);
    target.appendChild(host);
    injectedIds[id] = true;
  }

  /**
   * Inject card buttons for all listings in batch.
   */
  function injectAll(listings) {
    if (!listings || !listings.length) return;
    var idx = 0;
    var batchSize = 10;

    function processBatch() {
      var end = Math.min(idx + batchSize, listings.length);
      for (; idx < end; idx++) {
        injectCard(listings[idx]);
      }
      if (idx < listings.length) {
        requestAnimationFrame(processBatch);
      }
    }

    requestAnimationFrame(processBatch);
  }

  /**
   * Create and inject the "Send TOP Winners to CraftPlan" + "Deep Scan Top N" bar
   * above the search results.
   */
  function injectWinnersBar(listings) {
    var existingBar = document.getElementById('lv-winners-bar-host');
    if (existingBar) existingBar.parentNode.removeChild(existingBar);

    // Find the results container
    var container = null;
    var containerSels = SEL.resultsContainer || [];
    for (var i = 0; i < containerSels.length; i++) {
      container = document.querySelector(containerSels[i]);
      if (container) break;
    }
    if (!container) return;

    // Count winners
    var buyCount = 0, monitorCount = 0;
    var winnerIds = [];
    var winnerUrls = [];
    for (var j = 0; j < listings.length; j++) {
      if (listings[j].winner_tier === 'BUY') {
        buyCount++;
        winnerIds.push(listings[j].listing_id);
        winnerUrls.push(listings[j].url);
      } else if (listings[j].winner_tier === 'MONITOR') {
        monitorCount++;
        winnerIds.push(listings[j].listing_id);
        winnerUrls.push(listings[j].url);
      }
    }

    var host = document.createElement('div');
    host.id = 'lv-winners-bar-host';
    host.style.cssText = 'width:100%;margin-bottom:12px;';

    var shadow = host.attachShadow({ mode: 'closed' });

    var style = document.createElement('style');
    style.textContent = FONT_IMPORT + '\n' +
      ':host { all: initial; display: block; }' +
      '.lv-winners-bar { ' +
        'display: flex; flex-wrap: wrap; align-items: center; gap: 12px; ' +
        'padding: 12px 16px; border-radius: 10px; ' +
        'background: linear-gradient(135deg, #f0f4ff 0%, #faf5ff 100%); ' +
        'border: 1px solid #e0e7ff; font-family: "Inter", sans-serif; ' +
      '}' +
      '.lv-winners-summary { font-size: 13px; font-weight: 500; color: #374151; }' +
      '.lv-winners-summary strong { color: #22c55e; }' +
      '.lv-winners-summary .monitor { color: #f59e0b; }' +
      '.lv-action-btn { ' +
        'padding: 8px 16px; border-radius: 8px; border: none; ' +
        'font-size: 12px; font-weight: 600; cursor: pointer; ' +
        'font-family: "Inter", sans-serif; transition: all 0.15s; white-space: nowrap; ' +
      '}' +
      '.lv-send-winners { background: #8b5cf6; color: #fff; }' +
      '.lv-send-winners:hover { background: #7c3aed; }' +
      '.lv-send-winners:disabled { opacity: 0.5; cursor: not-allowed; }' +
      '.lv-deep-scan { background: #fff; color: #667eea; border: 1px solid #667eea; }' +
      '.lv-deep-scan:hover { background: #667eea; color: #fff; }' +
      '.lv-deep-scan:disabled { opacity: 0.5; cursor: not-allowed; }' +
      '.lv-pod-winners { background: linear-gradient(135deg, #a855f7, #ec4899); color: #fff; }' +
      '.lv-pod-winners:hover { filter: brightness(1.1); }' +
      '.lv-pod-winners:disabled { opacity: 0.5; cursor: not-allowed; filter: none; }' +
      '.lv-progress { font-size: 11px; color: #6b7280; margin-left: auto; }';
    shadow.appendChild(style);

    var bar = document.createElement('div');
    bar.className = 'lv-winners-bar';

    // Summary text
    var summary = document.createElement('span');
    summary.className = 'lv-winners-summary';
    summary.innerHTML = '<strong>' + buyCount + ' BUY</strong> + <span class="monitor">' + monitorCount + ' MONITOR</span> of ' + listings.length + ' listings';
    bar.appendChild(summary);

    // Send TOP Winners button
    if (winnerIds.length > 0) {
      var sendWinnersBtn = document.createElement('button');
      sendWinnersBtn.className = 'lv-action-btn lv-send-winners';
      sendWinnersBtn.textContent = '🚀 Send ' + winnerIds.length + ' Winners to CraftPlan';
      sendWinnersBtn.addEventListener('click', function () {
        sendWinnersBtn.disabled = true;
        sendWinnersBtn.textContent = '⏳ Sending...';
        chrome.runtime.sendMessage({
          action: 'sendWinnersToCraftPlan',
          listingIds: winnerIds,
        }, function (resp) {
          sendWinnersBtn.disabled = false;
          if (resp && resp.success) {
            sendWinnersBtn.textContent = '✓ Sent ' + (resp.total_sent || winnerIds.length) + ' winners!';
            sendWinnersBtn.style.background = '#22c55e';
            setTimeout(function () {
              sendWinnersBtn.textContent = '🚀 Send ' + winnerIds.length + ' Winners to CraftPlan';
              sendWinnersBtn.style.background = '';
            }, 4000);
          } else {
            sendWinnersBtn.textContent = '✗ ' + ((resp && resp.error) || 'Failed');
            sendWinnersBtn.style.background = '#ef4444';
            setTimeout(function () {
              sendWinnersBtn.textContent = '🚀 Send ' + winnerIds.length + ' Winners to CraftPlan';
              sendWinnersBtn.style.background = '';
            }, 4000);
          }
        });
      });
      bar.appendChild(sendWinnersBtn);
    }

    // Deep Scan button (top 25 winners)
    var deepScanCount = Math.min(25, winnerIds.length);
    if (deepScanCount > 0) {
      var deepBtn = document.createElement('button');
      deepBtn.className = 'lv-action-btn lv-deep-scan';
      deepBtn.textContent = '🔍 Deep Scan Top ' + deepScanCount;
      deepBtn.addEventListener('click', function () {
        deepBtn.disabled = true;
        deepBtn.textContent = '⏳ Scanning...';
        var topIds = winnerIds.slice(0, deepScanCount);
        var topUrls = winnerUrls.slice(0, deepScanCount);
        chrome.runtime.sendMessage({
          action: 'deepScanListings',
          listingIds: topIds,
          urls: topUrls,
        }, function (resp) {
          deepBtn.disabled = false;
          if (resp && resp.success) {
            deepBtn.textContent = '✓ Scanned ' + resp.scanned + '/' + resp.total;
            setTimeout(function () {
              deepBtn.textContent = '🔍 Deep Scan Top ' + deepScanCount;
            }, 5000);
          } else {
            deepBtn.textContent = '✗ Error';
            setTimeout(function () {
              deepBtn.textContent = '🔍 Deep Scan Top ' + deepScanCount;
            }, 3000);
          }
        });
      });
      bar.appendChild(deepBtn);
    }

    // Product Studio button — sends top winner to Product Studio
    if (winnerIds.length > 0) {
      // Find the highest-score BUY listing
      var topListing = null;
      for (var p = 0; p < listings.length; p++) {
        if (listings[p].winner_tier === 'BUY') {
          if (!topListing || (listings[p].winner_score || 0) > (topListing.winner_score || 0)) {
            topListing = listings[p];
          }
        }
      }
      if (!topListing) topListing = listings[0]; // fallback to first winner

      var podWinnersBtn = document.createElement('button');
      podWinnersBtn.className = 'lv-action-btn lv-pod-winners';
      podWinnersBtn.textContent = '🎨 Studio Top Pick';
      podWinnersBtn.title = 'Send best winner to Product Studio';
      podWinnersBtn.addEventListener('click', function () {
        podWinnersBtn.disabled = true;
        podWinnersBtn.textContent = '⏳ Opening...';
        chrome.runtime.sendMessage({
          action: 'sendToPodBuilder',
          listingId: topListing.listing_id,
        }, function (resp) {
          podWinnersBtn.disabled = false;
          if (resp && resp.success) {
            podWinnersBtn.textContent = '✓ Opened!';
            podWinnersBtn.style.background = '#22c55e';
            setTimeout(function () {
              podWinnersBtn.textContent = '🎨 Studio Top Pick';
              podWinnersBtn.style.background = '';
            }, 4000);
          } else {
            podWinnersBtn.textContent = '✗ ' + ((resp && resp.error) || 'Failed');
            podWinnersBtn.style.background = '#ef4444';
            setTimeout(function () {
              podWinnersBtn.textContent = '🎨 Studio Top Pick';
              podWinnersBtn.style.background = '';
            }, 4000);
          }
        });
      });
      bar.appendChild(podWinnersBtn);
    }

    // Progress indicator (updated via messages)
    var progressEl = document.createElement('span');
    progressEl.className = 'lv-progress';
    progressEl.id = 'lv-deep-progress';
    bar.appendChild(progressEl);
    deepScanProgressEl = progressEl;

    shadow.appendChild(bar);
    container.parentNode.insertBefore(host, container);
  }

  /**
   * Update deep scan progress indicator.
   */
  function updateDeepScanProgress(msg) {
    if (deepScanProgressEl) {
      deepScanProgressEl.textContent = 'Scanning ' + msg.current + '/' + msg.total + '...';
    }
  }

  /**
   * Deep scan complete callback.
   */
  function onDeepScanComplete(msg) {
    if (deepScanProgressEl) {
      deepScanProgressEl.textContent = '✓ Done: ' + msg.scanned + ' scanned, ' + msg.failed + ' failed';
      setTimeout(function () {
        if (deepScanProgressEl) deepScanProgressEl.textContent = '';
      }, 5000);
    }
  }

  /**
   * Remove all injected card buttons.
   */
  function removeAll() {
    var hosts = document.querySelectorAll('[id^="lv-card-btn-host-"]');
    for (var i = 0; i < hosts.length; i++) {
      if (hosts[i].parentNode) hosts[i].parentNode.removeChild(hosts[i]);
    }
    var bar = document.getElementById('lv-winners-bar-host');
    if (bar && bar.parentNode) bar.parentNode.removeChild(bar);
    injectedIds = {};
  }

  globalThis.LVCardButtons = {
    injectAll: function (listings) {
      injectAll(listings);
      injectWinnersBar(listings);
    },
    removeAll: removeAll,
    updateDeepScanProgress: updateDeepScanProgress,
    onDeepScanComplete: onDeepScanComplete,
  };
})();
