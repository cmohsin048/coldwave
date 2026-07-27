import Link from "next/link";
import { format } from "date-fns";
import { Users, FolderOpen } from "lucide-react";
import { requireOrgContext } from "@/lib/tenant";
import { listLeadLists, queryLeads } from "@/modules/leads/queries";
import { PageHeader } from "@/components/dashboard/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { NewSearchDialog } from "./new-search-dialog";
import { CsvImportButton, ExportCsvButton } from "./csv-tools";
import { LeadsTable } from "./leads-table";
import { ListSwitcher } from "./list-actions";
import { formatNumber } from "@/lib/utils";

export default async function LeadsPage({
  searchParams,
}: {
  searchParams: Promise<{ list?: string; page?: string }>;
}) {
  const ctx = await requireOrgContext();
  const params = await searchParams;

  // No ?list param → the lists overview (cards). "?list=all" → the full
  // table across every list; "?list=<id>" → that list's table.
  const showTable = !!params.list;
  const activeListId = params.list === "all" ? undefined : params.list;

  const [lists, leadPage] = await Promise.all([
    listLeadLists(ctx.orgId),
    queryLeads(ctx.orgId, {
      listId: activeListId,
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
            <ExportCsvButton listId={activeListId} />
            <CsvImportButton />
            <NewSearchDialog />
          </div>
        }
      />

      {!showTable ? (
        lists.length === 0 && leadPage.total === 0 ? (
          <Card>
            <CardContent>
              <p className="py-12 text-center text-sm text-muted-foreground">
                No leads yet. Find leads with AI or import a CSV.
              </p>
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <Link href="/leads?list=all" className="group">
              <Card className="h-full transition-colors group-hover:border-primary/50 group-hover:bg-accent/50">
                <CardHeader className="pb-2">
                  <CardTitle className="flex items-center gap-2 text-sm">
                    <Users className="h-4 w-4 text-muted-foreground" />
                    All leads
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-2xl font-semibold">
                    {formatNumber(leadPage.total)}
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Every lead across all lists
                  </p>
                </CardContent>
              </Card>
            </Link>
            {lists.map((l) => (
              <Link key={l.id} href={`/leads?list=${l.id}`} className="group">
                <Card className="h-full transition-colors group-hover:border-primary/50 group-hover:bg-accent/50">
                  <CardHeader className="pb-2">
                    <CardTitle className="flex items-center gap-2 text-sm">
                      <FolderOpen className="h-4 w-4 shrink-0 text-muted-foreground" />
                      <span className="truncate">{l.name}</span>
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <p className="text-2xl font-semibold">
                      {formatNumber(l.leadCount)}
                    </p>
                    <div className="mt-1 flex items-center gap-2 text-xs text-muted-foreground">
                      <Badge variant="secondary" className="capitalize">
                        {l.source}
                      </Badge>
                      <span>{format(l.createdAt, "MMM d, yyyy")}</span>
                    </div>
                  </CardContent>
                </Card>
              </Link>
            ))}
          </div>
        )
      ) : (
        <Card>
          <CardHeader className="flex-row items-center justify-between space-y-0">
            <CardTitle className="text-sm">
              {formatNumber(leadPage.total)} leads
            </CardTitle>
            <ListSwitcher
              lists={lists.map((l) => ({
                id: l.id,
                name: l.name,
                leadCount: l.leadCount,
              }))}
              activeListId={activeListId}
            />
          </CardHeader>
          <CardContent>
            {leadPage.rows.length === 0 ? (
              <p className="py-12 text-center text-sm text-muted-foreground">
                No leads in this list yet. Find leads with AI or import a CSV.
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
                  industry: lead.industry,
                  email: lead.email,
                  verification: lead.verification,
                }))}
                lists={lists.map((l) => ({ id: l.id, name: l.name }))}
              />
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
