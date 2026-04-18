// Accessible mobile-menu behavior, shared across all site pages.
// Progressive enhancement: the <noscript> fallback keeps the menu usable
// without JS (see the inline <noscript> style block on each page).
//
// Features:
//   - Tab focus trap while the menu is open
//   - Escape key closes the menu and restores focus to the hamburger
//   - Click outside the menu closes it
//   - aria-expanded is kept in sync with visible state
//   - Opens scroll lock on the body so the page underneath doesn't shift
//
// Designed to work with the existing markup:
//   <button class="hamburger" aria-controls="mobile-menu" aria-expanded="false">
//   <div class="mobile-menu" id="mobile-menu">...</div>

(function () {
  'use strict';

  function init() {
    var menu = document.getElementById('mobile-menu');
    var hamburger = document.querySelector('.hamburger');
    if (!menu || !hamburger) return;

    // Remove any legacy inline onclick so behavior is centralized.
    if (hamburger.hasAttribute('onclick')) {
      hamburger.removeAttribute('onclick');
    }

    var focusableSelector =
      'a[href], button:not([disabled]), input:not([disabled]), [tabindex]:not([tabindex="-1"])';

    function getFocusable() {
      return Array.prototype.slice.call(menu.querySelectorAll(focusableSelector));
    }

    function isOpen() {
      return menu.classList.contains('open');
    }

    function open() {
      menu.classList.add('open');
      hamburger.setAttribute('aria-expanded', 'true');
      document.body.classList.add('menu-open');
      var first = getFocusable()[0];
      if (first) {
        // Defer so the browser has a tick to render the now-visible menu.
        setTimeout(function () { first.focus(); }, 0);
      }
    }

    function close(restoreFocus) {
      menu.classList.remove('open');
      hamburger.setAttribute('aria-expanded', 'false');
      document.body.classList.remove('menu-open');
      if (restoreFocus) hamburger.focus();
    }

    function toggle() {
      if (isOpen()) close(true); else open();
    }

    hamburger.addEventListener('click', function (e) {
      e.preventDefault();
      toggle();
    });

    // Close when any menu link is activated.
    menu.addEventListener('click', function (e) {
      if (e.target && e.target.tagName === 'A') close(false);
    });

    // Escape closes and returns focus to the hamburger.
    document.addEventListener('keydown', function (e) {
      if (!isOpen()) return;
      if (e.key === 'Escape' || e.key === 'Esc') {
        e.preventDefault();
        close(true);
        return;
      }
      if (e.key === 'Tab') {
        // Focus trap: keep Tab within the menu while it's open.
        var focusable = getFocusable();
        if (focusable.length === 0) return;
        var first = focusable[0];
        var last = focusable[focusable.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    });

    // Click outside the menu (and not on the hamburger) closes it.
    document.addEventListener('click', function (e) {
      if (!isOpen()) return;
      if (menu.contains(e.target) || hamburger.contains(e.target)) return;
      close(false);
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
