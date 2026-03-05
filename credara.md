Credara - Product description and requirements
-

This document describes the Credara learning software, its intended features, and its requirements. This is a product document, not an engineering design document. Engineering designs should all seek to conform with the product requirements described here.

# Overview

Credara seeks to provide educational resources to schools to teach media literacy skills such as:
* Reading comprehension
* Evaluating source credibility
* Identifying bias in writing
* Recognizing AI-generated content
* General critical thinking

Credara has two main components:

1. A web-based learning management system (LMS) with curated lessons called "Credara Classroom"
2. A Chrome extension that extends the learning from the web application and brings it into the student's daily web browsing called "Credara Companion"

# Features and requirements

## Credara Classroom (LMS)

The web application contains a curated set of lessons on media literacy and digital citizenship.

### Users
There are four types of users of the web application:

1. **Students**
   * Can view lessons assigned to them
   * Can submit assessments in lessons
2. **Teachers**
   * Can view all lessons (in teacher view mode and student view mode)
   * Can create student accounts
   * Can view individual student and aggregated class statistics
   * Can assign lessons to classes or individual students
3. School **admins**
   * Can create teacher accounts
   * Can see and do everything that teachers within their school can do
4. Credara staff (**superadmins**)
   * Can create lessons
   * Can create school admin accounts
   * Can see and do anything a school admin can do

---

### Experiences
#### All Lessons page
* Visible to teachers
* Display lesson cards in a responsive grid layout containing
  * Image
  * Title
  * Short (1 paragraph) description
  * Subject tag (ELA, Social Studies, Journalism, Earth Science)
  * Grade level 
  * Broad Domain tags (Media Literacy, Critical Thinking, etc.)
* Allow filtering by:
  * Subject (ELA, Social Studies, Journalism, Earth Science)
  * Grade (7, 8, 9, 10, 11)
  * Broad Skill Domain:
    * Media Literacy 
    * Critical Thinking 
    * Reading Comprehension 
    * Written Expression 
    * Digital Citizenship 
    * AI Literacy 
    * Collection
* Allow sorting by:
  * Most Recent 
  * Most Assigned 
  * Grade Level 
  * Skill Domain

#### Collections page
* Visible to teachers
* Display collection cards in a responsive grid layout
* Collections refer to a grouping of lessons by topic. Eg:
  * Climate & Environment 
  * Artificial Intelligence 
  * Economics & Trade 
  * Space & Science 
  * Media & Democracy
* Clicking a card brings you to a filtered lessons page

#### Favorites page
* Visible to teachers
* Display lesson cards in a responsive grid layout
* Show lessons the logged in teacher has "starred" as favorites
* Clicking a card brings you to the clicked lesson

#### Classes page
* Visible to teachers
* Display class cards in a responsive grid layout containing:
  * Class name (e.g. Grade 7 ELA, Grade 8 Social Studies, etc)
  * Number of students
  * Class average
* Teachers can see their classes only
* Clicking a card brings you to the class overview page

#### Class Overview page
* Visible to teachers
* Can see their own classes only
* Shows class roster
* Assignment section shows list of assignments
  * Clicking an assignment shows a list of all students and their scores on the assignment
* Class progress section
  * Dropdown to switch between broad skill domains
  * When a domain is selected
    * show a table containing:
      * All students in the class (names clickable)
      * Percentage mastery for that domain
      * Breakdown across that domain's big 5 skills
      * Color-coded proficiency indicators
    * Show class average for the selected domain
    * Bar graph visualization of skill averages

#### Individual Student Profile page
* Visible to teachers
* Show overall mastery percentage
* Domain-level mastery breakdown
* Big 5 breakdown within each domain
* Trend indicators
* Badges earned. E.g.:
  * Expert Fact Checker 
  * Bias Detector 
  * Critical Thinker 
  * Skilled Writer 
  * AI Collaborator 
  * Responsible Digital Citizen
* Recent assignments
* Strengths
* Areas for growth

#### Lesson Detail page
###### Lesson Overview section
* Title 
* Image 
* Description 
* Subject 
* Grade Levels 
* Broad domain tags (Media literacy, Ai Literacy)
* Specific Big 5 tags (skill tags)

###### Media Sources section
* Article
* Video 
* Podcast

May contain one or more than one media sources

###### Teacher Guide section
* Only visible in teacher view mode
* Step-by-step instructions 
* Discussion prompts 
* Vocab Words and definitions 
* Pacing suggestions

###### Assessments
* Lesson may contain 0 or more assessments
* Quizzes (multiple choice)
* Short answer questions
* Writing assignment (1 or more paragraph responses)

In student mode, student can complete and submit the assessment. In teacher mode, teacher can view the questions.

#### Lesson Builder page
* Superadmin page for building and editing lessons
---

### UX Requirements
* Modern SaaS dashboard layout 
* Clean navigation 
* Responsive grid design 
* Interactive filters 
* Functional dropdown switching

---

### Other Requirements
* Bulk roster building
  * CSV import of teacher/student names and emails to create accounts
  * Google Classroom [roster integration](https://developers.google.com/workspace/classroom/tutorials/import-rosters)
* Data Privacy - FERPA & COPPA & PPRA Compliant

---

## Credara Companion (Chrome extension)

TODO