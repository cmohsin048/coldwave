import "dotenv/config";
import bcrypt from "bcryptjs";
import { desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { users, passwordResetTokens } from "@/db/schema";
import {
  registerAction,
  requestPasswordResetAction,
  resetPasswordAction,
  isResetTokenValid,
} from "@/app/(auth)/actions";

/**
 * Live test of the password reset flow. Usage:
 *   npx tsx src/scripts/test-password-reset.ts [email] [newPassword]
 *
 * Sends REAL reset emails through SYSTEM_SMTP. The final step requests a
 * fresh link so the recipient can also walk the browser flow manually.
 */
async function main() {
  const email = (process.argv[2] || "project@kakushin.io").toLowerCase();
  const newPassword = process.argv[3] || "ColdWave!Test123";
  let passed = 0;
  let failed = 0;

  const ok = (label: string, cond: boolean, extra?: string) => {
    if (cond) passed++;
    else failed++;
    console.log(`  ${cond ? "PASS " : "FAIL "} ${label}${!cond && extra ? ` — ${extra}` : ""}`);
  };

  console.log(`\n=== Password reset flow (${email}) ===`);

  // 0. Ensure the account exists.
  let user = await db.query.users.findFirst({ where: eq(users.email, email) });
  if (!user) {
    const reg = await registerAction({
      name: "Reset Test User",
      email,
      password: "InitialPass123!",
      orgName: "Reset Test Org",
    });
    ok("account created for test", reg.ok, JSON.stringify(reg));
    user = await db.query.users.findFirst({ where: eq(users.email, email) });
  } else {
    console.log("  (account already exists — reusing)");
  }
  if (!user) throw new Error("no user to test with");

  // 1. Unknown email → generic success, no token created.
  const unknown = await requestPasswordResetAction("nobody-here-xyz@example.com");
  ok("unknown email answered with generic success", unknown.ok);

  // 2. Real request → token row + real email.
  const req = await requestPasswordResetAction(email);
  ok("reset requested (email sent)", req.ok, !req.ok ? req.error : undefined);

  const tokenRow = await db.query.passwordResetTokens.findFirst({
    where: eq(passwordResetTokens.userId, user.id),
    orderBy: desc(passwordResetTokens.createdAt),
  });
  ok("token row created", !!tokenRow);
  const ttlMin = tokenRow
    ? (tokenRow.expiresAt.getTime() - Date.now()) / 60000
    : 0;
  ok("token expires in ~1 hour", ttlMin > 55 && ttlMin <= 60);
  ok("token validates", await isResetTokenValid(tokenRow?.token ?? ""));

  // 3. Garbage token rejected.
  const bad = await resetPasswordAction({ token: "not-a-real-token", password: newPassword });
  ok("garbage token rejected", !bad.ok);

  // 4. Weak password rejected.
  const weak = await resetPasswordAction({ token: tokenRow!.token, password: "short" });
  ok("weak password rejected", !weak.ok);

  // 5. Real reset works.
  const res = await resetPasswordAction({ token: tokenRow!.token, password: newPassword });
  ok("password reset succeeds", res.ok, !res.ok ? res.error : undefined);

  const after = await db.query.users.findFirst({ where: eq(users.email, email) });
  ok(
    "new password verifies against stored hash",
    !!after?.passwordHash && (await bcrypt.compare(newPassword, after.passwordHash))
  );

  // 6. Token is single-use.
  const reuse = await resetPasswordAction({ token: tokenRow!.token, password: "AnotherPass123!" });
  ok("used token cannot be reused", !reuse.ok);
  ok("used token no longer validates", !(await isResetTokenValid(tokenRow!.token)));

  // 7. Fresh link for manual browser testing.
  const again = await requestPasswordResetAction(email);
  ok("fresh reset link emailed for manual UI test", again.ok);

  console.log(`\nRESULTS: ${passed} passed, ${failed} failed`);
  console.log(
    failed === 0
      ? `\nAccount "${email}" password is now "${newPassword}".\nA FRESH reset link is in that inbox — click it to walk the browser flow.`
      : "\nSome checks failed — see above."
  );
  process.exit(failed === 0 ? 0 : 1);
}

main().catch((err) => {
  console.error("HARNESS CRASHED:", err);
  process.exit(1);
});
