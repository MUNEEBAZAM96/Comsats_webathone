"use client";

import { Loader2Icon, PlusIcon, SearchIcon, Trash2Icon, XIcon } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { assignExam, unassignExam } from "@/server/assignmentActions";
import { AttemptBadge } from "@/components/Student/AttemptBadge";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "../shadcnui/alert-dialog";
import { Button } from "../shadcnui/button";
import { Input } from "../shadcnui/input";

type Student = {
  id: string;
  name: string;
  email: string;
};

type Assignment = {
  id: string;
  userId: string;
  user: Student;
  assignedAt: Date;
  attemptStatus: string | null;
};

type AssignStudentsProps = {
  examId: string;
  initialAssignments: Assignment[];
  availableStudents: Student[];
};

const matches = (student: Student, query: string) => {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  return (
    student.name.toLowerCase().includes(q) ||
    student.email.toLowerCase().includes(q)
  );
};

const AssignStudents = ({
  examId,
  initialAssignments,
  availableStudents,
}: AssignStudentsProps) => {
  const [assignments, setAssignments] = useState(initialAssignments);
  const [available, setAvailable] = useState(availableStudents);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [removing, setRemoving] = useState<string | null>(null);
  const [pendingRemoval, setPendingRemoval] = useState<Assignment | null>(null);
  const [showAdd, setShowAdd] = useState(availableStudents.length > 0);

  const visible = available.filter((s) => matches(s, query));
  const allVisibleSelected =
    visible.length > 0 && visible.every((s) => selected.has(s.id));

  const toggleSelected = (id: string) => {
    const next = new Set(selected);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelected(next);
  };

  const toggleAllVisible = () => {
    const next = new Set(selected);
    if (allVisibleSelected) visible.forEach((s) => next.delete(s.id));
    else visible.forEach((s) => next.add(s.id));
    setSelected(next);
  };

  const handleAssign = async () => {
    if (selected.size === 0) return;
    setLoading(true);
    try {
      const { assigned, skipped } = await assignExam(
        examId,
        Array.from(selected),
      );
      const added = available.filter((s) => selected.has(s.id));
      setAssignments((prev) => [
        ...added.map((s) => ({
          id: s.id,
          userId: s.id,
          user: s,
          assignedAt: new Date(),
          attemptStatus: null,
        })),
        ...prev,
      ]);
      setAvailable((prev) => prev.filter((s) => !selected.has(s.id)));
      setSelected(new Set());
      toast.success(
        skipped > 0 ?
          `${assigned} assigned, ${skipped} skipped (already assigned or ineligible)`
        : `${assigned} student(s) assigned`,
      );
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to assign students");
    }
    setLoading(false);
  };

  const handleUnassign = async (assignment: Assignment) => {
    setRemoving(assignment.userId);
    try {
      await unassignExam(examId, assignment.userId);
      setAvailable((prev) =>
        [...prev, assignment.user].sort((a, b) => a.name.localeCompare(b.name)),
      );
      setAssignments((prev) =>
        prev.filter((a) => a.userId !== assignment.userId),
      );
      toast.success("Student removed");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to remove student");
    }
    setRemoving(null);
  };

  return (
    <div className="grid gap-6">
      {assignments.length > 0 ?
        <div className="grid gap-3">
          <h3 className="text-muted-foreground text-sm font-medium tracking-wider uppercase">
            Assigned Students ({assignments.length})
          </h3>
          {assignments.map((a) => (
            <div
              key={a.userId}
              className="border-border bg-card flex items-center justify-between gap-4 rounded-3xl border p-4">
              <div className="grid min-w-0 gap-0.5">
                <span className="truncate text-sm font-medium">
                  {a.user.name}
                </span>
                <span className="text-muted-foreground truncate text-xs">
                  {a.user.email}
                </span>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <AttemptBadge status={a.attemptStatus ?? undefined} />
                <Button
                  variant="outline"
                  size="icon-lg"
                  aria-label={`Remove ${a.user.name} from this exam`}
                  title={
                    a.attemptStatus ?
                      "Students who started the exam cannot be removed"
                    : "Remove from exam"
                  }
                  onClick={() => setPendingRemoval(a)}
                  disabled={removing === a.userId || Boolean(a.attemptStatus)}>
                  {removing === a.userId ?
                    <Loader2Icon className="size-4 animate-spin" />
                  : <Trash2Icon className="text-destructive size-4" />}
                </Button>
              </div>
            </div>
          ))}
        </div>
      : <p className="text-muted-foreground text-sm">
          No students assigned yet.
        </p>
      }

      {available.length > 0 && showAdd && (
        <div className="border-border bg-muted/30 grid gap-4 rounded-3xl border p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="text-sm font-medium">Add Students</h3>
            <span className="text-muted-foreground text-xs">
              {available.length} eligible
            </span>
          </div>
          <div className="relative">
            <SearchIcon
              aria-hidden="true"
              className="text-muted-foreground pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2"
            />
            <Input
              aria-label="Search students by name or email"
              placeholder="Search by name or email"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="pl-9"
            />
          </div>
          {visible.length > 0 ?
            <div className="grid gap-1">
              <label className="hover:bg-muted flex cursor-pointer items-center gap-3 rounded-xl px-3 py-2 text-sm font-medium">
                <input
                  type="checkbox"
                  checked={allVisibleSelected}
                  onChange={toggleAllVisible}
                  className="accent-foreground size-4"
                />
                Select all{query.trim() ? " matching" : ""} ({visible.length})
              </label>
              <div className="grid max-h-60 gap-1 overflow-y-auto">
                {visible.map((s) => (
                  <label
                    key={s.id}
                    className="hover:bg-muted flex cursor-pointer items-center gap-3 rounded-xl px-3 py-2">
                    <input
                      type="checkbox"
                      checked={selected.has(s.id)}
                      onChange={() => toggleSelected(s.id)}
                      className="accent-foreground size-4"
                    />
                    <div className="min-w-0">
                      <span className="text-sm">{s.name}</span>
                      <span className="text-muted-foreground ml-2 text-xs">
                        {s.email}
                      </span>
                    </div>
                  </label>
                ))}
              </div>
            </div>
          : <p className="text-muted-foreground text-sm">
              No students match “{query}”.
            </p>
          }
          <div className="flex flex-wrap gap-2">
            <Button
              onClick={handleAssign}
              disabled={selected.size === 0 || loading}
              size="lg">
              {loading ?
                <Loader2Icon className="size-4 animate-spin" />
              : <PlusIcon className="size-4" />}
              Assign Selected ({selected.size})
            </Button>
            <Button
              variant="outline"
              size="lg"
              onClick={() => {
                setShowAdd(false);
                setSelected(new Set());
                setQuery("");
              }}>
              <XIcon className="size-4" /> Cancel
            </Button>
          </div>
        </div>
      )}

      {available.length > 0 && !showAdd && (
        <div>
          <Button
            variant="outline"
            size="lg"
            onClick={() => setShowAdd(true)}>
            <PlusIcon className="size-4" /> Add Students
          </Button>
        </div>
      )}

      {available.length === 0 && (
        <p className="text-muted-foreground text-xs">
          {assignments.length > 0 ?
            "All eligible students are already assigned to this exam."
          : "There are no active student accounts yet. Create or import candidates from User Management."}
        </p>
      )}

      <AlertDialog
        open={Boolean(pendingRemoval)}
        onOpenChange={(open) => !open && setPendingRemoval(null)}>
        <AlertDialogContent size="sm">
          <AlertDialogHeader>
            <AlertDialogTitle>Remove student?</AlertDialogTitle>
            <AlertDialogDescription>
              {pendingRemoval?.user.name} will no longer see this exam. You can
              assign them again later.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={() => {
                if (pendingRemoval) void handleUnassign(pendingRemoval);
                setPendingRemoval(null);
              }}>
              Remove
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export { AssignStudents };
