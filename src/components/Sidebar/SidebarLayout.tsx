"use client";

import Link from "next/link";
import { useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { Loader2Icon, LogOutIcon, SettingsIcon } from "lucide-react";
import { toast } from "sonner";
import {
  SidebarProvider,
  SidebarInset,
  SidebarTrigger,
} from "@/components/shadcnui/sidebar";
import { Separator } from "@/components/shadcnui/separator";
import ThemeToggleButton from "@/components/ThemeToggleButton";
import {
  Avatar,
  AvatarFallback,
  AvatarImage,
} from "@/components/shadcnui/avatar";
import { Badge } from "@/components/shadcnui/badge";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuGroup,
  DropdownMenuSeparator,
} from "@/components/shadcnui/dropdown-menu";
import { AppSidebar } from "./AppSidebar";
import { getPageTitle, type NavGroup } from "./nav-config";
import { authClient } from "@/lib/auth-client";
import { useIsTablet } from "@/hooks/use-mobile";

const roleLabels: Record<string, string> = {
  "/admin": "Administrator",
  "/examiner": "Examiner",
  "/proctor": "Proctor",
  "/student": "Candidate",
};

const SidebarLayout = ({
  groups,
  children,
}: {
  groups: NavGroup[];
  children: React.ReactNode;
}) => {
  const { data: session } = authClient.useSession();
  const router = useRouter();
  const pathname = usePathname();
  const isTablet = useIsTablet();
  const [sidebarOpen, setSidebarOpen] = useState<boolean | null>(null);
  const [signingOut, setSigningOut] = useState(false);
  const roleLabel = roleLabels[groups[0]?.items[0]?.url] ?? "Workspace";
  const pageTitle = getPageTitle(pathname, groups);

  const handleSignOut = async () => {
    setSigningOut(true);
    try {
      const { error } = await authClient.signOut();
      if (error) throw new Error(error.message ?? "Failed to sign out");
      router.push("/");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to sign out");
    } finally {
      setSigningOut(false);
    }
  };

  const initials =
    session?.user.name
      .trim()
      .split(/\s+/)
      .slice(0, 2)
      .map((name) => name[0])
      .join("")
      .toUpperCase() ||
    session?.user.email.charAt(0).toUpperCase() ||
    "?";

  const isExamWorkspace = /^\/student\/exams\/[^/]+\/?$/.test(pathname);
  if (isExamWorkspace) return <main>{children}</main>;

  return (
    <SidebarProvider
      open={sidebarOpen ?? !isTablet}
      onOpenChange={setSidebarOpen}>
      <AppSidebar
        groups={groups}
        roleLabel={roleLabel}
      />
      <SidebarInset className="min-w-0">
        <header className="sticky top-0 z-10 flex h-16 shrink-0 items-center gap-3 border-b bg-card px-4 lg:px-8">
          <SidebarTrigger className="-ml-1 size-11 shrink-0" />
          <Separator
            orientation="vertical"
            className="h-6"
          />
          <div className="min-w-0">
            <p
              className="truncate text-sm font-semibold"
              title={pageTitle}>
              {pageTitle}
            </p>
            <p className="text-xs text-muted-foreground">{roleLabel}</p>
          </div>
          <div className="ml-auto flex shrink-0 items-center gap-2 sm:gap-3">
            <ThemeToggleButton />
            <DropdownMenu>
              <DropdownMenuTrigger
                aria-label="Account menu"
                className="grid size-11 place-items-center rounded-md focus-visible:outline-2">
                <Avatar
                  size="sm"
                  className="cursor-pointer">
                  <AvatarImage src={session?.user?.image ?? undefined} />
                  <AvatarFallback>{initials}</AvatarFallback>
                </Avatar>
              </DropdownMenuTrigger>
              <DropdownMenuContent
                align="end"
                className="w-72 max-w-[calc(100vw-2rem)]">
                <DropdownMenuGroup>
                  <div className="flex items-center gap-3 px-2 py-1.5">
                    <Avatar size="sm">
                      <AvatarImage src={session?.user?.image ?? undefined} />
                      <AvatarFallback>{initials}</AvatarFallback>
                    </Avatar>
                    <div className="flex min-w-0 flex-col">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span className="break-all text-sm font-medium">
                          {session?.user?.name ?? "User"}
                        </span>
                        <Badge
                          variant="outline"
                          className="shrink-0 px-1.5 py-0 text-[10px] leading-none capitalize">
                          {roleLabel}
                        </Badge>
                      </div>
                      <span className="text-muted-foreground break-all text-xs">
                        {session?.user?.email}
                      </span>
                    </div>
                  </div>
                </DropdownMenuGroup>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  className="cursor-pointer"
                  render={<Link href="/settings" />}>
                  <SettingsIcon />
                  Settings
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  className="cursor-pointer"
                  disabled={signingOut}
                  aria-busy={signingOut}
                  onClick={handleSignOut}>
                  {signingOut ?
                    <Loader2Icon className="motion-safe:animate-spin" />
                  : <LogOutIcon />}
                  {signingOut ? "Signing out…" : "Sign out"}
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </header>
        <div className="mx-auto flex w-full max-w-[94rem] flex-1 flex-col gap-6 p-4 sm:p-6 lg:p-8">
          {children}
        </div>
      </SidebarInset>
    </SidebarProvider>
  );
};

export { SidebarLayout };
