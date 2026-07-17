import { PageHeader } from "@/components/dashboard/page-header";
import { DesignerForm } from "./designer-form";

export default function DesignerPage() {
  return (
    <div>
      <PageHeader
        title="AI Campaign Designer"
        description="Describe your ICP and offer. Get a full multi-step sequence with subject lines, spintax variants, delays, and branch logic."
      />
      <DesignerForm />
    </div>
  );
}
