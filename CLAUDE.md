# Claude Code Instructions

This file defines project-specific guidance for Claude Code.
Keep the commit message rules in sync with `AGENTS.md`.

## Commit Messages

- Always use Conventional Commits style.
- Format every commit message as `<type>: <summary>`.
- Use a lowercase type, followed by a colon and a single space.
- Keep the summary to one short line. Japanese or English is fine.
- Do not end the summary with a period.
- Avoid vague titles such as `Update ...`, `Refine ...`, or `Fix stuff`.

### Recommended Types

- `feat`: user-facing feature
- `fix`: bug fix
- `docs`: documentation only
- `refactor`: internal refactor without behavior change
- `test`: add or update tests
- `chore`: maintenance work
- `ci`: CI/CD workflow changes
- `build`: build tooling or packaging changes
- `style`: formatting or non-functional UI polish
- `perf`: performance improvement

### Examples

- `fix: zip importでのマイク許可`
- `feat: add TTL countdown to task cards`
- `docs: document commit message convention`
- `ci: upload release zip from workflow`

## Validation

- If application code changes, run `npm run build` before finishing when practical.
