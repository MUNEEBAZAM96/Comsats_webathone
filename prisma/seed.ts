import "dotenv/config";
import { hashPasswordFunction } from "../src/lib/argon2";
import prisma from "../src/lib/database/dbClient";
import { serverEnv } from "../src/lib/env/serverEnv";

type SeedQuestion = {
  text: string;
  type: string;
  options?: string;
  answer: string;
  points: number;
  difficulty: string;
  topicId: string;
  markingScheme?: string;
};

const scheme = (value: object) => JSON.stringify(value);

const upsertUser = async (
  email: string,
  name: string,
  role: string,
  password: string,
) => {
  const hashedPassword = await hashPasswordFunction(password);
  const user = await prisma.user.upsert({
    where: { email },
    update: { name, role, emailVerified: true, banned: false },
    create: { email, name, role, emailVerified: true },
  });
  const account = await prisma.account.findFirst({
    where: { providerId: "credential", userId: user.id },
  });
  if (account) {
    await prisma.account.update({
      where: { id: account.id },
      data: { accountId: user.id, password: hashedPassword },
    });
  } else {
    await prisma.account.create({
      data: {
        userId: user.id,
        providerId: "credential",
        accountId: user.id,
        password: hashedPassword,
      },
    });
  }
  return user;
};

const main = async () => {
  await prisma.account.deleteMany({ where: { providerId: "email" } });
  const adminEmail = serverEnv.BETTER_AUTH_SEED_ADMIN_EMAIL ?? "admin@example.com";
  const admin = await upsertUser(adminEmail, "Administrator", "admin", adminEmail);
  const examiner = await upsertUser("examiner@example.com", "Examiner", "examiner", "examiner@example.com");
  const proctor = await upsertUser("proctor@example.com", "Proctor", "proctor", "proctor@example.com");
  const student = await upsertUser("student@example.com", "Student", "student", "student@example.com");

  const ensureSubject = async (name: string, description: string) =>
    prisma.subject.upsert({ where: { name }, update: { description }, create: { name, description } });
  const ensureTopic = async (subjectId: string, name: string, description: string) =>
    prisma.topic.upsert({ where: { subjectId_name: { subjectId, name } }, update: { description }, create: { subjectId, name, description } });

  const programming = await ensureSubject("Programming", "Software development and computer science topics");
  const javascript = await ensureTopic(programming.id, "JavaScript", "Language fundamentals and runtimes");
  const web = await ensureTopic(programming.id, "Web & APIs", "HTTP, REST and web concepts");
  const fundamentals = await ensureTopic(programming.id, "CS Fundamentals", "Algorithms, OOP and tooling");
  const security = await ensureSubject("Cybersecurity", "Secure systems, identity and application security");
  const appSecurity = await ensureTopic(security.id, "Application Security", "Common web vulnerabilities and defenses");
  const databases = await ensureSubject("Databases", "Relational data modeling and SQL");
  const sql = await ensureTopic(databases.id, "SQL Fundamentals", "Queries, constraints and transactions");

  const questions: SeedQuestion[] = [
    { text: "Which of the following are primitive data types in JavaScript?", type: "multiple_choice", options: "String\nNumber\nObject\nBoolean\nArray", answer: "String\nNumber\nBoolean", points: 2, difficulty: "medium", topicId: javascript.id, markingScheme: scheme({ version: 1, mode: "all_of", correctOptions: ["String", "Number", "Boolean"], partialCredit: true }) },
    { text: "What does the 'this' keyword refer to in an arrow function?", type: "single_choice", options: "The function itself\nThe global object\nThe enclosing lexical context\nThe new instance", answer: "The enclosing lexical context", points: 2, difficulty: "hard", topicId: javascript.id },
    { text: "TypeScript is a superset of JavaScript that adds optional static typing.", type: "true_false", options: "True\nFalse", answer: "True", points: 1, difficulty: "easy", topicId: javascript.id },
    { text: "What does REST stand for in web API design?", type: "short_answer", answer: "representational, state, transfer", points: 2, difficulty: "easy", topicId: web.id, markingScheme: scheme({ version: 1, mode: "keywords_partial", keywords: ["representational", "state", "transfer"], partialCredit: true }) },
    { text: "Which time complexity does merge sort have?", type: "single_choice", options: "O(n)\nO(n²)\nO(n log n)\nO(log n)", answer: "O(n log n)", points: 2, difficulty: "medium", topicId: fundamentals.id },
    { text: "Encapsulation bundles data with the methods that operate on it.", type: "true_false", options: "True\nFalse", answer: "True", points: 1, difficulty: "medium", topicId: fundamentals.id },
    { text: "Which design pattern ensures a class has only one instance?", type: "single_choice", options: "Factory\nObserver\nSingleton\nDecorator", answer: "Singleton", points: 2, difficulty: "easy", topicId: fundamentals.id },
    { text: "What Git command temporarily saves uncommitted changes?", type: "short_answer", answer: "stash", points: 1, difficulty: "easy", topicId: fundamentals.id, markingScheme: scheme({ version: 1, mode: "keywords_partial", keywords: ["stash"], partialCredit: true }) },
    { text: "Which are JavaScript runtime environments?", type: "multiple_choice", options: "Node.js\nDeno\nPython\nBun", answer: "Node.js\nDeno\nBun", points: 2, difficulty: "medium", topicId: javascript.id },
    { text: "What does ACID stand for in database transactions?", type: "single_choice", options: "Atomicity, Consistency, Isolation, Durability\nAvailability, Consistency, Isolation, Durability\nAtomicity, Consistency, Integrity, Durability", answer: "Atomicity, Consistency, Isolation, Durability", points: 2, difficulty: "hard", topicId: sql.id },
    { text: "Which HTTP status code indicates that authentication is required?", type: "single_choice", options: "200\n301\n401\n500", answer: "401", points: 1, difficulty: "easy", topicId: appSecurity.id },
    { text: "Which practices improve account security?", type: "multiple_choice", options: "Multi-factor authentication\nPassword reuse\nRate limiting\nStrong password hashing", answer: "Multi-factor authentication\nRate limiting\nStrong password hashing", points: 3, difficulty: "medium", topicId: appSecurity.id },
    { text: "Parameterized queries help prevent SQL injection attacks.", type: "true_false", options: "True\nFalse", answer: "True", points: 1, difficulty: "easy", topicId: appSecurity.id },
    { text: "Which SQL clause filters rows after a SELECT query?", type: "single_choice", options: "ORDER BY\nWHERE\nGROUP BY\nJOIN", answer: "WHERE", points: 1, difficulty: "easy", topicId: sql.id },
    { text: "Name the four ACID transaction properties.", type: "short_answer", answer: "atomicity, consistency, isolation, durability", points: 2, difficulty: "medium", topicId: sql.id, markingScheme: scheme({ version: 1, mode: "keywords_partial", keywords: ["atomicity", "consistency", "isolation", "durability"], partialCredit: true }) },
    { text: "Which database object provides a logical view without storing a separate copy?", type: "single_choice", options: "Index\nView\nTrigger\nSequence", answer: "View", points: 1, difficulty: "medium", topicId: sql.id },
    {
      text: "Explain how parameterized queries reduce SQL injection risk. Give one short example.",
      type: "long_answer",
      answer: "Use bound parameters so user input is never concatenated into SQL. Example: SELECT * FROM users WHERE id = $1",
      points: 5,
      difficulty: "medium",
      topicId: appSecurity.id,
      markingScheme: scheme({ version: 1, mode: "manual" }),
    },
    {
      text: "Describe the difference between authentication and authorization in web applications.",
      type: "long_answer",
      answer: "Authentication verifies identity; authorization decides what an authenticated user may do.",
      points: 5,
      difficulty: "medium",
      topicId: appSecurity.id,
      markingScheme: scheme({ version: 1, mode: "manual" }),
    },
  ];

  const topicById = new Map([
    [javascript.id, { topicName: "JavaScript", subjectName: "Programming" }],
    [web.id, { topicName: "Web & APIs", subjectName: "Programming" }],
    [fundamentals.id, { topicName: "CS Fundamentals", subjectName: "Programming" }],
    [appSecurity.id, { topicName: "Application Security", subjectName: "Cybersecurity" }],
    [sql.id, { topicName: "SQL Fundamentals", subjectName: "Databases" }],
  ]);

  const bankQuestions: Array<{
    id: string;
    text: string;
    type: string;
    options: string | null;
    answer: string | null;
    points: number;
    difficulty: string;
    markingScheme: string | null;
    topicId: string;
  }> = [];
  for (let index = 0; index < questions.length; index += 1) {
    const question = questions[index]!;
    const createdById = index % 2 === 0 ? admin.id : examiner.id;
    const existing = await prisma.bankQuestion.findFirst({ where: { text: question.text, createdById } });
    const saved = existing
      ? await prisma.bankQuestion.update({ where: { id: existing.id }, data: { ...question, createdById } })
      : await prisma.bankQuestion.create({ data: { ...question, createdById } });
    bankQuestions.push(saved);
  }

  const ensureExam = async (input: {
    title: string;
    description: string;
    instructions: string;
    duration: number;
    startTime: Date;
    endTime: Date;
    status: string;
    createdById: string;
    selected: typeof bankQuestions;
    shuffleQuestions?: boolean;
    shuffleOptions?: boolean;
  }) => {
    const existing = await prisma.exam.findFirst({ where: { title: input.title, createdById: input.createdById } });
    const exam = existing
      ? await prisma.exam.update({ where: { id: existing.id }, data: { title: input.title, description: input.description, instructions: input.instructions, duration: input.duration, startTime: input.startTime, endTime: input.endTime, status: input.status, shuffleQuestions: input.shuffleQuestions ?? false, shuffleOptions: input.shuffleOptions ?? false } })
      : await prisma.exam.create({ data: { title: input.title, description: input.description, instructions: input.instructions, duration: input.duration, startTime: input.startTime, endTime: input.endTime, status: input.status, createdById: input.createdById, shuffleQuestions: input.shuffleQuestions ?? false, shuffleOptions: input.shuffleOptions ?? false } });
    for (let index = 0; index < input.selected.length; index += 1) {
      const source = input.selected[index]!;
      const current = await prisma.question.findFirst({ where: { examId: exam.id, text: source.text } });
      const data = { examId: exam.id, text: source.text, type: source.type, options: source.options ?? null, answer: source.answer, points: source.points, order: index, difficulty: source.difficulty, markingScheme: source.markingScheme ?? null };
      if (current) await prisma.question.update({ where: { id: current.id }, data });
      else await prisma.question.create({ data });
    }
    const totals = await prisma.question.aggregate({ where: { examId: exam.id }, _sum: { points: true } });
    return prisma.exam.update({ where: { id: exam.id }, data: { totalMarks: totals._sum.points ?? 0 } });
  };

  const now = new Date();
  const liveExam = await ensureExam({ title: "Secure Web Engineering — Live Assessment", description: "Live paper for candidate attempts and proctor monitoring.", instructions: "Answer every question. The server controls the deadline.", duration: 60, startTime: new Date(now.getTime() - 15 * 60 * 1000), endTime: new Date(now.getTime() + 45 * 60 * 1000), status: "published", createdById: admin.id, selected: bankQuestions.slice(0, 8), shuffleQuestions: true, shuffleOptions: true });
  const scheduledExam = await ensureExam({ title: "JavaScript and SQL — Scheduled Paper", description: "Upcoming paper for scheduled-exam testing.", instructions: "This paper becomes available at its scheduled start time.", duration: 45, startTime: new Date(now.getTime() + 24 * 60 * 60 * 1000), endTime: new Date(now.getTime() + 25 * 60 * 60 * 1000), status: "published", createdById: examiner.id, selected: bankQuestions.slice(4, 12) });
  const completedExam = await ensureExam({ title: "Database Concepts — Completed Demo Paper", description: "Closed paper with a sample graded result.", instructions: "This paper is closed and contains a seeded result.", duration: 30, startTime: new Date(now.getTime() - 4 * 24 * 60 * 60 * 1000), endTime: new Date(now.getTime() - 3 * 24 * 60 * 60 * 1000), status: "completed", createdById: examiner.id, selected: bankQuestions.slice(8, 16) });
  await prisma.exam.update({
    where: { id: completedExam.id },
    data: {
      resultsPublishedAt: new Date(now.getTime() - 2 * 24 * 60 * 60 * 1000),
      resultReveal: "score_and_answers",
      passMarkPercent: 50,
    },
  });
  const writtenExam = await ensureExam({
    title: "Secure Coding — Written Analytics Demo",
    description: "Completed paper with AI-assisted and examiner-overridden written grades.",
    instructions: "Includes objective and long-answer items for student analytics.",
    duration: 40,
    startTime: new Date(now.getTime() - 10 * 24 * 60 * 60 * 1000),
    endTime: new Date(now.getTime() - 9 * 24 * 60 * 60 * 1000),
    status: "completed",
    createdById: examiner.id,
    selected: [
      ...bankQuestions.slice(10, 14),
      ...bankQuestions.filter((q) => q.type === "long_answer"),
    ],
  });
  await prisma.exam.update({
    where: { id: writtenExam.id },
    data: {
      resultsPublishedAt: new Date(now.getTime() - 8 * 24 * 60 * 60 * 1000),
      resultReveal: "score_and_answers",
      passMarkPercent: 55,
    },
  });
  const priorWeekExam = await ensureExam({
    title: "Weekly Trend — Prior Week Demo",
    description: "Earlier published paper for week-over-week student reports.",
    instructions: "Seeded for weekly analytics.",
    duration: 25,
    startTime: new Date(now.getTime() - 12 * 24 * 60 * 60 * 1000),
    endTime: new Date(now.getTime() - 11 * 24 * 60 * 60 * 1000),
    status: "completed",
    createdById: admin.id,
    selected: bankQuestions.slice(0, 6),
  });
  await prisma.exam.update({
    where: { id: priorWeekExam.id },
    data: {
      resultsPublishedAt: new Date(now.getTime() - 10 * 24 * 60 * 60 * 1000),
      resultReveal: "score_only",
      passMarkPercent: 50,
    },
  });
  await ensureExam({ title: "Question Bank Import Playground — Draft", description: "Draft paper for testing editing and question import.", instructions: "Add questions and publish this paper from the dashboard.", duration: 25, startTime: new Date(now.getTime() + 2 * 24 * 60 * 60 * 1000), endTime: new Date(now.getTime() + 2 * 24 * 60 * 60 * 1000 + 25 * 60 * 1000), status: "draft", createdById: admin.id, selected: [] });

  const assignmentPairs = [
    { examId: liveExam.id, assignedById: admin.id },
    { examId: scheduledExam.id, assignedById: examiner.id },
    { examId: completedExam.id, assignedById: examiner.id },
    { examId: writtenExam.id, assignedById: examiner.id },
    { examId: priorWeekExam.id, assignedById: admin.id },
  ];
  for (const pair of assignmentPairs) {
    await prisma.examAssignment.upsert({ where: { examId_userId: { examId: pair.examId, userId: student.id } }, update: { assignedById: pair.assignedById }, create: { examId: pair.examId, userId: student.id, assignedById: pair.assignedById } });
    await prisma.examProctor.upsert({ where: { examId_proctorId: { examId: pair.examId, proctorId: proctor.id } }, update: { assignedById: pair.assignedById }, create: { examId: pair.examId, proctorId: proctor.id, assignedById: pair.assignedById } });
  }

  const taxonomyFor = (text: string) => {
    const bank = bankQuestions.find((q) => q.text === text);
    return bank ? topicById.get(bank.topicId) : undefined;
  };

  const completedQuestions = await prisma.question.findMany({ where: { examId: completedExam.id }, orderBy: { order: "asc" } });
  const maxScore = completedQuestions.reduce((sum, question) => sum + question.points, 0);
  const score = completedQuestions.reduce((sum, question, index) => sum + (index % 3 === 0 ? question.points : 0), 0);
  const completedAttempt = await prisma.examAttempt.upsert({
    where: { userId_examId: { userId: student.id, examId: completedExam.id } },
    update: { status: "graded", submittedAt: new Date(now.getTime() - 3 * 24 * 60 * 60 * 1000 + 20 * 60 * 1000), autoScore: score, totalScore: score, maxScore },
    create: { userId: student.id, examId: completedExam.id, status: "graded", startedAt: new Date(now.getTime() - 3 * 24 * 60 * 60 * 1000 - 10 * 60 * 1000), submittedAt: new Date(now.getTime() - 3 * 24 * 60 * 60 * 1000 + 20 * 60 * 1000), autoScore: score, totalScore: score, maxScore },
  });
  for (let index = 0; index < completedQuestions.length; index += 1) {
    const question = completedQuestions[index]!;
    const tax = taxonomyFor(question.text);
    const snapshot = await prisma.attemptQuestion.upsert({
      where: { attemptId_sourceQuestionId: { attemptId: completedAttempt.id, sourceQuestionId: question.id } },
      update: { text: question.text, type: question.type, options: question.options, answer: question.answer, points: question.points, order: question.order, difficulty: question.difficulty, markingScheme: question.markingScheme, topicName: tax?.topicName ?? null, subjectName: tax?.subjectName ?? null },
      create: { attemptId: completedAttempt.id, sourceQuestionId: question.id, text: question.text, type: question.type, options: question.options, answer: question.answer, points: question.points, order: question.order, difficulty: question.difficulty, markingScheme: question.markingScheme, topicName: tax?.topicName ?? null, subjectName: tax?.subjectName ?? null },
    });
    await prisma.answer.upsert({
      where: { attemptId_questionId: { attemptId: completedAttempt.id, questionId: question.id } },
      update: {
        attemptQuestionId: snapshot.id,
        text: index % 3 === 0 ? question.answer : "",
        score: index % 3 === 0 ? question.points : 0,
        autoScore: index % 3 === 0 ? question.points : 0,
        gradingSource: "automatic",
        gradingStatus: "skipped",
      },
      create: {
        attemptId: completedAttempt.id,
        questionId: question.id,
        attemptQuestionId: snapshot.id,
        text: index % 3 === 0 ? question.answer : "",
        score: index % 3 === 0 ? question.points : 0,
        autoScore: index % 3 === 0 ? question.points : 0,
        gradingSource: "automatic",
        gradingStatus: "skipped",
      },
    });
  }

  const priorQuestions = await prisma.question.findMany({ where: { examId: priorWeekExam.id }, orderBy: { order: "asc" } });
  const priorMax = priorQuestions.reduce((sum, q) => sum + q.points, 0);
  const priorScore = priorQuestions.reduce((sum, q, index) => sum + (index % 2 === 0 ? q.points : 0), 0);
  const priorAttempt = await prisma.examAttempt.upsert({
    where: { userId_examId: { userId: student.id, examId: priorWeekExam.id } },
    update: {
      status: "graded",
      startedAt: new Date(now.getTime() - 12 * 24 * 60 * 60 * 1000),
      submittedAt: new Date(now.getTime() - 11 * 24 * 60 * 60 * 1000 + 15 * 60 * 1000),
      autoScore: priorScore,
      totalScore: priorScore,
      maxScore: priorMax,
    },
    create: {
      userId: student.id,
      examId: priorWeekExam.id,
      status: "graded",
      startedAt: new Date(now.getTime() - 12 * 24 * 60 * 60 * 1000),
      submittedAt: new Date(now.getTime() - 11 * 24 * 60 * 60 * 1000 + 15 * 60 * 1000),
      autoScore: priorScore,
      totalScore: priorScore,
      maxScore: priorMax,
    },
  });
  for (let index = 0; index < priorQuestions.length; index += 1) {
    const question = priorQuestions[index]!;
    const tax = taxonomyFor(question.text);
    const snapshot = await prisma.attemptQuestion.upsert({
      where: { attemptId_sourceQuestionId: { attemptId: priorAttempt.id, sourceQuestionId: question.id } },
      update: { text: question.text, type: question.type, options: question.options, answer: question.answer, points: question.points, order: question.order, difficulty: question.difficulty, markingScheme: question.markingScheme, topicName: tax?.topicName ?? null, subjectName: tax?.subjectName ?? null },
      create: { attemptId: priorAttempt.id, sourceQuestionId: question.id, text: question.text, type: question.type, options: question.options, answer: question.answer, points: question.points, order: question.order, difficulty: question.difficulty, markingScheme: question.markingScheme, topicName: tax?.topicName ?? null, subjectName: tax?.subjectName ?? null },
    });
    const earned = index % 2 === 0 ? question.points : 0;
    await prisma.answer.upsert({
      where: { attemptId_questionId: { attemptId: priorAttempt.id, questionId: question.id } },
      update: {
        attemptQuestionId: snapshot.id,
        text: earned > 0 ? question.answer : "",
        score: earned,
        autoScore: earned,
        gradingSource: "automatic",
        gradingStatus: "skipped",
      },
      create: {
        attemptId: priorAttempt.id,
        questionId: question.id,
        attemptQuestionId: snapshot.id,
        text: earned > 0 ? question.answer : "",
        score: earned,
        autoScore: earned,
        gradingSource: "automatic",
        gradingStatus: "skipped",
      },
    });
  }

  const writtenQuestions = await prisma.question.findMany({ where: { examId: writtenExam.id }, orderBy: { order: "asc" } });
  let writtenAuto = 0;
  let writtenManual = 0;
  let writtenMaxScore = 0;
  for (const q of writtenQuestions) writtenMaxScore += q.points;
  const writtenAttempt = await prisma.examAttempt.upsert({
    where: { userId_examId: { userId: student.id, examId: writtenExam.id } },
    update: {
      status: "graded",
      startedAt: new Date(now.getTime() - 10 * 24 * 60 * 60 * 1000),
      submittedAt: new Date(now.getTime() - 9 * 24 * 60 * 60 * 1000 + 25 * 60 * 1000),
      maxScore: writtenMaxScore,
    },
    create: {
      userId: student.id,
      examId: writtenExam.id,
      status: "graded",
      startedAt: new Date(now.getTime() - 10 * 24 * 60 * 60 * 1000),
      submittedAt: new Date(now.getTime() - 9 * 24 * 60 * 60 * 1000 + 25 * 60 * 1000),
      maxScore: writtenMaxScore,
    },
  });
  let longIndex = 0;
  for (let index = 0; index < writtenQuestions.length; index += 1) {
    const question = writtenQuestions[index]!;
    const tax = taxonomyFor(question.text);
    const snapshot = await prisma.attemptQuestion.upsert({
      where: { attemptId_sourceQuestionId: { attemptId: writtenAttempt.id, sourceQuestionId: question.id } },
      update: { text: question.text, type: question.type, options: question.options, answer: question.answer, points: question.points, order: question.order, difficulty: question.difficulty, markingScheme: question.markingScheme, topicName: tax?.topicName ?? null, subjectName: tax?.subjectName ?? null },
      create: { attemptId: writtenAttempt.id, sourceQuestionId: question.id, text: question.text, type: question.type, options: question.options, answer: question.answer, points: question.points, order: question.order, difficulty: question.difficulty, markingScheme: question.markingScheme, topicName: tax?.topicName ?? null, subjectName: tax?.subjectName ?? null },
    });
    if (question.type === "long_answer") {
      longIndex += 1;
      const studentText =
        longIndex === 1 ?
          "Parameterized queries bind values separately from SQL text so attackers cannot change the statement structure. Example: SELECT * FROM users WHERE id = $1."
        : "Authentication proves who you are. Authorization decides what you can access after login.";
      if (longIndex === 1) {
        const aiScore = 4;
        writtenManual += aiScore;
        const answer = await prisma.answer.upsert({
          where: { attemptId_questionId: { attemptId: writtenAttempt.id, questionId: question.id } },
          update: {
            attemptQuestionId: snapshot.id,
            text: studentText,
            score: aiScore,
            autoScore: null,
            manualScore: null,
            requiresManual: true,
            gradingSource: "ai_assisted",
            gradingStatus: "ai_graded",
            aiScore,
            aiConfidence: 0.81,
            aiFeedback: JSON.stringify({
              summary: "Explains parameterization and gives a concrete example.",
              strengths: ["Correctly explains bound parameters", "Includes a clear SQL example"],
              improvements: ["Mention ORM prepared statements as an alternative"],
            }),
            aiGradedAt: new Date(now.getTime() - 8.5 * 24 * 60 * 60 * 1000),
            feedback: "Explains parameterization and gives a concrete example.",
            aiIdempotencyKey: `${writtenAttempt.id}:seed-ai-1:0`,
          },
          create: {
            attemptId: writtenAttempt.id,
            questionId: question.id,
            attemptQuestionId: snapshot.id,
            text: studentText,
            score: aiScore,
            requiresManual: true,
            gradingSource: "ai_assisted",
            gradingStatus: "ai_graded",
            aiScore,
            aiConfidence: 0.81,
            aiFeedback: JSON.stringify({
              summary: "Explains parameterization and gives a concrete example.",
              strengths: ["Correctly explains bound parameters", "Includes a clear SQL example"],
              improvements: ["Mention ORM prepared statements as an alternative"],
            }),
            aiGradedAt: new Date(now.getTime() - 8.5 * 24 * 60 * 60 * 1000),
            feedback: "Explains parameterization and gives a concrete example.",
            aiIdempotencyKey: `${writtenAttempt.id}:seed-ai-1:0`,
          },
        });
        await prisma.gradeAudit.create({
          data: {
            examId: writtenExam.id,
            answerId: answer.id,
            action: "grade",
            previousScore: null,
            newScore: aiScore,
            reason: "AI-assisted provisional grade (seed)",
            gradedById: examiner.id,
          },
        });
      } else if (longIndex === 2) {
        const aiScore = 3;
        const finalScore = 4.5;
        writtenManual += finalScore;
        const answer = await prisma.answer.upsert({
          where: { attemptId_questionId: { attemptId: writtenAttempt.id, questionId: question.id } },
          update: {
            attemptQuestionId: snapshot.id,
            text: studentText,
            score: finalScore,
            autoScore: null,
            manualScore: finalScore,
            requiresManual: true,
            gradingSource: "examiner",
            gradingStatus: "examiner_reviewed",
            aiScore,
            aiConfidence: 0.64,
            aiFeedback: JSON.stringify({
              summary: "Basic distinction is present but thin.",
              strengths: ["States identity vs permissions"],
              improvements: ["Add an example of each"],
            }),
            aiGradedAt: new Date(now.getTime() - 8.4 * 24 * 60 * 60 * 1000),
            gradedById: examiner.id,
            gradedAt: new Date(now.getTime() - 8.2 * 24 * 60 * 60 * 1000),
            feedback: "Clear distinction. Added half a mark for the concise wording.",
            aiIdempotencyKey: `${writtenAttempt.id}:seed-ai-2:0`,
          },
          create: {
            attemptId: writtenAttempt.id,
            questionId: question.id,
            attemptQuestionId: snapshot.id,
            text: studentText,
            score: finalScore,
            manualScore: finalScore,
            requiresManual: true,
            gradingSource: "examiner",
            gradingStatus: "examiner_reviewed",
            aiScore,
            aiConfidence: 0.64,
            aiFeedback: JSON.stringify({
              summary: "Basic distinction is present but thin.",
              strengths: ["States identity vs permissions"],
              improvements: ["Add an example of each"],
            }),
            aiGradedAt: new Date(now.getTime() - 8.4 * 24 * 60 * 60 * 1000),
            gradedById: examiner.id,
            gradedAt: new Date(now.getTime() - 8.2 * 24 * 60 * 60 * 1000),
            feedback: "Clear distinction. Added half a mark for the concise wording.",
            aiIdempotencyKey: `${writtenAttempt.id}:seed-ai-2:0`,
          },
        });
        await prisma.gradeAudit.create({
          data: {
            examId: writtenExam.id,
            answerId: answer.id,
            action: "override",
            previousScore: aiScore,
            newScore: finalScore,
            reason: "Examiner override of AI provisional score (seed)",
            gradedById: examiner.id,
          },
        });
      }
    } else {
      const earned = index % 2 === 0 ? question.points : Math.max(0, question.points - 1);
      writtenAuto += earned;
      await prisma.answer.upsert({
        where: { attemptId_questionId: { attemptId: writtenAttempt.id, questionId: question.id } },
        update: {
          attemptQuestionId: snapshot.id,
          text: earned > 0 ? question.answer : "",
          score: earned,
          autoScore: earned,
          gradingSource: "automatic",
          gradingStatus: "skipped",
          requiresManual: false,
        },
        create: {
          attemptId: writtenAttempt.id,
          questionId: question.id,
          attemptQuestionId: snapshot.id,
          text: earned > 0 ? question.answer : "",
          score: earned,
          autoScore: earned,
          gradingSource: "automatic",
          gradingStatus: "skipped",
          requiresManual: false,
        },
      });
    }
  }

  // Pending written grade example on a separate unpublished attempt snapshot field
  // is represented by a draft-like pending answer status on a submitted unpublished paper.
  const pendingWrittenExam = await ensureExam({
    title: "Pending AI Review — Demo Paper",
    description: "Submitted paper awaiting AI/manual written grading (unpublished).",
    instructions: "Used to demo pending written grades.",
    duration: 30,
    startTime: new Date(now.getTime() - 2 * 24 * 60 * 60 * 1000),
    endTime: new Date(now.getTime() - 1 * 24 * 60 * 60 * 1000),
    status: "completed",
    createdById: examiner.id,
    selected: bankQuestions.filter((q) => q.type === "long_answer").slice(0, 1),
  });
  await prisma.examAssignment.upsert({
    where: { examId_userId: { examId: pendingWrittenExam.id, userId: student.id } },
    update: { assignedById: examiner.id },
    create: { examId: pendingWrittenExam.id, userId: student.id, assignedById: examiner.id },
  });
  const pendingQ = await prisma.question.findFirst({ where: { examId: pendingWrittenExam.id } });
  if (pendingQ) {
    const pendingAttempt = await prisma.examAttempt.upsert({
      where: { userId_examId: { userId: student.id, examId: pendingWrittenExam.id } },
      update: {
        status: "submitted",
        startedAt: new Date(now.getTime() - 2 * 24 * 60 * 60 * 1000),
        submittedAt: new Date(now.getTime() - 1 * 24 * 60 * 60 * 1000 + 10 * 60 * 1000),
        autoScore: 0,
        totalScore: null,
        maxScore: pendingQ.points,
      },
      create: {
        userId: student.id,
        examId: pendingWrittenExam.id,
        status: "submitted",
        startedAt: new Date(now.getTime() - 2 * 24 * 60 * 60 * 1000),
        submittedAt: new Date(now.getTime() - 1 * 24 * 60 * 60 * 1000 + 10 * 60 * 1000),
        autoScore: 0,
        totalScore: null,
        maxScore: pendingQ.points,
      },
    });
    const tax = taxonomyFor(pendingQ.text);
    const snapshot = await prisma.attemptQuestion.upsert({
      where: { attemptId_sourceQuestionId: { attemptId: pendingAttempt.id, sourceQuestionId: pendingQ.id } },
      update: {
        text: pendingQ.text,
        type: pendingQ.type,
        options: pendingQ.options,
        answer: pendingQ.answer,
        points: pendingQ.points,
        order: pendingQ.order,
        difficulty: pendingQ.difficulty,
        markingScheme: pendingQ.markingScheme,
        topicName: tax?.topicName ?? null,
        subjectName: tax?.subjectName ?? null,
      },
      create: {
        attemptId: pendingAttempt.id,
        sourceQuestionId: pendingQ.id,
        text: pendingQ.text,
        type: pendingQ.type,
        options: pendingQ.options,
        answer: pendingQ.answer,
        points: pendingQ.points,
        order: pendingQ.order,
        difficulty: pendingQ.difficulty,
        markingScheme: pendingQ.markingScheme,
        topicName: tax?.topicName ?? null,
        subjectName: tax?.subjectName ?? null,
      },
    });
    await prisma.answer.upsert({
      where: { attemptId_questionId: { attemptId: pendingAttempt.id, questionId: pendingQ.id } },
      update: {
        attemptQuestionId: snapshot.id,
        text: "I used prepared statements to keep user input out of the SQL string.",
        score: null,
        requiresManual: true,
        gradingSource: "pending_manual",
        gradingStatus: "pending",
        aiScore: null,
        manualScore: null,
      },
      create: {
        attemptId: pendingAttempt.id,
        questionId: pendingQ.id,
        attemptQuestionId: snapshot.id,
        text: "I used prepared statements to keep user input out of the SQL string.",
        score: null,
        requiresManual: true,
        gradingSource: "pending_manual",
        gradingStatus: "pending",
      },
    });
  }

  await prisma.examAttempt.update({
    where: { id: writtenAttempt.id },
    data: {
      autoScore: writtenAuto,
      manualScore: writtenManual,
      totalScore: writtenAuto + writtenManual,
      maxScore: writtenMaxScore,
      status: "graded",
    },
  });

  const liveQuestions = await prisma.question.findMany({
    where: { examId: liveExam.id },
    orderBy: { order: "asc" },
  });
  const liveAttempt = await prisma.examAttempt.upsert({
    where: { userId_examId: { userId: student.id, examId: liveExam.id } },
    update: { status: "in_progress", submittedAt: null, autoScore: null, totalScore: null },
    create: {
      userId: student.id,
      examId: liveExam.id,
      status: "in_progress",
      startedAt: new Date(now.getTime() - 5 * 60 * 1000),
      maxScore: liveQuestions.reduce((sum, question) => sum + question.points, 0),
    },
  });
  for (let index = 0; index < liveQuestions.length; index += 1) {
    const question = liveQuestions[index]!;
    const snapshot = await prisma.attemptQuestion.upsert({
      where: { attemptId_sourceQuestionId: { attemptId: liveAttempt.id, sourceQuestionId: question.id } },
      update: { text: question.text, type: question.type, options: question.options, answer: question.answer, points: question.points, order: question.order, difficulty: question.difficulty, markingScheme: question.markingScheme },
      create: { attemptId: liveAttempt.id, sourceQuestionId: question.id, text: question.text, type: question.type, options: question.options, answer: question.answer, points: question.points, order: question.order, difficulty: question.difficulty, markingScheme: question.markingScheme },
    });
    if (index === 0) {
      await prisma.answer.upsert({
        where: { attemptId_questionId: { attemptId: liveAttempt.id, questionId: question.id } },
        update: { attemptQuestionId: snapshot.id, text: question.answer, score: null },
        create: { attemptId: liveAttempt.id, questionId: question.id, attemptQuestionId: snapshot.id, text: question.answer },
      });
    }
  }

  console.log("Seeded four roles, question bank, papers, AI/examiner written grades, pending review, and multi-week published results.");
};

main()
  .then(async () => prisma.$disconnect())
  .catch(async (error) => {
    console.error(error);
    await prisma.$disconnect();
    process.exit(1);
  });
