import '@testing-library/jest-dom/vitest'

// Node 26 ships a default-on experimental global `localStorage`/`sessionStorage`
// (see the "ExperimentalWarning: localStorage is not available because
// --localstorage-file was not provided" warning). Vitest's jsdom environment
// (vitest@4.1.10) skips copying window keys that already exist on `globalThis`
// unless they're in its hardcoded allowlist, and localStorage/sessionStorage
// aren't in it — so Node's non-functional stub wins over jsdom's real
// implementation. `globalThis.jsdom` is the JSDOM instance vitest stashes on
// global; restore the working storage from its window.
declare const jsdom: { window: Window } | undefined
if (typeof jsdom !== 'undefined') {
  Object.defineProperty(globalThis, 'localStorage', {
    get: () => jsdom.window.localStorage,
    configurable: true,
  })
  Object.defineProperty(globalThis, 'sessionStorage', {
    get: () => jsdom.window.sessionStorage,
    configurable: true,
  })
}
