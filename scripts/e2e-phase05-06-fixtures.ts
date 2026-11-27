import "dotenv/config";
import { addDays, addMinutes, subDays, subMinutes } from "date-fns";
import prisma from "../src/lib/database/dbClient";

/**
 * Fixtures for manual / browser verification of Phase 05–06.
 * Every exam is titled with the "[E2E]" prefix and recreated on each run.
 *   npx tsx scripts/e2e-phase05-06-fixtures.ts          create
 *   npx tsx scripts/e2e-phase05-06-fixtures.ts --clean  delete only
 *   npx tsx scripts/e2e-phase05-06-fixtures.ts --expire <attemptId>  push an attempt past its deadline
 */

const PREFIX = "[E2E]";

const questions = [
  {
    text: "Which keyword declares a block-scoped constant in JavaScript?",
    type: "single_choice",
    options: "var\nlet\nconst\nstatic",
    answer: "const",
    points: 2,
  },
  {
    text: "Select every HTTP method that is idempotent by definition.",
    type: "multiple_choice",
    options: "GET\nPOST\nPUT\nDELETE",
    answer: "DELETE\nGET\nPUT",
    points: 3,
  },
  {
    text: "JSON keys must be wrapped in double quotes.",
    type: "true_false",
    options: "True\nFalse",
    answer: "True",
    points: 1,
  },
  {
    text: "Name the data structure that follows first-in, first-out order.",
    type: "short_answer",
    options: null,
    answer: "queue",
    points: 2,
  },
];

const clean = async () => {
  await prisma.examAttempt.deleteMany({
    where: { exam: { title: { startsWith: PREFIX } } },
  });
  const { count } = await prisma.exam.deleteMany({
    where: { title: { startsWith: PREFIX } },
  });
  console.log(`deleted ${count} ${PREFIX} exams`);
};

const create = async () => {
  const [admin, examiner, student] = await Promise.all(
    ["admin@example.com", "examiner@example.com", "student@example.com"].map(
      (email) => prisma.user.findUniqueOrThrow({ where: { email } }),
    ),
  );
  const now = new Date();
  const totalMarks = questions.reduce((s, q) => s + q.points, 0);

  const make = async (input: {
    title: string;
    ownerId: string;
    startTime: Date;
    endTime: Date;
    duration: number;
    assign: boolean;
    status?: string;
    shuffle?: boolean;
  }) => {
    const exam = await prisma.exam.create({
      data: {
        title: `${PREFIX} ${input.title}`,
        description: "Phase 05/06 verification fixture",
        instructions:
          "Answer every question.\nYour answers save automatically.\nThe exam submits itself when time runs out.",
        duration: input.duration,
        startTime: input.startTime,
        endTime: input.endTime,
        status: input.status ?? "published",
        totalMarks,
        shuffleQuestions: input.shuffle ?? false,
        shuffleOptions: input.shuffle ?? false,
        createdById: input.ownerId,
        questions: {
          create: questions.map((q, order) => ({ ...q, order })),
        },
      },
    });
    if (input.assign) {
      await prisma.examAssignment.create({
        data: {
          examId: exam.id,
          userId: student.id,
          assignedById: input.ownerId,
        },
      });
    }
    return exam;
  };

  const ongoing = await make({
    title: "Ongoing exam",
    ownerId: examiner.id,
    startTime: subMinutes(now, 10),
    endTime: addMinutes(now, 120),
    duration: 30,
    assign: true,
    shuffle: true,
  });
  const shortExam = await make({
    title: "Two-minute exam",
    ownerId: examiner.id,
    startTime: subMinutes(now, 5),
    endTime: addMinutes(now, 120),
    duration: 2,
    assign: true,
  });
  const upcoming = await make({
    title: "Upcoming exam",
    ownerId: examiner.id,
    startTime: addDays(now, 1),
    endTime: addDays(now, 2),
    duration: 30,
    assign: true,
  });
  const ended = await make({
    title: "Ended exam",
    ownerId: examiner.id,
    startTime: subDays(now, 2),
    endTime: subDays(now, 1),
    duration: 30,
    assign: true,
  });
  const draft = await make({
    title: "Draft exam (hidden)",
    ownerId: examiner.id,
    startTime: subMinutes(now, 10),
    endTime: addMinutes(now, 120),
    duration: 30,
    assign: true,
    status: "draft",
  });
  const unassigned = await make({
    title: "Unassigned exam",
    ownerId: examiner.id,
    startTime: subMinutes(now, 10),
    endTime: addMinutes(now, 120),
    duration: 30,
    assign: false,
  });
  const adminOwned = await make({
    title: "Admin-owned exam",
    ownerId: admin.id,
    startTime: subMinutes(now, 10),
    endTime: addMinutes(now, 120),
    duration: 30,
    assign: false,
  });
  const expiry = await make({
    title: "Mid-session expiry exam",
    ownerId: examiner.id,
    startTime: subMinutes(now, 10),
    endTime: addMinutes(now, 120),
    duration: 30,
    assign: true,
  });
  const resume = await make({
    title: "Resume-after-deadline exam",
    ownerId: examiner.id,
    startTime: subMinutes(now, 10),
    endTime: addMinutes(now, 120),
    duration: 30,
    assign: true,
  });

  console.log(
    JSON.stringify(
      {
        ongoing: ongoing.id,
        shortExam: shortExam.id,
        upcoming: upcoming.id,
        ended: ended.id,
        draft: draft.id,
        unassigned: unassigned.id,
        adminOwned: adminOwned.id,
        expiry: expiry.id,
        resume: resume.id,
      },
      null,
      2,
    ),
  );
};

/** Move an in-progress attempt's start back so its server deadline has passed. */
const expire = async (attemptId: string) => {
  const attempt = await prisma.examAttempt.findUniqueOrThrow({
    where: { id: attemptId },
    include: { exam: { select: { duration: true } } },
  });
  await prisma.examAttempt.update({
    where: { id: attemptId },
    data: { startedAt: subMinutes(new Date(), attempt.exam.duration + 1) },
  });
  console.log(`attempt ${attemptId} pushed past its deadline`);
};

const main = async () => {
  const args = process.argv.slice(2);
  if (args[0] === "--expire" && args[1]) await expire(args[1]);
  else {
    await clean();
    if (args[0] !== "--clean") await create();
  }
  await prisma.$disconnect();
};

main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect().catch(() => undefined);
  process.exit(1);
});
