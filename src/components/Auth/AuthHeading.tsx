const AuthHeading = ({
  title,
  description,
}: {
  title: string;
  description: string;
}) => (
  <div className="grid gap-2">
    <h1
      data-auth-title
      className="text-3xl font-bold tracking-tight sm:text-[2.5rem] sm:leading-tight"
    >
      {title}
    </h1>
    <p className="max-w-prose leading-relaxed text-muted-foreground">{description}</p>
  </div>
);

export { AuthHeading };
