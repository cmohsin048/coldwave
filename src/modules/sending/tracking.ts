import { nanoid } from "nanoid";
import { db } from "@/db";
import { trackingTokens } from "@/db/schema";
import { getEnv } from "@/lib/env";

/**
 * Inject an open-tracking pixel and wrap links for click tracking. Tokens map
 * back to (org, message) server-side so internal ids never appear in URLs.
 * Tracking is opt-in per campaign and should be skippable for plain-text sends.
 */

export async function injectTracking(params: {
  orgId: string;
  messageId: string;
  html: string;
  trackOpens: boolean;
  trackClicks: boolean;
}): Promise<string> {
  const base = getEnv().APP_URL;
  let html = params.html;
  const tokenRows: (typeof trackingTokens.$inferInsert)[] = [];

  if (params.trackClicks) {
    html = html.replace(
      /href=["'](https?:\/\/[^"']+)["']/gi,
      (_match, url: string) => {
        const token = nanoid(24);
        tokenRows.push({
          token,
          orgId: params.orgId,
          messageId: params.messageId,
          kind: "click",
          targetUrl: url,
        });
        return `href="${base}/api/track/click/${token}"`;
      }
    );
  }

  if (params.trackOpens) {
    const token = nanoid(24);
    tokenRows.push({
      token,
      orgId: params.orgId,
      messageId: params.messageId,
      kind: "open",
    });
    const pixel = `<img src="${base}/api/track/open/${token}" width="1" height="1" alt="" style="display:none" />`;
    html = /<\/body>/i.test(html)
      ? html.replace(/<\/body>/i, `${pixel}</body>`)
      : html + pixel;
  }

  if (tokenRows.length > 0) {
    await db.insert(trackingTokens).values(tokenRows);
  }
  return html;
}
