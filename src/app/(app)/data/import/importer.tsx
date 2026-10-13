"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Badge, Button, Card, CardHeader, Field, Select } from "@/components/ui";
import { label, num } from "@/lib/utils";

type Field = { key: string; label: string; group: string; required?: boolean };
type Preview = {
  kind: string; headers: string[]; rowCount: number; mapping: Record<string, string>; fields: Field[]; sample: Record<string, unknown>[];
  normalizedSample?: Record<string, unknown>[];
  dryRun?: { ok: number; rejected: number; rejections: { row: number; reason: string }[]; existingParcels: number; flags: Record<string, number> };
  error?: string;
};

export function Importer() {
  const [file, setFile] = useState<File | null>(null);
  const [kind, setKind] = useState("property_owner_list");
  const [category, setCategory] = useState("");
  const [preview, setPreview] = useState<Preview | null>(null);
  const [mapping, setMapping] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [result, setResult] = useState<{ importId: string; stats: Record<string, unknown> } | null>(null);
  const router = useRouter();

  async function post(url: string, withMapping?: Record<string, string>) {
    const fd = new FormData();
    fd.append("file", file!);
    fd.append("kind", kind);
    if (category) fd.append("category", category);
    if (withMapping) fd.append("mapping", JSON.stringify(withMapping));
    const r = await fetch(url, { method: "POST", body: fd });
    const j = await r.json();
    if (!r.ok) throw new Error(j.error ?? "Failed");
    return j;
  }
  const runPreview = async (m?: Record<string, string>) => {
    setErr(null); setBusy("Reading file…");
    try { const p = await post("/api/import/preview", m); setPreview(p); setMapping(p.mapping); } catch (e) { setErr((e as Error).message); }
    setBusy(null);
  };
  const runImport = async () => {
    setErr(null); setBusy(`Importing ${num(preview?.rowCount)} rows…`);
    try { setResult(await post("/api/import/run", mapping)); router.refresh(); } catch (e) { setErr((e as Error).message); }
    setBusy(null);
  };

  if (result) {
    return (
      <Card className="p-5">
        <h2 className="mb-3 text-base font-semibold">Import complete</h2>
        <dl className="grid grid-cols-2 gap-2 text-[13px] sm:grid-cols-4">
          {Object.entries(result.stats).filter(([, v]) => typeof v === "number").map(([k, v]) => (
            <div key={k}><dt className="text-2xs uppercase text-ink-500">{label(k)}</dt><dd className="num font-semibold">{num(v as number)}</dd></div>
          ))}
        </dl>
        {Array.isArray(result.stats.duplicate_names) && result.stats.duplicate_names.length > 0 && (
          <p className="mt-3 text-[13px] text-amber-800">Same name as an existing contact, kept separate for your review: {(result.stats.duplicate_names as string[]).join(", ")}</p>
        )}
        <div className="mt-4 flex gap-2"><Button onClick={() => router.push("/data")}>View import log</Button><Button variant="secondary" onClick={() => { setResult(null); setPreview(null); setFile(null); }}>Import another</Button></div>
      </Card>
    );
  }

  const req = preview?.fields.filter((f) => f.required) ?? [];
  const missingReq = req.filter((f) => !mapping[f.key]);
  return (
    <div className="space-y-4">
      <Card className="grid gap-3 p-4 sm:grid-cols-[1fr_220px_200px_auto] sm:items-end">
        <Field label="File (.xlsx or .csv)"><input type="file" accept=".xlsx,.csv" onChange={(e) => { setFile(e.target.files?.[0] ?? null); setPreview(null); }} className="block w-full text-sm file:mr-3 file:rounded-md file:border-0 file:bg-navy-900 file:px-3 file:py-1.5 file:text-sm file:text-white" /></Field>
        <Field label="What's in it?">
          <Select value={kind} onChange={(e) => { setKind(e.target.value); setPreview(null); }}>
            <option value="property_owner_list">Properties + owners (assessor / list data)</option>
            <option value="contacts">People (contacts, buyers, CRM export)</option>
          </Select>
        </Field>
        {kind === "contacts" ? (
          <Field label="Tag everyone as">
            <Select value={category} onChange={(e) => setCategory(e.target.value)}>
              <option value="">No category</option>
              {["property_owner", "investor_buyer", "seller", "broker", "property_manager", "lender", "attorney", "escrow_officer", "title_rep", "contractor", "other_professional"].map((c) => <option key={c} value={c}>{label(c)}</option>)}
            </Select>
          </Field>
        ) : <div />}
        <Button disabled={!file || !!busy} onClick={() => runPreview()}>Preview</Button>
      </Card>
      {busy && <p className="text-[13px] text-ink-500">{busy}</p>}
      {err && <p className="rounded-md bg-red-50 px-3 py-2 text-[13px] text-red-700">{err}</p>}

      {preview && (
        <>
          <Card>
            <CardHeader title={`Column mapping · ${num(preview.rowCount)} rows`} sub="Suggested from your headers and sample values. Columns left as “—” are ignored." />
            <div className="grid gap-x-4 gap-y-2 p-4 sm:grid-cols-3 lg:grid-cols-4">
              {preview.fields.map((f) => (
                <Field key={f.key} label={`${f.label}${f.required ? " *" : ""}`}>
                  <Select value={mapping[f.key] ?? ""} onChange={(e) => setMapping({ ...mapping, [f.key]: e.target.value || undefined } as Record<string, string>)}>
                    <option value="">—</option>
                    {preview.headers.map((h) => <option key={h} value={h}>{h}</option>)}
                  </Select>
                </Field>
              ))}
            </div>
            <div className="flex gap-2 border-t border-ink-100 px-4 py-3">
              <Button variant="secondary" onClick={() => runPreview(mapping)} disabled={!!busy}>Re-run dry run with this mapping</Button>
            </div>
          </Card>

          {preview.dryRun && (
            <Card>
              <CardHeader title="Dry run" sub="Nothing has been written yet" />
              <div className="grid gap-4 p-4 md:grid-cols-3">
                <div className="space-y-1 text-[13px]">
                  <div><b className="num">{num(preview.dryRun.ok)}</b> rows ready</div>
                  <div><b className="num">{num(preview.dryRun.existingParcels)}</b> APNs already in the CRM (blanks get filled, existing values and owners are never overwritten; owner changes go to review)</div>
                  <div className={preview.dryRun.rejected ? "text-amber-800" : ""}><b className="num">{num(preview.dryRun.rejected)}</b> rows will be skipped</div>
                </div>
                <div className="text-[13px]">
                  <div className="field-label">Flags (imported, marked for review)</div>
                  {Object.entries(preview.dryRun.flags).map(([k, v]) => <div key={k}><Badge tone="amber">{label(k)}</Badge> <span className="num">{num(v)}</span></div>)}
                  {!Object.keys(preview.dryRun.flags).length && <span className="text-ink-500">None</span>}
                </div>
                <div className="text-[13px]">
                  <div className="field-label">Skipped rows</div>
                  {preview.dryRun.rejections.map((r) => <div key={r.row} className="text-2xs">Row {r.row}: {r.reason}</div>)}
                </div>
              </div>
            </Card>
          )}

          <Card className="overflow-x-auto">
            <CardHeader title={preview.normalizedSample ? "Preview (after cleanup)" : "Preview (raw)"} />
            <table className="table-compact w-full">
              <thead><tr>{Object.keys((preview.normalizedSample ?? preview.sample)[0] ?? {}).filter((k) => !["address_normalized"].includes(k)).map((k) => <th key={k}>{label(k)}</th>)}</tr></thead>
              <tbody>
                {(preview.normalizedSample ?? preview.sample).map((r, i) => (
                  <tr key={i}>{Object.entries(r).filter(([k]) => k !== "address_normalized").map(([k, v]) => <td key={k} className="whitespace-nowrap text-2xs">{Array.isArray(v) ? v.join(", ") : v === null || v === undefined ? "—" : String(v)}</td>)}</tr>
                ))}
              </tbody>
            </table>
          </Card>

          <div className="flex items-center gap-3">
            <Button onClick={runImport} disabled={!!busy || missingReq.length > 0}>Import {num(preview.dryRun?.ok ?? preview.rowCount)} rows</Button>
            {missingReq.length > 0 && <span className="text-[13px] text-red-700">Map required fields: {missingReq.map((f) => f.label).join(", ")}</span>}
          </div>
        </>
      )}
    </div>
  );
}
