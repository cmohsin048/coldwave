import { and, eq, isNull } from "drizzle-orm";
import { db } from "@/db";
import { invitations, organizations } from "@/db/schema";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { AcceptInvite } from "./accept-invite";

export default async function InvitePage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;

  const invite = await db.query.invitations.findFirst({
    where: and(eq(invitations.token, token), isNull(invitations.acceptedAt)),
  });
  const org = invite
    ? await db.query.organizations.findFirst({
        where: eq(organizations.id, invite.orgId),
      })
    : null;

  const expired = invite ? invite.expiresAt.getTime() < Date.now() : false;

  return (
    <main className="flex min-h-screen items-center justify-center bg-muted/40 p-4">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>
            {invite && !expired ? "You're invited" : "Invitation unavailable"}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {!invite || expired ? (
            <p className="text-sm text-muted-foreground">
              This invitation link is invalid, expired, or has already been
              used. Ask your teammate to send a new one.
            </p>
          ) : (
            <div className="space-y-4">
              <p className="text-sm text-muted-foreground">
                <span className="font-medium text-foreground">
                  {invite.email}
                </span>{" "}
                has been invited to join{" "}
                <span className="font-medium text-foreground">
                  {org?.name ?? "a workspace"}
                </span>{" "}
                as <span className="font-medium">{invite.role}</span>.
              </p>
              <AcceptInvite token={token} orgName={org?.name ?? "workspace"} />
            </div>
          )}
        </CardContent>
      </Card>
    </main>
  );
}
