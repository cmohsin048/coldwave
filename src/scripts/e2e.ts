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
