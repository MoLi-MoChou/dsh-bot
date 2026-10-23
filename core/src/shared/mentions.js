// The runtime implementation, kept in JS for now: Node loads this module directly (the
// group host and the client both import it), and Phase 2 moves that code into TS. The
// typed contract lives in mentions.ts.
export * from './mentions.runtime.js'
