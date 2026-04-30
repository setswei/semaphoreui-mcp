# Changelog

All notable changes to this project will be documented in this file.

## [Unreleased]

### Fixed

- **Empty response parsing (issues #1–#4):** API client now handles empty response bodies from Semaphore PUT/DELETE endpoints. Previously, `update_environment`, `update_template`, `delete_template`, and `delete_environment` all returned "Unexpected end of JSON input" because Semaphore returns `content-type: application/json` with an empty body on these operations. The client now reads the response as text first and returns `null` for empty bodies instead of calling `res.json()`.
- **Success message on PUT/DELETE:** The `call()` helper now returns a human-readable success message (e.g. `PUT /project/1/environment/3 succeeded`) instead of `"null"` when the API returns an empty response.

### Added

- **Terraform `task_params` on templates (issue #6):** `create_template` and `update_template` now accept a `task_params` object with Terraform-specific fields: `auto_approve`, `allow_auto_approve`, `allow_destroy`, `override_backend`, `backend_filename`.
- **Task `params` on `run_task` (issue #6):** `run_task` now accepts a `params` object for Terraform tasks (`plan`, `destroy`, `auto_approve`, `upgrade`, `reconfigure`) and advanced Ansible overrides. Existing top-level Ansible params (`debug`, `dry_run`, `diff`, `limit`) are preserved for backward compatibility and assembled into `params` automatically when no explicit `params` object is provided.
- **4 new unit tests:** Empty JSON response handling (2 tests in `api-client.test.ts`), `task_params` passthrough and Terraform `run_task` params (2 tests in `api-tools.test.ts`). Total: 57 → 61 tests.

### Not a bug

- **Issue #5 (double-escaped arguments):** Investigated and confirmed this is not an MCP tool bug. Semaphore expects `arguments` as a JSON string (`*string` in Go), and the tool passes it through correctly. The reported error was actually issue #2 (empty response parsing) on the PUT response, not double-escaping.

## [1.5.3] - 2025-04-17

### Fixed

- Sync README to Docker Hub repository overview.
- Add git identity for CI tag creation.

### Changed

- Optimised single-pipeline CI — one build, one test, no double handling (closes #9).

## [1.5.2] - 2025-04-17

### Fixed

- Docker Hub login with explicit `docker.io` registry.

## [1.5.1] - 2025-04-17

### Fixed

- Docker Hub auth via `config.json` for non-TTY runners.

## [1.5.0] - 2025-04-17

### Fixed

- Docker Hub login uses `--password-stdin`.
