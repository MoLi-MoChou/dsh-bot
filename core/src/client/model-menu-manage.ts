// Shared helper: open the models settings page from a model menu action bag.
export const manageModels = (actions: { openModels?: (() => void) | undefined; openHarnessSettings?: (() => void) | undefined }): (() => void) | undefined =>
  actions.openModels ?? actions.openHarnessSettings

