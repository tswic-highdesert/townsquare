/**
 * What Town Square splices into a creation's entry document.
 *
 * Three things, and each one exists so a resident does not have to know it
 * exists:
 *
 *   the import map   makes `import { town } from '@townsquare/sdk'` resolve
 *                    with no package.json, no node_modules and no build step
 *   the theme sheet  makes an independently-built app look like it belongs
 *   the boot module  starts the handshake even for a creation that never
 *                    imports the SDK, so height and theme still work
 *
 * Injection happens at *serve* time rather than publish time so a theme change
 * or an SDK patch rolls forward without re-approving fifty creations. It is a
 * fixed string with no interpolation from the bundle, so there is nothing here
 * for a creation's own markup to influence.
 */

export interface InjectOptions {
  /** Cache-busted path to this town's compiled theme sheet. */
  themeHref: string
  /** Major version directory the SDK is served from, e.g. `1`. */
  sdkMajor: number
}

/**
 * The import map must be parsed before any module script in the document, so
 * everything goes at the very top of `<head>`. A map that appears after the
 * first module import is ignored by the browser, which would surface as the
 * bare specifier mysteriously failing in some apps and not others.
 */
export function injectionFor(opts: InjectOptions): string {
  const sdkBase = `/_ts/sdk/${opts.sdkMajor}`
  return [
    `<!-- injected by Town Square -->`,
    `<meta charset="utf-8">`,
    `<meta name="viewport" content="width=device-width, initial-scale=1">`,
    `<script type="importmap">{"imports":{"@townsquare/sdk":"${sdkBase}/sdk.js","@townsquare/sdk/":"${sdkBase}/"}}</script>`,
    `<link rel="stylesheet" href="${escapeAttr(opts.themeHref)}">`,
    `<script type="module" src="${sdkBase}/boot.js"></script>`,
    `<!-- end Town Square -->`,
  ].join('\n')
}

const HEAD_OPEN = /<head\b[^>]*>/i
const HTML_OPEN = /<html\b[^>]*>/i
const DOCTYPE = /<!doctype[^>]*>/i

/**
 * Splice the injection into an entry document.
 *
 * Generated single-file apps frequently have no `<head>` at all, and a couple
 * have no `<html>` either. Rather than refuse them, insert at the best
 * available anchor: browsers reparent the resulting elements into the head on
 * their own, and the import map still precedes every module script, which is
 * the only ordering property that has to hold.
 */
export function injectEntryHtml(html: string, opts: InjectOptions): string {
  const injection = injectionFor(opts)

  const head = HEAD_OPEN.exec(html)
  if (head) {
    const at = head.index + head[0].length
    return html.slice(0, at) + '\n' + injection + html.slice(at)
  }

  const htmlTag = HTML_OPEN.exec(html)
  if (htmlTag) {
    const at = htmlTag.index + htmlTag[0].length
    return html.slice(0, at) + `\n<head>\n${injection}\n</head>` + html.slice(at)
  }

  const doctype = DOCTYPE.exec(html)
  if (doctype) {
    const at = doctype.index + doctype[0].length
    return html.slice(0, at) + '\n' + injection + html.slice(at)
  }

  return injection + '\n' + html
}

function escapeAttr(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;')
}
