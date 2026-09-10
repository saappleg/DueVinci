# Coursework importer beta

DueVinci’s browser importer is being tested as a separate extension project:

<https://github.com/saappleg/duevinci-coursework-importer>

The first adapters support WGU pacing-guide documents and Maestro’s weekly course pages. The extension scans only after the student clicks **Scan current course page**, shows a review list, and sends only selected rows to the signed-in DueVinci account. It does not collect grades, submissions, student details, or whole-page HTML.

## Beta rollout

1. Install the unpacked Chrome build from the importer repository.
2. Keep a signed-in `duevinci.tech` tab open.
3. Open a WGU or Maestro course page and scan it from the extension.
4. Review the unit, lesson, review, and exam rows before importing.
5. Report adapter problems through the importer repository’s beta issue form.

The dashboard now shows the importer preference poll at the top of the main page, where students can select multiple paths they would use: a browser extension, a direct school API, or the existing Gemini syllabus setup. After submission, the poll collapses and stays dismissed on that browser. A separate dismissible beta announcement popup links to the importer repository. The poll stores the selected options and a server timestamp in `extension_beta_poll_votes`; it does not store an account ID, email, IP address, or device identifier.

## Database rollout

Apply these migrations to the target Supabase environment before enabling the hosted beta:

```sh
supabase db push --project-ref <target-project-ref>
```

The weekly course migration adds course window metadata. The importer poll migrations are write-only for `anon` and `authenticated`: visitors may submit a multi-select vote from the website, but the Data API does not expose individual responses for reading.

## Related changes

- `supabase/migrations/20260909090000_wgu_weekly_pacing.sql` stores weekly course windows and pacing metadata.
- `supabase/migrations/20260910031901_extension_beta_poll.sql` stores anonymous importer preference votes.
- `supabase/migrations/20260910032254_extension_beta_poll_lockdown.sql` makes the poll explicitly write-only for the public API roles.
- `supabase/migrations/20260910034000_extension_beta_poll_multi_select.sql` adds the multi-select response array.
- `js/modules/courses.js` recognizes WGU/Maestro weekly rows and renders linked lesson children.
- `js/modules/tour.js` announces the beta and hydrates the dashboard poll.
- `index.html` places the collapsible poll above the dashboard widgets.
