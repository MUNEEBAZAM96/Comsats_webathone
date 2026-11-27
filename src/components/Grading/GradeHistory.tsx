"use client";

import { Button } from "@/components/shadcnui/button";
import { formatScore } from "@/lib/exam/grading";
import { getGradeHistory, regradeExam, type GradeHistoryEntry } from "@/server/gradingActions";
import { format } from "date-fns";
import { HistoryIcon, Loader2Icon, RefreshCcwIcon } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";

const ACTION_LABEL: Record<string, string> = {
  grade: "Marked",
  override: "Override",
  regrade: "Re-graded",
  publish: "Published results",
  unpublish: "Withdrew results",
};

export const GradeHistory = ({
  examId,
  canRegrade,
}: {
  examId: string;
  canRegrade: boolean;
}) => {
  const router = useRouter();
  const [entries, setEntries] = useState<GradeHistoryEntry[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [regrading, setRegrading] = useState(false);

  const load = async () => {
    setLoading(true);
    const res = await getGradeHistory(examId).catch(() => null);
    setLoading(false);
    if (!res?.ok) return toast.error(res?.error ?? "Could not load the history");
    setEntries(res.data);
  };

  const regrade = async () => {
    setRegrading(true);
    const res = await regradeExam(examId).catch(() => null);
    setRegrading(false);
    if (!res?.ok) return toast.error(res?.error ?? "Could not re-grade");
    toast.success(
      `Re-graded ${res.data.attempts} attempt${res.data.attempts === 1 ? "" : "s"}: ${res.data.changedAnswers} score${res.data.changedAnswers === 1 ? "" : "s"} changed`,
    );
    router.refresh();
    if (entries) void load();
  };

  return (
    <section
      aria-labelledby="grade-history"
      className="grid gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2
          id="grade-history"
          className="text-lg font-medium">
          Grading history
        </h2>
        <div className="flex flex-wrap gap-2">
          {canRegrade && (
            <Button
              variant="outline"
              size="lg"
              disabled={regrading}
              onClick={regrade}
              title="Re-apply automatic marking to every submitted attempt. Manual marks are kept.">
              {regrading ?
                <Loader2Icon
                  aria-hidden="true"
                  className="animate-spin"
                />
              : <RefreshCcwIcon aria-hidden="true" />}
              Re-run automatic marking
            </Button>
          )}
          <Button
            variant="outline"
            size="lg"
            disabled={loading}
            onClick={load}>
            {loading ?
              <Loader2Icon
                aria-hidden="true"
                className="animate-spin"
              />
            : <HistoryIcon aria-hidden="true" />}
            {entries ? "Refresh history" : "Show history"}
          </Button>
        </div>
      </div>
      {entries && entries.length === 0 && (
        <p className="text-muted-foreground text-sm">No grading changes yet.</p>
      )}
      {entries && entries.length > 0 && (
        <div className="overflow-x-auto rounded-lg border">
          <table className="w-full min-w-[40rem] text-sm">
            <thead className="bg-muted/50 text-muted-foreground text-left text-xs">
              <tr>
                <th scope="col" className="px-3 py-2 font-medium">When</th>
                <th scope="col" className="px-3 py-2 font-medium">Action</th>
                <th scope="col" className="px-3 py-2 font-medium">Candidate / question</th>
                <th scope="col" className="px-3 py-2 font-medium">Score</th>
                <th scope="col" className="px-3 py-2 font-medium">By</th>
                <th scope="col" className="px-3 py-2 font-medium">Reason</th>
              </tr>
            </thead>
            <tbody>
              {entries.map((e) => (
                <tr
                  key={e.id}
                  className="border-t align-top">
                  <td className="px-3 py-2 whitespace-nowrap">
                    {format(new Date(e.createdAt), "MMM d, HH:mm")}
                  </td>
                  <td className="px-3 py-2">{ACTION_LABEL[e.action] ?? e.action}</td>
                  <td className="px-3 py-2">
                    {e.candidate ?
                      <>
                        <span className="font-medium">{e.candidate}</span>
                        {e.question && (
                          <span className="text-muted-foreground block max-w-xs truncate text-xs">
                            {e.question}
                          </span>
                        )}
                      </>
                    : "—"}
                  </td>
                  <td className="px-3 py-2 tabular-nums">
                    {e.candidate ?
                      `${formatScore(e.previousScore)} → ${formatScore(e.newScore)}${e.points != null ? ` / ${e.points}` : ""}`
                    : "—"}
                  </td>
                  <td className="px-3 py-2">{e.by}</td>
                  <td className="text-muted-foreground px-3 py-2">{e.reason ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
};
