import { requireOrgContext } from "@/lib/tenant";
import { listLeadLists, queryLeads } from "@/modules/leads/queries";
import { PageHeader } from "@/components/dashboard/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
            activeListId={params.list}
          />
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
                industry: lead.industry,
                email: lead.email,
                verification: lead.verification,
              }))}
              lists={lists.map((l) => ({ id: l.id, name: l.name }))}
            />
          )}
        </CardContent>
      </Card>
    </div>
  );
}
