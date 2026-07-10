// Vitest runs modules in Node, not Next's RSC bundler, where the real
// `server-only` package throws unconditionally. Aliased in vitest.config.ts
// so unit-testing a server module doesn't require mocking every import.
export {};
