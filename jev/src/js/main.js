/* last script: boots every registered module (each isolated by try/catch inside JEV.boot) */
(function () {
  if (!window.JEV) return;
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', window.JEV.boot);
  else window.JEV.boot();
})();
