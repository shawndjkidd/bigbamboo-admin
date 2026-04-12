/**
 * BigBamBoo — Special Events Popup Snippet
 * ─────────────────────────────────────────
 * Paste this entire file into Hostinger's custom code injection
 * (or wrap in <script>...</script> and drop before </body>).
 *
 * Requires Google Fonts to be available (Bebas Neue + DM Sans).
 * If not already loaded on your site, add this to <head>:
 *
 *   <link rel="preconnect" href="https://fonts.googleapis.com">
 *   <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
 *   <link href="https://fonts.googleapis.com/css2?family=Bebas+Neue&family=DM+Sans:wght@400;500;600&display=swap" rel="stylesheet">
 */
(function () {
  'use strict';

  var SUPABASE_URL = 'https://hodqpckslglxuyhitlgh.supabase.co';
  var ANON_KEY     = 'sb_publishable_EgJvVQayN7sHbOHoqlAlQg_ql0-xw6y';
  var SESSION_KEY  = 'bb_special_seen';

  /* ── Styles ─────────────────────────────────────────────────── */
  var CSS = [
    '@import url("https://fonts.googleapis.com/css2?family=Bebas+Neue&family=DM+Sans:wght@400;500;600&display=swap");',
    '#bb-overlay{display:none;position:fixed;inset:0;background:rgba(0,0,0,.75);z-index:99999;align-items:center;justify-content:center;padding:20px;box-sizing:border-box;backdrop-filter:blur(3px);-webkit-backdrop-filter:blur(3px);animation:bb-fade-in .35s ease forwards}',
    '#bb-overlay.bb-visible{display:flex}',
    '@keyframes bb-fade-in{from{opacity:0}to{opacity:1}}',
    '@keyframes bb-slide-up{from{opacity:0;transform:translateY(24px) scale(.97)}to{opacity:1;transform:translateY(0) scale(1)}}',
    '#bb-modal{background:#1a1a1a;border:1px solid #2e2e2e;border-radius:16px;max-width:520px;width:100%;max-height:88vh;overflow-y:auto;position:relative;box-shadow:0 24px 80px rgba(0,0,0,.7),0 0 0 1px rgba(232,119,46,.15);animation:bb-slide-up .4s cubic-bezier(.16,1,.3,1) forwards;scrollbar-width:thin;scrollbar-color:#333 transparent}',
    '#bb-modal::-webkit-scrollbar{width:6px}#bb-modal::-webkit-scrollbar-thumb{background:#333;border-radius:3px}',
    '#bb-modal-header{padding:28px 28px 0;position:relative}',
    '#bb-close-btn{position:absolute;top:20px;right:20px;background:rgba(255,255,255,.07);border:1px solid rgba(255,255,255,.1);color:#aaa;width:32px;height:32px;border-radius:50%;cursor:pointer;display:flex;align-items:center;justify-content:center;font-size:16px;line-height:1;transition:background .15s,color .15s;font-family:inherit;flex-shrink:0}',
    '#bb-close-btn:hover{background:rgba(255,255,255,.14);color:#fff}',
    '#bb-eyebrow{font-family:"DM Sans",sans-serif;font-size:11px;font-weight:600;letter-spacing:.12em;text-transform:uppercase;color:#e8772e;margin:0 0 8px}',
    '#bb-title{font-family:"Bebas Neue",sans-serif;font-size:clamp(34px,7vw,48px);color:#fff;letter-spacing:.03em;line-height:1;margin:0 0 6px}',
    '#bb-subtitle{font-family:"DM Sans",sans-serif;font-size:13px;color:#666;margin:0 0 24px}',
    '#bb-divider{height:1px;background:linear-gradient(90deg,#e8772e 0%,rgba(232,119,46,.1) 60%,transparent 100%);margin:0 28px}',
    '#bb-items{padding:20px 28px;display:flex;flex-direction:column;gap:14px}',
    '.bb-item{display:flex;justify-content:space-between;align-items:flex-start;gap:16px;padding:16px;background:#222;border:1px solid #2a2a2a;border-radius:10px;transition:border-color .15s}',
    '.bb-item:hover{border-color:rgba(232,119,46,.3)}',
    '.bb-item-left{flex:1;min-width:0}',
    '.bb-item-name{font-family:"DM Sans",sans-serif;font-size:15px;font-weight:600;color:#f0f0f0;margin:0 0 4px;line-height:1.3}',
    '.bb-item-subtitle{font-family:"DM Sans",sans-serif;font-size:12px;color:#888;margin:0 0 5px;font-style:italic}',
    '.bb-item-desc{font-family:"DM Sans",sans-serif;font-size:12px;color:#777;margin:0 0 8px;line-height:1.5}',
    '.bb-tags{display:flex;flex-wrap:wrap;gap:5px}',
    '.bb-tag{font-family:"DM Sans",sans-serif;font-size:10px;font-weight:600;letter-spacing:.05em;text-transform:uppercase;padding:3px 8px;border-radius:100px}',
    '.bb-tag-orange{background:rgba(232,119,46,.15);color:#e8772e;border:1px solid rgba(232,119,46,.25)}',
    '.bb-tag-blue{background:rgba(59,130,246,.12);color:#60a5fa;border:1px solid rgba(59,130,246,.2)}',
    '.bb-tag-green{background:rgba(34,197,94,.12);color:#4ade80;border:1px solid rgba(34,197,94,.2)}',
    '.bb-tag-red{background:rgba(239,68,68,.12);color:#f87171;border:1px solid rgba(239,68,68,.2)}',
    '.bb-item-price{font-family:"Bebas Neue",sans-serif;font-size:20px;color:#e8772e;letter-spacing:.03em;white-space:nowrap;flex-shrink:0;padding-top:1px}',
    '#bb-modal-footer{padding:4px 28px 28px}',
    '#bb-cta-btn{width:100%;padding:14px;background:#e8772e;color:#fff;border:none;border-radius:10px;font-family:"Bebas Neue",sans-serif;font-size:18px;letter-spacing:.06em;cursor:pointer;transition:background .15s,transform .1s}',
    '#bb-cta-btn:hover{background:#d96a22}',
    '#bb-cta-btn:active{transform:scale(.98)}',
    '@media(max-width:480px){#bb-modal-header,#bb-items,#bb-modal-footer{padding-left:20px;padding-right:20px}#bb-divider{margin:0 20px}#bb-title{font-size:36px}}',
  ].join('');

  /* ── HTML skeleton ───────────────────────────────────────────── */
  var HTML = (
    '<style id="bb-popup-styles">' + CSS + '</style>' +
    '<div id="bb-overlay" role="dialog" aria-modal="true" aria-labelledby="bb-title">' +
      '<div id="bb-modal">' +
        '<div id="bb-modal-header">' +
          '<button id="bb-close-btn" aria-label="Close">&#x2715;</button>' +
          '<p id="bb-eyebrow">BigBamBoo &bull; Tonight</p>' +
          '<h2 id="bb-title">Tonight\'s Special Menu</h2>' +
          '<p id="bb-subtitle">Exclusive offerings available this evening only</p>' +
        '</div>' +
        '<div id="bb-divider"></div>' +
        '<div id="bb-items"></div>' +
        '<div id="bb-modal-footer">' +
          '<button id="bb-cta-btn">View Full Menu</button>' +
        '</div>' +
      '</div>' +
    '</div>'
  );

  /* ── Helpers ─────────────────────────────────────────────────── */
  var TAG_COLORS = {
    'Featured': 'orange', 'Limited': 'orange',
    'New': 'blue', 'Seasonal': 'green', 'Premium': 'red',
  };
  var TAG_CLASS  = { orange: 'bb-tag-orange', blue: 'bb-tag-blue', green: 'bb-tag-green', red: 'bb-tag-red' };

  function tagClass(label) { return TAG_CLASS[TAG_COLORS[label] || 'orange'] || 'bb-tag-orange'; }

  function escapeHtml(s) {
    return String(s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  }

  function closeModal() {
    var overlay = document.getElementById('bb-overlay');
    if (!overlay) return;
    overlay.style.animation = 'bb-fade-in .25s ease reverse forwards';
    setTimeout(function () { overlay.style.display = 'none'; }, 240);
  }

  function renderItems(items) {
    var container = document.getElementById('bb-items');
    if (!container) return;
    container.innerHTML = items.map(function (item) {
      var tags = Array.isArray(item.tags) ? item.tags : [];
      var tagsHtml = tags.length
        ? '<div class="bb-tags">' + tags.map(function (t) { return '<span class="bb-tag ' + tagClass(t) + '">' + escapeHtml(t) + '</span>'; }).join('') + '</div>'
        : '';
      return (
        '<div class="bb-item">' +
          '<div class="bb-item-left">' +
            '<p class="bb-item-name">'    + escapeHtml(item.name)        + '</p>' +
            (item.subtitle    ? '<p class="bb-item-subtitle">'  + escapeHtml(item.subtitle)    + '</p>' : '') +
            (item.description ? '<p class="bb-item-desc">'      + escapeHtml(item.description) + '</p>' : '') +
            tagsHtml +
          '</div>' +
          '<div class="bb-item-price">' + escapeHtml(item.price || 'TBA') + '</div>' +
        '</div>'
      );
    }).join('');
  }

  function showPopup(items) {
    renderItems(items);
    var overlay = document.getElementById('bb-overlay');
    if (!overlay) return;
    overlay.style.animation = '';
    overlay.classList.add('bb-visible');
    var closeBtn = document.getElementById('bb-close-btn');
    if (closeBtn) closeBtn.focus();
  }

  function wireEvents() {
    var closeBtn = document.getElementById('bb-close-btn');
    var ctaBtn   = document.getElementById('bb-cta-btn');
    var overlay  = document.getElementById('bb-overlay');
    if (closeBtn) closeBtn.addEventListener('click', closeModal);
    if (ctaBtn)   ctaBtn.addEventListener('click', closeModal);
    if (overlay)  overlay.addEventListener('click', function (e) { if (e.target === overlay) closeModal(); });
    document.addEventListener('keydown', function (e) {
      if ((e.key === 'Escape' || e.keyCode === 27) && overlay && overlay.classList.contains('bb-visible')) closeModal();
    });
  }

  /* ── Boot ────────────────────────────────────────────────────── */
  function init() {
    if (sessionStorage.getItem(SESSION_KEY)) return;

    // Inject HTML into page
    var container = document.createElement('div');
    container.innerHTML = HTML;
    document.body.appendChild(container);
    wireEvents();

    fetch(
      SUPABASE_URL + '/rest/v1/menu_items?section=eq.special_events&is_available=eq.true&order=sort_order',
      {
        headers: {
          'apikey':        ANON_KEY,
          'Authorization': 'Bearer ' + ANON_KEY,
          'Content-Type':  'application/json',
        }
      }
    )
    .then(function (res) { return res.json(); })
    .then(function (items) {
      if (!Array.isArray(items) || items.length === 0) return;
      sessionStorage.setItem(SESSION_KEY, '1');
      showPopup(items);
    })
    .catch(function (err) { console.warn('[BigBamBoo popup] fetch error:', err); });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

})();
