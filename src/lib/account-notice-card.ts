/**
 * account-notice-card
 * ---------------------------------------------------------------------------
 * Builds the rich, self-contained "Account Notice" HTML card shown in the
 * notification bell when a user buys an item but is using a wrong/auto-detected
 * UID (they're not in the promoted list and have no visual ID). The plain-text
 * `message` on the notification is kept as-is for the fallback / push body; this
 * card is the pretty version rendered in the bell.
 *
 * Design goals:
 *   - VISUAL FIRST. The card must be understandable by a user who cannot read
 *     English well, so the meaning is carried by big, universally-recognised
 *     icons: ⚠️ warning, the wrong UID crossed out with ❌, then three numbered
 *     steps (🚪 log out → 🆔 register correct ID → 📦 get items) and finally a
 *     clear "View My Orders" button with a 📦 icon and arrow.
 *   - SELF-CONTAINED. All layout, colours and animation keyframes are inlined so
 *     it renders identically in light/dark themes with no app CSS. Every class
 *     name + keyframe is prefixed `anc-` so it can never collide with the app or
 *     the other notification cards (`srn-`, `rfa-`).
 *
 * The button is authored with `target="_blank"` exactly like the other cards;
 * the bell's render pipeline rewrites it to open in the same tab and upgrades
 * the tap to a silent, client-side route change (no page reload), the same as
 * the "Refund Accepted" card.
 */

// Escape dynamic text (the wrong UID) before placing it into the HTML so it can
// never break the markup.
function escapeHtml(value: string): string {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * Builds the animated "Account Notice" card.
 *
 * @param params.wrongId  The incorrect UID the user is currently using.
 * @param params.orderUrl Absolute URL to the user's order page. Rendered as the
 *                        card's primary button.
 * @returns A trusted, self-contained HTML string for the notification bell.
 */
export function buildAccountNoticeHtml(params: { wrongId: string; orderUrl: string }): string {
  const { wrongId, orderUrl } = params;

  return `<div class="anc-card">
    <style>
      .anc-card{position:relative;overflow:hidden;border-radius:13px;padding:12px 12px 11px;
        background:linear-gradient(135deg,#7f1d1d 0%,#b91c1c 45%,#dc2626 70%,#9f1239 100%);
        color:#fef2f2;font-family:ui-sans-serif,system-ui,sans-serif;
        box-shadow:0 8px 24px -8px rgba(153,27,27,.65);}
      .anc-card *{box-sizing:border-box;}
      .anc-glow{position:absolute;top:-40px;right:-40px;width:120px;height:120px;border-radius:50%;
        background:radial-gradient(circle,rgba(248,113,113,.5),transparent 70%);
        animation:anc-float 4s ease-in-out infinite;pointer-events:none;}
      .anc-head{display:flex;align-items:center;gap:9px;position:relative;z-index:1;}
      .anc-badge{flex:none;width:34px;height:34px;border-radius:50%;
        display:flex;align-items:center;justify-content:center;font-size:18px;
        background:#fff;box-shadow:0 0 0 0 rgba(255,255,255,.6);
        animation:anc-pop .5s cubic-bezier(.18,.89,.32,1.28) both,anc-ring 2.2s ease-out .5s infinite;}
      .anc-title{font-size:14px;font-weight:800;line-height:1.15;}
      .anc-sub{font-size:11px;opacity:.9;margin-top:1px;}
      .anc-id{margin:9px 0;display:flex;align-items:center;gap:7px;font-size:12.5px;
        background:rgba(0,0,0,.18);border-radius:9px;padding:6px 9px;position:relative;z-index:1;
        animation:anc-rise .5s ease both .12s;}
      .anc-id .anc-x{flex:none;font-size:14px;}
      .anc-id b{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;
        font-weight:800;color:#fff;text-decoration:line-through;text-decoration-color:rgba(255,255,255,.7);}
      .anc-id .anc-wrong{flex:none;font-size:10px;font-weight:700;background:#fff;color:#b91c1c;
        border-radius:999px;padding:2px 7px;}
      .anc-msg{margin:0 0 9px;font-size:11.5px;line-height:1.4;position:relative;z-index:1;
        animation:anc-rise .5s ease both .16s;}
      .anc-msg b{font-weight:800;color:#fff;}
      .anc-flow{display:flex;align-items:stretch;gap:5px;margin-bottom:10px;position:relative;z-index:1;
        animation:anc-rise .5s ease both .2s;}
      .anc-fitem{flex:1;min-width:0;display:flex;flex-direction:column;align-items:center;gap:3px;
        text-align:center;background:rgba(255,255,255,.14);border-radius:9px;padding:7px 4px;}
      .anc-fico{font-size:18px;line-height:1;}
      .anc-flbl{font-size:9.5px;font-weight:700;line-height:1.15;letter-spacing:.1px;}
      .anc-arrow{flex:none;align-self:center;font-size:13px;opacity:.85;font-weight:800;}
      .anc-btn{display:flex;align-items:center;justify-content:center;gap:7px;width:100%;
        text-decoration:none;font-size:13.5px;font-weight:800;color:#b91c1c !important;
        background:#fff;border-radius:10px;padding:9px 14px;position:relative;overflow:hidden;z-index:1;
        box-shadow:0 4px 14px -4px rgba(0,0,0,.35);}
      .anc-btn::after{content:"";position:absolute;top:0;left:-60%;width:40%;height:100%;
        background:linear-gradient(120deg,transparent,rgba(255,255,255,.7),transparent);
        transform:skewX(-20deg);animation:anc-shine 2.6s ease-in-out infinite;}
      @keyframes anc-pop{0%{transform:scale(0) rotate(-30deg);opacity:0;}100%{transform:scale(1) rotate(0);opacity:1;}}
      @keyframes anc-ring{0%{box-shadow:0 0 0 0 rgba(255,255,255,.55);}70%,100%{box-shadow:0 0 0 10px rgba(255,255,255,0);}}
      @keyframes anc-rise{0%{transform:translateY(6px);opacity:0;}100%{transform:translateY(0);opacity:1;}}
      @keyframes anc-float{0%,100%{transform:translateY(0);}50%{transform:translateY(10px);}}
      @keyframes anc-shine{0%{left:-60%;}60%,100%{left:130%;}}
    </style>
    <div class="anc-glow"></div>
    <div class="anc-head">
      <div class="anc-badge">⚠️</div>
      <div>
        <div class="anc-title">Account Notice</div>
        <div class="anc-sub">Action needed for safe delivery 📦</div>
      </div>
    </div>
    <div class="anc-id">
      <span class="anc-x">❌</span>
      <b>${escapeHtml(wrongId)}</b>
      <span class="anc-wrong">WRONG ID</span>
    </div>
    <div class="anc-msg">The UID you provided is <b>wrong</b>. Please <b>log out</b>, log in again with your <b>correct UID</b>, then <b>place your order again</b>.</div>
    <div class="anc-flow">
      <div class="anc-fitem"><span class="anc-fico">🚪</span><span class="anc-flbl">Log out</span></div>
      <span class="anc-arrow">→</span>
      <div class="anc-fitem"><span class="anc-fico">🆔✅</span><span class="anc-flbl">Correct UID</span></div>
      <span class="anc-arrow">→</span>
      <div class="anc-fitem"><span class="anc-fico">🛒🔁</span><span class="anc-flbl">Order again</span></div>
    </div>
    <a class="anc-btn" href="${orderUrl}" target="_blank" rel="noopener noreferrer">📦 View My Orders →</a>
  </div>`;
}
