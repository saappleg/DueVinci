# Data Backup & Cloud Sync 🔄

DueVinci ensures student data is never locked in or lost through comprehensive **JSON export/import capabilities** and seamless **Supabase Cloud Synchronization**.

---

## 💾 Local JSON Backup Engine (`js/modules/backup.js`)

You can export a complete, portable JSON snapshot of your entire DueVinci workspace at any time.

### Export Format Specification (`v1.2`)
```json
{
  "schemaVersion": "1.2.0",
  "exportedAt": "2026-08-21T06:00:00.000Z",
  "user": {
    "settings": {
      "theme": "dark",
      "gpaScale": "4.0",
      "timerIntervals": { "focus": 25, "shortBreak": 5, "longBreak": 15 }
    }
  },
  "terms": [
    {
      "id": "term-fall-2026",
      "name": "Fall 2026",
      "startDate": "2026-09-01",
      "endDate": "2026-12-20",
      "isCurrent": true,
      "courses": [
        {
          "id": "course-cs101",
          "name": "Introduction to Computer Science",
          "code": "CS 101",
          "color": "#10b981",
          "credits": 4,
          "categories": [
            { "id": "cat-hw", "name": "Homework", "weight": 40 },
            { "id": "cat-exam", "name": "Exams", "weight": 60 }
          ],
          "assignments": [
            {
              "id": "asg-1",
              "categoryId": "cat-hw",
              "title": "Problem Set 1",
              "dueDate": "2026-09-15T23:59:00",
              "score": 95,
              "maxPoints": 100,
              "completed": true
            }
          ]
        }
      ]
    }
  ],
  "flashcardDecks": [],
  "studyPlans": []
}
```

### Automated Schema Migration
When importing a backup from an older version (e.g. `v1.0.0`), `backup.js` automatically runs schema migration transformations to backfill missing fields and validate data integrity before committing to the database.

---

## ☁️ Supabase Cloud Synchronization

When a user logs in via Supabase Authentication (Magic Link or Email/Password):
1. **Initial Sync**: Local offline data is merged with the user's remote PostgreSQL tables.
2. **Row-Level Security (RLS)**: PostgreSQL tables are protected with strict RLS policies ensuring users can only read and mutate their own academic records:
   ```sql
   CREATE POLICY "Users can only access their own courses"
   ON courses FOR ALL
   USING (auth.uid() = user_id);
   ```
3. **Conflict Resolution**: Last-Write-Wins (LWW) based on timestamps, preserving data continuity across multiple devices (e.g., laptop and phone).
