"use client";

import { ConfirmAction } from "@/components/Workspace/ConfirmAction";
import {
  ArrowDownIcon,
  ArrowUpIcon,
  EyeIcon,
  Loader2Icon,
  PencilIcon,
  PlusIcon,
  SearchIcon,
  Trash2Icon,
} from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { deleteQuestion, reorderExamQuestions } from "@/server/examActions";
import { Badge } from "@/components/shadcnui/badge";
import { Button } from "@/components/shadcnui/button";
import BankQuestionPicker from "./BankQuestionPicker";
import ExamQuestionEditor from "./ExamQuestionEditor";
import QuestionPreviewDialog from "./QuestionPreviewDialog";
import {
  DIFFICULTY_LABEL,
  QUESTION_TYPE_LABEL,
  type BuilderQuestion,
} from "./questionLabels";

type QuestionSetPanelProps = {
  examId: string;
  questions: BuilderQuestion[];
  readOnly?: boolean;
  onChanged: () => void;
  focusQuestionId?: string | null;
};

const QuestionSetPanel = ({
  examId,
  questions,
  readOnly = false,
  onChanged,
  focusQuestionId,
}: QuestionSetPanelProps) => {
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState("");
  const [difficultyFilter, setDifficultyFilter] = useState("");
  const [pickerOpen, setPickerOpen] = useState(false);
  const [editorOpen, setEditorOpen] = useState(false);
  const [editing, setEditing] = useState<BuilderQuestion | null>(null);
  const [preview, setPreview] = useState<BuilderQuestion | null>(null);
  const [reordering, setReordering] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const totalMarks = questions.reduce((s, q) => s + q.points, 0);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return questions.filter((item) => {
      if (typeFilter && item.type !== typeFilter) return false;
      if (difficultyFilter && (item.difficulty ?? "medium") !== difficultyFilter)
        return false;
      if (q && !item.text.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [questions, search, typeFilter, difficultyFilter]);

  const move = async (id: string, direction: -1 | 1) => {
    const index = questions.findIndex((q) => q.id === id);
    const target = index + direction;
    if (index < 0 || target < 0 || target >= questions.length) return;
    const next = [...questions];
    [next[index], next[target]] = [next[target]!, next[index]!];
    setReordering(true);
    try {
      await reorderExamQuestions(
        examId,
        next.map((q) => q.id),
      );
      toast.success("Question order updated");
      onChanged();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to reorder");
    } finally {
      setReordering(false);
    }
  };

  const handleDelete = async (id: string) => {
    setDeletingId(id);
    try {
      await deleteQuestion(id);
      toast.success("Question removed from exam");
      onChanged();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to delete");
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <div className="grid gap-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="grid gap-1">
          <h2 className="text-lg font-medium">Question set</h2>
          <p className="text-muted-foreground text-sm">
            {questions.length} question{questions.length === 1 ? "" : "s"} ·{" "}
            {totalMarks} total marks
          </p>
        </div>
        {!readOnly ?
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              size="lg"
              onClick={() => setPickerOpen(true)}>
              <PlusIcon className="size-4" /> Add questions
            </Button>
            <Button
              type="button"
              variant="outline"
              size="lg"
              onClick={() => {
                setEditing(null);
                setEditorOpen(true);
              }}>
              Create new question
            </Button>
          </div>
        : null}
      </div>

      {questions.length === 0 ?
        <div className="border-border bg-muted/20 grid place-items-center gap-4 rounded-3xl border border-dashed px-6 py-14 text-center">
          <div className="grid max-w-md gap-2">
            <h3 className="text-base font-medium">Your exam has no questions yet</h3>
            <p className="text-muted-foreground text-sm">
              Import questions from your bank or create your first question to
              start building the paper.
            </p>
          </div>
          {!readOnly ?
            <div className="flex flex-wrap justify-center gap-2">
              <Button
                type="button"
                size="lg"
                onClick={() => setPickerOpen(true)}>
                Import from bank
              </Button>
              <Button
                type="button"
                variant="outline"
                size="lg"
                onClick={() => {
                  setEditing(null);
                  setEditorOpen(true);
                }}>
                Create first question
              </Button>
            </div>
          : null}
        </div>
      : <>
          <div className="grid gap-2 sm:grid-cols-[1fr_auto_auto]">
            <div className="relative">
              <SearchIcon className="text-muted-foreground absolute top-1/2 left-3 size-4 -translate-y-1/2" />
              <input
                type="search"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search questions on this exam…"
                className="bg-card focus-visible:border-ring focus-visible:ring-ring/30 h-11 w-full rounded-md border border-input pr-3 pl-9 text-sm outline-none focus-visible:ring-3"
              />
            </div>
            <select
              value={typeFilter}
              onChange={(e) => setTypeFilter(e.target.value)}
              className="bg-card h-11 rounded-md border border-input px-3 text-sm"
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
            <select
              value={difficultyFilter}
              onChange={(e) => setDifficultyFilter(e.target.value)}
              className="bg-card h-11 rounded-md border border-input px-3 text-sm"
              aria-label="Filter by difficulty">
              <option value="">All difficulties</option>
              <option value="easy">Easy</option>
              <option value="medium">Medium</option>
              <option value="hard">Hard</option>
            </select>
          </div>

          <div className="grid gap-3">
            {filtered.map((q) => {
              const index = questions.findIndex((item) => item.id === q.id);
              const focused = focusQuestionId === q.id;
              return (
                <article
                  key={q.id}
                  id={`exam-question-${q.id}`}
                  className={`border-border bg-card grid gap-3 rounded-3xl border p-4 ${focused ? "ring-ring ring-2" : ""}`}>
                  <div className="flex items-start justify-between gap-3">
                    <div className="grid min-w-0 gap-2">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="bg-muted flex size-7 items-center justify-center rounded-full text-xs font-medium">
                          {index + 1}
                        </span>
                        <p className="text-sm font-medium wrap-anywhere">{q.text}</p>
                      </div>
                      <div className="flex flex-wrap gap-1.5">
                        <Badge variant="secondary">
                          {QUESTION_TYPE_LABEL[q.type] ?? q.type}
                        </Badge>
                        <Badge variant="outline">
                          {DIFFICULTY_LABEL[q.difficulty ?? "medium"]}
                        </Badge>
                        <Badge variant="outline">
                          {q.points} pt{q.points === 1 ? "" : "s"}
                        </Badge>
                        {q.type === "long_answer" ?
                          <Badge variant="outline">Manual grading</Badge>
                        : null}
                      </div>
                    </div>
                    <div className="flex shrink-0 flex-wrap justify-end gap-1">
                      {!readOnly ?
                        <>
                          <Button
                            type="button"
                            variant="outline"
                            size="icon-lg"
                            aria-label="Move question up"
                            disabled={reordering || index === 0}
                            onClick={() => void move(q.id, -1)}>
                            <ArrowUpIcon className="size-4" />
                          </Button>
                          <Button
                            type="button"
                            variant="outline"
                            size="icon-lg"
                            aria-label="Move question down"
                            disabled={reordering || index === questions.length - 1}
                            onClick={() => void move(q.id, 1)}>
                            <ArrowDownIcon className="size-4" />
                          </Button>
                        </>
                      : null}
                      <Button
                        type="button"
                        variant="outline"
                        size="icon-lg"
                        aria-label="Preview question"
                        onClick={() => setPreview(q)}>
                        <EyeIcon className="size-4" />
                      </Button>
                      {!readOnly ?
                        <>
                          <Button
                            type="button"
                            variant="outline"
                            size="icon-lg"
                            aria-label="Edit question"
                            onClick={() => {
                              setEditing(q);
                              setEditorOpen(true);
                            }}>
                            <PencilIcon className="size-4" />
                          </Button>
                          <ConfirmAction
                            title="Remove this question?"
                            description="This removes the exam copy only. The bank original is unchanged."
                            actionLabel="Remove"
                            onConfirm={() => void handleDelete(q.id)}
                            trigger={
                              <Button
                                type="button"
                                variant="outline"
                                size="icon-lg"
                                aria-label="Remove question"
                                disabled={deletingId === q.id}>
                                {deletingId === q.id ?
                                  <Loader2Icon className="size-4 animate-spin" />
                                : <Trash2Icon className="text-destructive size-4" />}
                              </Button>
                            }
                          />
                        </>
                      : null}
                    </div>
                  </div>
                </article>
              );
            })}
            {filtered.length === 0 ?
              <p className="text-muted-foreground py-8 text-center text-sm">
                No questions match your search or filters.
              </p>
            : null}
          </div>
        </>
      }

      <BankQuestionPicker
        open={pickerOpen}
        onOpenChange={setPickerOpen}
        examId={examId}
        existingTexts={questions.map((q) => q.text)}
        onImported={onChanged}
      />
      <ExamQuestionEditor
        open={editorOpen}
        onOpenChange={setEditorOpen}
        examId={examId}
        question={editing}
        onSaved={onChanged}
      />
      <QuestionPreviewDialog
        question={preview}
        open={!!preview}
        onOpenChange={(next) => {
          if (!next) setPreview(null);
        }}
        onEdit={
          preview && !readOnly ?
            () => {
              setEditing(preview);
              setPreview(null);
              setEditorOpen(true);
            }
          : undefined
        }
      />
    </div>
  );
};

export default QuestionSetPanel;
