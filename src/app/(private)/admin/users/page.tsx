import type { Metadata } from "next";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import CreateUserDialog from "@/components/User/CreateUserDialog";
import UsersTable from "@/components/User/UsersTable";
import { TabularImportPanel } from "@/features/imports/components/TabularImportPanel";
import { requireRole } from "@/server/session";

export const metadata: Metadata = {
  title: "Users",
  description: "Manage users",
};

const AdminUsersPage = async () => {
  await requireRole("admin");
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session || session.user.role !== "admin") redirect("/");

  const { users, total } = await auth.api.listUsers({
    query: { limit: 20, offset: 0, sortBy: "createdAt", sortDirection: "desc" },
    headers: await headers(),
  });

  return (
    <section className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-medium">User Management</h1>
        <CreateUserDialog />
      </div>
      <div className="grid gap-2">
        <h2 className="text-lg font-medium">Bulk candidate import</h2>
        <TabularImportPanel mode="candidates" />
      </div>
      <UsersTable
        initialUsers={
          users as Array<{
            id: string;
            name: string;
            email: string;
            role: string;
            image: string | null;
            banned: boolean;
            banReason: string | null;
            banExpires: Date | null;
            createdAt: Date;
          }>
        }
        initialTotal={total}
      />
    </section>
  );
};

export default AdminUsersPage;
