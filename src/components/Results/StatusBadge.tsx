const statusMap: Record<string, { label: string; className: string }> = {
  in_progress: {
    label: "In progress",
    className: "bg-warning-surface text-warning",
  },
  submitted: {
    label: "Marking pending",
    className: "bg-info-surface text-info",
  },
  graded: {
    label: "Graded",
    className: "bg-success-surface text-success",
  },
};

const StatusBadge = ({ status }: { status: string }) => {
  const s = statusMap[status] ?? {
    label: status,
    className: "bg-muted text-muted-foreground",
  };
  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${s.className}`}>
      {s.label}
    </span>
  );
};

export { StatusBadge };
