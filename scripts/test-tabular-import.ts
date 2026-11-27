/**
 * Tabular import unit checks (no DB / no auth).
 * Run: npx tsx scripts/test-tabular-import.ts
 */
import assert from "node:assert/strict";
import { bankQuestionImportRowSchema } from "../src/features/imports/schemas/csvSchemas";
import { getReadableImportError } from "../src/features/imports/lib/readableImportError";
import {
  MAX_BYTES,
  parseCsvText,
  stripUtf8Bom,
} from "../src/features/imports/services/parseTabular";

const headers =
  "text,type,options,answer,points,difficulty,topicId,markingScheme";

const valid = parseCsvText(
  `${headers}\nWhat is 2+2?,single_choice,"3\n4\n5",4,1,easy,TOPIC_UUID,\n`,
  bankQuestionImportRowSchema,
  ["text", "type", "options", "answer", "points", "difficulty", "topicId"],
);
assert.equal(valid.invalid.length, 0);
assert.equal(valid.valid.length, 1);
assert.equal(valid.validRowNumbers[0], 2);
assert.ok(valid.valid[0]?.options.includes("\n"));

const quotedComma = parseCsvText(
  `${headers}\n"Hello, world?",single_choice,"A,1\nB,2",A\\,1,1,easy,TOPIC_UUID,\n`.replace(
    "A\\,1",
    '"A,1"',
  ),
  bankQuestionImportRowSchema,
  ["text", "type", "options", "answer", "points", "difficulty", "topicId"],
);
assert.equal(quotedComma.valid[0]?.text, "Hello, world?");

const unicode = parseCsvText(
  `${headers}\nپاکستان کا دارالحکومت؟,single_choice,"اسلام آباد\nکراچی",اسلام آباد,1,easy,TOPIC_UUID,\n`,
  bankQuestionImportRowSchema,
  ["text", "type", "options", "answer", "points", "difficulty", "topicId"],
);
assert.ok(unicode.valid[0]?.text.includes("پاکستان"));

const bom = parseCsvText(
  `\uFEFF${headers}\nQ?,true_false,,True,1,easy,TOPIC_UUID,\n`,
  bankQuestionImportRowSchema,
  ["text", "type", "options", "answer", "points", "difficulty", "topicId"],
);
assert.equal(bom.valid.length, 1);
assert.equal(stripUtf8Bom("\uFEFFtext"), "text");

assert.throws(
  () =>
    parseCsvText(
      "name,email\nJane,jane@example.com\n",
      bankQuestionImportRowSchema,
      ["text", "type", "options", "answer", "points", "difficulty", "topicId"],
    ),
  /Missing required column/,
);

assert.throws(
  () =>
    parseCsvText(
      "text,type,options,answer,points,difficulty,topicId,text\nx,single_choice,\"A\nB\",A,1,easy,T,\n",
      bankQuestionImportRowSchema,
      ["text", "type", "options", "answer", "points", "difficulty", "topicId"],
    ),
  /Duplicate column/,
);

const badType = parseCsvText(
  `${headers}\nQ?,not_a_type,"A\nB",A,1,easy,TOPIC_UUID,\n`,
  bankQuestionImportRowSchema,
  ["text", "type", "options", "answer", "points", "difficulty", "topicId"],
);
assert.ok(badType.invalid.some((row) => row.row === 2));

const badAnswer = parseCsvText(
  `${headers}\nQ?,single_choice,"A\nB",C,1,easy,TOPIC_UUID,\n`,
  bankQuestionImportRowSchema,
  ["text", "type", "options", "answer", "points", "difficulty", "topicId"],
);
assert.ok(
  badAnswer.invalid.some((row) => /answer/i.test(row.message)),
  JSON.stringify(badAnswer.invalid),
);

assert.equal(
  getReadableImportError(new Error("The file exceeds the 2 MB limit.")),
  "The file exceeds the 2 MB limit.",
);
assert.equal(
  getReadableImportError(new Error("Missing required column: topicId")),
  "A required column is missing.",
);
assert.equal(
  getReadableImportError(new Error("Minified React error #441")),
  "The server could not process this file. Check the server logs.",
);
assert.equal(
  getReadableImportError(new Error("Can't reach database server at postgres")),
  "The server could not process this file. Check the server logs.",
);
assert.ok(MAX_BYTES === 2 * 1024 * 1024);

console.log("tabular-import checks passed");
