// The `@deepseek-ai/*` API as the host uses it, without depending on a DSH install: the
// packages ship from the harness dev tree, not from core/node_modules, so `npm run
// typecheck` in a clean checkout would not resolve them otherwise.
//
// Only what a migrated host module imports is declared here; the surface grows with the
// migration. Each entry is a structural shape, so a DSH upgrade that keeps the shape
// needs no change here.
declare module '@deepseek-ai/dsh-llm' {
  export interface LlmMessageSource {
    readonly kind?: unknown
    readonly [key: string]: unknown
  }

  export interface LlmTextBlock {
    readonly type: string
    readonly text?: string
    readonly [key: string]: unknown
  }

  /** A user message a plugin injects into a Session. */
  export interface LlmUserMessage {
    readonly content: readonly LlmTextBlock[]
    readonly source?: LlmMessageSource
  }

  export function createUserMessage(input: {
    readonly content: readonly LlmTextBlock[]
    readonly source?: LlmMessageSource
  }): LlmUserMessage
}
