type RouteLoadingProps = {
  variant?: "auth" | "page" | "workspace";
  message?: string;
};

const LoadingStatus = ({ message }: { message: string }) => (
  <div
    role="status"
    className="text-muted-foreground text-sm">
    {message}
  </div>
);

const Skeleton = ({ className }: { className: string }) => (
  <div
    aria-hidden="true"
    className={`motion-safe:animate-pulse rounded-md bg-muted ${className}`}
  />
);

const RouteLoading = ({
  variant = "page",
  message,
}: RouteLoadingProps) => {
  if (variant === "auth") {
    return (
      <section
        aria-busy="true"
        className="grid min-h-[70dvh] place-items-center p-4">
        <div className="grid w-full max-w-sm gap-6">
          <LoadingStatus message={message ?? "Loading sign-in…"} />
          <div className="bg-card grid gap-5 rounded-2xl border p-6 shadow-sm">
            <Skeleton className="mx-auto h-6 w-40 rounded-xl" />
            <Skeleton className="h-4 w-56 max-w-full rounded-lg" />
            <Skeleton className="h-11 w-full rounded-xl" />
            <Skeleton className="h-11 w-full rounded-xl" />
            <Skeleton className="h-11 w-full rounded-xl" />
          </div>
        </div>
      </section>
    );
  }

  return (
    <section
      aria-busy="true"
      className="mx-auto grid min-h-[50dvh] w-full max-w-[94rem] content-start gap-6 p-4 sm:p-6 lg:p-8">
      <LoadingStatus
        message={
          message ??
          (variant === "workspace" ? "Loading workspace…" : "Loading page…")
        }
      />
      <div className="grid gap-3">
        <Skeleton className="h-8 w-52 max-w-full" />
        <Skeleton className="h-4 w-72 max-w-full" />
      </div>
      <div className="dashboard-stats grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }, (_, index) => (
          <Skeleton
            key={index}
            className="h-28 rounded-2xl"
          />
        ))}
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        {Array.from({ length: 2 }, (_, index) => (
          <div
            key={index}
            className="bg-card grid gap-4 rounded-2xl border p-5 shadow-sm">
            <Skeleton className="h-5 w-36 rounded-lg" />
            {Array.from({ length: 3 }, (_, row) => (
              <Skeleton
                key={row}
                className="h-10 w-full rounded-xl"
              />
            ))}
          </div>
        ))}
      </div>
    </section>
  );
};

export { RouteLoading };
