(function () {
  'use strict';

  var BADGE_COLORS = (globalThis.EtsyConstants || {}).BADGE_COLORS || {};
  var FONT_IMPORT = (globalThis.EtsyConstants || {}).FONT_IMPORT || '';
  var SEL = ((globalThis.EtsyConstants || {}).SELECTORS || {}).search || {};

  var injectedIds = {};

  function badgeCSS() {
    return FONT_IMPORT + '\n' +
      ':host { all: initial; display: block; }' +
      '.lv-badge-row { ' +
        'display: flex; flex-wrap: wrap; gap: 4px; padding: 6px; ' +
        'font-family: "Inter", sans-serif; ' +
      '}' +
      '.lv-badge { ' +
        'font-size: 11px; font-weight: 600; line-height: 1; ' +
        'padding: 3px 8px; border-radius: 1rem; max-height: 22px; ' +
        'white-space: nowrap; border-width: 1px; border-style: solid; ' +
        'display: inline-flex; align-items: center; ' +
      '}';
  }

  function createBadgeEl(badgeKey) {
    var c = BADGE_COLORS[badgeKey];
    if (!c) return null;
    var span = document.createElement('span');
    span.className = 'lv-badge';
    span.textContent = c.label;
    span.style.cssText = 'background:' + c.bg + ';color:' + c.color + ';border-color:' + c.border + ';';
    return span;
  }

  /**
   * Find the card DOM element for a given listing_id.
   */
  function findCardByListingId(listingId) {
    // data-listing-id attribute
    var el = document.querySelector('[data-listing-id="' + listingId + '"]');
    if (el) return el;
    // data-listing-card-v2 attribute
    el = document.querySelector('[data-listing-card-v2="' + listingId + '"]');
    if (el) return el;
    // href-based lookup
    var links = document.querySelectorAll('a[href*="/listing/' + listingId + '/"]');
    if (links.length > 0) {
      var card = links[0].closest('.v2-listing-card, li[data-listing-id], div[class*="card"], li');
      return card || links[0];
    }
    return null;
  }

  /**
   * Inject badges onto a single card.
   */
  function injectCard(listing) {
    var id = listing.listing_id;
    if (!id || !listing.badges || listing.badges.length === 0) return;
    var hostId = 'lv-badge-host-' + id;
    if (injectedIds[id]) return;

    var card = findCardByListingId(id);
    if (!card) return;

    // Find the image area to position badges
    var imgArea = card.querySelector(SEL.cardImage || '.v2-listing-card__img');
    var target = imgArea || card;

    // Ensure relative positioning on target
    var pos = window.getComputedStyle(target).position;
    if (pos === 'static') target.style.position = 'relative';

    // Create shadow host
    var host = document.createElement('div');
    host.id = hostId;
    host.style.cssText = 'position:absolute;bottom:0;left:0;right:0;z-index:10;pointer-events:none;';

    var shadow = host.attachShadow({ mode: 'closed' });

    var style = document.createElement('style');
    style.textContent = badgeCSS();
    shadow.appendChild(style);

    var row = document.createElement('div');
    row.className = 'lv-badge-row';

    for (var i = 0; i < listing.badges.length; i++) {
      var badge = createBadgeEl(listing.badges[i]);
      if (badge) row.appendChild(badge);
    }

    shadow.appendChild(row);
    target.appendChild(host);
    injectedIds[id] = true;
  }

  /**
   * Inject badges for a batch of enriched listings.
   * Uses requestAnimationFrame batching (10 per frame).
   */
  function injectBadges(listings) {
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
   * Remove all injected badge hosts.
   */
  function removeAllBadges() {
    var hosts = document.querySelectorAll('[id^="lv-badge-host-"]');
    for (var i = 0; i < hosts.length; i++) {
      if (hosts[i].parentNode) hosts[i].parentNode.removeChild(hosts[i]);
    }
    injectedIds = {};
  }

  globalThis.LVBadgeInjector = {
    injectBadges: injectBadges,
    removeAllBadges: removeAllBadges,
  };
})();
