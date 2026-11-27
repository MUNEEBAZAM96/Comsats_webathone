import { Button } from "@/components/shadcnui/button";
import { StatusPanel } from "@/components/Workspace/StatusPanel";
import Link from "next/link";

const NotFoundPage = () => (
  <StatusPanel
    tone="info"
    title="Page not found"
    actions={(
      <Button size="lg" render={<Link href="/" />} nativeButton={false}>
        Go to sign-in
      </Button>
    )}>
    <p>The page you’re looking for doesn’t exist or has been moved.</p>
  </StatusPanel>
);

export default NotFoundPage;
