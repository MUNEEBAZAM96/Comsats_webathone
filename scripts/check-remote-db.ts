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
         'attempt_question'
       )
     ORDER BY 1`,
  );

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
