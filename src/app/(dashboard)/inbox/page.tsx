import { and, eq, desc } from "drizzle-orm";
import { db } from "@/db";
import { messages, leads } from "@/db/schema";
import { requireOrgContext } from "@/lib/tenant";
import { PageHeader } from "@/components/dashboard/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ReplyAssist } from "./reply-assist";

const sentimentBadge: Record<
  string,
  { label: string; variant: "success" | "secondary" | "danger" }
> = {
  positive: { label: "Positive", variant: "success" },
  neutral: { label: "Neutral", variant: "secondary" },
  negative: { label: "Negative", variant: "danger" },
};

export default async function InboxPage() {
  const ctx = await requireOrgContext();

  const inbound = await db
    .select({
      id: messages.id,
      fromEmail: messages.fromEmail,
      subject: messages.subject,
      body: messages.body,
      sentiment: messages.sentiment,
      sentimentSummary: messages.sentimentSummary,
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
                  <span className="flex items-center gap-2">
                    {m.leadName ?? m.fromEmail}
                    {m.sentiment && sentimentBadge[m.sentiment] && (
                      <Badge variant={sentimentBadge[m.sentiment]!.variant}>
                        {sentimentBadge[m.sentiment]!.label}
                      </Badge>
                    )}
                  </span>
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
                {m.sentimentSummary && (
                  <p className="text-xs italic text-muted-foreground">
                    AI: {m.sentimentSummary}
                  </p>
                )}
                {m.body && (
                  <p className="whitespace-pre-line rounded-md bg-muted/40 p-3 text-sm text-foreground/90">
                    {m.body.length > 600 ? `${m.body.slice(0, 600)}…` : m.body}
                  </p>
                )}
                <ReplyAssist messageId={m.id} />
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
