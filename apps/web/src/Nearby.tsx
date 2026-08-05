/**
 * Nearby, which is now the directory.
 *
 * ## Why this file is four lines
 *
 * Nearby and the discovery directory were one screen wearing two hats. Both
 * read the same 741 listings out of the same scrape. Both compute open and
 * closed through the same `openState` in `today.ts`. Both hand the whole town
 * to the browser and rank it against a position that never leaves the device.
 * Both fall back to "what is open, then alphabetical" when a resident refuses
 * location. The only thing that differed was which question led — "what is near
 * me" against "what is in town" — and that is a sort control, not a second tab.
 *
 * Keeping both cost two payloads of the same 741 listings, two open-state
 * ladders to keep honest, two category taxonomies, and every later directory
 * feature either built twice or built once and quietly missing from the other
 * half. The visible symptom was two search fields stacked at desktop: the app
 * bar's, which searches the town, and this screen's, which filtered the
 * directory. A placeholder naming the scope would have made that duplicate
 * legible rather than gone. `Directory` removes the second field instead —
 * search there is a deliberate screen behind a quiet button, because a
 * directory's job is helping somebody find what they did not know to type.
 *
 * ## What came across, and must not be undone
 *
 * The decisions this file used to record are now recorded at the top of
 * `directory/Directory.tsx`, in the same words, because they are the reason the
 * screen is shaped the way it is rather than notes about a screen:
 *
 * - **No coordinates in either direction.** `/api/directory` takes no lat, no
 *   lng, no query and no category. The position stays on the phone, and the
 *   permission prompt can say so literally.
 * - **The map talks to nobody.** No tile host, no key, no attribution beacon,
 *   and the shell's CSP is unchanged by the screen. It is drawn from the street
 *   corridors implied by the directory's own 741 addresses — `TownMap.tsx` and
 *   `apps/api/src/townMap.ts` still carry the reasoning and the limits, and
 *   both are untouched.
 * - **The list is the default and stands alone.** The Map control appears only
 *   when the payload carries `bounds`.
 * - **Refusing location costs the distances and nothing else.**
 * - **No events on any surface that claims a distance.** The calendar's
 *   coordinates are a hardcoded town centre and a run of literal zeroes.
 *   `apps/api/src/nearby.ts` still has that whole story written down and it is
 *   worth reading before anybody puts an event back on a map.
 *
 * ## What is left to unwire, and why this file did not do it
 *
 * `App.tsx` and `apps/api/src/main.ts` belong to other people in this pass, so
 * the re-export keeps both working untouched. When they are free:
 *
 * 1. `App.tsx` — import `Directory` from `./directory/Directory.js` directly
 *    and delete this file.
 * 2. `main.ts` — drop `createNearbyRoutes`, its import, and its line in the
 *    route chain. `/api/directory` carries the streets and the bounds now, so
 *    `/api/nearby` is a second 240 KB copy of a payload nothing fetches.
 * 3. `apps/api/src/nearby.ts` — keep `placeKind` and `placeable`, which
 *    `directory.ts` and the tests both use. `assembleNearby` goes with the
 *    route.
 * 4. `styles/nearby.css` — the `.nearby-*` and `.place-*` half is then dead.
 *    **Do not delete the file**: `.saved-list`, `.saved-row` and `.yours-empty`
 *    in it belong to Yours.
 */

export { Directory as Nearby } from './directory/Directory.js'
export type { DirectoryProps as NearbyProps } from './directory/Directory.js'
