import { createAccessControl } from "better-auth/plugins/access";
import { defaultStatements, adminAc } from "better-auth/plugins/admin/access";

const statement = {
  ...defaultStatements,
  exam: [
    "create",
    "read",
    "update",
    "delete",
    "publish",
    "assign",
    "monitor",
  ] as const,
  result: ["read", "export", "delete", "grade", "publish"] as const,
} as const;

const ac = createAccessControl(statement);

const adminRole = ac.newRole({
  exam: ["create", "read", "update", "delete", "publish", "assign", "monitor"],
  result: ["read", "export", "delete", "grade", "publish"],
  ...adminAc.statements,
});

const examiner = ac.newRole({
  exam: ["create", "read", "update", "monitor"],
  result: ["read", "export", "grade", "publish"],
});

const proctor = ac.newRole({
  exam: ["read", "monitor"],
  result: ["read"],
  session: ["list"],
});

const student = ac.newRole({});

export { ac, adminRole, examiner, proctor, student, statement };
