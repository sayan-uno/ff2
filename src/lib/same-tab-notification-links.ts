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
