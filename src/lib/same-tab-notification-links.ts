import type { MouseEvent as ReactMouseEvent } from 'react';

/**
 * same-tab-notification-links
 * ---------------------------------------------------------------------------
 * Small, self-contained display helper for the rich (HTML) notification cards.
 *
 * The notification cards — the "New Support Reply" card and the "Refund
 * Accepted" card — are built on the server as trusted HTML and rendered with
 * `dangerouslySetInnerHTML`. Their buttons are plain anchors that were authored
 * with `target="_blank"`, which forces the link to open in a brand-new browser
 * tab when the user taps "View Reply", "Track Refund" or "Open Support Page".
 *
 * This helper rewrites those anchors so they open in the SAME tab instead. It
 * is a pure string transform applied only at render time:
 *   - The stored notification HTML in the database is left untouched.
 *   - The server-side card builders are left untouched.
 *   - No existing behaviour changes other than where the link opens.
 *
 * Because the cards are trusted, server-generated content, this only ever
 * touches the `target` attribute and the now-unnecessary `rel` tab-isolation
 * hints; it never adds or alters the destination (`href`).
 */

/**
 * Returns a copy of the given trusted notification HTML with every anchor
 * switched from opening a new tab (`target="_blank"`) to opening in the same
 * tab (`target="_self"`).
 *
 * Safe to call with `undefined`/empty input — it simply returns the input back,
 * so callers can pass an optional `notification.html` straight through.
 *
 * @param html The trusted, server-generated notification card HTML.
 * @returns    The same HTML with its links set to open in the current tab.
 */
export function makeNotificationLinksOpenInSameTab(html?: string | null): string {
  if (!html) return html ?? '';

  return (
    html
      // 1. Flip the explicit new-tab target to the same-tab target. Handles
      //    single or double quotes and is case-insensitive.
      .replace(/target=(["'])_blank\1/gi, 'target="_self"')
      // 2. `rel="noopener noreferrer"` only matters for `target="_blank"` (it
      //    isolates the newly opened tab). Once we open in the same tab it is
      //    redundant, so drop it to keep the markup clean. Optional and safe.
      .replace(/\s*rel=(["'])noopener noreferrer\1/gi, '')
  );
}

/**
 * Click interceptor for a notification card container.
 *
 * The card buttons are real anchors, so by default a tap triggers a full-page
 * browser navigation (the page visibly reloads). This helper upgrades that to a
 * silent, client-side route change — the same instant navigation the header nav
 * links use — by handing the destination to Next's router instead.
 *
 * Wire it onto the `onClick` of the element that renders the card HTML, e.g.
 *   onClick={(e) => handleNotificationCardClick(e, (path) => router.push(path))}
 *
 * It is deliberately conservative and only takes over a click when ALL of these
 * hold — otherwise it does nothing and the normal anchor behaviour runs, so no
 * existing behaviour is lost:
 *   - the click landed on (or inside) an anchor that has an `href`;
 *   - it's a plain left-click with no modifier keys (so Ctrl/Cmd/middle-click
 *     can still open the link in a new tab if the user wants);
 *   - the link points to THIS site (external links open normally).
 *
 * @param event    The React mouse event from the card container's onClick.
 * @param navigate Callback that performs the client-side navigation
 *                 (typically `router.push`). Receives an app-relative path.
 */
export function handleNotificationCardClick(
  event: ReactMouseEvent<HTMLElement>,
  navigate: (path: string) => void
): void {
  // Find the anchor that was clicked (the icon/text inside the button may be
  // the actual event target, so walk up to the nearest <a>).
  const anchor = (event.target as HTMLElement | null)?.closest('a');
  const href = anchor?.getAttribute('href');
  if (!href) return;

  // Respect modifier / non-left clicks so "open in new tab" still works.
  if (event.defaultPrevented) return;
  if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) {
    return;
  }

  try {
    const url = new URL(href, window.location.origin);
    // Only hijack same-site links; let anything external navigate normally.
    if (url.origin !== window.location.origin) return;

    event.preventDefault();
    navigate(`${url.pathname}${url.search}${url.hash}`);
  } catch {
    // Malformed href → leave the default browser behaviour untouched.
  }
}
