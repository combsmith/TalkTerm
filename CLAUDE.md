@https://github.com/petry-projects/.github/blob/main/AGENTS.md
@AGENTS.md

# TalkTerm — Claude Code Project Context

For comprehensive project guidelines (architecture, testing, code style, conventions), see [AGENTS.md](./AGENTS.md).

## Quick Reference

- **Install:** `npm install`
- **Test:** `npm test`
- **Lint:** `npm run lint`
- **Format:** `npm run format`
- **Type check:** `npm run typecheck`
- **Dev:** `npm run dev`

## Key Rules

1. **TDD is mandatory** — write tests before implementation (see AGENTS.md Section 1)
2. **Coverage thresholds** — 90% branch/function/line/statement
3. **Mutation testing** — 80% minimum Stryker score
4. **Clean Architecture** — dependencies point inward, never import outer from inner layers
5. **DDD bounded contexts** — Agent, Storage, Security, Voice, Avatar, Overlay
6. **Pre-commit checks run manually** — `npm run lint && npm run format && npm run typecheck && npm test`

See [AGENTS.md](./AGENTS.md) for full details.
