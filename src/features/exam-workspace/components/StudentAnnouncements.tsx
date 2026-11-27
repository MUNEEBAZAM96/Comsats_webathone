"use client";

import { Button } from "@/components/shadcnui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/shadcnui/dialog";
import type { StudentAnnouncement } from "@/lib/exam/syncSchemas";
import { cn } from "@/lib/utils";
import { format } from "date-fns";
import { MegaphoneIcon, XIcon } from "lucide-react";

const PRIORITY_STYLE: Record<StudentAnnouncement["priority"], string> = {
  urgent: "border-destructive/40 bg-error-surface text-destructive",
  important: "border-warning/40 bg-warning-surface text-warning",
  info: "border-border bg-secondary text-secondary-foreground",
};

const PRIORITY_LABEL: Record<StudentAnnouncement["priority"], string> = {
  urgent: "Urgent",
  important: "Important",
  info: "Announcement",
};

/** Header button + dialog listing every announcement for this exam. */
export const AnnouncementsButton = ({
  announcements,
  onOpen,
}: {
  announcements: StudentAnnouncement[];
  onOpen: () => void;
}) => {
  const unread = announcements.filter((a) => !a.read).length;
  if (announcements.length === 0) return null;
  return (
    <Dialog onOpenChange={(open) => open && onOpen()}>
      <DialogTrigger
        render={
          <Button
            variant="outline"
            size="lg"
            className="relative shrink-0"
          />
        }>
        <MegaphoneIcon aria-hidden="true" />
        <span className="hidden sm:inline">Announcements</span>
        <span className="sr-only sm:hidden">Announcements</span>
        {unread > 0 && (
          <span className="bg-destructive text-destructive-foreground ml-1 rounded-full px-1.5 text-xs font-semibold tabular-nums">
            {unread}
            <span className="sr-only"> unread</span>
          </span>
        )}
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Announcements</DialogTitle>
          <DialogDescription>
            Messages from the examination staff for this exam.
          </DialogDescription>
        </DialogHeader>
        <ul className="grid max-h-[60vh] gap-2 overflow-y-auto">
          {announcements.map((a) => (
            <li
              key={a.id}
              className={cn("rounded-md border px-3 py-2 text-sm", PRIORITY_STYLE[a.priority])}>
              <p className="flex items-center justify-between gap-2 text-xs font-medium">
                <span>{PRIORITY_LABEL[a.priority]}</span>
                <time dateTime={a.createdAt}>{format(new Date(a.createdAt), "h:mm a")}</time>
              </p>
              <p className="mt-1 whitespace-pre-wrap break-words">{a.message}</p>
            </li>
          ))}
        </ul>
        <DialogFooter showCloseButton />
      </DialogContent>
    </Dialog>
  );
};

/** Inline banner for the newest unread announcement. */
export const AnnouncementBanner = ({
  announcement,
  onDismiss,
}: {
  announcement: StudentAnnouncement;
  onDismiss: (id: string) => void;
}) => (
  <div
    role={announcement.priority === "urgent" ? "alert" : "status"}
    aria-live={announcement.priority === "urgent" ? "assertive" : "polite"}
    className={cn(
      "flex items-start gap-3 rounded-md border px-4 py-3 text-sm",
      PRIORITY_STYLE[announcement.priority],
    )}>
    <MegaphoneIcon
      aria-hidden="true"
      className="mt-0.5 size-4 shrink-0"
    />
    <div className="grid min-w-0 flex-1 gap-0.5">
      <p className="text-xs font-semibold">
        {PRIORITY_LABEL[announcement.priority]} ·{" "}
        {format(new Date(announcement.createdAt), "h:mm a")}
      </p>
      <p className="whitespace-pre-wrap break-words">{announcement.message}</p>
    </div>
    <Button
      type="button"
      variant="outline"
      size="icon-lg"
      aria-label="Dismiss announcement"
      onClick={() => onDismiss(announcement.id)}>
      <XIcon aria-hidden="true" />
    </Button>
  </div>
);
