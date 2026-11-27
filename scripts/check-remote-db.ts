import "dotenv/config";
import prisma from "../src/lib/database/dbClient";

const main = async () => {
  const tables = await prisma.$queryRawUnsafe<
    { table_name: string }[]
  >(
    `SELECT table_name
     FROM information_schema.tables
     WHERE table_schema = 'public'
       AND table_name IN (
         'report_verification',
         'import_job',
         'exam',
         'user',
         'bank_question',
         'exam_attempt',
         'attempt_question',
         'grade_audit',
         'attempt_event',
         'exam_incident',
         'exam_announcement',
         'announcement_read'
       )
     ORDER BY 1`,
  );

  const requiredColumns: Record<string, string[]> = {
    exam: ["resultsPublishedAt", "resultsPublishedById", "resultReveal", "passMarkPercent"],
    exam_attempt: [
      "autoScore",
      "manualScore",
      "totalScore",
      "gradedAt",
      "gradedById",
      "submitSource",
      "lastSeenAt",
      "lastSyncAt",
      "clientOnline",
      "pendingLocal",
    ],
    answer: [
      "score",
      "autoScore",
      "manualScore",
      "feedback",
      "requiresManual",
      "gradedById",
      "gradedAt",
      "clientSeq",
      "idempotencyKey",
      "serverUpdatedAt",
    ],
  };
  const columnRows = await prisma.$queryRawUnsafe<
    { table_name: string; column_name: string; data_type: string }[]
  >(
    `SELECT table_name, column_name, data_type
     FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name IN ('exam', 'exam_attempt', 'answer')`,
  );
  const missingColumns = Object.entries(requiredColumns).flatMap(
    ([table, columns]) =>
      columns
        .filter(
          (column) =>
            !columnRows.some(
              (r) => r.table_name === table && r.column_name === column,
            ),
        )
        .map((column) => `${table}.${column}`),
  );
  const scoreTypes = columnRows
    .filter(
      (r) =>
        (r.table_name === "answer" && r.column_name === "score") ||
        (r.table_name === "exam_attempt" &&
          ["autoScore", "totalScore"].includes(r.column_name)),
    )
    .map((r) => `${r.table_name}.${r.column_name}=${r.data_type}`);
  const requiredTables = [
    "grade_audit",
    "attempt_event",
    "exam_incident",
    "exam_announcement",
    "announcement_read",
  ];
  const missingTables = requiredTables.filter(
    (t) => !tables.some((row) => row.table_name === t),
  );
  if (missingTables.length > 0 || missingColumns.length > 0)
    throw new Error(
      `Schema check failed. Missing tables: ${missingTables.join(", ") || "none"}; missing columns: ${missingColumns.join(", ") || "none"}`,
    );
  if (scoreTypes.some((t) => !t.endsWith("double precision")))
    throw new Error(`Score columns are not double precision: ${scoreTypes.join(", ")}`);

  const reportColumns = await prisma.$queryRawUnsafe<
    { column_name: string; data_type: string }[]
  >(
    `SELECT column_name, data_type
     FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = 'report_verification'
     ORDER BY ordinal_position`,
  );

  const importColumns = await prisma.$queryRawUnsafe<
    { column_name: string; data_type: string }[]
  >(
    `SELECT column_name, data_type
     FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = 'import_job'
     ORDER BY ordinal_position`,
  );

  const migrationHistory = await prisma.$queryRawUnsafe<
    { migration_name: string; finished_at: Date | null }[]
  >(
    `SELECT migration_name, finished_at
     FROM "_prisma_migrations"
     ORDER BY finished_at NULLS LAST, migration_name`,
  );

  const counts = {
    users: await prisma.user.count(),
    exams: await prisma.exam.count(),
    bankQuestions: await prisma.bankQuestion.count(),
    attempts: await prisma.examAttempt.count(),
    reports: await prisma.reportVerification.count(),
    imports: await prisma.importJob.count(),
    gradeAudits: await prisma.gradeAudit.count(),
    attemptEvents: await prisma.attemptEvent.count(),
    incidents: await prisma.examIncident.count(),
    announcements: await prisma.examAnnouncement.count(),
  };

  // Round-trip smoke: create + delete an ImportJob row (audit table only).
  const smoke = await prisma.importJob.create({
    data: {
      kind: "healthcheck",
      status: "completed",
      rowCount: 0,
      validCount: 0,
      errorCount: 0,
      createdById: (await prisma.user.findFirst({ select: { id: true } }))!.id,
      summary: "readme-remote-db-check",
    },
  });
  await prisma.importJob.delete({ where: { id: smoke.id } });

  console.log(
    JSON.stringify(
      {
        ok: true,
        tables: tables.map((t) => t.table_name),
        phase07to09Columns: "ok",
        scoreTypes,
        reportColumns,
        importColumns,
        migrationHistory: migrationHistory.map((m) => m.migration_name),
        counts,
        smoke: "import_job create/delete ok",
      },
      null,
      2,
    ),
  );

  await prisma.$disconnect();
};

main().catch(async (error) => {
  console.error(error);
  await prisma.$disconnect().catch(() => undefined);
  process.exit(1);
});
