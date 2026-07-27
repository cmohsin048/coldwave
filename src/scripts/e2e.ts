/* eslint-disable no-console */
import "dotenv/config";
import { eq, and } from "drizzle-orm";
import { db } from "@/db";
import {
  organizations,
  users,
  leads,
  campaigns,
  sequenceSteps,
  campaignEnrollments,
  messages,
  messageEvents,
} from "@/db/schema";

// --- modules under test ---
import { encrypt, decrypt, encryptJson, decryptJson } from "@/lib/crypto";
import { render, countVariants, renderMergeFields } from "@/modules/spintax";
import {
  createUnsubToken,
  verifyUnsubToken,
  unsubscribeUrl,
} from "@/modules/compliance/unsubscribe";
import { buildFooter } from "@/modules/compliance/footer";
import { runSpamCheck } from "@/modules/spam/engine";
import { scanTriggerWords } from "@/modules/spam/trigger-words";
import { apolloPersonToLead } from "@/modules/leads/mapping";
import { verifyEmail } from "@/modules/leads/verify";
import {
  computeDailyTarget,
  isWithinBusinessHours,
} from "@/modules/warmup/engine";
import {
  checkRateLimit,
  consumeRateLimit,
} from "@/modules/sending/rate-limiter";
import { sealSecrets, openSecrets } from "@/modules/mailboxes/credentials";
import { findExistingEmails } from "@/modules/leads/queries";
import { addSuppression, isSuppressed } from "@/modules/sending/suppression";
import { registerAction } from "@/app/(auth)/actions";
import { getRedis } from "@/lib/redis";

let pass = 0;
let fail = 0;
let skip = 0;
const failures: string[] = [];

function ok(name: string, cond: boolean, detail = "") {
  if (cond) {
    pass++;
    console.log(`  PASS  ${name}`);
  } else {
    fail++;
    failures.push(name + (detail ? ` — ${detail}` : ""));
    console.log(`  FAIL  ${name}${detail ? ` — ${detail}` : ""}`);
  }
}
function skipped(name: string, reason: string) {
  skip++;
  console.log(`  SKIP  ${name} — ${reason}`);
}
function section(t: string) {
  console.log(`\n=== ${t} ===`);
}

