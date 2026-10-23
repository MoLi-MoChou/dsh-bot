// The Desktop bridge the window may carry; the Web build has no such member.
interface Window { dshDesktop?: unknown }

// The modules the DSH shell seeds into the client bundle's `require`. They resolve at
// runtime; this declaration keeps `tsc` happy without pulling DSH's own types in.
declare module '@deepseek-ai/dsh-client-ui-primitives' {
  import type { ReactElement } from 'react'
  export const FishLogo: (props: Record<string, unknown>) => ReactElement | null
  export const MarkdownText: (props: Record<string, unknown>) => ReactElement | null
}

// react-dom is a runtime dependency the shell supplies; only its types are missing here,
// so declare the one function the client calls. A portal is a React child either way.
declare module 'react-dom' {
  import type { ReactNode } from 'react'
  export function createPortal(children: ReactNode, container: Element | DocumentFragment, key?: string | null): ReactNode
}
