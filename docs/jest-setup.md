# Backend API Test Harness

This note captures the test harness decisions for `apps/api` and explains the real interoperability issue we had to solve before adding request-level auth tests.

## What Actually Broke

The backend is written as TypeScript that uses runtime-correct ESM import specifiers such as `../config/env.js`. That is the right shape for Node once the code is compiled, but Jest runs against source files before build output exists.

Without extra configuration, Jest tried to resolve those `.js` specifiers literally inside `src/`, where only `.ts` files exist. The visible failure showed up on `env`, but the problem was broader: any relative `.js` import in source could break tests.

## Root Fix

We kept the source code in its runtime-correct form and taught Jest how to interpret it.

1. Load `.env.test` before the suite so config-dependent modules can initialize safely.
2. Use `ts-jest` in ESM mode so Jest can execute TypeScript source directly.
3. Map relative `.js` imports back to the corresponding source module during tests.

The critical piece is this mapper:

```js
moduleNameMapper: {
  '^(\\.{1,2}/.*)\\.js$': '$1'
}
```

That keeps application imports consistent with the production build while still letting Jest run against `.ts` sources.

## Current Scope

The API test setup now supports two levels of coverage:

1. Unit tests for pure auth helpers such as password hashing.
2. Request-level integration tests that call `buildApp()` and hit Fastify routes with `app.inject()`.

For the first integration slice, we mock the DB boundary rather than starting a real Postgres instance. This is deliberate: it validates routing, schema parsing, cookies, auth token issuance, and response formatting without turning the test into infrastructure setup.

## Why This Approach Fits The Repo

This monorepo is still early in implementation. Only auth routes are mounted today, so the highest-value integration test is the auth HTTP surface, not an end-to-end database workflow that the rest of the repo is not ready to support yet.

This gives us a stable progression:

1. Pure helper unit tests.
2. Fastify request integration tests with mocked persistence.
3. True database-backed integration tests when the API surface and test fixtures are mature enough.

## Practical Rule Going Forward

When backend source files use relative `.js` imports inside TypeScript, do not “fix” the application code for Jest by rewriting imports to `.ts`. Keep the runtime-correct imports and make the test runner understand them.

That preserves parity between test-time and production module shapes, which matters more as the API grows.