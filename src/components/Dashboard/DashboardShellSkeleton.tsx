import { Card, CardContent, CardHeader } from "@/components/shadcnui/card";
import { Skeleton } from "@/components/shadcnui/skeleton";

const PanelSkeleton = () => (
  <Card className="gap-4">
    <CardHeader>
      <Skeleton className="h-5 w-32 max-w-full" />
    </CardHeader>
    <CardContent className="grid gap-3">
      {[0, 1, 2].map((row) => (
        <div
          key={row}
          className="flex items-center justify-between gap-3 border-b border-border pb-3 last:border-0 last:pb-0"
        >
          <Skeleton className="h-4 w-36 max-w-2/3" />
          <Skeleton className="h-5 w-12" />
        </div>
      ))}
    </CardContent>
  </Card>
);

const DashboardSkeleton = () => (
  <div
    aria-label="Loading dashboard data"
    aria-busy="true"
    className="grid gap-5"
  >
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      {[0, 1, 2, 3].map((card) => (
        <Card key={card} className="gap-2.5 p-3.5 sm:p-4">
          <div className="flex items-center justify-between gap-2">
            <Skeleton className="h-4 w-24 max-w-2/3" />
            <Skeleton className="size-8 shrink-0 sm:size-9" />
          </div>
          <Skeleton className="h-8 w-12 sm:h-9" />
        </Card>
      ))}
    </div>
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
      <PanelSkeleton />
      <PanelSkeleton />
    </div>
    <PanelSkeleton />
  </div>
);

const DashboardShellSkeleton = () => (
  <div className="grid gap-5">
    <div className="dashboard-intro grid gap-2 rounded-xl border px-5 py-5 sm:px-6">
      <Skeleton className="h-8 w-48 max-w-full" />
      <Skeleton className="h-4 w-64 max-w-full" />
    </div>
    <DashboardSkeleton />
  </div>
);

export { DashboardShellSkeleton, DashboardSkeleton };
