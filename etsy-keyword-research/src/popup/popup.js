(function () {
  'use strict';

  // --- Page detection ---
  function detectPage() {
    chrome.runtime.sendMessage({ action: 'getPageInfo' }, function (info) {
      var badge = document.getElementById('page-badge');
      var url = document.getElementById('page-url');
      if (!info || info.type === 'unknown') {
        badge.textContent = 'N/A';
        badge.className = 'page-badge';
        url.textContent = 'Not on an Etsy page';
        document.getElementById('btn-scan').disabled = true;
        return;
      }
      badge.textContent = info.type;
      badge.className = 'page-badge ' + info.type;
      url.textContent = info.query || info.shopName || info.url || '';
      document.getElementById('btn-scan').disabled = false;
    });
  }

  // --- Load metrics ---
  function loadMetrics() {
    chrome.runtime.sendMessage({
      action: 'classifyItems',
      request: { timeWindow: 'monthly' },
    }, function (data) {
      if (!data) return;
      document.getElementById('m-competition').textContent =
        data.totalResults != null ? data.totalResults.toLocaleString() : '--';
      document.getElementById('m-evergreen').textContent = data.evergreenCount || 0;
      document.getElementById('m-trending').textContent = data.trendingCount || 0;
      document.getElementById('m-new').textContent = data.newCount || 0;
    });
  }

  // --- Load totals ---
  function loadTotals() {
    chrome.runtime.sendMessage({
      action: 'getStoredData',
      request: { type: 'all' },
    }, function (data) {
      if (!data) return;
      var lCount = data.listings ? Object.keys(data.listings).length : 0;
      var kCount = data.keywords ? Object.keys(data.keywords).length : 0;
      document.getElementById('total-listings').textContent = lCount.toLocaleString();
      document.getElementById('total-keywords').textContent = kCount.toLocaleString();
    });
  }

  // --- Scan ---
  document.getElementById('btn-scan').addEventListener('click', function () {
    var btn = this;
    var label = document.getElementById('scan-label');
    btn.disabled = true;
    label.textContent = 'Scanning...';

    chrome.runtime.sendMessage({ action: 'triggerScan' }, function (response) {
      btn.disabled = false;
      label.textContent = 'Scan This Page';

      if (!response || response.error) {
        showFeedback('Error: ' + (response ? response.error : 'No response'), true);
        return;
      }

      showFeedback('Found ' + (response.listings_count || 0) + ' listings in ' + (response.duration_ms || 0) + 'ms');
      loadMetrics();
      loadTotals();
    });
  });

  function showFeedback(msg, isError) {
    var el = document.getElementById('scan-feedback');
    var span = document.getElementById('scan-msg');
    el.classList.remove('hidden');
    el.classList.toggle('error', !!isError);
    span.textContent = msg;
    setTimeout(function () { el.classList.add('hidden'); }, 4000);
  }

  // --- Open dashboard ---
  document.getElementById('btn-dashboard').addEventListener('click', function () {
    chrome.runtime.sendMessage({ action: 'openDashboard' });
    window.close();
  });

  // --- Export CSV ---
  document.getElementById('btn-export').addEventListener('click', function () {
    chrome.runtime.sendMessage({ action: 'exportCSV', dataType: 'listings' });
  });

  // --- Clear Data ---
  document.getElementById('btn-clear').addEventListener('click', function () {
    if (confirm('Clear all stored data?')) {
      chrome.runtime.sendMessage({ action: 'clearData', dataType: 'all' }, function () {
        loadMetrics();
        loadTotals();
        showFeedback('Data cleared');
      });
    }
  });

  // --- Etsy API Key ---
  var apiKeyInput = document.getElementById('api-key-input');
  var apiKeyStatus = document.getElementById('api-key-status');

  // Load saved key
  chrome.runtime.sendMessage({ action: 'getEtsyApiKey' }, function (resp) {
    if (resp && resp.apiKey) {
      apiKeyInput.value = resp.apiKey;
      apiKeyStatus.textContent = 'Key saved';
      apiKeyStatus.style.color = '#217005';
    }
  });

  document.getElementById('btn-save-key').addEventListener('click', function () {
    var key = (apiKeyInput.value || '').trim();
    if (!key) {
      apiKeyStatus.textContent = 'Please enter a key';
      apiKeyStatus.style.color = '#dc2626';
      return;
    }
    chrome.runtime.sendMessage({ action: 'saveEtsyApiKey', apiKey: key }, function () {
      apiKeyStatus.textContent = 'Key saved! Reload listing pages for accurate age.';
      apiKeyStatus.style.color = '#217005';
    });
  });

  // --- CraftPlan Integration ---
  var cpUrlInput = document.getElementById('cp-url-input');
  var cpStatus = document.getElementById('cp-status');
  var cpDot = document.getElementById('cp-status-dot');
  var cpSendStatus = document.getElementById('cp-send-status');

  // Load saved CraftPlan URL
  chrome.runtime.sendMessage({ action: 'getCraftPlanUrl' }, function (resp) {
    if (resp && resp.url) {
      cpUrlInput.value = resp.url;
    }
  });

  document.getElementById('btn-cp-save').addEventListener('click', function () {
    var url = (cpUrlInput.value || '').trim();
    if (!url) {
      cpStatus.textContent = 'Enter a URL';
      cpStatus.style.color = '#dc2626';
      return;
    }
    chrome.runtime.sendMessage({ action: 'saveCraftPlanUrl', url: url }, function () {
      cpStatus.textContent = 'URL saved';
      cpStatus.style.color = '#217005';
      cpDot.style.background = '#d1d5db';
      cpDot.title = 'Not tested';
    });
  });

  document.getElementById('btn-cp-test').addEventListener('click', function () {
    var btn = this;
    btn.disabled = true;
    btn.textContent = '...';
    cpStatus.textContent = 'Testing connection...';
    cpStatus.style.color = '#6b7280';

    // Save URL first, then test
    var url = (cpUrlInput.value || '').trim();
    if (url) {
      chrome.runtime.sendMessage({ action: 'saveCraftPlanUrl', url: url }, function () {
        doTest();
      });
    } else {
      doTest();
    }

    function doTest() {
      chrome.runtime.sendMessage({ action: 'testCraftPlanConnection' }, function (resp) {
        btn.disabled = false;
        btn.textContent = 'Test';
        if (resp && resp.success) {
          cpDot.style.background = '#22c55e';
          cpDot.title = 'Connected';
          cpStatus.textContent = 'Connected to CraftPlan ✓';
          cpStatus.style.color = '#217005';
        } else {
          cpDot.style.background = '#ef4444';
          cpDot.title = 'Connection failed';
          cpStatus.textContent = (resp && resp.error) || 'Connection failed';
          cpStatus.style.color = '#dc2626';
        }
      });
    }
  });

  document.getElementById('btn-cp-send').addEventListener('click', function () {
    var btn = this;
    btn.disabled = true;
    btn.textContent = '⏳ Sending...';
    cpSendStatus.textContent = '';
    cpSendStatus.style.color = '#6b7280';

    chrome.runtime.sendMessage({ action: 'sendToCraftPlan' }, function (resp) {
      btn.disabled = false;
      btn.textContent = '🚀 Send All to CraftPlan';

      if (resp && resp.success) {
        cpSendStatus.style.color = '#217005';
        cpSendStatus.innerHTML = '✓ Sent ' + resp.total_sent + ' listings, ' + resp.keywords_sent + ' keywords. ' +
          '<a href="' + resp.craftplan_url + '/etsy-imports" target="_blank" style="color:#667eea;text-decoration:underline;">Open CraftPlan</a>';
        cpDot.style.background = '#22c55e';
      } else {
        cpSendStatus.style.color = '#dc2626';
        cpSendStatus.textContent = '✗ ' + ((resp && resp.error) || 'Send failed');
      }
    });
  });

  // --- Init ---
  detectPage();
  loadMetrics();
  loadTotals();
})();
