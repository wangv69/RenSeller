# Development and testing rules

Use strict test-driven development for every behavior change in this repository.

1. RED: Write a focused test for the requested behavior or bug before editing production code. Run it and verify it fails for the intended reason.
2. GREEN: Make the smallest production change that passes the test.
3. REFACTOR: Improve structure while keeping the suite green. Keep major frontend features in separate components.
4. Run the affected suite, then all required checks, including both Docker test services, before reporting completion.

Agentic TDD is mandatory: tests FIRST, production code SECOND. Independently repeat RED -> GREEN -> REFACTOR for each behavior. Record the failing test and reason, implement only after observing that failure, and rerun tests after refactoring. Always run the tests inside Docker too; host-only results are insufficient. If Docker is unavailable, report that blocker explicitly and do not claim Docker validation passed.

Every new or changed behavior needs tests: success, invalid input, boundaries, failures, loading states, authorization, and cleanup where applicable. Bug fixes require a regression test. For existing untested behavior, add characterization tests before refactoring. Do not claim retrospective tests were written first.

Test observable behavior through public APIs and accessible UI. Do not use snapshots or implementation-mirroring assertions as a substitute for behavioral tests. Mock external services at their boundary; never contact production, use real student data, or require secrets in unit tests. Cover SQL permissions and cross-account access with isolated database integration tests when changing migrations; mocked frontend tests do not verify RLS or actual delivery.

Required checks:

- `npm --prefix frontend ci`
- `npm --prefix frontend run test:coverage`
- `npm --prefix frontend run lint`
- `npm --prefix frontend run build`
- Install `backend/requirements-dev.txt`, then run `python -m pytest` from the repository root
- `docker compose -f compose.test.yaml run --rm frontend-tests`
- `docker compose -f compose.test.yaml run --rm backend-tests`

On Windows use `npm.cmd` if PowerShell blocks npm.ps1. Use a local Python virtual environment. Keep coverage enabled, include unimported production modules, and never lower thresholds or exclude behavior merely to pass. Document uncovered branches and unavailable integration checks honestly. Tests must be deterministic and clean up subscriptions, timers, mocks, and DOM state. Never commit secrets, generated coverage, virtual environments, or dependencies.