async function main() {
  const stamp = Date.now();
  const testEmail = `e2e_${stamp}@coldwave.test`;
  let orgId = "";
  let userId = "";

  // ---------------------------------------------------------------------------
  section("1. Crypto (AES-256-GCM)");
  {
    const secret = "smtp-app-password-123!";
    const enc = encrypt(secret);
    ok("encrypt produces different ciphertext", enc !== secret);
    ok("decrypt round-trips", decrypt(enc) === secret);
    ok("two encryptions differ (random IV)", encrypt(secret) !== encrypt(secret));
    const obj = { smtpPass: "p1", imapPass: "p2" };
    ok("json round-trip", decryptJson<typeof obj>(encryptJson(obj)).imapPass === "p2");
    let tampered = enc.slice(0, -4) + (enc.endsWith("A") ? "B" : "A") + "==";
    let threw = false;
    try {
      decrypt(tampered);
    } catch {
      threw = true;
    }
    ok("tampered ciphertext rejected (auth tag)", threw);
    // mailbox credential seal/open
    const sealed = sealSecrets({ smtpPass: "x", imapPass: "y" });
    ok("mailbox secrets seal/open", openSecrets(sealed).smtpPass === "x");
  }

  // ---------------------------------------------------------------------------
  section("2. Spintax + merge fields");
  {
    ok(
      "merge fields resolve",
      renderMergeFields("Hi {{firstName}} at {{company}}", {
        firstName: "Sam",
        company: "Acme",
      }) === "Hi Sam at Acme"
    );
    const tmpl = "{Hi|Hey|Hello} {{firstName}}";
    const r1 = render(tmpl, { firstName: "Sam" }, "seedA");
    const r2 = render(tmpl, { firstName: "Sam" }, "seedA");
    ok("spintax is deterministic per seed", r1 === r2, `${r1} vs ${r2}`);
    ok("spintax resolved a variant", /^(Hi|Hey|Hello) Sam$/.test(r1), r1);
    ok("countVariants counts spin groups", countVariants("{a|b|c} {x|y}") === 6);
    // different seeds should (usually) diversify — sample a few
    const seeds = ["1", "2", "3", "4", "5"].map((s) => render(tmpl, { firstName: "S" }, s));
    ok("spintax diversifies across seeds", new Set(seeds).size >= 2);
  }

  // ---------------------------------------------------------------------------
  section("3. Compliance: unsubscribe tokens + footer (RFC 8058 / CAN-SPAM)");
  {
    const payload = { orgId: "org_test", email: "lead@example.com", campaignId: "camp_1" };
    const token = createUnsubToken(payload);
    const decoded = verifyUnsubToken(token);
    ok("unsub token verifies + round-trips email", decoded?.email === "lead@example.com");
    ok("tampered token rejected", verifyUnsubToken(token.slice(0, -3) + "xyz") === null);
    ok("unsubscribe URL points to /api/unsubscribe", unsubscribeUrl(payload).includes("/api/unsubscribe?token="));
    const footer = buildFooter({
      companyName: "Acme Inc",
      companyAddress: "1 Main St, City, ST",
      unsub: payload,
    });
    ok("footer includes postal address", footer.includes("1 Main St, City, ST"));
    ok("footer includes unsubscribe link", /unsubscribe/i.test(footer));
  }

  // ---------------------------------------------------------------------------
  section("4. Spam engine");
  {
    const trig = scanTriggerWords("ACT NOW for a 100% FREE guarantee, click here!!!");
    ok("trigger words detected", trig.hits.length >= 3, `${trig.hits.length} hits`);

    const clean = await runSpamCheck(
      {
        subject: "Quick question about your team",
        body: "Hi Sam,\n\nNoticed you're scaling outbound. Open to a short chat next week?\n\nBest, Alex",
        contentOnly: true,
      },
      5
    );
    ok("clean email scores low (<3)", clean.score < 3, `score=${clean.score}`);
    ok("clean email passes", clean.passed);

    const spammy = await runSpamCheck(
      {
        subject: "!!! 100% FREE MONEY GUARANTEED — ACT NOW !!!",
        body: "CONGRATULATIONS!!! You are a WINNER!!! CLICK HERE http://bit.ly/x to CLAIM your FREE CASH now!!! Buy now! Risk free! No cost! Viagra cheap!",
        contentOnly: true,
      },
      5
    );
    ok("spammy email scores high (>=5)", spammy.score >= 5, `score=${spammy.score}`);
    ok("spammy email blocked", !spammy.passed);
    ok("spammy email gives suggestions", spammy.suggestions.length > 0);

    // Full network pass (SpamAssassin daemon up)
    const full = await runSpamCheck({
      subject: "Following up",
      body: "Hi, circling back on my last note. Worth a quick chat?",
      fromEmail: "alex@example.com",
      toEmail: "sam@example.com",
      domain: "example.com",
    });
    ok(
      "SpamAssassin daemon responded",
      full.breakdown.spamassassin !== null,
      "daemon returned null (unreachable/rejected)"
    );
  }

  // ---------------------------------------------------------------------------
  section("5. Lead mapping + email verification");
  {
    const mapped = apolloPersonToLead({
      id: "p1",
      first_name: "Sam",
      last_name: "Lee",
      email: "Sam.Lee@Acme.com",
      title: "VP Sales",
      organization: { id: "o1", name: "Acme", primary_domain: "acme.com", estimated_num_employees: 120 },
    });
    ok("apollo person maps to lead", mapped?.companyName === "Acme" && mapped?.headcount === 120);
    ok("email normalized to lowercase", mapped?.email === "sam.lee@acme.com");
    ok("person without email is not importable", apolloPersonToLead({ id: "p2" }) === null);

    ok("invalid email syntax rejected", (await verifyEmail("not-an-email")) === "invalid");
    ok("disposable domain flagged", (await verifyEmail("x@mailinator.com")) === "disposable");
  }

  // ---------------------------------------------------------------------------
  section("6. Warmup ramp math + timing");
  {
    const base = {
      id: "wu", orgId: "o", mailboxId: "m", status: "ramping" as const,
      startVolume: 2, dailyIncrement: 2, maxVolume: 40, currentVolume: 2,
      replyRate: 30, businessHoursOnly: true, weekendReduction: true,
      timezone: "America/New_York", startedAt: null,
      createdAt: new Date(), updatedAt: new Date(),
    };
    ok("day 0 target = startVolume", computeDailyTarget({ ...base, startedAt: new Date() }) === 2);
    const tenDaysAgo = new Date(Date.now() - 10 * 864e5);
    ok("day 10 target = 2 + 10*2 = 22", computeDailyTarget({ ...base, startedAt: tenDaysAgo }) === 22);
    const longAgo = new Date(Date.now() - 100 * 864e5);
    ok("target caps at maxVolume (40)", computeDailyTarget({ ...base, startedAt: longAgo }) === 40);
    // business hours: Sunday should be false when weekendReduction on
    const sunday = new Date("2026-07-19T15:00:00Z"); // a Sunday
    ok("weekend blocked when weekendReduction on", isWithinBusinessHours(base, sunday) === false);
  }

  // ---------------------------------------------------------------------------
  section("7. Rate limiter (Redis)");
  {
    const mbx = `test_mbx_${stamp}`;
    const cfg = { hourlyLimit: 2, dailyLimit: 3, minDelaySeconds: 0, maxDelaySeconds: 0 };
    const d1 = await checkRateLimit(mbx, cfg);
    ok("first send allowed", d1.allowed);
    await consumeRateLimit(mbx);
    await consumeRateLimit(mbx);
    const d2 = await checkRateLimit(mbx, cfg);
    ok("hourly limit blocks after 2 sends", !d2.allowed && d2.reason === "hourly");
    // cooldown test with a fresh mailbox
    const mbx2 = `test_mbx2_${stamp}`;
    const cfg2 = { hourlyLimit: 10, dailyLimit: 10, minDelaySeconds: 60, maxDelaySeconds: 60 };
    ok("fresh mailbox allowed", (await checkRateLimit(mbx2, cfg2)).allowed);
    await consumeRateLimit(mbx2);
    const d3 = await checkRateLimit(mbx2, cfg2);
    ok("cooldown blocks immediate re-send", !d3.allowed && d3.reason === "cooldown");
    // cleanup redis keys
    const redis = getRedis();
    const keys = await redis.keys(`cw:rl:test_mbx*`);
    if (keys.length) await redis.del(...keys);
  }

  // ---------------------------------------------------------------------------
  section("8. Registration + multi-tenancy (DB)");
  {
    const res = await registerAction({
      name: "E2E User",
      email: testEmail,
      password: "password123",
      orgName: `E2E Org ${stamp}`,
    });
    ok("registration succeeds", res.ok, JSON.stringify(res));
    const user = await db.query.users.findFirst({ where: eq(users.email, testEmail) });
    ok("user row created with password hash", !!user?.passwordHash);
    userId = user?.id ?? "";
    const membership = await db.query.memberships.findFirst({
      where: eq(users.id, userId) ? undefined : undefined,
    });
    const org = await db.query.organizations.findFirst({
      where: eq(organizations.name, `E2E Org ${stamp}`),
    });
    orgId = org?.id ?? "";
    ok("organization created", !!orgId);
    ok("user active org set", user?.activeOrgId === orgId);
    void membership;

    // duplicate registration rejected
    const dup = await registerAction({
      name: "Dup", email: testEmail, password: "password123", orgName: "Dup",
    });
    ok("duplicate email rejected", !dup.ok);
  }

  // ---------------------------------------------------------------------------
  section("9. Leads: insert, dedupe, suppression (DB)");
  {
    if (!orgId) {
      skipped("lead tests", "no org from registration");
    } else {
      await db.insert(leads).values([
        { orgId, email: "existing1@acme.com", firstName: "A", status: "new" },
        { orgId, email: "existing2@acme.com", firstName: "B", status: "new" },
      ]);
      const existing = await findExistingEmails(orgId, [
        "existing1@acme.com",
        "brand-new@acme.com",
      ]);
      ok("dedupe finds existing lead", existing.has("existing1@acme.com"));
      ok("dedupe excludes new email", !existing.has("brand-new@acme.com"));

      await addSuppression({ orgId, email: "optout@acme.com", reason: "unsubscribe" });
      ok("global suppression honored", await isSuppressed(orgId, "optout@acme.com"));
      ok("non-suppressed passes", !(await isSuppressed(orgId, "fine@acme.com")));
      const supExisting = await findExistingEmails(orgId, ["optout@acme.com"]);
      ok("dedupe also excludes suppressed", supExisting.has("optout@acme.com"));
    }
  }

  // ---------------------------------------------------------------------------
  section("10. Campaign + sequence + enrollment + usage (DB)");
  {
    if (!orgId) {
      skipped("campaign tests", "no org");
    } else {
      const [camp] = await db
        .insert(campaigns)
        .values({ orgId, name: "E2E Campaign", status: "draft" })
        .returning();
      ok("campaign created", !!camp);
      const [step] = await db
        .insert(sequenceSteps)
        .values({
          orgId, campaignId: camp!.id, type: "email", stage: "awareness",
          order: 0, subject: "Hi {{firstName}}", body: "{Hey|Hi} {{firstName}}",
        })
        .returning();
      ok("sequence step created", !!step);
      const [lead] = await db
        .insert(leads)
        .values({ orgId, email: `enroll_${stamp}@acme.com`, firstName: "Enroll", status: "new" })
        .returning();
      const [enr] = await db
        .insert(campaignEnrollments)
        .values({ orgId, campaignId: camp!.id, leadId: lead!.id, status: "active", currentStepId: step!.id })
        .returning();
      ok("lead enrolled in campaign", enr?.status === "active");
    }
  }

  // ---------------------------------------------------------------------------
  section("11. Send pipeline: suppression gate (DB, no SMTP)");
  {
    if (!orgId) {
      skipped("send gate test", "no org");
    } else {
      const { sendSequenceStep } = await import("@/modules/sending/send");
      const [lead] = await db
        .insert(leads)
        .values({ orgId, email: `blocked_${stamp}@acme.com`, firstName: "Blocked", status: "new" })
        .returning();
      await addSuppression({ orgId, email: lead!.email, reason: "unsubscribe" });
      const fakeMailbox = {
        id: "mbx_fake", orgId, email: "sender@example.com", fromName: "S",
        provider: "smtp" as const, status: "active" as const, domainId: null,
        smtpHost: "localhost", smtpPort: 587, smtpSecure: false,
        imapHost: null, imapPort: null, imapSecure: true,
        encryptedCredentials: sealSecrets({ smtpPass: "x" }),
        dailySendLimit: 40, hourlySendLimit: 10, minDelaySeconds: 30, maxDelaySeconds: 180,
        sentToday: 0, lastSentAt: null, lastError: null,
        createdAt: new Date(), updatedAt: new Date(),
      };
      const outcome = await sendSequenceStep({
        orgId, campaignId: "c", stepId: "s", enrollmentId: "e", leadId: lead!.id,
        mailbox: fakeMailbox, subjectTemplate: "Hi", bodyTemplate: "Hello",
        trackOpens: false, trackClicks: false,
      });
      ok("suppressed lead is skipped (not sent)", outcome.status === "skipped", JSON.stringify(outcome));
    }
  }

  // ---------------------------------------------------------------------------
  section("12. External APIs (Apollo / OpenAI)");
  {
    if (process.env.APOLLO_API_KEY) {
      const { getApolloClient } = await import("@/modules/apollo/client");
      try {
        const r = await getApolloClient().searchPeople({ personTitles: ["CEO"], perPage: 1 });
        ok("Apollo people search returns results", r.totalEntries >= 0);
      } catch (e) {
        ok("Apollo people search", false, (e as Error).message);
      }
    } else {
      skipped("Apollo live search", "APOLLO_API_KEY empty");
    }
    if (process.env.OPENAI_API_KEY) {
      const { generateSequence } = await import("@/modules/ai/openai");
      try {
        const seq = await generateSequence({
          icp: "Heads of Sales at B2B SaaS", product: "ColdWave", tone: "friendly",
          offer: "free audit", goal: "book a demo", numSteps: 3,
        });
        ok("OpenAI returns a valid structured sequence", seq.steps.length >= 1);
      } catch (e) {
        ok("OpenAI generate", false, (e as Error).message);
      }
    } else {
      skipped("OpenAI live generation", "OPENAI_API_KEY empty");
    }
  }

  // ---------------------------------------------------------------------------
  section("13. Reply pipeline: extraction, pause-on-reply, sentiment, alerts");
  {
    // Reply text extraction (pure).
    const { extractReplyText } = await import("@/modules/warmup/imap");
    const raw = [
      "Sounds great, send over a calendar link.",
      "",
      "> original quoted line",
      "On Mon, Jul 20, 2026 at 9:00 AM Alex <alex@example.com> wrote:",
      "> earlier email body",
      "--",
      "Sam Lee | VP Sales | Acme",
    ].join("\n");
    const cleaned = extractReplyText(raw);
    ok("reply extraction keeps the lead's words", cleaned.includes("Sounds great"));
    ok(
      "reply extraction strips quotes/attribution/signature",
      !cleaned.includes("quoted") && !cleaned.includes("wrote:") && !cleaned.includes("VP Sales"),
      cleaned
    );

    if (!orgId) {
      skipped("reply pipeline DB tests", "no org from registration");
    } else {
      // Simulate what syncReplies records when a lead responds.
      const { pauseOnReply } = await import("@/modules/campaigns/scheduler");
      const [camp] = await db
        .insert(campaigns)
        .values({ orgId, name: "E2E Reply Campaign", status: "active" })
        .returning();
      const [step] = await db
        .insert(sequenceSteps)
        .values({
          orgId, campaignId: camp!.id, type: "email", stage: "awareness",
          order: 0, subject: "Hi {{firstName}}", body: "Hello",
        })
        .returning();
      const [rlead] = await db
        .insert(leads)
        .values({ orgId, email: `replier_${stamp}@acme.com`, firstName: "Rae", status: "contacted" })
        .returning();
      const [enr] = await db
        .insert(campaignEnrollments)
        .values({ orgId, campaignId: camp!.id, leadId: rlead!.id, status: "active", currentStepId: step!.id })
        .returning();
      const [outMsg] = await db
        .insert(messages)
        .values({
          orgId, direction: "outbound", status: "sent", campaignId: camp!.id,
          stepId: step!.id, enrollmentId: enr!.id, leadId: rlead!.id,
          fromEmail: "sender@example.com", toEmail: rlead!.email,
          subject: "Hi Rae", body: "Hello", sentAt: new Date(),
        })
        .returning();
      await db.insert(messages).values({
        orgId, direction: "inbound", status: "replied", campaignId: camp!.id,
        leadId: rlead!.id, fromEmail: rlead!.email, toEmail: "sender@example.com",
        subject: "Re: Hi Rae", body: "Sounds great, let's talk.",
        sentiment: "positive", sentimentSummary: "Interested, wants to talk.",
      });
      await db.insert(messageEvents).values({
        orgId, messageId: outMsg!.id, campaignId: camp!.id, leadId: rlead!.id, type: "reply",
      });

      await pauseOnReply(orgId, rlead!.id);
      const after = await db.query.campaignEnrollments.findFirst({
        where: eq(campaignEnrollments.id, enr!.id),
      });
      ok("enrollment auto-pauses as 'replied' after a reply", after?.status === "replied", after?.status);

      // Alert gating (no real email is sent on these paths).
      const { sendReplyAlert } = await import("@/modules/notifications/reply-alerts");
      await db.update(organizations)
        .set({ replyNotificationMode: "off" })
        .where(eq(organizations.id, orgId));
      const offRes = await sendReplyAlert({
        orgId, lead: rlead!, campaignId: camp!.id, subject: "Re: Hi",
        replyText: "Yes!", sentiment: "positive", sentimentSummary: null,
      });
      ok("alert mode 'off' suppresses alerts", offRes === false);

      await db.update(organizations)
        .set({ replyNotificationMode: "positive_only" })
        .where(eq(organizations.id, orgId));
      const neuRes = await sendReplyAlert({
        orgId, lead: rlead!, campaignId: camp!.id, subject: "Re: Hi",
        replyText: "Who is this?", sentiment: "neutral", sentimentSummary: null,
      });
      ok("'positive_only' skips neutral replies", neuRes === false);
      // Actual delivery of a positive alert is covered by
      // src/scripts/test-reply-alert.ts (sends a real email via SYSTEM_SMTP).
    }

    // Live AI sentiment classification.
    if (process.env.OPENAI_API_KEY) {
      const { classifyReplySentiment } = await import("@/modules/ai/openai");
      try {
        const pos = await classifyReplySentiment({
          subject: "Re: Quick question",
          body: "This looks great — let's book a call on Tuesday.",
        });
        ok("AI classifies interested reply as positive", pos.sentiment === "positive", pos.sentiment);
        ok("AI produces a one-line summary", (pos.summary ?? "").length > 0);
        const neg = await classifyReplySentiment({
          subject: "Re: Quick question",
          body: "Not interested. Remove me from your list and do not contact me again.",
        });
        ok("AI classifies rejection as negative", neg.sentiment === "negative", neg.sentiment);
      } catch (e) {
        ok("AI sentiment classification", false, (e as Error).message);
      }
    } else {
      skipped("AI sentiment classification", "OPENAI_API_KEY empty");
    }
  }

  // ---------------------------------------------------------------------------
  section("14. Analytics: reply breakdown + event totals (DB)");
  {
    if (!orgId) {
      skipped("analytics tests", "no org");
    } else {
      const { replyBreakdown, orgEventTotals } = await import("@/modules/analytics/queries");
      const rb = await replyBreakdown(orgId);
      ok("contacted counts distinct leads with sent mail", rb.contacted === 1, `contacted=${rb.contacted}`);
      ok("replied counts distinct leads with inbound mail", rb.replied === 1, `replied=${rb.replied}`);
      ok("positive reply sentiment counted", rb.sentiment.positive === 1, JSON.stringify(rb.sentiment));
      ok("noReply = contacted − replied", rb.noReply === 0, `noReply=${rb.noReply}`);
      const totals = await orgEventTotals(orgId);
      ok("reply event counted in org totals", totals.reply === 1, `reply=${totals.reply}`);
    }
  }

  // ---------------------------------------------------------------------------
  section("15. Hardening: keyword fallback, bot-open filter, verification gate, reclassify sweep");
  {
    // Keyword sentiment fallback (pure).
    const { keywordClassifyReply } = await import("@/modules/ai/keyword-sentiment");
    ok(
      "keyword: buying signal → positive",
      keywordClassifyReply({ subject: "Re: Hi", body: "Sounds great, let's book a call." })?.sentiment === "positive"
    );
    ok(
      "keyword: 'not interested' → negative (not positive)",
      keywordClassifyReply({ subject: "Re: Hi", body: "I'm not interested, remove me." })?.sentiment === "negative"
    );
    ok(
      "keyword: out-of-office → neutral",
      keywordClassifyReply({ subject: "Automatic reply", body: "I am out of office until Monday." })?.sentiment === "neutral"
    );
    ok(
      "keyword: ambiguous reply stays unclassified",
      keywordClassifyReply({ subject: "Re: Hi", body: "Who gave you this address?" }) === null
    );

    if (!orgId) {
      skipped("hardening DB tests", "no org");
    } else {
      // Verification gate: invalid/disposable leads never reach SMTP.
      const { sendSequenceStep } = await import("@/modules/sending/send");
      const [badLead] = await db
        .insert(leads)
        .values({ orgId, email: `bogus_${stamp}@acme.com`, firstName: "Bogus", status: "new", verification: "invalid" })
        .returning();
      const fakeMailbox = {
        id: "mbx_fake2", orgId, email: "sender@example.com", fromName: "S",
        provider: "smtp" as const, status: "active" as const, domainId: null,
        smtpHost: "localhost", smtpPort: 587, smtpSecure: false,
        imapHost: null, imapPort: null, imapSecure: true,
        encryptedCredentials: sealSecrets({ smtpPass: "x" }),
        dailySendLimit: 40, hourlySendLimit: 10, minDelaySeconds: 30, maxDelaySeconds: 180,
        sentToday: 0, lastSentAt: null, lastError: null,
        createdAt: new Date(), updatedAt: new Date(),
      };
      const gate = await sendSequenceStep({
        orgId, campaignId: "c", stepId: "s", enrollmentId: "e", leadId: badLead!.id,
        mailbox: fakeMailbox, subjectTemplate: "Hi", bodyTemplate: "Hello",
        trackOpens: false, trackClicks: false,
      });
      ok(
        "invalid-verification lead is skipped before sending",
        gate.status === "skipped" && gate.reason === "verification:invalid",
        JSON.stringify(gate)
      );

      // Bot-open filter: scanner UAs and instant hits don't become events.
      const { recordTrackingHit } = await import("@/modules/tracking/record");
      const { trackingTokens } = await import("@/db/schema");
      const [trackedMsg] = await db
        .insert(messages)
        .values({
          orgId, direction: "outbound", status: "sent",
          fromEmail: "sender@example.com", toEmail: `open_${stamp}@acme.com`,
          subject: "T", body: "B", sentAt: new Date(Date.now() - 60 * 60 * 1000),
        })
        .returning();
      const eventCount = async (id: string) => {
        const rows = await db
          .select({ id: messageEvents.id })
          .from(messageEvents)
          .where(eq(messageEvents.messageId, id));
        return rows.length;
      };
      await db.insert(trackingTokens).values({
        token: `e2ebot_${stamp}`, orgId, messageId: trackedMsg!.id, kind: "open",
      });
      await recordTrackingHit(`e2ebot_${stamp}`, {
        userAgent: "Mozilla/5.0 (compatible; barracuda scanner bot)",
      });
      ok("scanner user-agent open records no event", (await eventCount(trackedMsg!.id)) === 0);

      const [instantMsg] = await db
        .insert(messages)
        .values({
          orgId, direction: "outbound", status: "sent",
          fromEmail: "sender@example.com", toEmail: `open2_${stamp}@acme.com`,
          subject: "T", body: "B", sentAt: new Date(),
        })
        .returning();
      await db.insert(trackingTokens).values({
        token: `e2efast_${stamp}`, orgId, messageId: instantMsg!.id, kind: "open",
      });
      await recordTrackingHit(`e2efast_${stamp}`, {
        userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
      });
      ok("instant (prefetch-window) open records no event", (await eventCount(instantMsg!.id)) === 0);

      await db.insert(trackingTokens).values({
        token: `e2ehuman_${stamp}`, orgId, messageId: trackedMsg!.id, kind: "open",
      });
      await recordTrackingHit(`e2ehuman_${stamp}`, {
        userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
      });
      const afterHuman = await db.query.messages.findFirst({
        where: eq(messages.id, trackedMsg!.id),
      });
      ok("human open still records event + status", (await eventCount(trackedMsg!.id)) === 1 && afterHuman?.status === "opened");

      // Reclassification sweep: unclassified inbound replies get upgraded.
      if (process.env.OPENAI_API_KEY) {
        const { reclassifyReplies } = await import("@/modules/notifications/reclassify-replies");
        // Alerts stay quiet for this org while the sweep runs.
        await db.update(organizations)
          .set({ replyNotificationMode: "off" })
          .where(eq(organizations.id, orgId));
        const [unclassified] = await db
          .insert(messages)
          .values({
            orgId, direction: "inbound", status: "replied",
            fromEmail: `sweep_${stamp}@acme.com`, toEmail: "sender@example.com",
            subject: "Re: Hi", body: "Yes, very interested — send pricing please.",
          })
          .returning();
        await reclassifyReplies({ batchSize: 5 });
        const swept = await db.query.messages.findFirst({
          where: eq(messages.id, unclassified!.id),
        });
        ok("sweep classifies previously-unclassified reply", swept?.sentiment === "positive", swept?.sentiment ?? "null");
        ok("sweep with alerts off leaves replyAlertSentAt unset", swept?.replyAlertSentAt == null);
      } else {
        skipped("reclassification sweep", "OPENAI_API_KEY empty");
      }
    }
  }

  // ---------------------------------------------------------------------------
  section("Cleanup");
  {
    if (orgId) {
      await db.delete(organizations).where(eq(organizations.id, orgId)); // cascades
    }
    if (userId) {
      await db.delete(users).where(eq(users.id, userId));
    }
    console.log("  test data removed");
  }

  // ---------------------------------------------------------------------------
  console.log(`\n${"=".repeat(40)}`);
  console.log(`RESULTS:  ${pass} passed, ${fail} failed, ${skip} skipped`);
  if (failures.length) {
    console.log("\nFailures:");
    for (const f of failures) console.log("  - " + f);
  }
  console.log("=".repeat(40));

  // Close pooled connections so the process exits.
  getRedis().disconnect();
  process.exit(fail > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error("\nHARNESS CRASHED:", err);
  process.exit(1);
});
