import { and, eq, desc } from "drizzle-orm";
import { db } from "@/db";
import { messages, leads } from "@/db/schema";
import { requireOrgContext } from "@/lib/tenant";
import { PageHeader } from "@/components/dashboard/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ReplyAssist } from "./reply-assist";

export default async function InboxPage() {
  const ctx = await requireOrgContext();

  const inbound = await db
    .select({
      id: messages.id,
      fromEmail: messages.fromEmail,
      subject: messages.subject,
      createdAt: messages.createdAt,
      leadName: leads.fullName,
      company: leads.companyName,
    })
    .from(messages)
    .leftJoin(leads, eq(messages.leadId, leads.id))
    .where(
      and(eq(messages.orgId, ctx.orgId), eq(messages.direction, "inbound"))
    )
    .orderBy(desc(messages.createdAt))
    .limit(100);

  return (
    <div>
      <PageHeader
        title="Unified Inbox"
        description="Replies across all mailboxes. Sequences auto-pause when a lead replies. Draft responses with AI."
      />

      {inbound.length === 0 ? (
        <Card>
          <CardContent className="py-16 text-center text-sm text-muted-foreground">
            No replies yet. When leads respond, they appear here and their
            sequence pauses automatically.
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-3">
          {inbound.map((m) => (
            <Card key={m.id}>
              <CardHeader className="pb-2">
                <CardTitle className="flex items-center justify-between text-base">
                  <span>{m.leadName ?? m.fromEmail}</span>
                  <span className="text-xs font-normal text-muted-foreground">
                    {m.createdAt.toLocaleString()}
                  </span>
                </CardTitle>
                <p className="text-sm text-muted-foreground">
                  {m.company ? `${m.company} · ` : ""}
                  {m.fromEmail}
                </p>
              </CardHeader>
              <CardContent className="space-y-3">
                <p className="text-sm font-medium">{m.subject}</p>
                <ReplyAssist messageId={m.id} />
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
