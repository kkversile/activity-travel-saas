// A cancellable transition keeps the shell's outlet remount and data isolation,
// while allowing the current editor to protect unsaved or in-flight work.
export const BEFORE_OUTLET_CHANGE = 'voya:before-outlet-change';
export type OutletChangeDetail = { proceed: () => void };
