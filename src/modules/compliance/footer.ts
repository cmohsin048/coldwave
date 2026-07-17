import { unsubscribeUrl, type UnsubPayload } from "./unsubscribe";

/**
 * CAN-SPAM compliant footer. Every campaign email must include:
 *   - a physical postal address (CAN-SPAM),
 *   - a clear, working unsubscribe mechanism (CAN-SPAM + GDPR opt-out).
 */
export function buildFooter(params: {
  companyName: string;
  companyAddress: string;
  unsub: UnsubPayload;
  html?: boolean;
}): string {
  const url = unsubscribeUrl(params.unsub);
  if (params.html) {
    return `
<hr style="border:none;border-top:1px solid #e5e7eb;margin:24px 0" />
<div style="font-size:12px;color:#6b7280;line-height:1.5">
  <p>${escapeHtml(params.companyName)}<br/>${escapeHtml(params.companyAddress)}</p>
  <p>You are receiving this because we believe it is relevant to your work.
     <a href="${url}" style="color:#6b7280">Unsubscribe</a> at any time — honored within 24 hours.</p>
</div>`.trim();
  }
  return [
    "",
    "—",
    params.companyName,
    params.companyAddress,
    "",
    `Unsubscribe: ${url}`,
  ].join("\n");
}

/** Ensure a body has a compliant footer; appends one if missing. */
export function ensureFooter(
  body: string,
  params: Parameters<typeof buildFooter>[0]
): string {
  if (/unsubscribe/i.test(body)) return body; // assume author added one
  return `${body}\n${buildFooter(params)}`;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}
