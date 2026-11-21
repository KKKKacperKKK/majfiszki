// Wczytywany synchronicznie w <head>, zanim cokolwiek zostanie narysowane.
// Osobny plik (zamiast skryptu w HTML-u) pozwala zachować ścisłą politykę CSP bez 'unsafe-inline'.
(function () {
  var stored = null;
  try {
    stored = localStorage.getItem('fiszki.theme');
  } catch (e) {
    /* pamięć przeglądarki niedostępna — użyjemy ustawień systemu */
  }
  var dark = stored ? stored === 'dark' : window.matchMedia('(prefers-color-scheme: dark)').matches;
  var root = document.documentElement;
  root.classList.toggle('dark', dark);
  var meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute('content', dark ? '#12100e' : '#f8f6f2');
})();
