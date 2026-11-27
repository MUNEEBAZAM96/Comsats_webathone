"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  ClipboardCheckIcon,
  FileCheck2Icon,
  ShieldCheckIcon,
} from "lucide-react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { AuthArtwork } from "@/components/Auth/AuthArtwork";
import { BrandMark } from "@/components/BrandMark";
import ThemeToggleButton from "@/components/ThemeToggleButton";
import type { ReactNode } from "react";

const features = [
  { icon: ClipboardCheckIcon, label: "Prepare exams" },
  { icon: ShieldCheckIcon, label: "Monitor sessions" },
  { icon: FileCheck2Icon, label: "Verify results" },
];

const AuthShell = ({ children }: { children: ReactNode }) => {
  const pathname = usePathname();
  const reduceMotion = useReducedMotion();

  return (
    <div className="auth-layout">
      <aside className="auth-story">
        <Link
          href="/"
          className="auth-desktop-brand w-fit text-lg">
          <BrandMark className="[&_[data-brand-icon]]:bg-brand-panel-foreground [&_[data-brand-icon]]:text-brand-panel" />
        </Link>

        <div className="auth-story-content">
          <h2 className="font-heading text-[clamp(2.5rem,min(4.1vw,7.5dvh),4.65rem)] leading-[1.04] font-bold tracking-[-0.06em]">
            A better way to
            <br className="hidden xl:block" />{" "}
            <span className="text-brand-panel-muted">run exams.</span>
          </h2>
          <p className="max-w-sm text-base leading-relaxed text-brand-panel-muted">
            Plan assessments, monitor live sessions, and publish results from
            one workspace.
          </p>
          <AuthArtwork />
        </div>

        <ul
          className="auth-features"
          aria-label="Platform features">
          {features.map(({ icon: Icon, label }) => (
            <li key={label}>
              <Icon
                aria-hidden="true"
                className="size-[18px] shrink-0"
              />
              {label}
            </li>
          ))}
        </ul>
      </aside>

      <main className="auth-main">
        <header className="flex min-h-12 items-center justify-between gap-4 lg:justify-end">
          <Link
            href="/"
            className="text-lg lg:hidden">
            <BrandMark />
          </Link>
          <ThemeToggleButton />
        </header>
        <div className="auth-form-position grid flex-1 place-items-center py-2 sm:py-4">
          <AnimatePresence
            mode="wait"
            initial={false}>
            <motion.div
              key={pathname}
              className="auth-card"
              initial={reduceMotion ? false : { opacity: 0, y: 8, scale: 0.99 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={reduceMotion ? undefined : { opacity: 0, y: -6, scale: 0.99 }}
              transition={{ duration: reduceMotion ? 0 : 0.24, ease: [0.2, 0.8, 0.2, 1] }}>
              {children}
            </motion.div>
          </AnimatePresence>
        </div>
      </main>
    </div>
  );
};

export { AuthShell };
