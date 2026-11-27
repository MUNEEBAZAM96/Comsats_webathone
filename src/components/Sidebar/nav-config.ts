import type { Route } from "next";

export type NavItem = {
  title: string;
  url: Route;
  icon: "LayoutDashboard" | "FileText" | "Users" | "BarChart3" | "BookOpen";
  exact?: boolean;
};

export type NavGroup = {
  label: string;
  items: NavItem[];
};

const overview = (url: Route): NavGroup => ({
  label: "Overview",
  items: [{ title: "Dashboard", url, icon: "LayoutDashboard", exact: true }],
});

export const findMatchingNavItem = (pathname: string, items: NavItem[]) => {
  const normalized = pathname.replace(/\/$/, "") || "/";
  return items.find(
    ({ url, exact }) =>
      normalized === url || (!exact && normalized.startsWith(url + "/")),
  );
};

export const getPageTitle = (pathname: string, groups: NavGroup[]) => {
  const [, role, section, id, action] = pathname.replace(/\/$/, "").split("/");
  if (role === "settings") return "Settings";

  if (section === "exams" && id) {
    if (id === "new") return "Create Exam";
    if (action === "assign") return "Assign Exam";
    if (action === "assign-proctor") return "Assign Proctors";
    if (action === "results") return "Exam Results";
    if (action === "monitor") return "Monitor Exam";
    if (action === "grading") return "Grading";
    if (action === "builder") return "Exam Builder";
    if (action === "preview") return "Exam Preview";
    if (role === "student") return "Take Exam";
    return role === "proctor" ? "Monitor Exam" : "Exam Builder";
  }

  if (section === "questions" && id) {
    if (id === "new" || pathname.replace(/\/$/, "").endsWith("/new"))
      return "New Question";
    if (id === "subjects") return "Topics";
    if (id === "topics") return "Questions";
    return "Edit Question";
  }

  if (section === "results" && id) return "Result Details";
  if (section === "reports") {
    if (id === "weekly") return "Weekly Report";
    return "Performance";
  }

  return (
    findMatchingNavItem(
      pathname,
      groups.flatMap(({ items }) => items),
    )?.title ?? "Dashboard"
  );
};

export const adminNav: NavGroup[] = [
  overview("/admin"),
  {
    label: "Assessments",
    items: [
      { title: "Exams", url: "/admin/exams", icon: "FileText" },
      { title: "Question Bank", url: "/admin/questions", icon: "BookOpen" },
    ],
  },
  {
    label: "People",
    items: [{ title: "Users", url: "/admin/users", icon: "Users" }],
  },
  {
    label: "Reports",
    items: [{ title: "Results", url: "/admin/results", icon: "BarChart3" }],
  },
];

export const examinerNav: NavGroup[] = [
  overview("/examiner"),
  {
    label: "Assessments",
    items: [
      { title: "My Exams", url: "/examiner/exams", icon: "FileText" },
      { title: "Question Bank", url: "/examiner/questions", icon: "BookOpen" },
    ],
  },
  {
    label: "Reports",
    items: [{ title: "Results", url: "/examiner/results", icon: "BarChart3" }],
  },
];

export const proctorNav: NavGroup[] = [
  overview("/proctor"),
  {
    label: "Assessments",
    items: [
      { title: "Assigned Exams", url: "/proctor/exams", icon: "FileText" },
    ],
  },
  {
    label: "Reports",
    items: [{ title: "Results", url: "/proctor/results", icon: "BarChart3" }],
  },
];

export const studentNav: NavGroup[] = [
  overview("/student"),
  {
    label: "Assessments",
    items: [
      { title: "My Exams", url: "/student/exams", icon: "FileText" },
      { title: "Practice", url: "/student/practice", icon: "FileText" },
    ],
  },
  {
    label: "Reports",
    items: [
      { title: "My Results", url: "/student/results", icon: "BarChart3" },
      { title: "Performance", url: "/student/reports", icon: "BarChart3" },
    ],
  },
];
