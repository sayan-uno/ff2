// Builds the rich, animated "purchase successful" notification card shown in the
// notification bell whenever a user buys a product. This mirrors the existing
// refund-accepted (`buildRefundAcceptedHtml` in src/app/actions/refund.ts) and
// support-reply (`src/lib/support-reply-notifier.ts`) cards so all three feel like
// one family, while staying completely self-contained.
//
// IMPORTANT: this is a pure, side-effect-free helper. It only returns an HTML
// string. The callers keep doing exactly what they did before — inserting a
// notification with a plain-text `message` (the push / fallback body) and the
// product `imageUrl` (rendered by the bell *below* this card, untouched). We only
// add the optional `html` field so existing behaviour can never be affected.

// Escape any dynamic text (the product name) before placing it into the HTML body
// so a product name can never break the markup.
function escapeHtml(value: string): string {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * Build a compact, self-contained animated "purchase successful" card for the
 * notification bell. Everything (layout, colours, animation keyframes) is inlined
 * so it renders identically in both light and dark themes and needs no app CSS.
 * Class names + keyframes are prefixed `pps-` so they cannot collide with anything
 * else in the app (or the `rfa-` / `srn-` cards).
 *
 * @param params.productName  The purchased product's name.
 * @param params.amount       The amount paid (₹). Rendered as a chip.
 * @param params.status       The order status. Only 'Completed' (instant, e.g.
 *                            coins) is treated specially; anything else (e.g.
 *                            'Processing') shows the "processing" wording. The
 *                            wider union just lets callers pass an order's own
 *                            `status` field directly without a cast.
 * @param params.orderUrl     Absolute URL to the user's order page (the button).
 * @param params.imageUrl     Optional product image (or .mp4/.webm clip) to embed
 *                            inside the card, near the bottom, framed to match the
 *                            card. When given, the bell should NOT also render the
 *                            notification's separate `imageUrl` (callers drop it).
 */
export function buildPurchaseSuccessHtml(params: {
  productName: string;
  amount: number;
  status: 'Completed' | 'Processing' | 'Failed';
  orderUrl: string;
  imageUrl?: string;
}): string {
  const { productName, amount, status, orderUrl, imageUrl } = params;

  // Embed the product media inside the card so it reads as one piece (instead of a
  // detached block below). Videos (.mp4/.webm) autoplay muted+looped like the rest
  // of the app's media; everything else is an <img>. The src is escaped so it can
  // never break out of the attribute.
  const safeImage = imageUrl ? escapeHtml(imageUrl) : '';
  const isVideo = /\.(mp4|webm)(\?|#|$)/i.test(imageUrl || '');
  const mediaTag = imageUrl
    ? isVideo
      ? `<video src="${safeImage}" autoplay loop muted playsinline class="pps-media-el"></video>`
      : `<img src="${safeImage}" alt="${escapeHtml(productName)}" class="pps-media-el" />`
    : '';
  const mediaBlock = imageUrl ? `<div class="pps-media">${mediaTag}</div>` : '';

  const isCompleted = status === 'Completed';
  const subTitle = isCompleted
    ? 'Your order is confirmed & delivered'
    : "Payment received — we're processing it";
  const statusPill = isCompleted
    ? '✅ Delivered'
    : '⏳ Processing your order';

  // A small burst of confetti pieces along the top of the card. Each gets its own
  // colour / horizontal offset / fall delay so the burst feels organic. Inlined
  // per-piece so no extra CSS classes are needed.
  const confettiColors = ['#fde047', '#fb7185', '#a855f7', '#34d399', '#60a5fa', '#fbbf24'];
  const confetti = Array.from({ length: 12 })
    .map((_, i) => {
      const color = confettiColors[i % confettiColors.length];
      const left = Math.round((i + 1) * (100 / 13));
      const delay = ((i % 6) * 0.18).toFixed(2);
      const dur = (1.8 + (i % 4) * 0.35).toFixed(2);
      return `<span class="pps-confetti" style="left:${left}%;background:${color};animation-delay:${delay}s;animation-duration:${dur}s;"></span>`;
    })
    .join('');

  return `<div class="pps-card">
    <style>
      .pps-card{position:relative;overflow:hidden;border-radius:14px;padding:16px 14px 14px;
        background:linear-gradient(135deg,#4c1d95 0%,#7c3aed 50%,#db2777 100%);
        color:#faf5ff;font-family:ui-sans-serif,system-ui,sans-serif;
        box-shadow:0 8px 24px -8px rgba(124,58,237,.6);}
      .pps-card *{box-sizing:border-box;}
      .pps-glow{position:absolute;top:-50px;right:-40px;width:150px;height:150px;border-radius:50%;
        background:radial-gradient(circle,rgba(244,114,182,.55),transparent 70%);
        animation:pps-float 4s ease-in-out infinite;pointer-events:none;}
      .pps-glow2{position:absolute;bottom:-60px;left:-40px;width:150px;height:150px;border-radius:50%;
        background:radial-gradient(circle,rgba(167,139,250,.5),transparent 70%);
        animation:pps-float 5s ease-in-out infinite reverse;pointer-events:none;}
      .pps-confetti{position:absolute;top:-10px;width:7px;height:11px;border-radius:2px;opacity:0;
        animation-name:pps-fall;animation-timing-function:linear;animation-iteration-count:infinite;pointer-events:none;}
      .pps-head{display:flex;align-items:center;gap:11px;position:relative;z-index:1;}
      .pps-badge{flex:none;width:42px;height:42px;border-radius:50%;
        display:flex;align-items:center;justify-content:center;font-size:21px;
        background:#fff;box-shadow:0 0 0 0 rgba(255,255,255,.6);
        animation:pps-pop .55s cubic-bezier(.18,.89,.32,1.28) both,pps-ring 2.2s ease-out .55s infinite;}
      .pps-badge-img{width:27px;height:27px;object-fit:contain;display:block;}
      .pps-title{font-size:15.5px;font-weight:800;line-height:1.2;letter-spacing:.2px;}
      .pps-sub{font-size:11.5px;opacity:.9;margin-top:2px;}
      .pps-product{margin:13px 0 10px;display:flex;align-items:flex-start;gap:9px;font-size:13px;
        background:rgba(255,255,255,.14);border-radius:10px;padding:9px 11px;position:relative;z-index:1;
        animation:pps-rise .5s ease both .15s;}
      .pps-product .pps-pdot{flex:none;width:8px;height:8px;border-radius:50%;background:#fbcfe8;margin-top:5px;
        box-shadow:0 0 0 3px rgba(251,207,232,.25);}
      .pps-pname{flex:1;min-width:0;line-height:1.35;font-weight:700;color:#fff;overflow-wrap:anywhere;word-break:break-word;}
      .pps-meta{display:flex;flex-wrap:wrap;gap:7px;margin-bottom:13px;position:relative;z-index:1;}
      .pps-chip{display:inline-flex;align-items:center;gap:5px;font-size:11.5px;font-weight:700;
        background:rgba(255,255,255,.16);border-radius:999px;padding:4px 11px;animation:pps-rise .5s ease both .25s;}
      .pps-chip.pps-amt{background:#fff;color:#7c3aed;}
      .pps-media{position:relative;z-index:1;margin-bottom:12px;border-radius:11px;overflow:hidden;
        border:1px solid rgba(255,255,255,.35);background:rgba(255,255,255,.1);
        box-shadow:0 6px 18px -8px rgba(0,0,0,.45);animation:pps-rise .5s ease both .3s;}
      .pps-media-el{display:block;width:100%;aspect-ratio:16/9;object-fit:cover;}
      .pps-btn{display:flex;align-items:center;justify-content:center;gap:6px;width:100%;
        text-decoration:none;font-size:13.5px;font-weight:800;color:#7c3aed !important;
        background:#fff;border-radius:10px;padding:11px 14px;position:relative;overflow:hidden;z-index:1;
        box-shadow:0 4px 14px -4px rgba(0,0,0,.4);}
      .pps-btn::after{content:"";position:absolute;top:0;left:-60%;width:40%;height:100%;
        background:linear-gradient(120deg,transparent,rgba(255,255,255,.75),transparent);
        transform:skewX(-20deg);animation:pps-shine 2.6s ease-in-out infinite;}
      @keyframes pps-pop{0%{transform:scale(0) rotate(-30deg);opacity:0;}100%{transform:scale(1) rotate(0);opacity:1;}}
      @keyframes pps-ring{0%{box-shadow:0 0 0 0 rgba(255,255,255,.55);}70%,100%{box-shadow:0 0 0 13px rgba(255,255,255,0);}}
      @keyframes pps-rise{0%{transform:translateY(7px);opacity:0;}100%{transform:translateY(0);opacity:1;}}
      @keyframes pps-float{0%,100%{transform:translateY(0);}50%{transform:translateY(12px);}}
      @keyframes pps-shine{0%{left:-60%;}60%,100%{left:130%;}}
      @keyframes pps-fall{0%{transform:translateY(0) rotate(0);opacity:0;}
        10%{opacity:1;}100%{transform:translateY(150px) rotate(420deg);opacity:0;}}
    </style>
    <div class="pps-glow"></div>
    <div class="pps-glow2"></div>
    ${confetti}
    <div class="pps-head">
      <div class="pps-badge"><img src="/img/garena.png" alt="Garena" class="pps-badge-img" /></div>
      <div>
        <div class="pps-title">Purchase Successful 🎉</div>
        <div class="pps-sub">${subTitle}</div>
      </div>
    </div>
    <div class="pps-product"><span class="pps-pdot"></span><span class="pps-pname">${escapeHtml(productName)}</span></div>
    <div class="pps-meta">
      <span class="pps-chip pps-amt">₹${escapeHtml(String(amount))}</span>
      <span class="pps-chip">${statusPill}</span>
    </div>
    ${mediaBlock}
    <a class="pps-btn" href="${orderUrl}" target="_blank" rel="noopener noreferrer">View My Order →</a>
  </div>`;
}
