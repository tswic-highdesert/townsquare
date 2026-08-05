/**
 * The build layer's screens.
 *
 * Import from here rather than from the files: the split inside this directory
 * is for whoever is reading the code, and this barrel is what routing writes
 * against.
 */

export { Gallery } from './Gallery.js'
export type { GalleryProps } from './Gallery.js'

export { TrustScreen } from './TrustScreen.js'
export type { TrustScreenProps } from './TrustScreen.js'

export { CreationDetail } from './CreationDetail.js'
export type { CreationDetailProps } from './CreationDetail.js'

export { RunningCreation } from './RunningCreation.js'
export type { RunningCreationProps } from './RunningCreation.js'

export { BuilderDoor } from './BuilderDoor.js'
export type { BuilderDoorProps } from './BuilderDoor.js'

export { HostChrome, FooterChrome } from './HostChrome.js'
export type { FooterChromeProps, HostChromeProps } from './HostChrome.js'

/* The logic under the screens, exported because the trust page's honesty is a
 * property worth testing without a browser. */
export { summariseTrust } from './trustGroups.js'
export type { TrustGroup, TrustSummary, TrustTone } from './trustGroups.js'
export { touchChips } from './touch.js'
export type { TouchChip } from './touch.js'
