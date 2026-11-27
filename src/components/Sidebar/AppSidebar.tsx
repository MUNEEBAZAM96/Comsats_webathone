"use client";

import Link from "next/link";
import { BrandMark } from "@/components/BrandMark";
import { usePathname } from "next/navigation";
import {
  BarChart3Icon,
  BookOpenIcon,
  FileTextIcon,
  LayoutDashboardIcon,
  UsersIcon,
  type LucideIcon,
} from "lucide-react";

import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
  useSidebar,
} from "@/components/shadcnui/sidebar";
import { findMatchingNavItem, type NavGroup, type NavItem } from "./nav-config";

const iconMap: Record<string, LucideIcon> = {
  LayoutDashboard: LayoutDashboardIcon,
  FileText: FileTextIcon,
  Users: UsersIcon,
  BarChart3: BarChart3Icon,
  BookOpen: BookOpenIcon,
};

const AppSidebar = ({
  groups,
  roleLabel,
}: {
  groups: NavGroup[];
  roleLabel: string;
}) => {
  const { setOpenMobile } = useSidebar();
  const closeMobileNavigation = () => setOpenMobile(false);
  const pathname = usePathname().replace(/\/$/, "") || "/";

  const allItems = groups.flatMap((g) => g.items);
  const matchedItem = findMatchingNavItem(pathname, allItems);
  const isActive = (item: NavItem) => matchedItem === item;

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader className="h-16 gap-0.5 justify-center border-b px-4 group-data-[collapsible=icon]:items-center group-data-[collapsible=icon]:px-0">
        <Link
          href={groups[0]?.items[0]?.url ?? "/"}
          aria-label="ExamGuard overview"
          onNavigate={closeMobileNavigation}
          className="w-fit rounded-md group-data-[collapsible=icon]:[&_[data-brand-name]]:hidden">
          <BrandMark className="text-lg" />
        </Link>
        <p className="text-xs text-muted-foreground group-data-[collapsible=icon]:hidden">
          {roleLabel}
        </p>
      </SidebarHeader>
      <SidebarContent className="px-2 py-4 group-data-[collapsible=icon]:px-0">
        <nav
          aria-label="Workspace navigation"
          className="grid gap-2">
          {groups.map((group) => (
            <SidebarGroup key={group.label}>
              <SidebarGroupLabel>{group.label}</SidebarGroupLabel>
              <SidebarGroupContent>
                <SidebarMenu>
                  {group.items.map((item) => {
                    const Icon = iconMap[item.icon];
                    return (
                      <SidebarMenuItem key={item.url}>
                        <SidebarMenuButton
                          render={
                            <Link
                              href={item.url}
                              aria-label={item.title}
                              onNavigate={closeMobileNavigation}
                              aria-current={isActive(item) ? "page" : undefined}
                            />
                          }
                          isActive={isActive(item)}
                          tooltip={item.title}
                          className="min-h-11 rounded-md data-active:font-semibold [&_svg]:size-[18px]">
                          {Icon && <Icon aria-hidden="true" />}
                          <span>{item.title}</span>
                        </SidebarMenuButton>
                      </SidebarMenuItem>
                    );
                  })}
                </SidebarMenu>
              </SidebarGroupContent>
            </SidebarGroup>
          ))}
        </nav>
      </SidebarContent>
      <SidebarRail />
    </Sidebar>
  );
};

export { AppSidebar };
