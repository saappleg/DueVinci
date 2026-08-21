# GitHub Wiki Sync Guide 🔄

GitHub hosts repository wikis in a separate, dedicated Git repository ending in `.wiki.git`. This guide explains how to sync and publish the contents of the `wiki/` directory to the live GitHub Wiki for `saappleg/DueVinci`.

---

## 🛠️ Method 1: Manual Git Push (Quickest)

Every GitHub repository has a dedicated wiki clone URL in the format:
```text
https://github.com/<owner>/<repo>.wiki.git
```

### Steps:
1. First, make sure you have initialized the Wiki tab on GitHub:
   - Navigate to [https://github.com/saappleg/DueVinci](https://github.com/saappleg/DueVinci).
   - Click on the **Wiki** tab and click **"Create the first page"** (you can click Save Page with default text). This provisions the `.wiki.git` repository on GitHub's servers.
2. In your local terminal, clone the wiki repository into a temporary directory:
   ```bash
   git clone https://github.com/saappleg/DueVinci.wiki.git /tmp/duevinci-wiki
   ```
3. Copy all markdown files from `wiki/` into the cloned wiki directory:
   ```bash
   cp -R wiki/* /tmp/duevinci-wiki/
   ```
4. Commit and push the changes:
   ```bash
   cd /tmp/duevinci-wiki
   git add .
   git commit -m "docs: update GitHub wiki documentation"
   git push origin master
   ```

All pages, sidebars, and footers will immediately reflect on the live GitHub Wiki!

---

## 🤖 Method 2: Automated GitHub Action (Continuous Deployment)

You can set up a GitHub Action to automatically publish the `wiki/` folder whenever changes are merged into `main`.

### Sample GitHub Action Workflow (`.github/workflows/sync-wiki.yml`)

```yaml
name: Sync Wiki

on:
  push:
    branches:
      - main
    paths:
      - 'wiki/**'

jobs:
  sync-wiki:
    runs-on: ubuntu-latest
    steps:
      - name: Checkout Source Repo
        uses: actions/checkout@v4

      - name: Sync to GitHub Wiki
        uses: SwiftDocOrg/github-wiki-publish-action@v1
        with:
          wiki_folder: wiki
          token: ${{ secrets.GITHUB_TOKEN }}
```

---

## 📑 File Naming Conventions on GitHub Wiki

- `Home.md`: Automatically rendered as the Wiki front page.
- `_Sidebar.md`: Automatically rendered as the persistent sidebar on all wiki pages.
- `_Footer.md`: Automatically rendered at the bottom of all wiki pages.
- Standard pages: Use hyphens (`-`) instead of spaces (e.g., `Getting-Started.md`, `Smart-Study-Planner.md`).
