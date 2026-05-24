(function () {
  'use strict';

  /**
   * Debounce a function call
   */
  function debounce(fn, ms) {
    let timer;
    return function (...args) {
      clearTimeout(timer);
      timer = setTimeout(() => fn.apply(this, args), ms);
    };
  }

  /**
   * Format a number as currency
   */
  function formatPrice(amount, currency) {
    if (amount == null || isNaN(amount)) return '—';
    currency = currency || 'USD';
    try {
      return new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(amount);
    } catch {
      return '$' + Number(amount).toFixed(2);
    }
  }

  /**
   * Try multiple CSS selectors against a parent, return first match's extracted value.
   * @param {Element} parent
   * @param {string[]} selectors
   * @param {'text'|'href'|'src'|string} extract - what to extract (default: textContent)
   * @returns {string|null}
   */
  function trySelectors(parent, selectors, extract) {
    extract = extract || 'text';
    if (!parent) return null;
    for (const sel of selectors) {
      try {
        const el = parent.querySelector(sel);
        if (!el) continue;
        if (extract === 'text') return (el.textContent || '').trim();
        if (extract === 'href') return el.href || el.getAttribute('href');
        if (extract === 'src') return el.src || el.getAttribute('src');
        return el.getAttribute(extract);
      } catch {
        // selector invalid, skip
      }
    }
    return null;
  }

  /**
   * Extract a listing ID from a URL string
   */
  function extractListingIdFromUrl(url) {
    if (!url) return null;
    const match = url.match(/\/listing\/(\d+)/);
    return match ? match[1] : null;
  }

  /**
   * Extract price number from text like "$4.99" or "4,99"
   */
  function extractPrice(text) {
    if (!text) return null;
    const match = text.replace(/,/g, '').match(/(\d+\.?\d*)/);
    return match ? parseFloat(match[1]) : null;
  }

  /**
   * Extract number from text like "(1,234)" or "1,234 reviews"
   */
  function extractNumber(text) {
    if (!text) return null;
    const clean = text.replace(/[,\s]/g, '');
    const match = clean.match(/(\d+)/);
    return match ? parseInt(match[1], 10) : null;
  }

  /**
   * Escape a value for CSV
   */
  function escapeCSV(value) {
    if (value == null) return '';
    const str = String(value);
    if (str.includes(',') || str.includes('"') || str.includes('\n')) {
      return '"' + str.replace(/"/g, '""') + '"';
    }
    return str;
  }

  /**
   * Generate a simple unique ID
   */
  function generateId() {
    return 'scan_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 7);
  }

  /**
   * Get ISO timestamp
   */
  function now() {
    return new Date().toISOString();
  }

  /**
   * Truncate text with ellipsis
   */
  function truncate(str, maxLen) {
    maxLen = maxLen || 60;
    if (!str || str.length <= maxLen) return str || '';
    return str.slice(0, maxLen - 1) + '…';
  }

  globalThis.EtsyUtils = {
    debounce,
    formatPrice,
    trySelectors,
    extractListingIdFromUrl,
    extractPrice,
    extractNumber,
    escapeCSV,
    generateId,
    now,
    truncate,
  };
})();
