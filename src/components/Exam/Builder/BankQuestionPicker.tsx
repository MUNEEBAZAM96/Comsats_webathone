"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import {
  getBankHierarchy,
  getBankQuestionById,
  importBankQuestions,
  importRandomBankQuestions,
  listBankQuestions,
} from "@/server/bankActions";
import {
  EyeIcon,
  Loader2Icon,
  SearchIcon,
  ShuffleIcon,
} from "lucide-react";
import { Badge } from "@/components/shadcnui/badge";
import { Button } from "@/components/shadcnui/button";
import { Checkbox } from "@/components/shadcnui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/shadcnui/dialog";
import { Input } from "@/components/shadcnui/input";
import { Skeleton } from "@/components/shadcnui/skeleton";
import {
  DIFFICULTY_LABEL,
  QUESTION_TYPE_LABEL,
  type BuilderQuestion,
} from "./questionLabels";
import QuestionPreviewDialog from "./QuestionPreviewDialog";

type HierarchyItem = {
  id: string;
  name: string;
  topics: { id: string; name: string }[];
};

type BankItem = {
  id: string;
  text: string;
  type: string;
  options: string | null;
  points: number;
  difficulty: string | null;
  topic: {
    id: string;
    name: string;
    subject: { id: string; name: string };
  };
};

type BankQuestionPickerProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  examId: string;
  existingTexts: string[];
  onImported: () => void;
};

const selectClass =
  "bg-card focus-visible:border-ring focus-visible:ring-ring/30 h-11 w-full rounded-md border border-input px-3 py-1 text-sm outline-none focus-visible:ring-3";

