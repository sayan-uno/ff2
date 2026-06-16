/**
 * Reusable, self-contained notification card templates for the HTML Notifier
 * admin section.
 *
 * Each template is a pure function that takes a small set of fields and returns a
 * complete, inline-styled HTML string ready to drop into the notification bell
 * (it renders identically in light/dark themes and needs no app CSS). Every
 * template:
 *   - Embeds the optional image/video INSIDE the card (framed, just like the
 *     purchase-success card) — never as a separate detached block.
 *   - Renders an optional call-to-action button ONLY when a button URL is given,
 *     with a fully customisable button label.
 *
 * Class names + keyframes are uniquely prefixed per template (ev1/ev2/fo1/fo2/
 * te1/te2/nt1/nt2) so multiple different cards can safely coexist in the bell at
 * once without their styles ever clashing.
 *
 * This file has no side effects and no 'use server'/'use client' directive, so it
 * can be imported from anywhere (it is used by the client HTML Notifier page).
 */

export interface TemplateParams {
  title?: string;
  message: string;
  imageUrl?: string;
  buttonText?: string;
  buttonUrl?: string;
}

export interface NotificationTemplate {
  id: string;
  name: string;
  category: 'Event' | 'Order Failed' | 'Technical Error' | 'Website Notice';
  /** Whether the title field is meaningful for this template (all currently use it). */
  usesTitle: boolean;
  /** Prefilled values shown when the admin selects this template. */
  defaults: { title: string; message: string; buttonText: string };
  build: (params: TemplateParams) => string;
}

