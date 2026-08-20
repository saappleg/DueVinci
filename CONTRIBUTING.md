# Contributing to DueVinci 🤝

Thank you for your interest in contributing to **DueVinci**! Whether you are reporting a bug, improving the user interface, optimizing code, or submitting new features, your help is welcome.

---

## Code of Conduct

Please be respectful, constructive, and considerate when interacting with other contributors and maintainers.

---

## How Can I Contribute?

### 1. Reporting Bugs
- Check the [existing issues](https://github.com/saappleg/DueVinci/issues) to ensure your issue has not already been reported.
- If not, create a new issue using our [Bug Report template](https://github.com/saappleg/DueVinci/issues/new?template=bug_report.md).
- Include clear reproduction steps, browser/OS version, and screenshots if applicable.

### 2. Suggesting Enhancements
- Open a feature request using our [Feature Request template](https://github.com/saappleg/DueVinci/issues/new?template=feature_request.md).
- Clearly explain why the feature would be valuable to students using DueVinci.

### 3. Submitting Pull Requests (PRs)
1. **Fork the repository** on GitHub.
2. **Clone your fork** locally:
   ```bash
   git clone https://github.com/<your-username>/DueVinci.git
   cd DueVinci
   ```
3. **Create a feature branch**:
   ```bash
   git checkout -b feature/your-feature-name
   # or
   git checkout -b fix/your-bugfix-name
   ```
4. **Make your changes**:
   - Maintain clean, readable Vanilla JavaScript and semantic HTML5.
   - Follow the existing dark-mode design aesthetics and Tailwind styling patterns.
   - Ensure no credentials, secrets, or API keys are committed.
5. **Verify your changes locally**:
   - Check JavaScript syntax:
     ```bash
     node --check app.js academics.js timers.js sw.js
     ```
   - Open and test across pages (`index.html`, `courses.html`, `grades.html`, `calendar.html`).
6. **Commit & Push**:
   ```bash
   git commit -m "feat: add your descriptive message"
   git push origin feature/your-feature-name
   ```
7. **Open a Pull Request** against the `main` branch of `saappleg/DueVinci`.

---

## Development Guidelines

- **Vanilla Stack**: DueVinci uses Vanilla JS and CDN-loaded libraries (Tailwind, FullCalendar, PDF.js, Canvas-Confetti). Keep external dependencies lightweight.
- **Privacy & Security**: Never store unhashed sensitive credentials in local storage or client-side code.
- **Edge Functions**: Edge functions live in Supabase and should be tested with Deno.

---

## Questions?

Feel free to open an issue or reach out via [SECURITY.md](SECURITY.md) for security-related matters.
