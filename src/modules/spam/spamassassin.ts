import net from "node:net";
import { getEnv } from "@/lib/env";
import { logger } from "@/lib/logger";

/**
 * Minimal spamc/spamd protocol client. Talks to a SpamAssassin daemon (run as a
 * Docker sidecar) over TCP using the CHECK command and parses the returned
 * `Spam: True/False ; <score> / <threshold>` header.
 *
 * If the daemon is unreachable we return null so the aggregate score can fall
 * back to heuristics only (SpamAssassin is one input among several).
 */

export interface SpamAssassinResult {
  score: number;
  threshold: number;
  isSpam: boolean;
}

function buildRfc822(subject: string, body: string, from: string, to: string) {
  return [
    `From: ${from}`,
    `To: ${to}`,
    `Subject: ${subject}`,
    "MIME-Version: 1.0",
    'Content-Type: text/plain; charset="UTF-8"',
    "",
    body,
    "",
  ].join("\r\n");
}

export async function checkWithSpamAssassin(params: {
  subject: string;
  body: string;
  from?: string;
  to?: string;
  timeoutMs?: number;
}): Promise<SpamAssassinResult | null> {
  const env = getEnv();
  const host = env.SPAMASSASSIN_HOST;
  const port = env.SPAMASSASSIN_PORT;
  const message = buildRfc822(
    params.subject,
    params.body,
    params.from ?? "sender@example.com",
    params.to ?? "recipient@example.com"
  );

  const request =
    `CHECK SPAMC/1.5\r\n` +
    `Content-length: ${Buffer.byteLength(message)}\r\n` +
    `\r\n` +
    message;

  return new Promise((resolve) => {
    const socket = net.createConnection({ host, port });
    let response = "";
    const timeout = params.timeoutMs ?? 5000;
    socket.setTimeout(timeout);

    const done = (result: SpamAssassinResult | null) => {
      socket.destroy();
      resolve(result);
    };

    socket.on("connect", () => socket.write(request));
    socket.on("data", (chunk) => (response += chunk.toString()));
    socket.on("end", () => {
      // Example: "Spam: True ; 6.2 / 5.0"
      const m = response.match(
        /Spam:\s*(True|False)\s*;\s*(-?\d+(?:\.\d+)?)\s*\/\s*(-?\d+(?:\.\d+)?)/i
      );
      if (!m) return done(null);
      done({
        isSpam: m[1]!.toLowerCase() === "true",
        score: Number(m[2]),
        threshold: Number(m[3]),
      });
    });
    socket.on("timeout", () => {
      logger.warn("spamassassin timeout");
      done(null);
    });
    socket.on("error", (err) => {
      logger.warn("spamassassin unreachable", { error: err.message });
      done(null);
    });
  });
}
