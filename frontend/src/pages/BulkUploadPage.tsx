import { useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import clsx from "clsx";
import { usePageHeader } from "../hooks/usePageHeader";
import { Dropzone } from "../components/common/Dropzone";
import { Badge } from "../components/common/Badge";
import { Spinner } from "../components/common/Spinner";
import { EmptyState } from "../components/common/EmptyState";
import {
  IconArrowLeft,
  IconCheck,
  IconDownload,
  IconFileSpreadsheet,
} from "../components/common/icons";
import {
  downloadUserImportTemplate,
  useUserImportCommit,
  useUserImportDryRun,
} from "../hooks/useUsers";
import {
  downloadProjectImportTemplate,
  useProjectImportCommit,
  useProjectImportDryRun,
} from "../hooks/useProjects";
import type { ImportBatch, ImportPreviewRow } from "../types";

type ImportType = "users" | "projects";
type Step = 1 | 2 | 3;

const STEP_LABELS: Record<Step, string> = { 1: "Upload", 2: "Map Columns", 3: "Review & Confirm" };

const USER_FIELDS = ["Employee ID", "Full Name", "Email", "Role", "Department", "Job Title", "Manager Email"];
const PROJECT_FIELDS = ["Client", "Project Code", "Project Name", "Start Date", "End Date", "Billing Type", "Budget Hours", "Project Admin Email"];

export default function BulkUploadPage() {
  usePageHeader("Bulk Upload (Excel)");
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();
  const type = (searchParams.get("type") === "projects" ? "projects" : "users") as ImportType;

  const [step, setStep] = useState<Step>(1);
  const [file, setFile] = useState<File | null>(null);
  const [batch, setBatch] = useState<ImportBatch | null>(null);
  const [includedRows, setIncludedRows] = useState<Set<number>>(new Set());
  const [committed, setCommitted] = useState<{ count: number } | null>(null);

  const userDryRun = useUserImportDryRun();
  const projectDryRun = useProjectImportDryRun();
  const userCommit = useUserImportCommit();
  const projectCommit = useProjectImportCommit();

  const dryRun = type === "users" ? userDryRun : projectDryRun;
  const commit = type === "users" ? userCommit : projectCommit;
  const fieldLabels = type === "users" ? USER_FIELDS : PROJECT_FIELDS;

  function setType(next: ImportType) {
    setSearchParams({ type: next });
    setStep(1);
    setFile(null);
    setBatch(null);
    setCommitted(null);
  }

  function handleNextFromUpload() {
    if (!file) return;
    dryRun.mutate(file, {
      onSuccess: (data) => {
        setBatch(data);
        setIncludedRows(new Set(data.rows.filter((r) => r.status !== "ERROR").map((r) => r.rowNumber)));
        setStep(2);
      },
    });
  }

  function handleCommit() {
    if (!batch) return;
    const rows = batch.rows.filter((r) => includedRows.has(r.rowNumber)).map((r) => r.data);
    commit.mutate(
      { batchId: batch.batchId, rows },
      {
        onSuccess: () => setCommitted({ count: rows.length }),
      }
    );
  }

  const detectedColumns = useMemo(() => {
    if (!batch?.rows.length) return [];
    return Object.keys(batch.rows[0].data);
  }, [batch]);

  function reset() {
    setStep(1);
    setFile(null);
    setBatch(null);
    setCommitted(null);
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <button onClick={() => navigate(-1)} className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-brand-primary">
          <IconArrowLeft size={14} />
          Back
        </button>
        <div className="flex gap-1 rounded-xl bg-gray-100 p-1">
          {(["users", "projects"] as ImportType[]).map((t) => (
            <button
              key={t}
              onClick={() => setType(t)}
              className={clsx(
                "rounded-lg px-3.5 py-1.5 text-sm font-medium capitalize transition-colors",
                type === t ? "bg-white text-gray-900 shadow-soft" : "text-gray-500 hover:text-gray-700"
              )}
            >
              {t}
            </button>
          ))}
        </div>
      </div>

      <StepIndicator step={step} />

      <div className="rounded-2xl bg-white p-6 shadow-soft ring-1 ring-gray-100">
        {step === 1 && (
          <div className="space-y-5">
            <div className="flex flex-col items-start justify-between gap-3 sm:flex-row sm:items-center">
              <div>
                <h2 className="text-sm font-semibold text-gray-900">1. Upload your {type} file</h2>
                <p className="text-sm text-gray-500">Use our template for the best results, or upload your own .xlsx/.csv.</p>
              </div>
              <button
                onClick={() => (type === "users" ? downloadUserImportTemplate() : downloadProjectImportTemplate())}
                className="btn-secondary shrink-0"
              >
                <IconDownload size={15} />
                {type === "users" ? "Users Template" : "Projects Template"}
              </button>
            </div>

            <Dropzone file={file} onFile={setFile} />

            {dryRun.isError && (
              <p className="text-sm text-status-danger">Couldn't validate this file. Please check the format and try again.</p>
            )}

            <div className="flex justify-end">
              <button onClick={handleNextFromUpload} disabled={!file || dryRun.isPending} className="btn-primary">
                {dryRun.isPending && <Spinner size={14} className="text-white" />}
                Next: Map Columns
              </button>
            </div>
          </div>
        )}

        {step === 2 && batch && (
          <div className="space-y-5">
            <div>
              <h2 className="text-sm font-semibold text-gray-900">2. Confirm column mapping</h2>
              <p className="text-sm text-gray-500">
                We detected the following columns in <span className="font-medium text-gray-700">{file?.name}</span> and matched
                them to TimeSync fields.
              </p>
            </div>

            <div className="overflow-x-auto rounded-xl border border-gray-100">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-100 bg-gray-50 text-left text-xs font-semibold uppercase tracking-wide text-gray-400">
                    <th className="px-4 py-2.5">Detected column</th>
                    <th className="px-4 py-2.5">Maps to</th>
                  </tr>
                </thead>
                <tbody>
                  {detectedColumns.map((col, idx) => (
                    <tr key={col} className="border-b border-gray-50 last:border-0">
                      <td className="px-4 py-2.5 font-medium text-gray-800">{col}</td>
                      <td className="px-4 py-2.5">
                        <select defaultValue={fieldLabels[idx] ?? fieldLabels[0]} className="input py-1.5 text-sm">
                          {fieldLabels.map((f) => (
                            <option key={f} value={f}>
                              {f}
                            </option>
                          ))}
                          <option value="__ignore">Don't import this column</option>
                        </select>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <p className="text-xs text-gray-400">
              Mapping is auto-detected from your template headers. Validation results (next step) reflect the file exactly as
              uploaded.
            </p>

            <div className="flex justify-between">
              <button onClick={() => setStep(1)} className="btn-secondary">
                Back
              </button>
              <button onClick={() => setStep(3)} className="btn-primary">
                Next: Review &amp; Confirm
              </button>
            </div>
          </div>
        )}

        {step === 3 && batch && !committed && (
          <div className="space-y-5">
            <div>
              <h2 className="text-sm font-semibold text-gray-900">3. Review &amp; confirm</h2>
              <p className="text-sm text-gray-500">Uncheck any rows you don't want to import, then commit the batch.</p>
            </div>

            <div className="flex flex-wrap gap-3">
              <Badge tone="neutral">{batch.totalRows} total</Badge>
              <Badge tone="success">{batch.validRows} valid</Badge>
              <Badge tone="warning">{batch.warningRows} warnings</Badge>
              <Badge tone="danger">{batch.errorRows} errors</Badge>
            </div>

            <div className="max-h-[420px] overflow-auto rounded-xl border border-gray-100">
              <table className="w-full text-sm">
                <thead className="sticky top-0 bg-gray-50">
                  <tr className="border-b border-gray-100 text-left text-xs font-semibold uppercase tracking-wide text-gray-400">
                    <th className="px-3 py-2.5">
                      <input
                        type="checkbox"
                        checked={includedRows.size === batch.rows.filter((r) => r.status !== "ERROR").length}
                        onChange={(e) =>
                          setIncludedRows(
                            e.target.checked ? new Set(batch.rows.filter((r) => r.status !== "ERROR").map((r) => r.rowNumber)) : new Set()
                          )
                        }
                        className="h-4 w-4 rounded border-gray-300"
                      />
                    </th>
                    <th className="px-3 py-2.5">#</th>
                    <th className="px-3 py-2.5">Status</th>
                    {detectedColumns.slice(0, 4).map((c) => (
                      <th key={c} className="px-3 py-2.5">
                        {c}
                      </th>
                    ))}
                    <th className="px-3 py-2.5">Messages</th>
                  </tr>
                </thead>
                <tbody>
                  {batch.rows.map((row) => (
                    <ReviewRow
                      key={row.rowNumber}
                      row={row}
                      columns={detectedColumns.slice(0, 4)}
                      checked={includedRows.has(row.rowNumber)}
                      onToggle={() =>
                        setIncludedRows((prev) => {
                          const next = new Set(prev);
                          if (next.has(row.rowNumber)) next.delete(row.rowNumber);
                          else next.add(row.rowNumber);
                          return next;
                        })
                      }
                    />
                  ))}
                </tbody>
              </table>
            </div>

            {commit.isError && <p className="text-sm text-status-danger">Commit failed. Please try again.</p>}

            <div className="flex justify-between">
              <button onClick={() => setStep(2)} className="btn-secondary">
                Back
              </button>
              <button onClick={handleCommit} disabled={includedRows.size === 0 || commit.isPending} className="btn-primary">
                {commit.isPending && <Spinner size={14} className="text-white" />}
                Commit {includedRows.size} row{includedRows.size === 1 ? "" : "s"}
              </button>
            </div>
          </div>
        )}

        {committed && (
          <div className="py-6">
            <EmptyState
              icon={<IconCheck size={40} />}
              title={`${committed.count} ${type} imported successfully`}
              description="You can review them in the management table, or start another import."
              action={
                <div className="flex gap-2">
                  <button onClick={reset} className="btn-secondary">
                    Start another import
                  </button>
                  <button onClick={() => navigate(type === "users" ? "/users" : "/projects")} className="btn-primary">
                    <IconFileSpreadsheet size={15} />
                    Go to {type === "users" ? "Users" : "Projects"}
                  </button>
                </div>
              }
            />
          </div>
        )}
      </div>
    </div>
  );
}

function StepIndicator({ step }: { step: Step }) {
  return (
    <div className="flex items-center gap-2">
      {([1, 2, 3] as Step[]).map((s, idx) => (
        <div key={s} className="flex flex-1 items-center gap-2">
          <div
            className={clsx(
              "flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-sm font-semibold",
              s < step ? "bg-status-success text-white" : s === step ? "bg-brand-primary text-white" : "bg-gray-100 text-gray-400"
            )}
          >
            {s < step ? <IconCheck size={14} /> : s}
          </div>
          <span className={clsx("hidden text-sm font-medium sm:block", s === step ? "text-gray-900" : "text-gray-400")}>
            {STEP_LABELS[s]}
          </span>
          {idx < 2 && <div className={clsx("h-0.5 flex-1", s < step ? "bg-status-success" : "bg-gray-100")} />}
        </div>
      ))}
    </div>
  );
}

function ReviewRow({
  row,
  columns,
  checked,
  onToggle,
}: {
  row: ImportPreviewRow;
  columns: string[];
  checked: boolean;
  onToggle: () => void;
}) {
  const rowBg = row.status === "ERROR" ? "bg-rose-50/60" : row.status === "WARNING" ? "bg-amber-50/50" : "";
  return (
    <tr className={clsx("border-b border-gray-50 last:border-0", rowBg)}>
      <td className="px-3 py-2">
        <input
          type="checkbox"
          checked={checked}
          disabled={row.status === "ERROR"}
          onChange={onToggle}
          className="h-4 w-4 rounded border-gray-300 disabled:opacity-40"
        />
      </td>
      <td className="px-3 py-2 text-gray-500">{row.rowNumber}</td>
      <td className="px-3 py-2">
        <Badge tone={row.status === "VALID" ? "success" : row.status === "WARNING" ? "warning" : "danger"}>
          {row.status === "VALID" ? "Valid" : row.status === "WARNING" ? "Warning" : "Error"}
        </Badge>
      </td>
      {columns.map((c) => (
        <td key={c} className="px-3 py-2 text-gray-700">
          {String(row.data[c] ?? "")}
        </td>
      ))}
      <td className="px-3 py-2 text-xs text-gray-500">{row.messages.join("; ") || "—"}</td>
    </tr>
  );
}
