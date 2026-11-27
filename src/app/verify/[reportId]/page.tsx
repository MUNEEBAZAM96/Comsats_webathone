import type { Metadata } from "next";
import { Suspense } from "react";
import { formatDisplayDateTime } from "@/lib/date/format";
import { verifyPublishedReport } from "@/server/verifyReport";

export const metadata: Metadata = {
  title: "Verify Report",
  description: "Verify a published examination report",
};

/** Dynamic verification — must not prerender against uncached DB access. */
export const instant = false;

const PUBLIC_META_KEYS = [
  "type",
  "examTitle",
  "totalScore",
  "maxScore",
  "percentage",
  "attemptCount",
  "averageScore",
  "submittedAt",
  "publishedAt",
] as const;

const VerifyReportContent = async ({
  params,
}: {
  params: Promise<{ reportId: string }>;
}) => {
  const { reportId } = await params;
  const result = await verifyPublishedReport(reportId);

  const tone =
    result.status === "valid" ? "text-emerald-600"
    : result.status === "invalid" ? "text-destructive"
    : "text-muted-foreground";

  const metaEntries =
    "publicMeta" in result && result.publicMeta ?
      PUBLIC_META_KEYS.flatMap((key) => {
        const value = result.publicMeta?.[key];
        if (value === undefined || value === null) return [];
        return [[key, value] as const];
      })
    : [];

  return (
    <main className="mx-auto grid min-h-dvh w-full max-w-lg content-center gap-6 px-4 py-12">
      <div className="grid gap-2">
        <p className="text-muted-foreground text-sm tracking-wide uppercase">
          Report verification
        </p>
        <h1 className={`text-3xl font-medium ${tone}`}>
          {result.status === "valid" ?
            "Valid"
          : result.status === "invalid" ?
            "Invalid"
          : "Unavailable"}
        </h1>
        <p className="text-muted-foreground text-sm">{result.message}</p>
      </div>

      {metaEntries.length > 0 ?
        <dl className="border-border grid gap-3 rounded-lg border p-4 text-sm">
          {metaEntries.map(([key, value]) => (
            <div
              key={key}
              className="grid grid-cols-2 gap-2">
              <dt className="text-muted-foreground capitalize">{key}</dt>
              <dd className="font-medium break-all">
                {typeof value === "string" || typeof value === "number" ?
                  String(value)
                : JSON.stringify(value)}
              </dd>
            </div>
          ))}
          {"publishedAt" in result && result.publishedAt ?
            <div className="grid grid-cols-2 gap-2">
              <dt className="text-muted-foreground">Verified against</dt>
              <dd className="font-medium">
                {formatDisplayDateTime(result.publishedAt)}
              </dd>
            </div>
          : null}
        </dl>
      : null}

      <p className="text-muted-foreground text-xs">
        Candidate personal details and answers are never shown on this page.
      </p>
    </main>
  );
};

const VerifyReportPage = ({
  params,
}: {
  params: Promise<{ reportId: string }>;
}) => (
  <Suspense
    fallback={
      <main className="mx-auto grid min-h-dvh w-full max-w-lg content-center gap-2 px-4 py-12">
        <p className="text-muted-foreground text-sm">Verifying report…</p>
      </main>
    }>
    <VerifyReportContent params={params} />
  </Suspense>
);

export default VerifyReportPage;
