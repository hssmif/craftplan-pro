// ══════════════════════════════════════════════════════════════
// CraftPlan Bridge — Content Script
// Runs on localhost CraftPlan pages. Announces the extension ID
// so the POD Builder can auto-detect and communicate with us.
// ══════════════════════════════════════════════════════════════

(function () {
  'use strict';

  var extensionId = chrome.runtime.id;

  // Inject extension ID into the page so CraftPlan app can read it
  var beacon = document.createElement('meta');
  beacon.name = 'listingview-extension-id';
  beacon.content = extensionId;
  document.head.appendChild(beacon);

  // Also dispatch a custom event for immediate detection
  window.dispatchEvent(new CustomEvent('listingview-ready', {
    detail: { extensionId: extensionId, name: 'ListingView' }
  }));

  console.log('[ListingView Bridge] Extension ID announced: ' + extensionId);

  // Re-announce periodically in case the app loads after us
  var announceCount = 0;
  var announceInterval = setInterval(function () {
    window.dispatchEvent(new CustomEvent('listingview-ready', {
      detail: { extensionId: extensionId, name: 'ListingView' }
    }));
    announceCount++;
    if (announceCount >= 10) clearInterval(announceInterval); // Stop after ~10 seconds
  }, 1000);
})();
