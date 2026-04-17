# Contributing

## Commit Conventions

This project uses [Conventional Commits](https://www.conventionalcommits.org/) to automate versioning and releases.

### Format

```
<type>: <description>

[optional body]

[optional footer]
```

### Types

| Type | Description | Version Bump |
|------|-------------|-------------|
| `feat` | New feature or tool | Minor (1.0.0 → 1.1.0) |
| `fix` | Bug fix | Patch (1.0.0 → 1.0.1) |
| `docs` | Documentation only | None |
| `test` | Adding or updating tests | None |
| `ci` | CI/CD changes | None |
| `chore` | Maintenance, deps, etc. | None |
| `refactor` | Code change that doesn't fix a bug or add a feature | None |

For breaking changes, add `BREAKING CHANGE:` in the commit footer:

```
feat: replace search_docs with unified search tool

BREAKING CHANGE: search_docs tool renamed to semaphoreui_docs_search
```

This triggers a major version bump (1.0.0 → 2.0.0).

### Examples

```bash
# New API tool → minor bump
git commit -m "feat: add create_project API tool"

# Bug fix → patch bump
git commit -m "fix: stop_task now returns task status after stopping"

# Tests → no bump
git commit -m "test: add unit tests for CRUD tools"

# Docs → no bump
git commit -m "docs: update README with new tools"
```

## Release Process

Releases are fully automated:

1. Push to `main` with conventional commit messages
2. CI runs tests
3. `auto-release` job reads commits since the last tag
4. Determines bump type (major/minor/patch) from commit prefixes
5. Updates `package.json` version, creates a git tag, pushes
6. `build-release` job builds and pushes Docker images with semver tags

### Docker Image Tags

When `v1.2.3` is released:

| Tag | Description |
|-----|-------------|
| `1.2.3` | Exact version |
| `1.2` | Latest patch in 1.2.x |
| `1` | Latest minor+patch in 1.x.x |
| `latest` | Always the newest |

## Development

### Setup

```bash
npm install
```

### Build

```bash
npm run build
```

### Test

```bash
npm test
```

### Run locally

```bash
# stdio mode
node dist/index.js

# HTTP mode
node dist/index.js --http
```

### Docker

```bash
docker build -t mcp/semaphoreui-docs .
echo '{}' | docker run -i --rm mcp/semaphoreui-docs
```

## CI Variables

The `auto-release` job requires a `CI_RELEASE_TOKEN` variable in GitLab project settings:

1. Go to **Settings → CI/CD → Variables**
2. Add `CI_RELEASE_TOKEN` with a Personal Access Token that has `write_repository` scope
3. Mark it as **Protected** and **Masked**
