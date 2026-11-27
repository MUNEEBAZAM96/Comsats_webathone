"use client";

import { DatabaseIcon } from "lucide-react";
import { Button } from "../shadcnui/button";

export type SeedAccount = {
  role: string;
  email: string;
  home: string;
};

export const SEED_ACCOUNTS: SeedAccount[] = [
  { role: "Admin", email: "admin@example.com", home: "/admin" },
  { role: "Examiner", email: "examiner@example.com", home: "/examiner" },
  { role: "Proctor", email: "proctor@example.com", home: "/proctor" },
  { role: "Student", email: "student@example.com", home: "/student" },
];

type AuthTestBannerProps = {
  onFillAccount?: (email: string, password: string) => void;
  showSeedHelper?: boolean;
};

const AuthTestBanner = ({
  onFillAccount,
  showSeedHelper = false,
}: AuthTestBannerProps) => (
  <div className="border-border bg-muted/40 mb-4 space-y-3 rounded-xl border p-3 text-left text-sm">
    <div className="flex items-start gap-2">
      <DatabaseIcon className="text-muted-foreground mt-0.5 size-4 shrink-0" />
      <div>
        <p className="font-medium">Open Exam — test harness</p>
        <p className="text-muted-foreground text-xs">
          Connected to Postgres (Supabase). Better Auth sessions are stored in
          the remote database.
        </p>
      </div>
    </div>

    {showSeedHelper && onFillAccount ?
      <div className="space-y-2">
        <p className="text-muted-foreground text-xs">
          Seed accounts (password = email). Click to fill the form:
        </p>
        <div className="grid gap-2 sm:grid-cols-2">
          {SEED_ACCOUNTS.map((account) => (
            <Button
              key={account.email}
              type="button"
              variant="outline"
              size="lg"
              className="h-auto justify-start px-3 py-2 text-left whitespace-normal"
              onClick={() => onFillAccount(account.email, account.email)}>
              <span className="grid gap-0.5">
                <span className="font-medium">{account.role}</span>
                <span className="text-muted-foreground text-xs">
                  {account.email} → {account.home}
                </span>
              </span>
            </Button>
          ))}
        </div>
      </div>
    : null}
  </div>
);

export default AuthTestBanner;