const BankQuestionPicker = ({
  open,
  onOpenChange,
  examId,
  existingTexts,
  onImported,
}: BankQuestionPickerProps) => {
  const [mode, setMode] = useState<"pick" | "random">("pick");
  const [hierarchy, setHierarchy] = useState<HierarchyItem[]>([]);
  const [items, setItems] = useState<BankItem[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize] = useState(25);
  const [fetching, setFetching] = useState(false);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [subjectId, setSubjectId] = useState("");
  const [topicId, setTopicId] = useState("");
  const [difficulty, setDifficulty] = useState("");
  const [type, setType] = useState("");
  const [minPoints, setMinPoints] = useState("");
  const [maxPoints, setMaxPoints] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [randomCount, setRandomCount] = useState("5");
  const [preview, setPreview] = useState<BuilderQuestion | null>(null);

  const existingSet = useMemo(
    () => new Set(existingTexts.map((t) => t.trim().toLowerCase())),
    [existingTexts],
  );

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search.trim()), 300);
    return () => clearTimeout(t);
  }, [search]);

  const load = useCallback(async () => {
    setFetching(true);
    try {
      const [tree, listed] = await Promise.all([
        hierarchy.length ? Promise.resolve(hierarchy) : getBankHierarchy(),
        listBankQuestions({
          search: debouncedSearch,
          subjectId: subjectId || undefined,
          topicId: topicId || undefined,
          difficulty:
            difficulty === "easy" || difficulty === "medium" || difficulty === "hard" ?
              difficulty
            : undefined,
          type:
            type ?
              (type as
                | "multiple_choice"
                | "single_choice"
                | "true_false"
                | "short_answer"
                | "long_answer")
            : undefined,
          minPoints: minPoints ? Number(minPoints) : undefined,
          maxPoints: maxPoints ? Number(maxPoints) : undefined,
          page,
          pageSize,
        }),
      ]);
      if (!hierarchy.length) setHierarchy(tree as HierarchyItem[]);
      setItems(listed.items as BankItem[]);
      setTotal(listed.total);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to load bank");
    } finally {
      setFetching(false);
    }
  }, [
    debouncedSearch,
    difficulty,
    hierarchy,
    maxPoints,
    minPoints,
    page,
    pageSize,
    subjectId,
    topicId,
    type,
  ]);

  useEffect(() => {
    if (!open) return;
    const timer = window.setTimeout(() => {
      void load();
    }, 0);
    return () => window.clearTimeout(timer);
  }, [open, load]);

  const handleOpenChange = (next: boolean) => {
    onOpenChange(next);
    if (!next) return;
    setSelected(new Set());
    setPage(1);
    setMode("pick");
    setSearch("");
    setDebouncedSearch("");
    setSubjectId("");
    setTopicId("");
    setDifficulty("");
    setType("");
    setMinPoints("");
    setMaxPoints("");
  };

  const topicsForSubject =
    subjectId ?
      (hierarchy.find((s) => s.id === subjectId)?.topics ?? [])
    : hierarchy.flatMap((s) => s.topics);

  const selectedMarks = useMemo(
    () =>
      items
        .filter((q) => selected.has(q.id))
        .reduce((sum, q) => sum + q.points, 0),
    [items, selected],
  );

  const alreadyOnExam = (q: BankItem) =>
    existingSet.has(q.text.trim().toLowerCase());

  const visibleSelectable = items.filter((q) => !alreadyOnExam(q));

  const toggle = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const selectAllVisible = () => {
    setSelected((prev) => {
      const next = new Set(prev);
      for (const q of visibleSelectable) next.add(q.id);
      return next;
    });
  };

  const handleImport = async () => {
    if (selected.size === 0) return;
    setLoading(true);
    try {
      await importBankQuestions(examId, Array.from(selected));
      toast.success(`Added ${selected.size} question${selected.size === 1 ? "" : "s"}`);
      onOpenChange(false);
      onImported();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to import");
    } finally {
      setLoading(false);
    }
  };

  const handleRandom = async () => {
    const count = Number(randomCount);
    if (!Number.isFinite(count) || count < 1) {
      toast.error("Enter a valid number of questions");
      return;
    }
    setLoading(true);
    try {
      const result = await importRandomBankQuestions(examId, {
        count,
        subjectId: subjectId || undefined,
        topicId: topicId || undefined,
        difficulty: difficulty || undefined,
        type: type || undefined,
      });
      toast.success(`Added ${result?.imported ?? count} random question(s)`);
      onOpenChange(false);
      onImported();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Random import failed");
    } finally {
      setLoading(false);
    }
  };

  const openPreview = async (id: string) => {
    try {
      const full = await getBankQuestionById(id);
      setPreview({
        id: full.id,
        text: full.text,
        type: full.type,
        options: full.options,
        answer: full.answer,
        points: full.points,
        order: 0,
        difficulty: full.difficulty,
        markingScheme: full.markingScheme,
      });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to preview");
    }
  };

  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  return (
    <>
      <Dialog
        open={open}
        onOpenChange={handleOpenChange}>
        <DialogContent className="flex max-h-[90vh] flex-col gap-4 overflow-hidden sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>Add questions from bank</DialogTitle>
            <DialogDescription>
              Search and filter the shared bank, preview items, then add them as
              exam copies.
            </DialogDescription>
          </DialogHeader>

          <div className="flex gap-2">
            <Button
              type="button"
              size="lg"
              variant={mode === "pick" ? "default" : "outline"}
              onClick={() => setMode("pick")}>
              Select questions
            </Button>
            <Button
              type="button"
              size="lg"
              variant={mode === "random" ? "default" : "outline"}
              onClick={() => setMode("random")}>
              <ShuffleIcon className="size-4" /> Random pick
            </Button>
          </div>

          <div className="grid gap-2 sm:grid-cols-3">
            <select
              value={subjectId}
              onChange={(e) => {
                setSubjectId(e.target.value);
                setTopicId("");
                setPage(1);
              }}
              className={selectClass}
              aria-label="Filter by subject">
              <option value="">All subjects</option>
              {hierarchy.map((s) => (
                <option
                  key={s.id}
                  value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
            <select
              value={topicId}
              onChange={(e) => {
                setTopicId(e.target.value);
                setPage(1);
              }}
              className={selectClass}
              aria-label="Filter by topic">
              <option value="">All topics</option>
              {topicsForSubject.map((t) => (
                <option
                  key={t.id}
                  value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
            <select
              value={difficulty}
              onChange={(e) => {
                setDifficulty(e.target.value);
                setPage(1);
              }}
              className={selectClass}
              aria-label="Filter by difficulty">
              <option value="">All difficulties</option>
              <option value="easy">Easy</option>
              <option value="medium">Medium</option>
              <option value="hard">Hard</option>
            </select>
          </div>

          <div className="grid gap-2 sm:grid-cols-3">
            <select
              value={type}
              onChange={(e) => {
                setType(e.target.value);
                setPage(1);
              }}
              className={selectClass}
              aria-label="Filter by type">
              <option value="">All types</option>
              {Object.entries(QUESTION_TYPE_LABEL).map(([value, label]) => (
                <option
                  key={value}
                  value={value}>
                  {label}
                </option>
              ))}
            </select>
            <Input
              type="number"
              min={0}
              placeholder="Min points"
              value={minPoints}
              onChange={(e) => {
                setMinPoints(e.target.value);
                setPage(1);
              }}
              aria-label="Minimum points"
            />
            <Input
              type="number"
              min={0}
              placeholder="Max points"
              value={maxPoints}
              onChange={(e) => {
                setMaxPoints(e.target.value);
                setPage(1);
              }}
              aria-label="Maximum points"
            />
          </div>

          <div className="relative">
            <SearchIcon className="text-muted-foreground absolute top-1/2 left-3 size-4 -translate-y-1/2" />
            <input
              type="search"
              placeholder="Search question text…"
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(1);
              }}
              className="bg-card focus-visible:border-ring focus-visible:ring-ring/30 h-11 w-full rounded-md border border-input pr-3 pl-9 text-sm outline-none focus-visible:ring-3"
            />
          </div>

          {mode === "random" ?
            <div className="border-border bg-muted/20 grid gap-3 rounded-3xl border p-4">
              <p className="text-sm">
                Server-side random selection uses your filters and avoids exact
                duplicates already on this exam.
              </p>
              <div className="flex flex-wrap items-end gap-3">
                <div className="grid gap-1">
                  <label
                    htmlFor="random-count"
                    className="text-sm font-medium">
                    Number of questions
                  </label>
                  <Input
                    id="random-count"
                    type="number"
                    min={1}
                    max={100}
                    value={randomCount}
                    onChange={(e) => setRandomCount(e.target.value)}
                    className="w-28"
                  />
                </div>
                <Button
                  type="button"
                  size="lg"
                  onClick={() => void handleRandom()}
                  disabled={loading}>
                  {loading ?
                    <Loader2Icon className="size-4 animate-spin" />
                  : <ShuffleIcon className="size-4" />}
                  Add random selection
                </Button>
              </div>
            </div>
          : <>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-muted-foreground text-sm">
                  {total} match{total === 1 ? "" : "es"} · {selected.size} selected
                  {selected.size > 0 ? ` · ${selectedMarks} pts` : ""}
                </p>
                <div className="flex gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="lg"
                    onClick={selectAllVisible}
                    disabled={visibleSelectable.length === 0}>
                    Select all visible
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="lg"
                    onClick={() => setSelected(new Set())}
                    disabled={selected.size === 0}>
                    Clear
                  </Button>
                </div>
              </div>

              <div className="min-h-0 flex-1 overflow-y-auto">
                {fetching ?
                  <div className="grid gap-2 py-2">
                    {Array.from({ length: 5 }, (_, i) => (
                      <Skeleton
                        key={i}
                        className="h-16 w-full rounded-2xl"
                      />
                    ))}
                  </div>
                : items.length === 0 ?
                  <p className="text-muted-foreground py-10 text-center text-sm">
                    No questions match these filters.
                  </p>
                : <div className="grid gap-2">
                    {items.map((q) => {
                      const onExam = alreadyOnExam(q);
                      return (
                        <div
                          key={q.id}
                          className={`border-border flex items-start gap-3 rounded-2xl border px-3 py-2.5 ${onExam ? "bg-muted/40 opacity-70" : "hover:bg-muted/40"}`}>
                          <Checkbox
                            checked={selected.has(q.id)}
                            disabled={onExam || loading}
                            onCheckedChange={() => toggle(q.id)}
                            className="mt-1"
                            aria-label={`Select ${q.text.slice(0, 40)}`}
                          />
                          <div className="grid min-w-0 flex-1 gap-1">
                            <p className="truncate text-sm font-medium">{q.text}</p>
                            <div className="flex flex-wrap gap-1.5">
                              <Badge variant="secondary">
                                {q.topic.subject.name} · {q.topic.name}
                              </Badge>
                              <Badge variant="outline">
                                {QUESTION_TYPE_LABEL[q.type] ?? q.type}
                              </Badge>
                              <Badge variant="outline">
                                {DIFFICULTY_LABEL[q.difficulty ?? "medium"]}
                              </Badge>
                              <Badge variant="outline">{q.points} pts</Badge>
                              {onExam ?
                                <Badge variant="destructive">Already on exam</Badge>
                              : null}
                            </div>
                          </div>
                          <Button
                            type="button"
                            variant="outline"
                            size="icon-lg"
                            aria-label="Preview question"
                            onClick={() => void openPreview(q.id)}>
                            <EyeIcon className="size-4" />
                          </Button>
                        </div>
                      );
                    })}
                  </div>
                }
              </div>

              <div className="flex items-center justify-between gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="lg"
                  disabled={page <= 1 || fetching}
                  onClick={() => setPage((p) => Math.max(1, p - 1))}>
                  Previous
                </Button>
                <span className="text-muted-foreground text-sm">
                  Page {page} of {totalPages}
                </span>
                <Button
                  type="button"
                  variant="outline"
                  size="lg"
                  disabled={page >= totalPages || fetching}
                  onClick={() => setPage((p) => p + 1)}>
                  Next
                </Button>
              </div>
            </>
          }

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              size="lg"
              onClick={() => onOpenChange(false)}
              disabled={loading}>
              Cancel
            </Button>
            {mode === "pick" ?
              <Button
                type="button"
                size="lg"
                disabled={selected.size === 0 || loading}
                onClick={() => void handleImport()}>
                {loading ?
                  <Loader2Icon className="size-4 animate-spin" />
                : null}
                Add {selected.size || ""} question{selected.size === 1 ? "" : "s"}
              </Button>
            : null}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <QuestionPreviewDialog
        question={preview}
        open={!!preview}
        onOpenChange={(next) => {
          if (!next) setPreview(null);
        }}
      />
    </>
  );
};

export default BankQuestionPicker;
