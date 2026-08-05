/**
 * Civic: the town's own business, read-side.
 *
 * Notices and the severity ladder they sit on, the meetings of the bodies that
 * govern Russellville, and what a resident has agreed to be interrupted by.
 *
 * Read `ladder.ts` first. Four rungs, one object, used by the notice card, the
 * subscription threshold, the push decision and the composer gate alike. The
 * argument for four rather than seven, and for only three of them ever reaching
 * a lock screen, is the load-bearing decision in this whole area.
 *
 * Most of `design/hifi-v2` section 9 is deliberately not built. The agenda
 * reader, the vote record, public comment, the ballot module and service status
 * all need ingest that does not exist, and the plain-terms panel is an
 * editorial workflow with a human in it rather than a service. Each omission is
 * named where it would have gone, and `MeetingIndex.notCarried` names them on
 * the payload itself so a client cannot mistake absence for nothing happening.
 */

export * from './ladder.js'
export * from './notices.js'
export * from './meetings.js'
export * from './alerts.js'
