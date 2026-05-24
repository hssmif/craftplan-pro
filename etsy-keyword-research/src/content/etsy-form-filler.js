// ══════════════════════════════════════════════════════════════
// Etsy Listing Form Filler — Content Script
// Runs on Etsy's listing creation/edit pages.
// Reads pending listing payload from chrome.storage, fills form
// fields step-by-step, and highlights the Publish button.
// NEVER auto-publishes — the user must click Publish themselves.
// ══════════════════════════════════════════════════════════════

(function () {
  'use strict';

  var TOTAL_STEPS = 13;

  // ── DOM Helpers ────────────────────────────────────────────

  function delay(ms) {
    return new Promise(function (resolve) { setTimeout(resolve, ms); });
  }

  function waitForElement(selectors, timeout) {
    timeout = timeout || 10000;
    return new Promise(function (resolve, reject) {
      // Check if already present
      for (var i = 0; i < selectors.length; i++) {
        var el = document.querySelector(selectors[i]);
        if (el) { resolve(el); return; }
      }
      // Observe DOM for changes
      var timer = null;
      var observer = new MutationObserver(function () {
        for (var j = 0; j < selectors.length; j++) {
          var found = document.querySelector(selectors[j]);
          if (found) {
            observer.disconnect();
            clearTimeout(timer);
            resolve(found);
            return;
          }
        }
      });
      observer.observe(document.body, { childList: true, subtree: true });
      timer = setTimeout(function () {
        observer.disconnect();
        reject(new Error('Element not found: ' + selectors.join(', ')));
      }, timeout);
    });
  }

  function simulateInput(el, value) {
    var nativeSetter = Object.getOwnPropertyDescriptor(
      el.tagName === 'TEXTAREA' ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype,
      'value'
    );
    if (nativeSetter && nativeSetter.set) {
      nativeSetter.set.call(el, value);
    } else {
      el.value = value;
    }
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
  }

  function simulateClick(el) {
    el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
  }

  function selectOption(selectEl, value) {
    var options = Array.from(selectEl.options);
    for (var i = 0; i < options.length; i++) {
      if (options[i].value === value || (options[i].textContent || '').trim() === value) {
        selectEl.value = options[i].value;
        selectEl.dispatchEvent(new Event('change', { bubbles: true }));
        return true;
      }
    }
    return false;
  }

  function typeText(el, text, delayMs) {
    delayMs = delayMs || 30;
    return new Promise(function (resolve) {
      el.focus();
      simulateInput(el, '');
      var i = 0;
      function nextChar() {
        if (i < text.length) {
          simulateInput(el, text.substring(0, i + 1));
          i++;
          setTimeout(nextChar, delayMs);
        } else {
          resolve();
        }
      }
      nextChar();
    });
  }

  function pressKey(el, key) {
    el.dispatchEvent(new KeyboardEvent('keydown', { key: key, bubbles: true }));
    el.dispatchEvent(new KeyboardEvent('keypress', { key: key, bubbles: true }));
    el.dispatchEvent(new KeyboardEvent('keyup', { key: key, bubbles: true }));
  }

  function scrollToElement(el) {
    el.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }

  function highlightElement(el, color) {
    el.style.outline = '3px solid ' + (color || '#10b981');
    el.style.outlineOffset = '2px';
    el.style.boxShadow = '0 0 20px ' + (color || '#10b981') + '40';
    el.style.transition = 'all 0.3s ease';
  }

  // ── Progress reporting ──────────────────────────────────────

  function reportProgress(step, total, label, status) {
    status = status || 'running';
    var msg = { type: 'LISTING_PROGRESS', step: step, total: total, label: label, status: status };
    chrome.runtime.sendMessage(msg, function () {
      if (chrome.runtime.lastError) { /* ok */ }
    });
    console.log('[ListingView Filler] Step ' + step + '/' + total + ': ' + label + ' (' + status + ')');
  }

  // ── Individual form-fill steps ──────────────────────────────

  async function fillTitle(payload) {
    var step = 1, label = 'Filling title';
    reportProgress(step, TOTAL_STEPS, label);
    try {
      var el = await waitForElement([
        'input[name*="title"]',
        '#listing-edit-title input',
        'textarea[aria-label*="Title"]',
        'input[aria-label*="Title"]',
        'input[placeholder*="title" i]',
        '#title-input',
      ]);
      simulateInput(el, payload.title);
      await delay(300);
      return { step: step, label: label, success: true };
    } catch (err) {
      return { step: step, label: label, success: false, error: err.message };
    }
  }

  async function fillPhotos(payload) {
    var step = 2, label = 'Uploading photos';
    reportProgress(step, TOTAL_STEPS, label);
    try {
      if (!payload.images || payload.images.length === 0) {
        return { step: step, label: label, success: true, error: 'No images — skipped' };
      }
      var fileInput = await waitForElement([
        'input[type="file"][accept*="image"]',
        '.image-upload input[type="file"]',
        'input[type="file"]',
      ]);

      var dt = new DataTransfer();
      for (var i = 0; i < payload.images.length; i++) {
        var base64 = payload.images[i];
        var dataUrl = base64.startsWith('data:') ? base64 : 'data:image/png;base64,' + base64;
        var resp = await fetch(dataUrl);
        var blob = await resp.blob();
        var file = new File([blob], 'mockup-' + (i + 1) + '.png', { type: 'image/png' });
        dt.items.add(file);
      }

      var nativeSetter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'files');
      if (nativeSetter && nativeSetter.set) {
        nativeSetter.set.call(fileInput, dt.files);
      } else {
        Object.defineProperty(fileInput, 'files', { value: dt.files, writable: true });
      }
      fileInput.dispatchEvent(new Event('change', { bubbles: true }));
      fileInput.dispatchEvent(new Event('input', { bubbles: true }));
      await delay(2000);
      return { step: step, label: label, success: true };
    } catch (err) {
      return { step: step, label: label, success: false, error: err.message };
    }
  }

  async function fillCategory(payload) {
    var step = 3, label = 'Setting category';
    reportProgress(step, TOTAL_STEPS, label);
    try {
      if (!payload.category) {
        return { step: step, label: label, success: true, error: 'No category — skipped' };
      }
      var el = await waitForElement([
        '#taxonomy-search input',
        'input[placeholder*="category" i]',
        'input[aria-label*="category" i]',
        'input[name*="taxonomy"]',
      ]);
      await typeText(el, payload.category, 30);
      await delay(1500);
      try {
        var dropdown = await waitForElement([
          '[role="listbox"] [role="option"]',
          '.wt-menu__item',
          '.autocomplete-option',
          '[data-taxonomy-id]',
        ], 3000);
        simulateClick(dropdown);
      } catch (e) {
        console.log('[ListingView Filler] Category dropdown not found, text typed only');
      }
      await delay(500);
      return { step: step, label: label, success: true };
    } catch (err) {
      return { step: step, label: label, success: false, error: err.message };
    }
  }

  async function fillWhoMadeIt() {
    var step = 4, label = 'Setting "Who made it"';
    reportProgress(step, TOTAL_STEPS, label);
    try {
      var el = await waitForElement([
        'select[name*="who_made"]', '#who_made',
        'select[aria-label*="Who made it" i]',
      ], 5000);
      if (el.tagName === 'SELECT') {
        if (!selectOption(el, 'i_did')) selectOption(el, 'I did');
      } else {
        var radios = document.querySelectorAll('input[name*="who_made"]');
        radios.forEach(function (radio) {
          var lbl = (radio.closest('label') || {}).textContent || '';
          if (lbl.toLowerCase().includes('i did')) simulateClick(radio);
        });
      }
      await delay(300);
      return { step: step, label: label, success: true };
    } catch (err) {
      return { step: step, label: label, success: false, error: err.message };
    }
  }

  async function fillWhatIsIt() {
    var step = 5, label = 'Setting "What is it"';
    reportProgress(step, TOTAL_STEPS, label);
    try {
      var el = await waitForElement([
        'select[name*="is_supply"]', '#is_supply',
        'select[aria-label*="What is it" i]',
      ], 5000);
      if (el.tagName === 'SELECT') {
        if (!selectOption(el, 'not_supply')) selectOption(el, 'A finished product');
      }
      await delay(300);
      return { step: step, label: label, success: true };
    } catch (err) {
      return { step: step, label: label, success: false, error: err.message };
    }
  }

  async function fillWhenMade() {
    var step = 6, label = 'Setting "When was it made"';
    reportProgress(step, TOTAL_STEPS, label);
    try {
      var el = await waitForElement([
        'select[name*="when_made"]', '#when_made',
        'select[aria-label*="When" i]',
      ], 5000);
      if (el.tagName === 'SELECT') {
        if (!selectOption(el, 'made_to_order')) selectOption(el, 'Made to order');
      }
      await delay(300);
      return { step: step, label: label, success: true };
    } catch (err) {
      return { step: step, label: label, success: false, error: err.message };
    }
  }

  async function fillDescription(payload) {
    var step = 7, label = 'Filling description';
    reportProgress(step, TOTAL_STEPS, label);
    try {
      var el = await waitForElement([
        'textarea[name*="description"]',
        '#description-text-area-input',
        '#description textarea',
        'textarea[aria-label*="Description" i]',
        'textarea[placeholder*="description" i]',
      ]);
      scrollToElement(el);
      await delay(300);
      simulateInput(el, payload.description);
      await delay(300);
      return { step: step, label: label, success: true };
    } catch (err) {
      return { step: step, label: label, success: false, error: err.message };
    }
  }

  async function fillTags(payload) {
    var step = 8, label = 'Adding tags';
    reportProgress(step, TOTAL_STEPS, label);
    try {
      if (!payload.tags || payload.tags.length === 0) {
        return { step: step, label: label, success: true, error: 'No tags — skipped' };
      }
      var tagInput = await waitForElement([
        'input[name*="tag"]', '#tag-new-tag-input',
        'input[aria-label*="tag" i]', 'input[placeholder*="tag" i]',
      ]);
      scrollToElement(tagInput);
      await delay(300);
      var tagsToAdd = payload.tags.slice(0, 13);
      var addedCount = 0;
      for (var i = 0; i < tagsToAdd.length; i++) {
        try {
          simulateInput(tagInput, '');
          await delay(100);
          simulateInput(tagInput, tagsToAdd[i]);
          await delay(200);
          pressKey(tagInput, 'Enter');
          await delay(400);
          addedCount++;
        } catch (e) {
          console.log('[ListingView Filler] Failed to add tag: ' + tagsToAdd[i]);
        }
      }
      return { step: step, label: label, success: addedCount > 0,
        error: addedCount < tagsToAdd.length ? 'Added ' + addedCount + '/' + tagsToAdd.length + ' tags' : undefined };
    } catch (err) {
      return { step: step, label: label, success: false, error: err.message };
    }
  }

  async function fillPrice(payload) {
    var step = 9, label = 'Setting price';
    reportProgress(step, TOTAL_STEPS, label);
    try {
      var el = await waitForElement([
        'input[name*="price"]', '#price-input',
        'input[aria-label*="Price" i]',
        'input[type="number"][placeholder*="0.00"]',
      ]);
      scrollToElement(el);
      await delay(300);
      simulateInput(el, String(payload.price));
      await delay(300);
      return { step: step, label: label, success: true };
    } catch (err) {
      return { step: step, label: label, success: false, error: err.message };
    }
  }

  async function fillQuantity(payload) {
    var step = 10, label = 'Setting quantity';
    reportProgress(step, TOTAL_STEPS, label);
    try {
      var el = await waitForElement([
        'input[name*="quantity"]', '#quantity-input',
        'input[aria-label*="Quantity" i]',
      ], 5000);
      scrollToElement(el);
      await delay(300);
      simulateInput(el, String(payload.quantity || 999));
      await delay(300);
      return { step: step, label: label, success: true };
    } catch (err) {
      return { step: step, label: label, success: false, error: err.message };
    }
  }

  async function fillShipping() {
    var step = 11, label = 'Selecting shipping profile';
    reportProgress(step, TOTAL_STEPS, label);
    try {
      var el = await waitForElement([
        'select[name*="shipping"]', 'select[aria-label*="shipping" i]',
        '#shipping-profile-select', 'select[name*="profile"]',
      ], 5000);
      if (el.tagName === 'SELECT') {
        var options = Array.from(el.options);
        var profile = options.find(function (o) {
          return o.value && o.value !== '' && !(o.textContent || '').toLowerCase().includes('none');
        });
        if (profile) {
          el.value = profile.value;
          el.dispatchEvent(new Event('change', { bubbles: true }));
        }
      }
      await delay(300);
      return { step: step, label: label, success: true };
    } catch (err) {
      return { step: step, label: label, success: false, error: err.message };
    }
  }

  async function fillProcessingTime(payload) {
    var step = 12, label = 'Setting processing time';
    reportProgress(step, TOTAL_STEPS, label);
    try {
      var el = await waitForElement([
        'select[name*="processing"]', 'select[aria-label*="processing" i]',
        '#processing-time',
      ], 5000);
      if (el.tagName === 'SELECT') {
        var time = (payload && payload.processingTime) || '3_5_business_days';
        if (!selectOption(el, time)) selectOption(el, '3-5 business days');
      }
      await delay(300);
      return { step: step, label: label, success: true };
    } catch (err) {
      return { step: step, label: label, success: false, error: err.message };
    }
  }

  async function highlightPublishButton() {
    var step = 13, label = 'Highlighting Publish button';
    reportProgress(step, TOTAL_STEPS, label);
    try {
      var el = await waitForElement([
        'button[data-action="publish"]',
        'button[type="submit"].wt-btn--filled',
        'button:not([disabled])[type="submit"]',
        '.listing-editor-actions button.wt-btn--filled',
      ], 5000);
      scrollToElement(el);
      await delay(500);
      highlightElement(el, '#10b981');

      var tooltip = document.createElement('div');
      tooltip.style.cssText =
        'position:fixed;bottom:20px;left:50%;transform:translateX(-50%);' +
        'background:linear-gradient(135deg,#10b981,#059669);color:white;' +
        'padding:12px 24px;border-radius:12px;font-size:14px;font-weight:600;' +
        'z-index:999999;box-shadow:0 4px 20px rgba(16,185,129,0.3);';
      tooltip.textContent = 'All fields filled! Review and click Publish when ready.';
      document.body.appendChild(tooltip);
      setTimeout(function () { tooltip.remove(); }, 10000);

      return { step: step, label: label, success: true };
    } catch (err) {
      return { step: step, label: label, success: false, error: err.message };
    }
  }

  // ── Main form-fill orchestrator ─────────────────────────────

  async function fillListingForm(payload) {
    console.log('[ListingView Filler] Starting form fill with payload:', payload);
    await delay(2000);

    var results = [];
    var steps = [
      function () { return fillTitle(payload); },
      function () { return fillPhotos(payload); },
      function () { return fillCategory(payload); },
      function () { return fillWhoMadeIt(); },
      function () { return fillWhatIsIt(); },
      function () { return fillWhenMade(); },
      function () { return fillDescription(payload); },
      function () { return fillTags(payload); },
      function () { return fillPrice(payload); },
      function () { return fillQuantity(payload); },
      function () { return fillShipping(); },
      function () { return fillProcessingTime(payload); },
      function () { return highlightPublishButton(); },
    ];

    for (var i = 0; i < steps.length; i++) {
      try {
        var result = await steps[i]();
        results.push(result);
        reportProgress(result.step, TOTAL_STEPS, result.label, result.success ? 'done' : 'error');
        await delay(500);
      } catch (err) {
        console.error('[ListingView Filler] Unexpected step error:', err);
      }
    }

    var succeeded = results.filter(function (r) { return r.success; }).length;
    var failed = results.filter(function (r) { return !r.success; }).length;
    console.log('[ListingView Filler] Done! ' + succeeded + '/' + results.length + ' succeeded, ' + failed + ' failed');

    if (failed > 0) {
      console.log('[ListingView Filler] Failed steps:');
      results.filter(function (r) { return !r.success; }).forEach(function (r) {
        console.log('  Step ' + r.step + ' (' + r.label + '): ' + r.error);
      });
    }

    chrome.runtime.sendMessage({
      type: 'LISTING_READY',
      succeeded: succeeded,
      failed: failed,
      total: results.length,
      results: results,
    }, function () {
      if (chrome.runtime.lastError) { /* ok */ }
    });
  }

  // ── Activation ──────────────────────────────────────────────

  function checkForPendingListing() {
    chrome.storage.local.get('pendingEtsyListing', function (data) {
      var payload = data.pendingEtsyListing;
      if (!payload) {
        console.log('[ListingView Filler] No pending listing found');
        return;
      }
      console.log('[ListingView Filler] Found pending listing, starting fill...');
      chrome.storage.local.remove('pendingEtsyListing', function () {
        fillListingForm(payload);
      });
    });
  }

  // Wait for page to load before checking
  setTimeout(checkForPendingListing, 3000);

  // Listen for manual trigger from background/popup
  chrome.runtime.onMessage.addListener(function (msg, sender, sendResponse) {
    if (msg.type === 'FILL_LISTING' && msg.payload) {
      fillListingForm(msg.payload);
      sendResponse({ ok: true });
    }
    // Forward progress to background for relay to CraftPlan
    if (msg.type === 'LISTING_PROGRESS') {
      chrome.storage.local.set({ listingProgress: msg });
    }
  });

})();
