// `shared/views.ts` declares the same module path, so TypeScript resolves `.js` to it
// and cannot see the runtime function. This JS-only bridge gives the typed tools one
// import of the card checks without duplicating their logic.
export { checkShownView, normalizeView } from '../../shared/views.js'
