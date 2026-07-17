import Link from "next/link";
import { requireOrgContext } from "@/lib/tenant";
import { listLeadLists, queryLeads } from "@/modules/leads/queries";
import { PageHeader } from "@/components/dashboard/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { NewSearchDialog } from "./new-search-dialog";
import { CsvImportButton, ExportCsvButton } from "./csv-tools";
import { LeadsTable } from "./leads-table";
import { formatNumber } from "@/lib/utils";

export default async function LeadsPage({
  searchParams,
}: {
  searchParams: Promise<{ list?: string; page?: string }>;
}) {
  const ctx = await requireOrgContext();
  const params = await searchParams;

  const [lists, leadPage] = await Promise.all([
    listLeadLists(ctx.orgId),
    queryLeads(ctx.orgId, {
      listId: params.list,
      page: params.page ? Number(params.page) : 1,
    }),
  ]);

  return (
    <div>
      <PageHeader
        title="Leads"
        description="Search Apollo, enrich and verify, then dedupe against everyone you've already contacted."
        action={
          <div className="flex gap-2">
            <ExportCsvButton listId={params.list} />
            <CsvImportButton />
            <NewSearchDialog />
          </div>
        }
      />

      <div className="grid gap-6 lg:grid-cols-[240px_1fr]">
        <Card className="h-fit">
          <CardHeader>
            <CardTitle className="text-sm">Lists</CardTitle>
          </CardHeader>
          <CardContent className="space-y-1 text-sm">
            <Link
              href="/leads"
              className={`block rounded px-2 py-1.5 hover:bg-accent ${!params.list ? "bg-accent font-medium" : ""}`}
            >
              All leads
            </Link>
            {lists.length === 0 && (
              <p className="px-2 py-1.5 text-muted-foreground">No lists yet.</p>
            )}
            {lists.map((list) => (
              <Link
                key={list.id}
                href={`/leads?list=${list.id}`}
                className={`flex items-center justify-between rounded px-2 py-1.5 hover:bg-accent ${params.list === list.id ? "bg-accent font-medium" : ""}`}
              >
                <span className="truncate">{list.name}</span>
                <span className="text-xs text-muted-foreground">
                  {formatNumber(list.leadCount)}
                </span>
              </Link>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-sm">
              {formatNumber(leadPage.total)} leads
            </CardTitle>
          </CardHeader>
          <CardContent>
            {leadPage.rows.length === 0 ? (
              <p className="py-12 text-center text-sm text-muted-foreground">
                No leads yet. Start a new Apollo search or import a CSV.
              </p>
            ) : (
              <LeadsTable
                rows={leadPage.rows.map((lead) => ({
                  id: lead.id,
                  name:
                    lead.fullName ??
                    `${lead.firstName ?? ""} ${lead.lastName ?? ""}`.trim(),
                  title: lead.title,
                  companyName: lead.companyName,
                  email: lead.email,
                  verification: lead.verification,
                }))}
                lists={lists.map((l) => ({ id: l.id, name: l.name }))}
              />
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
