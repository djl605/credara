import { relations } from "drizzle-orm";
import {
  boolean,
  index,
  numeric,
  pgEnum,
  pgTable,
  primaryKey,
  smallint,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";

// ── Enums ──────────────────────────────────────────────────────────────

export const userRoleEnum = pgEnum("user_role", [
  "superadmin",
  "admin",
  "teacher",
  "student",
]);

export const subjectEnum = pgEnum("subject", [
  "ela",
  "social_studies",
  "journalism",
  "earth_science",
]);

export const skillDomainEnum = pgEnum("skill_domain", [
  "media_literacy",
  "critical_thinking",
  "reading_comprehension",
  "written_expression",
  "digital_citizenship",
  "ai_literacy",
]);

export const questionTypeEnum = pgEnum("question_type", [
  "multiple_choice",
  "short_answer",
  "writing",
]);

export const mediaTypeEnum = pgEnum("media_type", [
  "article",
  "video",
  "podcast",
]);

export const submissionStatusEnum = pgEnum("submission_status", [
  "in_progress",
  "submitted",
  "graded",
]);

// ── Tables ─────────────────────────────────────────────────────────────

export const users = pgTable("users", {
  id: uuid().primaryKey().defaultRandom(),
  email: varchar({ length: 255 }).notNull().unique(),
  passwordHash: varchar("password_hash", { length: 255 }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
});

export const userSchoolRoles = pgTable(
  "user_school_roles",
  {
    id: uuid().primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    schoolId: uuid("school_id").references(() => schools.id, {
      onDelete: "cascade",
    }),
    role: userRoleEnum().notNull(),
    firstName: varchar("first_name", { length: 100 }).notNull(),
    lastName: varchar("last_name", { length: 100 }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex("user_school_roles_user_school_role_idx").on(
      table.userId,
      table.schoolId,
      table.role,
    ),
    index("user_school_roles_user_id_idx").on(table.userId),
    index("user_school_roles_school_id_idx").on(table.schoolId),
  ],
);

export const sessions = pgTable(
  "sessions",
  {
    id: varchar({ length: 255 }).primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    userSchoolRoleId: uuid("user_school_role_id")
      .notNull()
      .references(() => userSchoolRoles.id, { onDelete: "cascade" }),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("sessions_user_id_idx").on(table.userId),
    index("sessions_expires_at_idx").on(table.expiresAt),
  ],
);

export const schools = pgTable("schools", {
  id: uuid().primaryKey().defaultRandom(),
  name: varchar({ length: 255 }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
});

export const classes = pgTable(
  "classes",
  {
    id: uuid().primaryKey().defaultRandom(),
    name: varchar({ length: 255 }).notNull(),
    schoolId: uuid("school_id")
      .notNull()
      .references(() => schools.id),
    teacherId: uuid("teacher_id")
      .notNull()
      .references(() => users.id),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    index("classes_school_id_idx").on(table.schoolId),
    index("classes_teacher_id_idx").on(table.teacherId),
  ],
);

export const classStudents = pgTable(
  "class_students",
  {
    classId: uuid("class_id")
      .notNull()
      .references(() => classes.id, { onDelete: "cascade" }),
    studentId: uuid("student_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
  },
  (table) => [primaryKey({ columns: [table.classId, table.studentId] })],
);

export const skills = pgTable(
  "skills",
  {
    id: uuid().primaryKey().defaultRandom(),
    name: varchar({ length: 100 }).notNull(),
    domain: skillDomainEnum().notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex("skills_name_domain_idx").on(table.name, table.domain),
  ],
);

export const lessons = pgTable(
  "lessons",
  {
    id: uuid().primaryKey().defaultRandom(),
    title: varchar({ length: 255 }).notNull(),
    description: text().notNull(),
    imageUrl: varchar("image_url", { length: 500 }),
    subject: subjectEnum().notNull(),
    gradeLevels: smallint("grade_levels").array().notNull(),
    createdBy: uuid("created_by")
      .notNull()
      .references(() => users.id),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [index("lessons_subject_idx").on(table.subject)],
);

export const lessonSkills = pgTable(
  "lesson_skills",
  {
    lessonId: uuid("lesson_id")
      .notNull()
      .references(() => lessons.id, { onDelete: "cascade" }),
    skillId: uuid("skill_id")
      .notNull()
      .references(() => skills.id, { onDelete: "cascade" }),
  },
  (table) => [primaryKey({ columns: [table.lessonId, table.skillId] })],
);

export const mediaSources = pgTable("media_sources", {
  id: uuid().primaryKey().defaultRandom(),
  lessonId: uuid("lesson_id")
    .notNull()
    .references(() => lessons.id, { onDelete: "cascade" }),
  type: mediaTypeEnum().notNull(),
  title: varchar({ length: 255 }).notNull(),
  url: varchar({ length: 500 }).notNull(),
  sortOrder: smallint("sort_order").notNull().default(0),
});

export const collections = pgTable("collections", {
  id: uuid().primaryKey().defaultRandom(),
  name: varchar({ length: 255 }).notNull().unique(),
  description: text(),
  imageUrl: varchar("image_url", { length: 500 }),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
});

export const collectionLessons = pgTable(
  "collection_lessons",
  {
    collectionId: uuid("collection_id")
      .notNull()
      .references(() => collections.id, { onDelete: "cascade" }),
    lessonId: uuid("lesson_id")
      .notNull()
      .references(() => lessons.id, { onDelete: "cascade" }),
    sortOrder: smallint("sort_order").notNull().default(0),
  },
  (table) => [primaryKey({ columns: [table.collectionId, table.lessonId] })],
);

export const assessments = pgTable("assessments", {
  id: uuid().primaryKey().defaultRandom(),
  lessonId: uuid("lesson_id")
    .notNull()
    .references(() => lessons.id, { onDelete: "cascade" }),
  title: varchar({ length: 255 }).notNull(),
  sortOrder: smallint("sort_order").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const assessmentQuestions = pgTable("assessment_questions", {
  id: uuid().primaryKey().defaultRandom(),
  assessmentId: uuid("assessment_id")
    .notNull()
    .references(() => assessments.id, { onDelete: "cascade" }),
  type: questionTypeEnum().notNull(),
  questionText: text("question_text").notNull(),
  sortOrder: smallint("sort_order").notNull().default(0),
});

export const questionChoices = pgTable("question_choices", {
  id: uuid().primaryKey().defaultRandom(),
  questionId: uuid("question_id")
    .notNull()
    .references(() => assessmentQuestions.id, { onDelete: "cascade" }),
  choiceText: varchar("choice_text", { length: 500 }).notNull(),
  isCorrect: boolean("is_correct").notNull().default(false),
  sortOrder: smallint("sort_order").notNull().default(0),
});

export const assignments = pgTable(
  "assignments",
  {
    id: uuid().primaryKey().defaultRandom(),
    lessonId: uuid("lesson_id")
      .notNull()
      .references(() => lessons.id),
    classId: uuid("class_id")
      .notNull()
      .references(() => classes.id),
    assignedBy: uuid("assigned_by")
      .notNull()
      .references(() => users.id),
    dueDate: timestamp("due_date", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [index("assignments_class_id_idx").on(table.classId)],
);

export const submissions = pgTable(
  "submissions",
  {
    id: uuid().primaryKey().defaultRandom(),
    assignmentId: uuid("assignment_id")
      .notNull()
      .references(() => assignments.id),
    studentId: uuid("student_id")
      .notNull()
      .references(() => users.id),
    status: submissionStatusEnum().notNull().default("in_progress"),
    submittedAt: timestamp("submitted_at", { withTimezone: true }),
    gradedAt: timestamp("graded_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex("submissions_assignment_student_idx").on(
      table.assignmentId,
      table.studentId,
    ),
    index("submissions_student_id_idx").on(table.studentId),
  ],
);

export const submissionAnswers = pgTable(
  "submission_answers",
  {
    id: uuid().primaryKey().defaultRandom(),
    submissionId: uuid("submission_id")
      .notNull()
      .references(() => submissions.id, { onDelete: "cascade" }),
    questionId: uuid("question_id")
      .notNull()
      .references(() => assessmentQuestions.id, { onDelete: "cascade" }),
    answerText: text("answer_text"),
    selectedChoiceId: uuid("selected_choice_id").references(
      () => questionChoices.id,
      { onDelete: "cascade" },
    ),
    score: numeric({ precision: 5, scale: 2 }),
    maxScore: numeric("max_score", { precision: 5, scale: 2 }).notNull(),
    feedback: text(),
  },
  (table) => [
    uniqueIndex("submission_answers_submission_question_idx").on(
      table.submissionId,
      table.questionId,
    ),
  ],
);

export const teacherFavorites = pgTable(
  "teacher_favorites",
  {
    teacherId: uuid("teacher_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    lessonId: uuid("lesson_id")
      .notNull()
      .references(() => lessons.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [primaryKey({ columns: [table.teacherId, table.lessonId] })],
);

export const badgeDefinitions = pgTable("badge_definitions", {
  id: uuid().primaryKey().defaultRandom(),
  name: varchar({ length: 100 }).notNull().unique(),
  description: text(),
  iconUrl: varchar("icon_url", { length: 500 }),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const studentBadges = pgTable(
  "student_badges",
  {
    studentId: uuid("student_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    badgeId: uuid("badge_id")
      .notNull()
      .references(() => badgeDefinitions.id, { onDelete: "cascade" }),
    earnedAt: timestamp("earned_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [primaryKey({ columns: [table.studentId, table.badgeId] })],
);

// ── Relations ──────────────────────────────────────────────────────────

export const usersRelations = relations(users, ({ many }) => ({
  schoolRoles: many(userSchoolRoles),
  sessions: many(sessions),
}));

export const userSchoolRolesRelations = relations(
  userSchoolRoles,
  ({ one }) => ({
    user: one(users, {
      fields: [userSchoolRoles.userId],
      references: [users.id],
    }),
    school: one(schools, {
      fields: [userSchoolRoles.schoolId],
      references: [schools.id],
    }),
  }),
);

export const sessionsRelations = relations(sessions, ({ one }) => ({
  user: one(users, {
    fields: [sessions.userId],
    references: [users.id],
  }),
  userSchoolRole: one(userSchoolRoles, {
    fields: [sessions.userSchoolRoleId],
    references: [userSchoolRoles.id],
  }),
}));

export const schoolsRelations = relations(schools, ({ many }) => ({
  userSchoolRoles: many(userSchoolRoles),
  classes: many(classes),
}));

export const classesRelations = relations(classes, ({ one, many }) => ({
  school: one(schools, {
    fields: [classes.schoolId],
    references: [schools.id],
  }),
  teacher: one(users, {
    fields: [classes.teacherId],
    references: [users.id],
  }),
  students: many(classStudents),
  assignments: many(assignments),
}));

export const classStudentsRelations = relations(classStudents, ({ one }) => ({
  class: one(classes, {
    fields: [classStudents.classId],
    references: [classes.id],
  }),
  student: one(users, {
    fields: [classStudents.studentId],
    references: [users.id],
  }),
}));

export const skillsRelations = relations(skills, ({ many }) => ({
  lessonSkills: many(lessonSkills),
}));

export const lessonsRelations = relations(lessons, ({ one, many }) => ({
  creator: one(users, {
    fields: [lessons.createdBy],
    references: [users.id],
  }),
  lessonSkills: many(lessonSkills),
  mediaSources: many(mediaSources),
  assessments: many(assessments),
  collectionLessons: many(collectionLessons),
}));

export const lessonSkillsRelations = relations(lessonSkills, ({ one }) => ({
  lesson: one(lessons, {
    fields: [lessonSkills.lessonId],
    references: [lessons.id],
  }),
  skill: one(skills, {
    fields: [lessonSkills.skillId],
    references: [skills.id],
  }),
}));

export const mediaSourcesRelations = relations(mediaSources, ({ one }) => ({
  lesson: one(lessons, {
    fields: [mediaSources.lessonId],
    references: [lessons.id],
  }),
}));

export const collectionsRelations = relations(collections, ({ many }) => ({
  collectionLessons: many(collectionLessons),
}));

export const collectionLessonsRelations = relations(
  collectionLessons,
  ({ one }) => ({
    collection: one(collections, {
      fields: [collectionLessons.collectionId],
      references: [collections.id],
    }),
    lesson: one(lessons, {
      fields: [collectionLessons.lessonId],
      references: [lessons.id],
    }),
  }),
);

export const assessmentsRelations = relations(assessments, ({ one, many }) => ({
  lesson: one(lessons, {
    fields: [assessments.lessonId],
    references: [lessons.id],
  }),
  questions: many(assessmentQuestions),
}));

export const assessmentQuestionsRelations = relations(
  assessmentQuestions,
  ({ one, many }) => ({
    assessment: one(assessments, {
      fields: [assessmentQuestions.assessmentId],
      references: [assessments.id],
    }),
    choices: many(questionChoices),
  }),
);

export const questionChoicesRelations = relations(
  questionChoices,
  ({ one }) => ({
    question: one(assessmentQuestions, {
      fields: [questionChoices.questionId],
      references: [assessmentQuestions.id],
    }),
  }),
);

export const assignmentsRelations = relations(assignments, ({ one, many }) => ({
  lesson: one(lessons, {
    fields: [assignments.lessonId],
    references: [lessons.id],
  }),
  class: one(classes, {
    fields: [assignments.classId],
    references: [classes.id],
  }),
  assigner: one(users, {
    fields: [assignments.assignedBy],
    references: [users.id],
  }),
  submissions: many(submissions),
}));

export const submissionsRelations = relations(submissions, ({ one, many }) => ({
  assignment: one(assignments, {
    fields: [submissions.assignmentId],
    references: [assignments.id],
  }),
  student: one(users, {
    fields: [submissions.studentId],
    references: [users.id],
  }),
  answers: many(submissionAnswers),
}));

export const submissionAnswersRelations = relations(
  submissionAnswers,
  ({ one }) => ({
    submission: one(submissions, {
      fields: [submissionAnswers.submissionId],
      references: [submissions.id],
    }),
    question: one(assessmentQuestions, {
      fields: [submissionAnswers.questionId],
      references: [assessmentQuestions.id],
    }),
    selectedChoice: one(questionChoices, {
      fields: [submissionAnswers.selectedChoiceId],
      references: [questionChoices.id],
    }),
  }),
);

export const teacherFavoritesRelations = relations(
  teacherFavorites,
  ({ one }) => ({
    teacher: one(users, {
      fields: [teacherFavorites.teacherId],
      references: [users.id],
    }),
    lesson: one(lessons, {
      fields: [teacherFavorites.lessonId],
      references: [lessons.id],
    }),
  }),
);

export const badgeDefinitionsRelations = relations(
  badgeDefinitions,
  ({ many }) => ({
    studentBadges: many(studentBadges),
  }),
);

export const studentBadgesRelations = relations(studentBadges, ({ one }) => ({
  student: one(users, {
    fields: [studentBadges.studentId],
    references: [users.id],
  }),
  badge: one(badgeDefinitions, {
    fields: [studentBadges.badgeId],
    references: [badgeDefinitions.id],
  }),
}));
