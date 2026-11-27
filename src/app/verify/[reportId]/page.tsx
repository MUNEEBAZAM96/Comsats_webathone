import type { Metadata } from "next";
import { Suspense } from "react";
import { CircleAlertIcon, InfoIcon, ShieldCheckIcon } from "lucide-react";
import { BrandMark } from "@/components/BrandMark";
import ThemeToggleButton from "@/components/ThemeToggleButton";
import { RouteLoading } from "@/components/Loading/RouteLoading";
import { PdfIntegrityCheck } from "@/features/verification/components/PdfIntegrityCheck";
import { formatDisplayDateTime } from "@/lib/date/format";
import { verifyPublishedReport } from "@/server/verifyReport";

export const metadata: Metadata = {
  title: "Verify Report",
  description: "Verify a published examination report",
};

/** Dynamic verification — must not prerender against uncached DB access. */
export const instant = false;

const publicMetaLabels = {
  type: "Report type",
  examTitle: "Exam",
  totalScore: "Total score",
  maxScore: "Maximum score",
  percentage: "Percentage",
  attemptCount: "Attempt count",
  averageScore: "Average score",
  submittedAt: "Submitted",
  publishedAt: "Published",
} as const;

const publicMetaKeys = Object.keys(
  publicMetaLabels,
) as (keyof typeof publicMetaLabels)[];

const VerifyReportContent = async ({
  params,
}: {
  params: Promise<{ reportId: string }>;
}) => {
  const { reportId } = await params;
  const result = await verifyPublishedReport(reportId).catch(() => ({
    status: "unavailable" as const,
    message: "Verification is temporarily unavailable. Try again later.",
  }));

  const tone =
    result.status === "valid"
      ? "bg-success-surface text-success"
      : result.status === "invalid"
        ? "bg-error-surface text-destructive"
        : "bg-info-surface text-info";
  const StatusIcon =
    result.status === "valid"
      ? ShieldCheckIcon
      : result.status === "invalid"
        ? CircleAlertIcon
        : InfoIcon;

  const metaEntries =
    "publicMeta" in result && result.publicMeta
      ? publicMetaKeys.flatMap((key) => {
          const value = result.publicMeta?.[key];
          if (value === undefined || value === null) return [];
          return [[key, value] as const];
        })
      : [];

  return (
    <section className="status-panel grid w-full gap-6 rounded-2xl border bg-card p-5 sm:p-8">
      <div className="grid gap-3">
        <span className={`status-icon ${tone}`}>
          <StatusIcon aria-hidden="true" className="size-6" />
        </span>
        <p className="font-medium text-sm text-muted-foreground">
          Report verification
        </p>
        <h1>
          {result.status === "valid"
            ? "Report verified"
            : result.status === "invalid"
              ? "Report could not be verified"
              : "Report unavailable"}
        </h1>
        <p className="text-muted-foreground text-sm">{result.message}</p>
        <p className="break-all text-sm">Report identifier {reportId}</p>
      </div>

      {metaEntries.length > 0 ? (
        <dl className="grid divide-y rounded-xl border bg-muted/40 px-4 text-sm">
          {metaEntries.map(([key, value]) => (
            <div
              key={key}
              className="grid grid-cols-[minmax(0,1fr)_minmax(0,1.25fr)] gap-3 py-3"
            >
              <dt className="text-muted-foreground">{publicMetaLabels[key]}</dt>
              <dd className="font-medium break-all">
                {typeof value === "string" || typeof value === "number"
                  ? key === "publishedAt" || key === "submittedAt"
                    ? formatDisplayDateTime(String(value))
                    : String(value)
                  : JSON.stringify(value)}
              </dd>
            </div>
          ))}
        </dl>
      ) : null}

      {result.status === "valid" &&
        (result.pdfHash ? (
          <PdfIntegrityCheck expectedHash={result.pdfHash} />
        ) : (
          <p className="text-muted-foreground text-sm">
            This report predates PDF file integrity checks.
          </p>
        ))}
      <p className="text-muted-foreground text-xs">
        Candidate personal details and answers are never shown on this page.
      </p>
    </section>
  );
};

const VerifyReportPage = ({
  params,
}: {
  params: Promise<{ reportId: string }>;
}) => (
  <main className="exam-workspace flex min-h-dvh flex-col">
    <header className="workspace-topbar flex items-center justify-between gap-3 border-b px-4 py-3 sm:px-8">
      <BrandMark className="text-lg" />
      <ThemeToggleButton />
    </header>
    <div className="mx-auto grid w-full max-w-xl flex-1 content-center px-4 py-8">
      <Suspense fallback={<RouteLoading message="Verifying report…" />}>
        <VerifyReportContent params={params} />
      </Suspense>
    </div>
  </main>
);

export default VerifyReportPage;
