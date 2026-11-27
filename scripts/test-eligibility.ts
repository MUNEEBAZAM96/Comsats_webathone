import assert from "node:assert/strict";
import { addMinutes, subMinutes } from "date-fns";
import {
  getCandidateExamEligibility,
  getStartBlockReason,
} from "../src/lib/exam/eligibility";
import { getEffectiveExamStatus } from "../src/lib/exam/examStatus";

const now = new Date("2026-11-27T10:00:00.000Z");

const exam = (overrides: Partial<Parameters<typeof getCandidateExamEligibility>[0]> = {}) => ({
  status: "published",
  startTime: subMinutes(now, 30),
  endTime: addMinutes(now, 30),
  duration: 20,
  questionCount: 3,
  ...overrides,
});

const cases: [string, () => void][] = [
  ["draft is hidden", () => {
    const e = getCandidateExamEligibility(exam({ status: "draft" }), null, now);
    assert.equal(e.bucket, "hidden");
    assert.equal(getStartBlockReason(exam({ status: "draft" }), now), "This exam is not available");
  }],
  ["before start is upcoming/scheduled", () => {
    const e = getCandidateExamEligibility(exam({ startTime: addMinutes(now, 5) }), null, now);
    assert.deepEqual([e.bucket, e.state, e.action], ["upcoming", "scheduled", "none"]);
    assert.match(
      getStartBlockReason(exam({ startTime: addMinutes(now, 5) }), now) ?? "",
      /This exam will be available on/,
    );
  }],
  ["inside window is available/start", () => {
    const e = getCandidateExamEligibility(exam(), null, now);
    assert.deepEqual([e.bucket, e.state, e.action, e.effectiveStatus], ["available", "available", "start", "ongoing"]);
    assert.equal(getStartBlockReason(exam(), now), null);
  }],
  ["window boundaries are inclusive", () => {
    assert.equal(getEffectiveExamStatus(exam({ startTime: now }), now), "ongoing");
    assert.equal(getEffectiveExamStatus(exam({ endTime: now }), now), "ongoing");
  }],
  ["after end with no attempt is missed", () => {
    const e = getCandidateExamEligibility(exam({ endTime: subMinutes(now, 1) }), null, now);
    assert.deepEqual([e.bucket, e.state], ["completed", "missed"]);
    assert.equal(getStartBlockReason(exam({ endTime: subMinutes(now, 1) }), now), "This exam has ended");
  }],
  ["stored completed is missed", () => {
    const e = getCandidateExamEligibility(exam({ status: "completed" }), null, now);
    assert.equal(e.state, "missed");
  }],
  ["no questions blocks start", () => {
    const e = getCandidateExamEligibility(exam({ questionCount: 0 }), null, now);
    assert.deepEqual([e.state, e.action], ["no_questions", "none"]);
    assert.match(getStartBlockReason(exam({ questionCount: 0 }), now) ?? "", /no questions/);
  }],
  ["in-progress inside deadline resumes", () => {
    const e = getCandidateExamEligibility(exam(), { id: "a", status: "in_progress", startedAt: subMinutes(now, 5) }, now);
    assert.deepEqual([e.bucket, e.state, e.action], ["available", "in_progress", "resume"]);
    assert.equal(e.attemptDeadline?.toISOString(), addMinutes(now, 15).toISOString());
  }],
  ["deadline = min(start+duration, endTime)", () => {
    const e = getCandidateExamEligibility(exam({ endTime: addMinutes(now, 2) }), { id: "a", status: "in_progress", startedAt: subMinutes(now, 1) }, now);
    assert.equal(e.attemptDeadline?.toISOString(), addMinutes(now, 2).toISOString());
  }],
  ["in-progress past duration is time_up (finalize)", () => {
    const e = getCandidateExamEligibility(exam(), { id: "a", status: "in_progress", startedAt: subMinutes(now, 25) }, now);
    assert.deepEqual([e.bucket, e.state, e.action], ["completed", "time_up", "resume"]);
  }],
  ["submitted / graded view result", () => {
    const s = getCandidateExamEligibility(exam(), { id: "a", status: "submitted", startedAt: now }, now);
    const g = getCandidateExamEligibility(exam({ status: "completed" }), { id: "a", status: "graded", startedAt: now }, now);
    assert.deepEqual([s.bucket, s.state, s.action], ["completed", "submitted", "view_result"]);
    assert.equal(g.state, "graded");
  }],
  ["open-ended windows (null bounds) are ongoing", () => {
    assert.equal(getEffectiveExamStatus(exam({ startTime: null, endTime: null }), now), "ongoing");
  }],
];

let failed = 0;
for (const [name, run] of cases) {
  try {
    run();
    console.log(`ok   ${name}`);
  } catch (e) {
    failed++;
    console.error(`FAIL ${name}\n     ${(e as Error).message}`);
  }
}
console.log(`\n${cases.length - failed}/${cases.length} passed`);
if (failed > 0) process.exit(1);
