import { Card, CardContent, CardHeader } from "@/components/shadcnui/card";

const StatCardsSkeleton = () => (
  <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
    {[...Array(4)].map((_, i) => (
      <Card
        key={i}
        className="gap-4 p-5"
        aria-hidden="true">
        <div className="flex items-center justify-between gap-3">
          <div className="h-4 w-24 motion-safe:animate-pulse rounded bg-muted" />
          <div className="size-10 motion-safe:animate-pulse rounded-md bg-muted" />
        </div>
        <div className="h-8 w-14 motion-safe:animate-pulse rounded bg-muted" />
      </Card>
    ))}
  </div>
);

const SummaryGridSkeleton = () => (
  <div className="grid gap-4 sm:grid-cols-2">
    {[...Array(2)].map((_, i) => (
      <Card key={i}>
        <CardHeader>
          <div className="bg-muted h-5 w-32 motion-safe:animate-pulse rounded" />
        </CardHeader>
        <CardContent>
          <div className="grid gap-3">
            {[...Array(4)].map((_, j) => (
              <div
                key={j}
                className="flex items-center justify-between">
                <div className="bg-muted h-3 w-20 motion-safe:animate-pulse rounded" />
                <div className="bg-muted h-3 w-8 motion-safe:animate-pulse rounded" />
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    ))}
  </div>
);

const ListCardSkeleton = () => (
  <div className="grid gap-4 sm:grid-cols-2">
    {[...Array(2)].map((_, i) => (
      <Card key={i}>
        <CardHeader>
          <div className="bg-muted h-5 w-28 motion-safe:animate-pulse rounded" />
        </CardHeader>
        <CardContent>
          <div className="grid gap-3">
            {[...Array(5)].map((_, j) => (
              <div
                key={j}
                className="border-border flex items-center justify-between border-b pb-2 last:border-0 last:pb-0">
                <div className="grid gap-1">
                  <div className="bg-muted h-3 w-36 motion-safe:animate-pulse rounded" />
                  <div className="bg-muted h-2 w-24 motion-safe:animate-pulse rounded" />
                </div>
                <div className="bg-muted h-5 w-16 motion-safe:animate-pulse rounded-full" />
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    ))}
  </div>
);

const DashboardShellSkeleton = () => (
  <section className="grid gap-8">
    <div className="grid gap-2">
      <div className="bg-muted h-8 w-48 motion-safe:animate-pulse rounded" />
      <div className="bg-muted h-4 w-full max-w-64 motion-safe:animate-pulse rounded" />
    </div>
    <StatCardsSkeleton />
    <SummaryGridSkeleton />
    <ListCardSkeleton />
  </section>
);

const DashboardSkeleton = () => (
  <>
    <StatCardsSkeleton />
    <SummaryGridSkeleton />
    <ListCardSkeleton />
  </>
);

const ActivityDashboardSkeleton = () => (
  <section
    aria-busy="true"
    aria-label="Loading dashboard"
    className="grid gap-6">
    <div className="h-24 rounded-lg border bg-secondary" />
    <div className="grid gap-3 rounded-lg border bg-card p-5 motion-safe:animate-pulse">
      <div className="h-5 w-28 rounded bg-muted" />
      <div className="h-4 w-48 max-w-full rounded bg-muted" />
    </div>
    <StatCardsSkeleton />
  </section>
);

export { ActivityDashboardSkeleton, DashboardShellSkeleton, DashboardSkeleton };
