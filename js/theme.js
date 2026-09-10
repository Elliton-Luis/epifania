// theme.js — Van Gogh pastel dark mode toggle
// NOTA: usa chave dedicada epifania:theme — nunca toca em epifania:notes / enc:v1
(() => {
  const KEY = "epifania:theme";
  const DARK = "dark";
  const LIGHT = "light";

  function getStored() {
    try { return localStorage.getItem(KEY); } catch { return null; }
  }
  function setStored(v) {
    try { localStorage.setItem(KEY, v); } catch {}
  }
  function apply(theme) {
    const isDark = theme === DARK;
    document.documentElement.setAttribute("data-theme", isDark ? DARK : LIGHT);
    // keep checkbox in sync
    const cb = document.getElementById("theme-toggle");
    if (cb) cb.checked = isDark;
    // update <meta name="theme-color"> for mobile chrome
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute("content", isDark ? "#252336" : "#9e2b25");
    // manifest theme_color is static, but dynamic meta is what browsers use
  }
  function currentTheme() {
    return document.documentElement.getAttribute("data-theme") === DARK ? DARK : LIGHT;
  }
  function toggle() {
    const next = currentTheme() === DARK ? LIGHT : DARK;
    apply(next);
    setStored(next);
  }

  // init: inline script already set data-theme early to avoid flash.
  // Re-apply to sync toggle + meta, and persist if was system preference.
  document.addEventListener("DOMContentLoaded", () => {
    const stored = getStored();
    const hasAttr = document.documentElement.hasAttribute("data-theme");
    if (!stored && !hasAttr) {
      const prefersDark = window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches;
      apply(prefersDark ? DARK : LIGHT);
    } else if (stored) {
      apply(stored);
    } else {
      // inline script set it, just sync UI
      apply(currentTheme());
    }
    const cb = document.getElementById("theme-toggle");
    if (cb) cb.addEventListener("change", toggle);
    // listen system changes only when user hasn't chosen manually
    try {
      const mq = window.matchMedia("(prefers-color-scheme: dark)");
      if (mq && mq.addEventListener) {
        mq.addEventListener("change", (e) => {
          if (!getStored()) apply(e.matches ? DARK : LIGHT);
        });
      }
    } catch {}
  });

  window.EpifaniaTheme = { apply, toggle, currentTheme };
})();
