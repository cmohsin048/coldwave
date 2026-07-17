import { eq, desc } from "drizzle-orm";
import { db } from "@/db";
import { mailboxes } from "@/db/schema";
import { requireOrgContext } from "@/lib/tenant";
import { PageHeader } from "@/components/dashboard/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ConnectMailboxDialog } from "./connect-dialog";
import { MailboxRowActions } from "./row-actions";
import { Mail } from "lucide-react";

const statusVariant: Record<
  string,
  "success" | "warning" | "danger" | "secondary"
> = {
  active: "success",
  warming: "warning",
  connecting: "secondary",
  paused: "secondary",
  error: "danger",
  disconnected: "danger",
};

export default async function MailboxesPage() {
  const ctx = await requireOrgContext();
  const rows = await db
    .select()
    .from(mailboxes)
    .where(eq(mailboxes.orgId, ctx.orgId))
    .orderBy(desc(mailboxes.createdAt));

  return (
    <div>
      <PageHeader
        title="Mailboxes"
        description="Connect the mailboxes you'll send from. Campaigns rotate across the pool with per-mailbox rate limits."
        action={<ConnectMailboxDialog />}
      />

      {rows.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-3 py-16 text-center">
            <Mail className="h-10 w-10 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">
              No mailboxes yet. Connect one to start warming and sending.
            </p>
            <ConnectMailboxDialog />
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="pt-6">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Mailbox</TableHead>
                  <TableHead>Provider</TableHead>
                  <TableHead>Daily limit</TableHead>
                  <TableHead>Sent today</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((m) => (
                  <TableRow key={m.id}>
                    <TableCell>
                      <div className="font-medium">{m.email}</div>
                      {m.fromName && (
                        <div className="text-xs text-muted-foreground">
                          {m.fromName}
                        </div>
                      )}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {m.provider}
                    </TableCell>
                    <TableCell>{m.dailySendLimit}</TableCell>
                    <TableCell>{m.sentToday}</TableCell>
                    <TableCell>
                      <Badge variant={statusVariant[m.status] ?? "secondary"}>
                        {m.status}
                      </Badge>
                      {m.lastError && (
                        <div
                          className="mt-1 max-w-56 truncate text-xs text-destructive"
                          title={m.lastError}
                        >
                          {m.lastError}
                        </div>
                      )}
                    </TableCell>
                    <TableCell>
                      <MailboxRowActions mailboxId={m.id} email={m.email} />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
