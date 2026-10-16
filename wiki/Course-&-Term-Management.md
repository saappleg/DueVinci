# Course & Term Management 📂

Classes, terms, units, lessons, and assignments are managed by `js/modules/courses.js` and the academic/planning modules.

## Academic organization

```text
Named term and optional date window
 └── Class, pacing profile, and optional date window
      ├── Units, lessons, reviews, exams, and assignments
      ├── Due dates, priority, effort estimates, and completion
      ├── Percentage grades and GPA exclusion
      ├── Notes, resources, description, and objectives
      └── Note-derived quizzes and flashcards
```

## Find and organize classes

- Give classes a code, icon, and color; use term folders or the alphabetical list.
- Search classes/terms, select classes for a bulk term move, and choose whether completed classes are visible.
- Set class and term start/end dates. Planning and imports use their effective date window; terms can archive after their end date.
- Show archived terms to find or restore older folders. Hiding or archiving a folder does not mean its coursework was deleted.
- Choose manual or supported weekly pacing profiles. Weekly progress follows the current coursework week rather than assuming all overdue work belongs today.

## Start a new term

Open a named term, choose **Start a new term**, enter a distinct name and optional dates, then create it.

Rollover copies class shells: name/code, icon/color, and pacing type. Old coursework stays in the original term. The copies start incomplete with empty class dates and without old assignments, grades, notes, or LMS identities. Source-course keys prevent duplicate copies from a retried rollover. A new term is not a live duplicate of the old term; review dates and add/import the new coursework separately.

## Assignment management

Coursework supports a title, unit, date, task type, priority, effort estimate, and completion state. Dates can be planned in curriculum order or rescheduled using the existing controls. Grades accepts percentage values and an Exclude choice; [Grades & GPA](Grade-Tracker-&-GPA-Calculator) explains the calculation limits.

The current UI does not provide custom weighted grading categories, credit-hour accounting, a Pending/In Progress/Graded status workflow, or drag-and-drop category sorting. Use the existing manual fields and [syllabus import](AI-Syllabus-&-Document-Parser) for the supported workflow.

Calendar events can be explicitly [converted to assignments](Calendar-&-Schedule-Sync), preserving the original event. DueVinci Pro adds connected Canvas imports; the free course/task workflow remains available without a subscription.
