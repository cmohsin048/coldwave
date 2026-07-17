import { NextRequest, NextResponse } from "next/server";
import { recordTrackingHit } from "@/modules/tracking/record";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params;
  const result = await recordTrackingHit(token, {
    ip: req.headers.get("x-forwarded-for") ?? undefined,
    userAgent: req.headers.get("user-agent") ?? undefined,
  }).catch(() => null);

  const target = result?.targetUrl;
  if (target && /^https?:\/\//i.test(target)) {
    return NextResponse.redirect(target, 302);
  }
  // Fallback if token is unknown/invalid.
  return NextResponse.redirect(new URL("/", req.url), 302);
}
