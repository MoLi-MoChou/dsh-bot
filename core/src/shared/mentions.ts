// "@Name" is read by one rule everywhere: the group host picks who answers with it and
// the client draws the same mentions in the bubbles, so what the user sees called is what
// gets called.
//
// The runtime stays in `mentions.runtime.js` (Node loads `mentions.js`, which re-exports it);
// this module is the typed layer both ends will import once the host/client move to TS.
// Its signatures are the contract: change one and both sides fail to compile.
import * as runtime from './mentions.runtime.js'

/** Someone `@` can call: a Bot on the team. */
export interface MentionTarget {
  readonly id: string
  readonly name: string
}

/** A group log line, whose `who` may read as the user even for a Bot. */
export interface LogLineLike {
  readonly who?: string | null
  readonly botId?: string
}

/** One `@Name` found in a text; `all` marks `@all`/`@所有人`. */
export type MentionSpan =
  | { readonly start: number; readonly end: number; readonly bot: MentionTarget }
  | { readonly start: number; readonly end: number; readonly all: true }

/** One `@label` DSH wrote for a referenced conversation (not a call). */
export interface ReferenceSpan {
  readonly start: number
  readonly end: number
  readonly label: string
}

/** Words that call everyone in a group, in the languages the UI serves. */
// The runtime module's inferred types are looser than the contract (it is plain JS); the
// declared shape below is what both ends compile against.
interface MentionsRuntime {
  readonly ALL_WORDS: readonly string[]
  readonly USER_NAMES: readonly string[]
  speakerOf(line: LogLineLike): string | undefined
  nameProblem(name: string): string | undefined
  referenceSpans(text: string, labels?: readonly string[]): readonly ReferenceSpan[]
  mentionSpans(text: string, bots: readonly MentionTarget[], options?: { readonly references?: readonly string[] }): readonly MentionSpan[]
}
const impl = runtime as unknown as MentionsRuntime

export const ALL_WORDS: readonly string[] = impl.ALL_WORDS
/** Speaker names that stand for the user in a log line. */
export const USER_NAMES: readonly string[] = impl.USER_NAMES

/** The name a group log line goes by, so a Bot named "User" never reads as the user. */
export const speakerOf = (line: LogLineLike): string | undefined => impl.speakerOf(line)

/** What a Bot may be named: something `@` can call without a second reading. */
export const nameProblem = (name: string): string | undefined => impl.nameProblem(name)

/** The `@label` occurrences that are references to other conversations. */
export const referenceSpans = (text: string, labels?: readonly string[]): readonly ReferenceSpan[] =>
  impl.referenceSpans(text, labels ?? [])

/** Every `@Name` and `@all` outside code, links and references, in order. */
export const mentionSpans = (
  text: string,
  bots: readonly MentionTarget[],
  options?: { readonly references?: readonly string[] },
): readonly MentionSpan[] => impl.mentionSpans(text, bots, options ?? {})
