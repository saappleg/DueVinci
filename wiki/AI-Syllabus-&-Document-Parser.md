# AI Syllabus & Document Parser 🧠

Optional syllabus parsing sends extracted PDF text or a supported lesson screenshot through the authenticated `gemini-parser` Edge Function. Provider keys stay server-side; model selection is configurable with fallbacks. Manually created classes and coursework remain usable without AI.

## PDF workflow

1. Open a class's **Overview & Syllabus** section.
2. Select a PDF; PDF.js extracts its text in the browser.
3. Choose the metadata-only checkbox if you do not want units/lessons added.
4. Run the scan and review the native confirmation summarizing description and objectives, plus proposed units when importing units.
5. Continue to save, or cancel. Review saved dates and coursework afterward.

The metadata-only response contains `description` and `objectives`. A full syllabus response can also contain `units`:

```json
{
  "description": "Fictional introductory course",
  "objectives": "Explain the course concepts",
  "units": [
    {
      "num": 1,
      "title": "Foundations",
      "dateStr": "October 20, 2026",
      "lessons": ["Key terms", "Practice review"]
    }
  ]
}
```

This is the requested extraction shape, not a guarantee that a model always returns valid or complete data. It is not a schema for professors, credit hours, grading rubrics, or weighted categories.

## Lesson screenshots

The screenshot control sends JPEG, PNG, or WebP data to the same function. The response requests units with `num`, `title`, `dateStr`, optional `endDateStr`, and lesson strings. The current screenshot workflow saves the parsed units/lessons directly after a successful response; it does **not** offer the PDF confirmation or an editable per-row preview. Use only material you are ready to import and review results afterward.

The server limits request/text/image size and checks authentication. Scanned PDFs without a usable text layer and unusual layouts can produce incomplete results. The current class UI does not provide a generic pasted-text upload flow.

## Dates, duplicates, and review limits

Imports use the class/term date window, adjust imported dates to that window, and report adjustments. A unit range can spread lesson dates across its weekdays. Missing dates can receive fallback dates, so always compare results against the actual syllabus.

The native PDF confirmation is a summary, not a diff editor with individual selection or grading-weight normalization. Do not assume repeated scans are deduplicated. Correct or remove unwanted results using the existing coursework controls.

## Privacy and troubleshooting

Only upload material you are authorized to process. Never include real patient information; nursing examples must be fictional. Provider processing follows the applicable service terms—do not assume inputs avoid all provider processing or training use based solely on this UI.

For failed requests, check sign-in/connectivity and ask the operator to verify deployed function configuration. Do not put provider API keys in browser code, logs, or issues. See [FAQ & Troubleshooting](FAQ-&-Troubleshooting) and the [security policy](https://github.com/saappleg/DueVinci/blob/main/docs/SECURITY.md).
