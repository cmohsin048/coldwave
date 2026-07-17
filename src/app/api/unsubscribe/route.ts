import { NextRequest } from "next/server";
import { verifyUnsubToken } from "@/modules/compliance/unsubscribe";
import { addSuppression } from "@/modules/sending/suppression";
import { pauseOnReply } from "@/modules/campaigns/scheduler";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { leads } from "@/db/schema";
import { normalizeEmail } from "@/lib/utils";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * RFC 8058 one-click unsubscribe endpoint. Handles:
 *   - POST (List-Unsubscribe-Post=One-Click) from Gmail/Apple — no UI, 200.
 *   - GET  (a human clicking the link) — friendly confirmation page.
 *
 * The suppression is written immediately so the opt-out is honored within the
 * 24-hour window (CAN-SPAM / GDPR).
 */

async function processUnsubscribe(token: string): Promise<boolean> {
  const payload = verifyUnsubToken(token);
  if (!payload) return false;

  await addSuppression({
    orgId: payload.orgId,
    email: payload.email,
    reason: "unsubscribe",
    scope: "global",
  });

  // Mark the lead + pause any active sequence.
  const email = normalizeEmail(payload.email);
  const lead = await db.query.leads.findFirst({
    where: and(eq(leads.orgId, payload.orgId), eq(leads.email, email)),
  });
  if (lead) {
    await db
      .update(leads)
      .set({ status: "unsubscribed" })
      .where(eq(leads.id, lead.id));
    await pauseOnReply(payload.orgId, lead.id);
  }
  return true;
}

export async function POST(req: NextRequest) {
  const token = new URL(req.url).searchParams.get("token") ?? "";
  const ok = await processUnsubscribe(token).catch(() => false);
  return new Response(ok ? "Unsubscribed" : "Invalid token", {
    status: ok ? 200 : 400,
  });
}

export async function GET(req: NextRequest) {
  const token = new URL(req.url).searchParams.get("token") ?? "";
  const ok = await processUnsubscribe(token).catch(() => false);
  const html = `<!doctype html><html><head><meta charset="utf-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1"/>
<title>Unsubscribe</title>
<style>body{font-family:system-ui,Arial,sans-serif;display:flex;min-height:100vh;align-items:center;justify-content:center;margin:0;background:#f8fafc;color:#0f172a}
.card{background:#fff;border:1px solid #e2e8f0;border-radius:12px;padding:40px;max-width:420px;text-align:center;box-shadow:0 1px 3px rgba(0,0,0,.08)}</style>
</head><body><div class="card">
<h1 style="font-size:20px;margin:0 0 8px">${ok ? "You're unsubscribed" : "Link expired"}</h1>
<p style="color:#64748b;margin:0">${ok ? "You won't receive further emails from us. This is honored within 24 hours." : "This unsubscribe link is invalid or has expired."}</p>
</div></body></html>`;
  return new Response(html, {
    status: ok ? 200 : 400,
    headers: { "Content-Type": "text/html; charset=utf-8" },
  });
}
