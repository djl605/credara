import "dotenv/config";
import { sql } from "drizzle-orm";
import bcrypt from "bcrypt";
import { createDatabase } from "./index.js";
import * as schema from "./schema.js";

const { db, pool } = createDatabase();

async function seed() {
  console.log("Seeding database...");

  // Truncate all tables (cascade) for idempotent re-runs
  await db.execute(sql`
    TRUNCATE
      student_badges, badge_definitions,
      submission_answers, submissions,
      assignments,
      teacher_favorites,
      collection_lessons, collections,
      media_sources,
      lesson_skills, lessons,
      skills,
      class_students, classes,
      sessions, user_school_roles, users,
      schools,
      question_choices, assessment_questions, assessments
    CASCADE
  `);

  // ── Skills (a few per domain) ────────────────────────────────────────

  type SkillDomain = (typeof schema.skillDomainEnum.enumValues)[number];

  const skillsByDomain: Record<SkillDomain, string[]> = {
    media_literacy: ["Source Evaluation", "Bias Detection", "Fact-Checking"],
    critical_thinking: [
      "Logical Reasoning",
      "Argument Analysis",
      "Evidence Evaluation",
    ],
    reading_comprehension: [
      "Main Idea Identification",
      "Inference",
      "Vocabulary in Context",
    ],
    written_expression: [
      "Thesis Development",
      "Evidence Integration",
      "Clarity and Coherence",
    ],
    digital_citizenship: [
      "Online Safety",
      "Digital Footprint",
      "Responsible Sharing",
    ],
    ai_literacy: [
      "AI Output Evaluation",
      "Prompt Engineering Basics",
      "AI Limitations Awareness",
    ],
  };

  const skillValues = Object.entries(skillsByDomain).flatMap(
    ([domain, skillNames]) =>
      skillNames.map((name) => ({
        name,
        domain: domain as SkillDomain,
      })),
  );

  const createdSkills = await db
    .insert(schema.skills)
    .values(skillValues)
    .returning();

  console.log(`  Created ${createdSkills.length} skills`);

  // ── Test School ──────────────────────────────────────────────────────

  const [school] = await db
    .insert(schema.schools)
    .values({ name: "Demo High School" })
    .returning();

  console.log(`  Created school: ${school.name}`);

  // ── Users (one of each role) ─────────────────────────────────────────

  const passwordHash = await bcrypt.hash("password123", 4);

  const [superadminUser, adminUser, teacherUser, studentUser] = await db
    .insert(schema.users)
    .values([
      { email: "superadmin@credara.com", passwordHash },
      { email: "admin@demo.edu", passwordHash },
      { email: "teacher@demo.edu", passwordHash },
      { email: "student@demo.edu", passwordHash },
    ])
    .returning();

  // ── User-School-Role mappings ────────────────────────────────────────

  await db.insert(schema.userSchoolRoles).values([
    {
      userId: superadminUser.id,
      schoolId: null,
      role: "superadmin",
      firstName: "Super",
      lastName: "Admin",
    },
    {
      userId: adminUser.id,
      schoolId: school.id,
      role: "admin",
      firstName: "School",
      lastName: "Admin",
    },
    {
      userId: teacherUser.id,
      schoolId: school.id,
      role: "teacher",
      firstName: "Jane",
      lastName: "Teacher",
    },
    {
      userId: studentUser.id,
      schoolId: school.id,
      role: "student",
      firstName: "Alex",
      lastName: "Student",
    },
  ]);

  console.log(
    "  Created 4 users with roles (superadmin, admin, teacher, student)",
  );

  // ── Badge Definitions ────────────────────────────────────────────────

  const badges = await db
    .insert(schema.badgeDefinitions)
    .values([
      {
        name: "First Submission",
        description: "Awarded for completing your first assignment submission.",
      },
      {
        name: "Critical Thinker",
        description:
          "Awarded for achieving 80%+ mastery in the Critical Thinking domain.",
      },
    ])
    .returning();

  console.log(`  Created ${badges.length} badge definitions`);

  console.log("Seed complete!");
}

seed()
  .catch((err) => {
    console.error("Seed failed:", err);
    process.exit(1);
  })
  .finally(async () => {
    await pool.end();
  });
