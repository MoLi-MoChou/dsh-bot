// The Desktop bridge the window may carry; the Web build has no such member.
interface Window { dshDesktop?: unknown }

// The modules the DSH shell seeds into the client bundle's `require`. They resolve at
// runtime; this declaration keeps `tsc` happy without pulling DSH's own types in.
declare module '@deepseek-ai/dsh-client-ui-primitives' {
  import type { ReactElement } from 'react'
  export const FishLogo: (props: Record<string, unknown>) => ReactElement | null
  export const MarkdownText: (props: Record<string, unknown>) => ReactElement | null
}
