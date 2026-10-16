import { describe, expect, it } from "vitest";
import {
  announcementVisible, can, canGradeSubjectInClass, canManageClass, canViewStudent, isDirector, scopeOf, teacherClassIds, withinEditWindow,
} from "@/lib/school/permissions";
import type { SchoolRole, SchoolSession } from "@/lib/school/types";

const sess = (role: SchoolRole, over: Partial<SchoolSession> = {}): SchoolSession => ({ id: `u-${role}`, email: `${role}@x.uz`, name: role, role, demo: true, teacherId: null, studentIds: [], ...over });
const classes = [{ id: "c1", homeroom_teacher_id: "t1" }, { id: "c2", homeroom_teacher_id: "t2" }, { id: "c3", homeroom_teacher_id: null }];
const asg = [
  { class_id: "c1", subject_id: "math", teacher_id: "t1" },
  { class_id: "c2", subject_id: "math", teacher_id: "t2" },
  { class_id: "c3", subject_id: "math", teacher_id: "t1" },
  { class_id: "c3", subject_id: "phys", teacher_id: "t2" },
];

describe("permission matrix", () => {
  it("directors have full scope, others as documented", () => {
    expect(isDirector(sess("school_admin"))).toBe(true);
    expect(isDirector(sess("super_admin"))).toBe(true);
    expect(isDirector(sess("teacher"))).toBe(false);
    expect(scopeOf("school_admin", "students", "write")).toBe("all");
    expect(scopeOf("teacher", "students", "write")).toBe("none");
    expect(scopeOf("teacher", "attendance", "write")).toBe("own_classes");
    expect(scopeOf("teacher", "grades", "write")).toBe("own_subject_classes");
    expect(scopeOf("parent", "students", "read")).toBe("own_children");
    expect(scopeOf("student", "students", "read")).toBe("self");
    expect(can("parent", "grades", "write")).toBe(false);
    expect(can("student", "attendance", "write")).toBe(false);
    expect(can("parent", "import", "read")).toBe(false);
    expect(can("teacher", "accounts", "write")).toBe(false);
  });
});

describe("teacher ownership", () => {
  const t1 = sess("teacher", { teacherId: "t1" });
  const t2 = sess("teacher", { teacherId: "t2" });
  it("class ids = taught classes + homeroom", () => {
    expect([...teacherClassIds(t1, classes, asg)].sort()).toEqual(["c1", "c3"]);
    expect([...teacherClassIds(t2, classes, asg)].sort()).toEqual(["c2", "c3"]);
    expect(teacherClassIds(sess("teacher"), classes, asg).size).toBe(0);
  });
  it("homeroom teacher manages the whole class even without a subject there", () => {
    const ids = teacherClassIds(sess("teacher", { teacherId: "t2" }), [{ id: "c9", homeroom_teacher_id: "t2" }], []);
    expect(canManageClass(sess("teacher", { teacherId: "t2" }), "c9", ids)).toBe(true);
  });
  it("attendance: own classes only; grades: only own subject in the class", () => {
    const ids1 = teacherClassIds(t1, classes, asg);
    expect(canManageClass(t1, "c1", ids1)).toBe(true);
    expect(canManageClass(t1, "c2", ids1)).toBe(false);
    expect(canGradeSubjectInClass(t1, asg, "c3", "math")).toBe(true);
    expect(canGradeSubjectInClass(t1, asg, "c3", "phys")).toBe(false);
    expect(canGradeSubjectInClass(t1, asg, "c2", "math")).toBe(false);
    expect(canGradeSubjectInClass(sess("parent"), asg, "c1", "math")).toBe(false);
    expect(canGradeSubjectInClass(sess("school_admin"), asg, "c2", "math")).toBe(true);
  });
});

describe("student visibility", () => {
  const ids = new Set(["c1"]);
  it("director all, teacher own classes, parent children, student self", () => {
    expect(canViewStudent(sess("school_admin"), { id: "s1", class_id: "c9" }, new Set())).toBe(true);
    expect(canViewStudent(sess("teacher", { teacherId: "t1" }), { id: "s1", class_id: "c1" }, ids)).toBe(true);
    expect(canViewStudent(sess("teacher", { teacherId: "t1" }), { id: "s2", class_id: "c2" }, ids)).toBe(false);
    expect(canViewStudent(sess("teacher", { teacherId: "t1" }), { id: "s3", class_id: null }, ids)).toBe(false);
    expect(canViewStudent(sess("parent", { studentIds: ["s1"] }), { id: "s1", class_id: "c1" }, new Set())).toBe(true);
    expect(canViewStudent(sess("parent", { studentIds: ["s1"] }), { id: "s2", class_id: "c1" }, new Set())).toBe(false);
    expect(canViewStudent(sess("student", { studentIds: ["s5"] }), { id: "s5", class_id: "c1" }, new Set())).toBe(true);
    expect(canViewStudent(sess("student", { studentIds: ["s5"] }), { id: "s6", class_id: "c1" }, new Set())).toBe(false);
  });
});

describe("edit window + announcements", () => {
  it("teachers may edit 14 days back, directors always", () => {
    expect(withinEditWindow(sess("teacher"), "2026-10-01", "2026-10-15")).toBe(true);
    expect(withinEditWindow(sess("teacher"), "2026-09-30", "2026-10-15")).toBe(false);
    expect(withinEditWindow(sess("school_admin"), "2020-01-01", "2026-10-15")).toBe(true);
  });
  it("announcement audiences", () => {
    const now = new Date("2026-10-15T10:00:00Z");
    const a = (audience: string, class_id: string | null = null, publish_at = "2026-10-15T08:00:00Z") => ({ audience, class_id, publish_at });
    const vis = new Set(["c1"]);
    expect(announcementVisible(sess("parent"), a("all"), now, vis)).toBe(true);
    expect(announcementVisible(sess("parent"), a("teachers"), now, vis)).toBe(false);
    expect(announcementVisible(sess("teacher"), a("teachers"), now, vis)).toBe(true);
    expect(announcementVisible(sess("student"), a("parents"), now, vis)).toBe(false);
    expect(announcementVisible(sess("parent"), a("class", "c1"), now, vis)).toBe(true);
    expect(announcementVisible(sess("parent"), a("class", "c2"), now, vis)).toBe(false);
    expect(announcementVisible(sess("parent"), a("all", null, "2026-10-16T00:00:00Z"), now, vis)).toBe(false);
    expect(announcementVisible(sess("school_admin"), a("all", null, "2026-10-16T00:00:00Z"), now, vis)).toBe(true);
  });
});
