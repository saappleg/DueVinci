# FAQ & Troubleshooting ❓

## Frequently asked questions

### Is an internet connection required?

After an online sign-in and successful caching, supported free-planner data and pages can remain available offline. Planner changes queue for replay after reconnecting. Sign-in, AI/Tutor requests, Canvas/Brightspace, billing, support, and account deletion need a connection. Keep the app open until pending synchronization completes; export a backup before relying on a long offline session.

Localhost previews deliberately do not use DueVinci's service worker. See [Offline Support & PWA](Offline-Support-&-PWA).

### Where are Settings and its sections?

Click the profile card at the bottom of the sidebar. Settings contains **Profile**, **Appearance**, **Study & Reminders**, **Cloud & Backup**, **Privacy & AI**, and **Subscription**. At narrow widths, scroll the section list horizontally to reach later sections, then scroll inside the content pane for lower controls.

Settings opens before optional preferences and subscription checks finish. Close with its X or Escape; focus returns to the opener when it remains available. On mobile, the menu button opens the drawer, Tab stays inside it, and Escape closes it and returns focus.

### How do I change the GPA scale?

Open Settings → Appearance → **GPA Scale Target**, then choose 4.0 or 5.0. DueVinci supports configured grade-category weights and course-credit weighting, but scales percentages linearly and does not implement a school's letter-grade conversion or repeat-course policy. See [Grades & GPA](Grade-Tracker-&-GPA-Calculator).

### Can I use Google, Apple, or Outlook calendar files?

Yes. Calendar → **Import .ICS** reviews dated rows before saving and skips matching title/date duplicates. **Export .ICS** downloads the currently loaded schedule as date-based entries. These files are not two-way account synchronization. Pro also supports read-only Google Calendar and Outlook connections once the provider OAuth clients and callback are configured: the first sync runs after you connect, and you start later syncs.

Click a custom/imported calendar event, choose a class, and select **Create assignment** to add coursework while keeping the original event. A duplicate or out-of-window class date is reported instead of creating another assignment.

### Why is Study Companion locked or unavailable?

The Tutor requires current Pro or eligible trial access and a network connection. Settings → Subscription shows the account's status. A loading failure offers **Try again**; provider or allowance errors appear in the conversation. Daily/monthly usage is shown in UTC. The conversation is kept in the current page, not a saved chat archive.

Choose **General study help** to avoid selected-course context. Selecting a course can send its description, objectives, notes, and assignment context to the configured AI provider. Do not enter real patient information or ask it to complete graded submissions.

### Which study features need opt-in?

Settings → Study & Reminders contains Pro personalized estimates and Canvas assignment/grade alerts. Completing coursework successfully records a study day for the streak without requiring a timer. In Daily Brief, if no linked focus session was completed for an item on this device that day, you can enter an optional approximate time. Those minutes enter personalized study history only when the Pro setting is enabled, and remain separate from focus-session totals. Each history save retains at most the newest 180 focus sessions, 120 task completions, and 120 self-reports, while older entries may be dropped. Turning personalization off pauses new history capture; **Clear history** removes saved history through preference sync. Assignment alerts follow a Canvas sync. Posted-grade alerts need an initial baseline, scheduled refresh, configured scheduler/Web Push secrets, and browser push permission on each receiving device.

## Troubleshooting

### Settings opens but a section appears empty, clipped, or offset

Refresh the deployed app after a release has loaded. Check the section list and scroll inside the modal, especially on mobile. A visible scroll aid is placed within its active pane and hidden when no safe location exists. If the issue remains, report the route, section, browser, theme, viewport, and a screenshot without private data. A passing public smoke test alone does not exercise signed-in Settings.

### Local preview still shows old code or cannot sign in

Serve the actual checkout over HTTP. DueVinci removes only its matching worker on loopback hosts; reload a page that was already controlled. Do not clear all site storage as a first step, because it can contain unsynced work. Localhost and the live site have separate sessions. For an independent backend, verify its project settings and permitted authentication return URL.

### Syllabus AI fails

Check connectivity and sign-in first. Operators should verify the deployed `gemini-parser`, project configuration, and server-side API key. Model availability and capacity can produce errors even when the UI loads. Never place provider secrets in a report or browser configuration.

### A Brightspace sync reports an error or no events

Use the private HTTPS Calendar Feed link from SNHU Brightspace, not a page/login URL. Never post the feed link in an issue. A successful empty feed can retire older imported SNHU entries; malformed feeds are rejected before persistence. Feed imports are calendar entries, not automatic class/task imports. See [Calendar & Schedule Sync](Calendar-&-Schedule-Sync).

### Pomodoro audio is silent

Browsers can require user interaction before audio plays. Check mute/alarm preferences in Appearance and browser/device sound settings. Timer alarms are browser audio, not a guarantee of background push delivery.

### A production PWA has not received an update

Reconnect and reload after deployment completes. Operators should check the deployed `sw.js` cache version and service-worker state. Preserve unsynced planner data before unregistering workers or clearing storage. Loopback preview behavior differs deliberately from production.
