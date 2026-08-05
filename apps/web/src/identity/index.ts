/**
 * The identity surfaces, for whoever wires the shell together.
 *
 * `AccountScreen` and `ReviewScreen` stay where the router already expects
 * them. What is exported here is the smaller pieces a second door onto the same
 * job would otherwise reimplement: the sign-in flow, the verification copy, and
 * the report form the chrome under a running creation should render.
 */

export { SignIn } from './SignIn.js'
export type { SignInProps } from './SignIn.js'

export { UnlockTable, VerificationCard } from './Verification.js'

export { Vouching } from './Vouching.js'
export type { VouchingProps } from './Vouching.js'

export { WhatWeHold } from './WhatWeHold.js'

export { ReportForm } from './ReportForm.js'
export type { ReportFormProps } from './ReportForm.js'
