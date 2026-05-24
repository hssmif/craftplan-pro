(function () {
  'use strict';

  var FONT_IMPORT = (globalThis.EtsyConstants || {}).FONT_IMPORT || '';
  var STORAGE_KEY = ((globalThis.EtsyConstants || {}).STORAGE_KEYS || {}).floatingPos || 'listing-view-floating-tools';
  var HOST_ID = 'listing-view-floating-shadow-host';

  var hostEl = null;
  var shadowRoot = null;
  var isDragging = false;
  var dragStartY = 0;
  var startTop = 0;
  var dragDistance = 0;

  function getStoredPosition() {
    try {
      var v = localStorage.getItem(STORAGE_KEY);
      if (v) return JSON.parse(v);
    } catch (e) { /* ignore */ }
    return null;
  }

  function savePosition(top) {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ top: top }));
    } catch (e) { /* ignore */ }
  }

  function createSVGIcon() {
    return '<svg width="28" height="28" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">' +
      '<path d="M3 13h2v-2H3v2zm0 4h2v-2H3v2zm0-8h2V7H3v2zm4 4h14v-2H7v2zm0 4h14v-2H7v2zM7 7v2h14V7H7z" fill="white"/>' +
      '</svg>';
  }

  function init(onClickCallback) {
    if (document.getElementById(HOST_ID)) return;

    hostEl = document.createElement('div');
    hostEl.id = HOST_ID;
    hostEl.style.cssText = 'position:fixed;right:20px;z-index:2147483647;width:62px;height:62px;';

    var pos = getStoredPosition();
    var topVal = pos && pos.top != null ? pos.top : Math.round(window.innerHeight / 2 - 31);
    hostEl.style.top = topVal + 'px';

    shadowRoot = hostEl.attachShadow({ mode: 'closed' });

    var style = document.createElement('style');
    style.textContent = FONT_IMPORT + '\n' +
      ':host { all: initial; }' +
      '.lv-fab { ' +
        'width: 62px; height: 62px; border-radius: 50%; border: none; cursor: pointer; ' +
        'background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); ' +
        'display: flex; align-items: center; justify-content: center; ' +
        'box-shadow: 0 4px 15px rgba(102, 126, 234, 0.4); ' +
        'transition: box-shadow 0.2s, transform 0.2s; ' +
        'font-family: "Inter", sans-serif; ' +
        'user-select: none; -webkit-user-select: none; ' +
      '}' +
      '.lv-fab:hover { ' +
        'box-shadow: 0 6px 20px rgba(102, 126, 234, 0.6); ' +
        'transform: scale(1.05); ' +
      '}' +
      '.lv-fab:active { transform: scale(0.98); }' +
      '.lv-fab.dragging { cursor: grabbing; transition: none; transform: none; }';

    var btn = document.createElement('button');
    btn.className = 'lv-fab';
    btn.innerHTML = createSVGIcon();
    btn.title = 'ListingView Dashboard';

    // Drag logic
    btn.addEventListener('mousedown', function (e) {
      e.preventDefault();
      isDragging = true;
      dragStartY = e.clientY;
      startTop = parseInt(hostEl.style.top, 10) || 0;
      dragDistance = 0;
      btn.classList.add('dragging');
    });

    document.addEventListener('mousemove', function (e) {
      if (!isDragging) return;
      var dy = e.clientY - dragStartY;
      dragDistance = Math.abs(dy);
      var newTop = Math.max(10, Math.min(window.innerHeight - 72, startTop + dy));
      hostEl.style.top = newTop + 'px';
    });

    document.addEventListener('mouseup', function () {
      if (!isDragging) return;
      isDragging = false;
      btn.classList.remove('dragging');
      var finalTop = parseInt(hostEl.style.top, 10) || 0;
      savePosition(finalTop);

      // If drag was minimal, treat as click
      if (dragDistance < 5 && onClickCallback) {
        onClickCallback();
      }
    });

    shadowRoot.appendChild(style);
    shadowRoot.appendChild(btn);
    document.body.appendChild(hostEl);
  }

  function destroy() {
    if (hostEl && hostEl.parentNode) {
      hostEl.parentNode.removeChild(hostEl);
    }
    hostEl = null;
    shadowRoot = null;
  }

  globalThis.LVFloatingTool = {
    init: init,
    destroy: destroy,
  };
})();
