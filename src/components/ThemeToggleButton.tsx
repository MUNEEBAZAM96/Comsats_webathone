"use client";

import { MoonIcon, SunIcon } from "lucide-react";
import { useTheme } from "next-themes";
import { Button } from "@/components/shadcnui/button";

const ThemeToggleButton = () => {
  const { resolvedTheme, setTheme } = useTheme();

  return (
    <Button
      type="button"
      variant="ghost"
      size="icon-lg"
      aria-label="Toggle color theme"
      title="Toggle color theme"
      className="theme-toggle border-border bg-card text-muted-foreground"
      onClick={() => setTheme(resolvedTheme === "dark" ? "light" : "dark")}
    >
      <MoonIcon aria-hidden="true" className="size-[18px] dark:hidden" />
      <SunIcon aria-hidden="true" className="hidden size-[18px] dark:block" />
    </Button>
  );
};

export default ThemeToggleButton;
