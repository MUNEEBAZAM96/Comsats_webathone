import { PracticePlayer } from "@/components/Student/PracticePlayer";
import { requireRole } from "@/server/session";

const PracticePage = async () => {
  await requireRole("student");
  return <PracticePlayer />;
};

export default PracticePage;
