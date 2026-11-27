"use client";

import { ChevronDownIcon, FlaskConicalIcon } from "lucide-react";
import { Button } from "../shadcnui/button";

export const SEED_ACCOUNTS = [
  { role: "Administrator", email: "admin@example.com" },
  { role: "Examiner", email: "examiner@example.com" },
  { role: "Proctor", email: "proctor@example.com" },
  { role: "Candidate", email: "student@example.com" },
];

const AuthTestBanner = ({
  onFillAccount,
}: {
  onFillAccount: (email: string, password: string) => void;
}) => (
  <details className="auth-demo" suppressHydrationWarning>
    <summary>
      <FlaskConicalIcon aria-hidden="true" className="size-4 text-primary" />
      Demo accounts
      <ChevronDownIcon aria-hidden="true" className="ml-auto size-4 text-muted-foreground" />
    </summary>
    <div className="grid grid-cols-2 gap-2 p-3 pt-0">
      {SEED_ACCOUNTS.map(({ role, email }) => (
        <Button
          key={email}
          type="button"
          variant="outline"
          className="h-auto min-h-10 justify-start px-2 py-2 text-left whitespace-normal sm:px-3"
          onClick={() => onFillAccount(email, email)}>
          {role}
        </Button>
      ))}
    </div>
  </details>
);

export default AuthTestBanner;
