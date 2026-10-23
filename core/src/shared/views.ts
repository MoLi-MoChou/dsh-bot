// The blueprint a `show_view` card carries, typed. The runtime validation lives in
// `views.js` (the host checks a card before storing it, the client renders the same
// blueprint); this module is the shared type layer both ends will move onto.
//
// Phase 1 declares `diff` and `diagram` as cards a Bot may name later. Nothing renders
// them yet and no host accepts them: `views.js` still rejects them, by design.

export type ViewComponentType = 'stack' | 'text' | 'metric' | 'table' | 'options' | 'confirm' | 'form' | 'progress'

export type ViewTone = 'good' | 'warn' | 'bad'

/** Cards a model may show today. */
export interface StackView {
  readonly type: 'stack'
  readonly children: readonly WidgetView[]
}

export interface TextView {
  readonly type: 'text'
  readonly text: string
}

export interface MetricView {
  readonly type: 'metric'
  readonly label: string
  readonly value: number | string
  readonly tone?: ViewTone
}

export interface TableView {
  readonly type: 'table'
  readonly columns: readonly { readonly key: string; readonly label: string }[]
  readonly rows: readonly Readonly<Record<string, string | number>>[]
}

export interface OptionsView {
  readonly type: 'options'
  readonly id: string
  readonly options: readonly { readonly label: string; readonly description?: string }[]
  readonly multi?: boolean
}

export interface ConfirmView {
  readonly type: 'confirm'
  readonly id: string
  readonly confirmLabel?: string
  readonly cancelLabel?: string
}

export interface FormView {
  readonly type: 'form'
  readonly id: string
  readonly fields: readonly { readonly id: string; readonly label: string; readonly placeholder?: string }[]
  readonly submitLabel?: string
}

export interface ProgressView {
  readonly type: 'progress'
  readonly label?: string
  readonly percent: number
}

// ---------------------------------------------------------------------------
// Phase 3 cards: declared so the contract exists, not shown or accepted yet.

/** A unified diff a Bot may show for review: a patch plus the files it touches. */
export interface DiffView {
  readonly type: 'diff'
  readonly title?: string
  readonly patch: string
  readonly files?: readonly string[]
}

/** A structure diagram (Mermaid source or a small SVG) a Bot may show. */
export interface DiagramView {
  readonly type: 'diagram'
  readonly kind: 'mermaid' | 'svg'
  readonly source: string
  readonly caption?: string
}

export type WidgetView =
  | StackView
  | TextView
  | MetricView
  | TableView
  | OptionsView
  | ConfirmView
  | FormView
  | ProgressView

/** Everything a blueprint node may be, including the Phase 3 cards. */
export type AnyView = WidgetView | DiffView | DiagramView

export type InteractiveView = OptionsView | ConfirmView | FormView

/** What `show_view` answers after checking a blueprint. */
export type ViewCheck =
  | { readonly ok: true; readonly interactive: boolean }
  | { readonly ok: false; readonly error: string }

/** What the host keeps of a shown card, for the answer it later receives. */
export interface ShownView {
  readonly id: string
  readonly title: string
  readonly view: WidgetView
  readonly callId?: string
}

/** The user's answer to a card: an option id, a confirmation, or form values. */
export interface ViewAnswer {
  readonly id: string
  readonly action?: string
  readonly selected?: readonly string[]
  readonly values?: Readonly<Record<string, string>>
  readonly custom?: string
}
