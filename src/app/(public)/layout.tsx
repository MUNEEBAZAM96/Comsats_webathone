import { AuthShell } from "@/components/Auth/AuthShell";
import type { LayoutProps } from "@/lib/types";

const PublicLayout = ({ children }: LayoutProps) => (
  <AuthShell>{children}</AuthShell>
);

export default PublicLayout;
