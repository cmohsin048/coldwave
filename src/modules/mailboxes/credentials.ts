import { encryptJson, decryptJson } from "@/lib/crypto";

/**
 * Shape of the secret material stored (encrypted) for a mailbox. SMTP is used
 * for sending, IMAP for reply detection + warmup. OAuth tokens are supported
 * for Gmail/Microsoft when the org connects via OAuth instead of app passwords.
 */
export interface MailboxSecrets {
  smtpPass?: string;
  imapPass?: string;
  oauth?: {
    accessToken: string;
    refreshToken: string;
    expiresAt: number;
  };
}

/** Encrypt secrets for storage in `mailboxes.encryptedCredentials`. */
export function sealSecrets(secrets: MailboxSecrets): string {
  return encryptJson(secrets);
}

/** Decrypt secrets read from the DB. */
export function openSecrets(sealed: string): MailboxSecrets {
  return decryptJson<MailboxSecrets>(sealed);
}
