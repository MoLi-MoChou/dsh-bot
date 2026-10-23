// `shared/views.ts` declares the same module path, so TypeScript resolves `.js` to it
// and cannot see the runtime function. This JS-only bridge gives the typed channel one
// import of the validator without duplicating its logic.
export { validateViewAnswer } from '../../shared/views.js'
