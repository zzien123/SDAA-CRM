import { PageHeader } from "@/components/ui";
import { Importer } from "./importer";
export default function ImportPage() {
  return (
    <>
      <PageHeader title="Import data" sub="Excel or CSV. Map columns, preview a dry run, then import. Every import is logged and can be rolled back." />
      <Importer />
    </>
  );
}
