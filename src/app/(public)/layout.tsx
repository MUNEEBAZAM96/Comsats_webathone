import Link from "next/link";
import { AuthArtwork } from "@/components/Auth/AuthArtwork";
import { BrandMark } from "@/components/BrandMark";
import { QuietReveal } from "@/components/Providers/QuietReveal";
import ThemeToggleButton from "@/components/ThemeToggleButton";
import type { LayoutProps } from "@/lib/types";

const PublicLayout = ({ children }: LayoutProps) => (
  <div className="grid min-h-dvh lg:grid-cols-[minmax(0,0.97fr)_minmax(0,1.03fr)]">
    <aside className="hidden flex-col justify-between gap-8 overflow-hidden bg-brand-panel p-8 text-brand-panel-foreground lg:flex xl:p-14">
      <Link
        href="/"
        className="w-fit rounded-md text-lg focus-visible:outline-brand-panel-foreground"
      >
        <BrandMark className="[&_[data-brand-icon]]:bg-brand-panel-foreground [&_[data-brand-icon]]:text-brand-panel" />
      </Link>

      <div className="mx-auto grid w-full max-w-[31rem] gap-5 xl:gap-6">
        <div className="grid gap-4">
          <p className="font-heading text-[clamp(2.5rem,4.6vw,4.5rem)] leading-[1.06] font-bold tracking-[-0.055em]">
            Secure. Fair.
            <br />
            <span className="text-brand-panel-muted">Calm.</span>
          </p>
          <p className="text-base text-brand-panel-muted xl:text-lg">
            Confidence in every assessment.
          </p>
        </div>
        <AuthArtwork />
      </div>

      <div aria-hidden="true" className="flex items-center gap-3">
        <span className="size-1.5 rounded-full bg-brand-art-accent" />
        <span className="h-px flex-1 bg-brand-panel-muted/25" />
      </div>
    </aside>

    <main className="relative flex min-w-0 flex-col px-6 pb-10 sm:px-10 lg:px-12">
      <div className="flex min-h-20 items-center justify-between gap-4 lg:justify-end">
        <Link href="/" className="rounded-md text-lg lg:hidden">
          <BrandMark />
        </Link>
        <ThemeToggleButton />
      </div>
      <div className="grid flex-1 place-items-center py-8 lg:pb-16">
        <QuietReveal className="w-full max-w-[25rem]">{children}</QuietReveal>
      </div>
    </main>
  </div>
);

export default PublicLayout;
