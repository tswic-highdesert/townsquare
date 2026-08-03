/**
 * `@townsquare/sdk`, build-time surface.
 *
 * This entry is for the platform: the method table, the host-side permission
 * gate, and the generated docs artifact. The guest runtime that actually ships
 * into a creation's frame is `runtime/sdk.js`, which is plain JavaScript served
 * verbatim so that what a reviewer reads is exactly what a browser runs.
 */

export * from './methods.js'
export * from './permissions.js'
export { SDK_DOCS, type SdkDocs } from './docs.generated.js'
