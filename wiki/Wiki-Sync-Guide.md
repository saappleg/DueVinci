# GitHub Wiki Sync Guide 🔄

GitHub publishes this project's wiki from a separate
[`DueVinci.wiki.git` repository](https://github.com/saappleg/DueVinci/wiki).
The maintained source is the main repository's
[`wiki/` directory](https://github.com/saappleg/DueVinci/tree/main/wiki).

## Publish through the existing workflow

1. Edit the relevant Markdown files under `wiki/` on a documentation branch.
2. Review the changes and merge the pull request into `main`.
3. Open the [Sync Wiki workflow](https://github.com/saappleg/DueVinci/actions/workflows/wiki-sync.yml)
   and check the run for the merged commit.
4. Read the affected pages on the [published wiki](https://github.com/saappleg/DueVinci/wiki)
   to confirm the new text, navigation, and formatting.

The active workflow is
[`.github/workflows/wiki-sync.yml`](https://github.com/saappleg/DueVinci/blob/main/.github/workflows/wiki-sync.yml).
It runs when a `main` push changes `wiki/**`, and it also supports manual
`workflow_dispatch` through GitHub Actions' **Run workflow** control.

### What the workflow does

- Checks out the source repository into `repo/`.
- Uses the workflow's `contents: write` permission and `GITHUB_TOKEN` to clone
  the separate wiki repository.
- Copies the repository's `wiki/*` files, including `_Sidebar.md` and `_Footer.md`,
  into that checkout.
- Commits changes as `github-actions[bot]` when the copied files differ.
- Pushes to the wiki's `master` branch, with `main` as the fallback.

The copy keeps any extra pages already present in the wiki repository. Review
obsolete pages explicitly when removing a guide from the canonical source.
Direct web edits to a page also maintained in `wiki/` can be replaced by the
next sync; make lasting changes in the source repository.

### Verify a sync

A successful Action confirms that its copy/commit/push commands completed, or
that no file changes were needed. The workflow has no separate post-push
content comparison. Check the published page content and history as well as the
Action conclusion. Match the Action's source commit to the documentation PR.

If a run fails, inspect its first failing step. Check wiki availability, workflow
write permissions, and the wiki branch before retrying. Keep credentials out of
logs and use the existing workflow's token handling.

## Manual fallback

Use a fresh temporary wiki checkout when an approved manual update is needed.
Run the copy from the root of the actual DueVinci source checkout, review the
staged changes, and push the wiki's checked-out branch:

```sh
git clone https://github.com/saappleg/DueVinci.wiki.git /tmp/duevinci-wiki
cp -R wiki/* /tmp/duevinci-wiki/
cd /tmp/duevinci-wiki
git add .
git diff --cached --stat
git commit -m "docs: sync reviewed DueVinci wiki pages"
git push origin HEAD
```

The temporary destination must be available. If there is no staged difference,
skip the commit and push. If concurrent wiki edits cause a push rejection,
review them before integrating and retrying; preserve the existing history.
The current wiki is already initialized. A new repository must create its first
wiki page on GitHub before a wiki clone or publish can succeed.

## File naming

- `Home.md` is the wiki landing page.
- `_Sidebar.md` supplies navigation; `_Footer.md` supplies the shared footer.
- Existing guide names use hyphens, such as `Getting-Started.md`. Link wiki pages
  by their page name without the `.md` extension.
- Links to files outside the wiki should use their full GitHub repository URLs
  so they also work after publication.