// Escape any dynamic text before placing it into the HTML so a stray < or " can
// never break the markup. Newlines in messages are preserved visually via
// `white-space:pre-line` on the message element (so the admin's line breaks show).
function esc(value: string): string {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// Build an embedded media block (image or autoplaying muted video) using the
// template's prefixed classes. Returns '' when no image is provided.
function mediaHtml(prefix: string, imageUrl?: string, alt = ''): string {
  const url = (imageUrl || '').trim();
  if (!url) return '';
  const safe = esc(url);
  const isVideo = /\.(mp4|webm)(\?|#|$)/i.test(url);
  const el = isVideo
    ? `<video src="${safe}" autoplay loop muted playsinline class="${prefix}-media-el"></video>`
    : `<img src="${safe}" alt="${esc(alt)}" class="${prefix}-media-el" />`;
  return `<div class="${prefix}-media">${el}</div>`;
}

// Build the optional CTA button using the template's prefixed class. Returns ''
// when no URL is provided. `fallback` is used when a URL is given but no label.
function btnHtml(prefix: string, url: string | undefined, text: string | undefined, fallback: string): string {
  const href = (url || '').trim();
  if (!href) return '';
  const label = esc((text && text.trim()) || fallback);
  return `<a class="${prefix}-btn" href="${esc(href)}" target="_blank" rel="noopener noreferrer">${label} →</a>`;
}

// ===========================================================================
// EVENT — Template 1: "Lightning Spotlight" (electric indigo/violet + gold)
// ===========================================================================
function buildEvent1(p: TemplateParams): string {
  const media = mediaHtml('ev1', p.imageUrl, p.title || 'Event');
  const button = btnHtml('ev1', p.buttonUrl, p.buttonText, 'Explore Now');

  // A celebratory confetti burst across the top of the card (same idea as the
  // purchase-success card). Each piece gets its own colour / position / fall
  // timing so the burst feels organic. The whole layer is contained inside the
  // card (overflow:hidden) and sits BEHIND the text, so it can never push content
  // around or drift into the middle on a narrow phone bell.
  const confettiColors = ['#fde047', '#fb7185', '#a855f7', '#34d399', '#60a5fa', '#fbbf24'];
  const confetti = Array.from({ length: 12 })
    .map((_, i) => {
      const color = confettiColors[i % confettiColors.length];
      const left = Math.round((i + 1) * (100 / 13));
      const delay = ((i % 6) * 0.22).toFixed(2);
      const dur = (1.9 + (i % 4) * 0.4).toFixed(2);
      return `<span class="ev1-confetti" style="left:${left}%;background:${color};animation-delay:${delay}s;animation-duration:${dur}s;"></span>`;
    })
    .join('');

  return `<div class="ev1-card">
    <style>
      .ev1-card{position:relative;overflow:hidden;width:100%;border-radius:16px;padding:15px 14px 14px;
        background:radial-gradient(120% 75% at 50% 0%,rgba(192,132,252,.4),transparent 55%),linear-gradient(135deg,#2e1065 0%,#6d28d9 55%,#9333ea 100%);
        color:#f5f3ff;font-family:ui-sans-serif,system-ui,sans-serif;
        box-shadow:0 12px 28px -12px rgba(124,58,237,.7);border:1px solid rgba(255,255,255,.12);}
      .ev1-card *{box-sizing:border-box;}
      .ev1-fx{position:absolute;inset:0;z-index:0;overflow:hidden;pointer-events:none;}
      .ev1-confetti{position:absolute;top:-12px;width:7px;height:11px;border-radius:2px;opacity:0;
        animation-name:ev1-fall;animation-timing-function:linear;animation-iteration-count:infinite;}
      .ev1-pill{position:relative;z-index:1;display:inline-flex;align-items:center;gap:5px;font-size:9.5px;font-weight:800;letter-spacing:1px;text-transform:uppercase;
        background:linear-gradient(135deg,#fde047,#f59e0b);color:#3b2406;border-radius:999px;padding:4px 11px;margin-bottom:12px;
        box-shadow:0 4px 12px -3px rgba(251,191,36,.8);animation:ev1-rise .5s ease both;}
      .ev1-head{position:relative;z-index:1;display:flex;align-items:center;gap:12px;animation:ev1-rise .5s ease both .06s;}
      .ev1-badge{position:relative;flex:none;width:48px;height:48px;border-radius:14px;display:flex;align-items:center;justify-content:center;
        font-size:25px;line-height:1;background:linear-gradient(135deg,#fde047,#f59e0b);
        box-shadow:0 6px 15px -4px rgba(245,158,11,.75);animation:ev1-pop .55s cubic-bezier(.18,.89,.32,1.28) both,ev1-bob 3s ease-in-out .6s infinite;}
      .ev1-badge::after{content:"";position:absolute;inset:0;border-radius:14px;
        box-shadow:0 0 0 0 rgba(253,224,71,.65);animation:ev1-ring 2.2s ease-out .5s infinite;}
      .ev1-eyebrow{font-size:10px;font-weight:800;letter-spacing:1.4px;text-transform:uppercase;color:#fcd34d;}
      .ev1-title{font-size:18px;font-weight:900;line-height:1.2;margin-top:2px;overflow-wrap:anywhere;word-break:break-word;
        background:linear-gradient(90deg,#ffffff 0%,#f5d0fe 30%,#fde68a 50%,#f5d0fe 70%,#ffffff 100%);background-size:220% auto;
        -webkit-background-clip:text;background-clip:text;color:transparent;animation:ev1-sweep 4.5s linear infinite;}
      .ev1-desc{position:relative;z-index:1;font-size:13px;line-height:1.6;color:#ede9fe;opacity:.95;margin:13px 0 13px;white-space:pre-line;overflow-wrap:anywhere;animation:ev1-rise .5s ease both .12s;}
      .ev1-media{position:relative;z-index:1;margin:0 0 13px;border-radius:12px;overflow:hidden;border:1px solid rgba(255,255,255,.25);
        box-shadow:0 8px 20px -8px rgba(0,0,0,.55);animation:ev1-rise .5s ease both .18s;}
      .ev1-media-el{display:block;width:100%;aspect-ratio:16/9;object-fit:cover;}
      .ev1-btn{position:relative;z-index:1;display:flex;align-items:center;justify-content:center;gap:7px;width:100%;text-decoration:none;font-size:14px;font-weight:800;
        color:#3b2406 !important;background:linear-gradient(135deg,#fde047,#f59e0b);border-radius:12px;padding:12px 14px;overflow:hidden;
        box-shadow:0 6px 16px -6px rgba(245,158,11,.8);animation:ev1-rise .5s ease both .24s;}
      .ev1-btn::after{content:"";position:absolute;top:0;left:-60%;width:42%;height:100%;background:linear-gradient(120deg,transparent,rgba(255,255,255,.9),transparent);transform:skewX(-20deg);animation:ev1-shine 2.8s ease-in-out infinite;}
      @keyframes ev1-pop{0%{transform:scale(0) rotate(-20deg);opacity:0;}100%{transform:scale(1) rotate(0);opacity:1;}}
      @keyframes ev1-bob{0%,100%{transform:translateY(0) rotate(0);}50%{transform:translateY(-3px) rotate(-4deg);}}
      @keyframes ev1-ring{0%{box-shadow:0 0 0 0 rgba(253,224,71,.65);}70%,100%{box-shadow:0 0 0 13px rgba(253,224,71,0);}}
      @keyframes ev1-rise{0%{transform:translateY(9px);opacity:0;}100%{transform:translateY(0);opacity:1;}}
      @keyframes ev1-sweep{0%{background-position:0% center;}100%{background-position:220% center;}}
      @keyframes ev1-shine{0%{left:-60%;}60%,100%{left:140%;}}
      @keyframes ev1-fall{0%{transform:translateY(0) rotate(0);opacity:0;}10%{opacity:.95;}100%{transform:translateY(160px) rotate(440deg);opacity:0;}}
    </style>
    <div class="ev1-fx">${confetti}</div>
    <div class="ev1-pill">✦ New Event</div>
    <div class="ev1-head">
      <div class="ev1-badge">🎉</div>
      <div>
        <div class="ev1-eyebrow">Garena Store</div>
        <div class="ev1-title">${esc(p.title || 'New Event')}</div>
      </div>
    </div>
    <div class="ev1-desc">${esc(p.message)}</div>
    ${media}
    ${button}
  </div>`;
}

// ===========================================================================
// EVENT — Template 2: "Premium Gold" (luxe black + gold, hero image on top)
// ===========================================================================
function buildEvent2(p: TemplateParams): string {
  const media = mediaHtml('ev2', p.imageUrl, p.title || 'Event');
  const button = btnHtml('ev2', p.buttonUrl, p.buttonText, 'View Event');
  return `<div class="ev2-card">
    <style>
      .ev2-card{position:relative;overflow:hidden;width:100%;border-radius:16px;
        background:linear-gradient(140deg,#0b0b0f 0%,#1c1917 55%,#3b2f12 100%);color:#fef3c7;
        font-family:ui-sans-serif,system-ui,sans-serif;border:1px solid rgba(234,179,8,.4);
        box-shadow:0 10px 28px -10px rgba(0,0,0,.7);}
      .ev2-card *{box-sizing:border-box;}
      .ev2-media{position:relative;margin:0;border-bottom:1px solid rgba(234,179,8,.4);overflow:hidden;}
      .ev2-media-el{display:block;width:100%;aspect-ratio:16/9;object-fit:cover;}
      .ev2-body{position:relative;padding:16px 15px 15px;}
      .ev2-shimmer{position:absolute;top:0;left:0;right:0;height:2px;
        background:linear-gradient(90deg,transparent,#fbbf24,transparent);animation:ev2-slide 3s linear infinite;}
      .ev2-head{display:flex;align-items:center;gap:11px;}
      .ev2-badge{flex:none;width:42px;height:42px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:20px;
        background:radial-gradient(circle at 30% 30%,#fde68a,#d97706);color:#3b2406;
        box-shadow:0 4px 14px -4px rgba(217,119,6,.8);animation:ev2-pop .55s cubic-bezier(.18,.89,.32,1.28) both;}
      .ev2-eyebrow{font-size:10px;font-weight:700;letter-spacing:1.6px;text-transform:uppercase;color:#d4a72c;}
      .ev2-title{font-size:18px;font-weight:900;line-height:1.15;margin-top:2px;color:#fef9c3;}
      .ev2-rule{height:1px;background:linear-gradient(90deg,rgba(234,179,8,.6),transparent);margin:12px 0;}
      .ev2-desc{font-size:12.5px;line-height:1.6;color:#fde9c8;opacity:.95;margin-bottom:14px;white-space:pre-line;}
      .ev2-btn{display:flex;align-items:center;justify-content:center;gap:7px;width:100%;text-decoration:none;font-size:13.5px;font-weight:800;
        color:#1c1300 !important;background:linear-gradient(135deg,#fde68a,#d97706);border-radius:11px;padding:12px 14px;position:relative;overflow:hidden;
        box-shadow:0 6px 16px -6px rgba(217,119,6,.8);}
      .ev2-btn::after{content:"";position:absolute;top:0;left:-60%;width:42%;height:100%;background:linear-gradient(120deg,transparent,rgba(255,255,255,.8),transparent);transform:skewX(-20deg);animation:ev2-shine 2.8s ease-in-out infinite;}
      @keyframes ev2-pop{0%{transform:scale(0) rotate(-20deg);opacity:0;}100%{transform:scale(1) rotate(0);opacity:1;}}
      @keyframes ev2-slide{0%{transform:translateX(-100%);}100%{transform:translateX(100%);}}
      @keyframes ev2-shine{0%{left:-60%;}60%,100%{left:140%;}}
    </style>
    ${media}
    <div class="ev2-body">
      <div class="ev2-shimmer"></div>
      <div class="ev2-head">
        <div class="ev2-badge">🎁</div>
        <div>
          <div class="ev2-eyebrow">Exclusive · Garena Store</div>
          <div class="ev2-title">${esc(p.title || 'Exclusive Event')}</div>
        </div>
      </div>
      <div class="ev2-rule"></div>
      <div class="ev2-desc">${esc(p.message)}</div>
      ${button}
    </div>
  </div>`;
}

// ===========================================================================
// ORDER FAILED — Template 1: "Alert" (red gradient, wrong-UID style)
// ===========================================================================
function buildFailed1(p: TemplateParams): string {
  const media = mediaHtml('fo1', p.imageUrl, p.title || 'Order Failed');
  const button = btnHtml('fo1', p.buttonUrl, p.buttonText, 'Fix My Account');
  return `<div class="fo1-card">
    <style>
      .fo1-card{position:relative;overflow:hidden;width:100%;border-radius:15px;padding:16px 14px 14px;
        background:linear-gradient(135deg,#7f1d1d 0%,#b91c1c 55%,#e11d48 100%);color:#fff1f2;
        font-family:ui-sans-serif,system-ui,sans-serif;box-shadow:0 9px 24px -9px rgba(225,29,72,.6);}
      .fo1-card *{box-sizing:border-box;}
      .fo1-head{display:flex;align-items:center;gap:11px;position:relative;z-index:1;}
      .fo1-badge{flex:none;width:42px;height:42px;border-radius:50%;display:flex;align-items:center;justify-content:center;
        font-size:20px;line-height:1;text-align:center;
        background:#fff;color:#dc2626;box-shadow:0 0 0 0 rgba(255,255,255,.6);
        animation:fo1-pop .5s cubic-bezier(.18,.89,.32,1.28) both,fo1-ring 2s ease-out .5s infinite;}
      .fo1-title{font-size:15.5px;font-weight:800;line-height:1.2;}
      .fo1-sub{font-size:11px;opacity:.85;margin-top:1px;}
      .fo1-desc{font-size:12.5px;line-height:1.55;margin:12px 0 12px;background:rgba(255,255,255,.12);
        border:1px solid rgba(255,255,255,.18);border-radius:10px;padding:10px 12px;position:relative;z-index:1;white-space:pre-line;
        animation:fo1-rise .5s ease both .15s;}
      .fo1-media{position:relative;z-index:1;margin-bottom:12px;border-radius:11px;overflow:hidden;border:1px solid rgba(255,255,255,.3);animation:fo1-rise .5s ease both .25s;}
      .fo1-media-el{display:block;width:100%;aspect-ratio:16/9;object-fit:cover;}
      .fo1-btn{display:flex;align-items:center;justify-content:center;gap:6px;width:100%;text-decoration:none;font-size:13.5px;font-weight:800;
        color:#b91c1c !important;background:#fff;border-radius:10px;padding:11px 14px;position:relative;overflow:hidden;z-index:1;box-shadow:0 4px 14px -4px rgba(0,0,0,.4);}
      @keyframes fo1-pop{0%{transform:scale(0) rotate(-20deg);opacity:0;}100%{transform:scale(1) rotate(0);opacity:1;}}
      @keyframes fo1-ring{0%{box-shadow:0 0 0 0 rgba(255,255,255,.55);}70%,100%{box-shadow:0 0 0 12px rgba(255,255,255,0);}}
      @keyframes fo1-rise{0%{transform:translateY(6px);opacity:0;}100%{transform:translateY(0);opacity:1;}}
    </style>
    <div class="fo1-head">
      <div class="fo1-badge">⚠️</div>
      <div>
        <div class="fo1-title">${esc(p.title || 'Order Failed')}</div>
        <div class="fo1-sub">Action needed on your account</div>
      </div>
    </div>
    <div class="fo1-desc">${esc(p.message)}</div>
    ${media}
    ${button}
  </div>`;
}

// ===========================================================================
// ORDER FAILED — Template 2: "Receipt" (clean light card, red accent)
// ===========================================================================
function buildFailed2(p: TemplateParams): string {
  const media = mediaHtml('fo2', p.imageUrl, p.title || 'Order Failed');
  const button = btnHtml('fo2', p.buttonUrl, p.buttonText, 'Update Gaming UID');
  return `<div class="fo2-card">
    <style>
      .fo2-card{position:relative;overflow:hidden;width:100%;border-radius:14px;
        background:#ffffff;color:#1f2937;font-family:ui-sans-serif,system-ui,sans-serif;
        border:1px solid #fecaca;border-left:5px solid #ef4444;box-shadow:0 8px 22px -10px rgba(0,0,0,.25);}
      .fo2-card *{box-sizing:border-box;}
      .fo2-body{padding:15px 15px 14px;}
      .fo2-head{display:flex;align-items:center;gap:10px;}
      .fo2-badge{flex:none;width:38px;height:38px;border-radius:10px;display:flex;align-items:center;justify-content:center;font-size:18px;
        background:#fee2e2;color:#dc2626;animation:fo2-shake .6s ease both;}
      .fo2-title{font-size:15px;font-weight:800;color:#b91c1c;line-height:1.2;}
      .fo2-sub{font-size:10.5px;color:#9ca3af;text-transform:uppercase;letter-spacing:.8px;margin-top:1px;}
      .fo2-desc{font-size:12.5px;line-height:1.6;color:#374151;margin:11px 0 13px;white-space:pre-line;}
      .fo2-media{margin-bottom:13px;border-radius:10px;overflow:hidden;border:1px solid #e5e7eb;}
      .fo2-media-el{display:block;width:100%;aspect-ratio:16/9;object-fit:cover;}
      .fo2-btn{display:flex;align-items:center;justify-content:center;gap:6px;width:100%;text-decoration:none;font-size:13.5px;font-weight:800;
        color:#fff !important;background:linear-gradient(135deg,#ef4444,#b91c1c);border-radius:10px;padding:11px 14px;box-shadow:0 5px 14px -5px rgba(220,38,38,.6);}
      @keyframes fo2-shake{0%,100%{transform:translateX(0);}20%{transform:translateX(-3px);}40%{transform:translateX(3px);}60%{transform:translateX(-2px);}80%{transform:translateX(2px);}}
    </style>
    <div class="fo2-body">
      <div class="fo2-head">
        <div class="fo2-badge">❌</div>
        <div>
          <div class="fo2-title">${esc(p.title || 'Order Unsuccessful')}</div>
          <div class="fo2-sub">Garena Store · Order Update</div>
        </div>
      </div>
      <div class="fo2-desc">${esc(p.message)}</div>
      ${media}
      ${button}
    </div>
  </div>`;
}

// ===========================================================================
// TECHNICAL ERROR — Template 1: "Working on it" (amber, spinning gear)
// ===========================================================================
function buildTech1(p: TemplateParams): string {
  const media = mediaHtml('te1', p.imageUrl, p.title || 'Technical Issue');
  const button = btnHtml('te1', p.buttonUrl, p.buttonText, 'Contact Support');
  return `<div class="te1-card">
    <style>
      .te1-card{position:relative;overflow:hidden;width:100%;border-radius:15px;padding:16px 14px 14px;
        background:linear-gradient(135deg,#78350f 0%,#b45309 55%,#d97706 100%);color:#fffbeb;
        font-family:ui-sans-serif,system-ui,sans-serif;box-shadow:0 9px 24px -9px rgba(217,119,6,.6);}
      .te1-card *{box-sizing:border-box;}
      .te1-glow{position:absolute;top:-50px;right:-40px;width:150px;height:150px;border-radius:50%;
        background:radial-gradient(circle,rgba(253,224,71,.4),transparent 70%);animation:te1-float 4s ease-in-out infinite;pointer-events:none;}
      .te1-head{display:flex;align-items:center;gap:11px;position:relative;z-index:1;}
      .te1-badge{flex:none;width:42px;height:42px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:21px;
        background:#fff;color:#b45309;animation:te1-spin 4s linear infinite;}
      .te1-title{font-size:15.5px;font-weight:800;line-height:1.2;}
      .te1-sub{font-size:11px;opacity:.85;margin-top:1px;}
      .te1-desc{font-size:12.5px;line-height:1.55;margin:12px 0 12px;background:rgba(255,255,255,.12);
        border-radius:10px;padding:10px 12px;position:relative;z-index:1;white-space:pre-line;animation:te1-rise .5s ease both .15s;}
      .te1-bar{position:relative;z-index:1;height:6px;border-radius:999px;background:rgba(255,255,255,.2);overflow:hidden;margin-bottom:13px;}
      .te1-bar::after{content:"";position:absolute;top:0;left:0;height:100%;width:40%;border-radius:999px;background:#fde047;animation:te1-load 1.8s ease-in-out infinite;}
      .te1-media{position:relative;z-index:1;margin-bottom:12px;border-radius:11px;overflow:hidden;border:1px solid rgba(255,255,255,.3);}
      .te1-media-el{display:block;width:100%;aspect-ratio:16/9;object-fit:cover;}
      .te1-btn{display:flex;align-items:center;justify-content:center;gap:6px;width:100%;text-decoration:none;font-size:13.5px;font-weight:800;
        color:#b45309 !important;background:#fff;border-radius:10px;padding:11px 14px;position:relative;z-index:1;box-shadow:0 4px 14px -4px rgba(0,0,0,.4);}
      @keyframes te1-spin{0%{transform:rotate(0);}100%{transform:rotate(360deg);}}
      @keyframes te1-float{0%,100%{transform:translateY(0);}50%{transform:translateY(10px);}}
      @keyframes te1-rise{0%{transform:translateY(6px);opacity:0;}100%{transform:translateY(0);opacity:1;}}
      @keyframes te1-load{0%{left:-40%;}100%{left:100%;}}
    </style>
    <div class="te1-glow"></div>
    <div class="te1-head">
      <div class="te1-badge">⚙️</div>
      <div>
        <div class="te1-title">${esc(p.title || 'Temporary Technical Issue')}</div>
        <div class="te1-sub">We're on it — please hold tight</div>
      </div>
    </div>
    <div class="te1-desc">${esc(p.message)}</div>
    <div class="te1-bar"></div>
    ${media}
    ${button}
  </div>`;
}

// ===========================================================================
// TECHNICAL ERROR — Template 2: "Maintenance" (slate blue, tools)
// ===========================================================================
function buildTech2(p: TemplateParams): string {
  const media = mediaHtml('te2', p.imageUrl, p.title || 'Technical Issue');
  const button = btnHtml('te2', p.buttonUrl, p.buttonText, 'Visit Support');
  return `<div class="te2-card">
    <style>
      .te2-card{position:relative;overflow:hidden;width:100%;border-radius:15px;padding:16px 14px 14px;
        background:linear-gradient(135deg,#0f172a 0%,#1e293b 55%,#334155 100%);color:#e2e8f0;
        font-family:ui-sans-serif,system-ui,sans-serif;box-shadow:0 9px 24px -9px rgba(15,23,42,.7);}
      .te2-card *{box-sizing:border-box;}
      .te2-head{display:flex;align-items:center;gap:11px;position:relative;z-index:1;}
      .te2-badge{flex:none;width:42px;height:42px;border-radius:12px;display:flex;align-items:center;justify-content:center;font-size:20px;
        background:linear-gradient(135deg,#38bdf8,#6366f1);color:#fff;box-shadow:0 0 0 0 rgba(99,102,241,.6);
        animation:te2-pop .55s cubic-bezier(.18,.89,.32,1.28) both,te2-ring 2.2s ease-out .55s infinite;}
      .te2-title{font-size:15.5px;font-weight:800;line-height:1.2;color:#f1f5f9;}
      .te2-sub{font-size:11px;color:#94a3b8;margin-top:1px;}
      .te2-desc{font-size:12.5px;line-height:1.6;color:#cbd5e1;margin:12px 0 13px;border-left:3px solid #38bdf8;
        background:rgba(56,189,248,.08);border-radius:0 8px 8px 0;padding:9px 11px;position:relative;z-index:1;white-space:pre-line;}
      .te2-media{position:relative;z-index:1;margin-bottom:12px;border-radius:11px;overflow:hidden;border:1px solid rgba(148,163,184,.3);}
      .te2-media-el{display:block;width:100%;aspect-ratio:16/9;object-fit:cover;}
      .te2-btn{display:flex;align-items:center;justify-content:center;gap:6px;width:100%;text-decoration:none;font-size:13.5px;font-weight:800;
        color:#fff !important;background:linear-gradient(135deg,#38bdf8,#6366f1);border-radius:10px;padding:11px 14px;position:relative;z-index:1;box-shadow:0 5px 14px -5px rgba(99,102,241,.7);}
      @keyframes te2-pop{0%{transform:scale(0) rotate(-20deg);opacity:0;}100%{transform:scale(1) rotate(0);opacity:1;}}
      @keyframes te2-ring{0%{box-shadow:0 0 0 0 rgba(99,102,241,.55);}70%,100%{box-shadow:0 0 0 12px rgba(99,102,241,0);}}
    </style>
    <div class="te2-head">
      <div class="te2-badge">🛠️</div>
      <div>
        <div class="te2-title">${esc(p.title || "Order Couldn't Be Completed")}</div>
        <div class="te2-sub">Garena Store · Technical Team</div>
      </div>
    </div>
    <div class="te2-desc">${esc(p.message)}</div>
    ${media}
    ${button}
  </div>`;
}

// ===========================================================================
// WEBSITE NOTICE — Template 1: "Announcement" (blue/cyan, megaphone)
// ===========================================================================
function buildNotice1(p: TemplateParams): string {
  const media = mediaHtml('nt1', p.imageUrl, p.title || 'Notice');
  const button = btnHtml('nt1', p.buttonUrl, p.buttonText, 'Learn More');
  return `<div class="nt1-card">
    <style>
      .nt1-card{position:relative;overflow:hidden;width:100%;border-radius:15px;padding:16px 14px 14px;
        background:linear-gradient(135deg,#0c4a6e 0%,#0369a1 55%,#0891b2 100%);color:#ecfeff;
        font-family:ui-sans-serif,system-ui,sans-serif;box-shadow:0 9px 24px -9px rgba(8,145,178,.6);}
      .nt1-card *{box-sizing:border-box;}
      .nt1-glow{position:absolute;top:-50px;right:-40px;width:150px;height:150px;border-radius:50%;
        background:radial-gradient(circle,rgba(125,211,252,.45),transparent 70%);animation:nt1-float 4.2s ease-in-out infinite;pointer-events:none;}
      .nt1-head{display:flex;align-items:center;gap:11px;position:relative;z-index:1;}
      .nt1-badge{flex:none;width:42px;height:42px;border-radius:12px;display:flex;align-items:center;justify-content:center;font-size:20px;
        background:#fff;color:#0369a1;animation:nt1-swing 2.4s ease-in-out infinite;transform-origin:top center;}
      .nt1-eyebrow{font-size:10px;font-weight:700;letter-spacing:1.4px;text-transform:uppercase;color:#bae6fd;}
      .nt1-title{font-size:16px;font-weight:800;line-height:1.18;margin-top:2px;color:#fff;}
      .nt1-desc{font-size:12.5px;line-height:1.6;opacity:.95;margin:12px 0 13px;position:relative;z-index:1;white-space:pre-line;animation:nt1-rise .5s ease both .15s;}
      .nt1-media{position:relative;z-index:1;margin-bottom:13px;border-radius:11px;overflow:hidden;border:1px solid rgba(255,255,255,.3);}
      .nt1-media-el{display:block;width:100%;aspect-ratio:16/9;object-fit:cover;}
      .nt1-btn{display:flex;align-items:center;justify-content:center;gap:6px;width:100%;text-decoration:none;font-size:13.5px;font-weight:800;
        color:#0369a1 !important;background:#fff;border-radius:10px;padding:11px 14px;position:relative;z-index:1;box-shadow:0 4px 14px -4px rgba(0,0,0,.35);}
      @keyframes nt1-float{0%,100%{transform:translateY(0);}50%{transform:translateY(10px);}}
      @keyframes nt1-swing{0%,100%{transform:rotate(-8deg);}50%{transform:rotate(8deg);}}
      @keyframes nt1-rise{0%{transform:translateY(6px);opacity:0;}100%{transform:translateY(0);opacity:1;}}
    </style>
    <div class="nt1-glow"></div>
    <div class="nt1-head">
      <div class="nt1-badge">📢</div>
      <div>
        <div class="nt1-eyebrow">Announcement</div>
        <div class="nt1-title">${esc(p.title || 'Important Notice')}</div>
      </div>
    </div>
    <div class="nt1-desc">${esc(p.message)}</div>
    ${media}
    ${button}
  </div>`;
}

// ===========================================================================
// WEBSITE NOTICE — Template 2: "Official" (formal dark, bell, ruled header)
// ===========================================================================
function buildNotice2(p: TemplateParams): string {
  const media = mediaHtml('nt2', p.imageUrl, p.title || 'Notice');
  const button = btnHtml('nt2', p.buttonUrl, p.buttonText, 'Read More');
  return `<div class="nt2-card">
    <style>
      .nt2-card{position:relative;overflow:hidden;width:100%;border-radius:14px;padding:16px 15px 14px;
        background:linear-gradient(160deg,#111827 0%,#1f2937 100%);color:#e5e7eb;
        font-family:ui-sans-serif,system-ui,sans-serif;border:1px solid rgba(148,163,184,.25);
        box-shadow:0 9px 24px -10px rgba(0,0,0,.65);}
      .nt2-card *{box-sizing:border-box;}
      .nt2-head{display:flex;align-items:center;gap:10px;padding-bottom:11px;border-bottom:1px solid rgba(148,163,184,.22);}
      .nt2-badge{flex:none;width:38px;height:38px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:18px;
        background:rgba(99,102,241,.18);color:#a5b4fc;animation:nt2-ring 2.4s ease-out infinite;}
      .nt2-title{font-size:15px;font-weight:800;line-height:1.2;color:#f9fafb;}
      .nt2-sub{font-size:10.5px;color:#9ca3af;text-transform:uppercase;letter-spacing:1px;margin-top:1px;}
      .nt2-desc{font-size:12.5px;line-height:1.65;color:#d1d5db;margin:12px 0 13px;white-space:pre-line;}
      .nt2-media{margin-bottom:13px;border-radius:10px;overflow:hidden;border:1px solid rgba(148,163,184,.25);}
      .nt2-media-el{display:block;width:100%;aspect-ratio:16/9;object-fit:cover;}
      .nt2-btn{display:flex;align-items:center;justify-content:center;gap:6px;width:100%;text-decoration:none;font-size:13px;font-weight:800;
        color:#0b1220 !important;background:linear-gradient(135deg,#e5e7eb,#cbd5e1);border-radius:10px;padding:11px 14px;}
      @keyframes nt2-ring{0%{box-shadow:0 0 0 0 rgba(165,180,252,.5);}70%,100%{box-shadow:0 0 0 11px rgba(165,180,252,0);}}
    </style>
    <div class="nt2-head">
      <div class="nt2-badge">🔔</div>
      <div>
        <div class="nt2-title">${esc(p.title || 'Official Announcement')}</div>
        <div class="nt2-sub">Garena Store · Notice</div>
      </div>
    </div>
    <div class="nt2-desc">${esc(p.message)}</div>
    ${media}
    ${button}
  </div>`;
}

// Default copy reused by the order-failed / technical templates (the exact text
// the admin usually sends), so selecting a template prefills it ready to go.
const FAILED_UID_TEXT =
  'We are unable to complete your order because the gaming UID you provided is incorrect.\nPlease log out and register again using the correct gaming UID to continue your purchases.';
const TECH_ERROR_TEXT =
  'Due to a technical issue, your order could not be completed.\nOur team is actively working to resolve this issue. Once it is fixed, we will notify you, and you can continue your purchases again.';

export const NOTIFICATION_TEMPLATES: NotificationTemplate[] = [
  {
    id: 'event-spotlight',
    name: 'Event · Lightning Spotlight',
    category: 'Event',
    usesTitle: true,
    defaults: {
      title: 'New Event Coming Soon',
      message:
        'Get ready! Brand-new event items are going live on the Garena Store. Be the first to grab these limited-time drops. 🔥',
      buttonText: 'Explore Now',
    },
    build: buildEvent1,
  },
  {
    id: 'event-premium',
    name: 'Event · Premium Gold',
    category: 'Event',
    usesTitle: true,
    defaults: {
      title: 'Exclusive Event',
      message:
        'Something special is arriving on the Garena Store. Unlock exclusive items for a limited time only. Stay tuned!',
      buttonText: 'View Event',
    },
    build: buildEvent2,
  },
  {
    id: 'failed-uid-alert',
    name: 'Order Failed · Wrong UID (Alert)',
    category: 'Order Failed',
    usesTitle: true,
    defaults: { title: 'Order Failed', message: FAILED_UID_TEXT, buttonText: 'Fix My Account' },
    build: buildFailed1,
  },
  {
    id: 'failed-uid-receipt',
    name: 'Order Failed · Wrong UID (Receipt)',
    category: 'Order Failed',
    usesTitle: true,
    defaults: { title: 'Order Unsuccessful', message: FAILED_UID_TEXT, buttonText: 'Update Gaming UID' },
    build: buildFailed2,
  },
  {
    id: 'tech-working',
    name: 'Technical Error · Working on it',
    category: 'Technical Error',
    usesTitle: true,
    defaults: { title: 'Temporary Technical Issue', message: TECH_ERROR_TEXT, buttonText: 'Contact Support' },
    build: buildTech1,
  },
  {
    id: 'tech-maintenance',
    name: 'Technical Error · Maintenance',
    category: 'Technical Error',
    usesTitle: true,
    defaults: { title: "Order Couldn't Be Completed", message: TECH_ERROR_TEXT, buttonText: 'Visit Support' },
    build: buildTech2,
  },
  {
    id: 'notice-announcement',
    name: 'Website Notice · Announcement',
    category: 'Website Notice',
    usesTitle: true,
    defaults: {
      title: 'Important Notice',
      message:
        'We have an important update regarding the Garena Store. Please read the details below to stay informed.',
      buttonText: 'Learn More',
    },
    build: buildNotice1,
  },
  {
    id: 'notice-official',
    name: 'Website Notice · Official',
    category: 'Website Notice',
    usesTitle: true,
    defaults: {
      title: 'Official Announcement',
      message:
        'Please take a moment to read this official notice from the Garena Store team regarding recent updates.',
      buttonText: 'Read More',
    },
    build: buildNotice2,
  },
];

export function getTemplateById(id: string): NotificationTemplate | undefined {
  return NOTIFICATION_TEMPLATES.find((t) => t.id === id);
}
