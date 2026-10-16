# Nursing Hub 🩺

The Nursing Hub is an optional, free student workspace for organizing nursing coursework and reviewing basic study prompts. It stays out of the sidebar until enabled.

## Enable or hide the Hub

1. Open the profile menu and choose **Settings**.
2. Open **Appearance** and enable **Nursing Hub**.
3. Open **Nursing** from the sidebar.

Turning the feature off hides it but preserves its workspace. Enable it again to continue. Its nursing degree theme can be selected in the same Appearance section.

## What it includes

- **Clinical tracker:** add generic rotation labels, dates, a linked course, and skills you want to practice or track.
- **Care-plan studio:** organize your own work around fictional practice cases. The form requires confirmation that the scenario is fictional.
- **Dosage practice:** work through synthetic arithmetic questions that use no drug names. These are coursework exercises, not a dosing tool.
- **Flashcards:** review starter prompts or create cards from course-approved study notes.
- **Anatomy studio:** review eleven basic body-system topics and mark topics for later.
- **Quick review:** start a queue of up to ten due flashcards, unfinished dosage exercises, and anatomy topics not yet marked reviewed. The queue is built from existing Hub data and is not stored as a separate progress record. Opening an item takes you to its existing tool; completing it updates that tool’s saved progress.

## Saving and privacy

Workspace data saves locally first and syncs through the signed-in account’s protected `user_preferences` record while online. Practice progress stays in the existing Nursing workspace format, so the quick-review queue does not add a new data category. Check the [Privacy Policy](https://duevinci.tech/legal/privacy.html) for the data categories and account-deletion behavior.

**Use fictional study content only. Never enter real patient information**, including names, dates of birth, room numbers, photographs, or details that could identify someone. Do not use the Hub to store clinical documentation or guide patient care. Follow your course materials, instructor, and program policy.

## Verify changes

Run `npm test -- tests/nursing.test.js tests/scrollAids.test.js` and then `npm test`. Check the Hub and Settings in both light and dark modes and at narrow mobile widths.
