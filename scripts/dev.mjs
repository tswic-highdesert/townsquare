/**
 * `pnpm dev`: all four local processes in one terminal.
 *
 * The same four commands DEVELOPING.md lists, run side by side with each line
 * labelled by the process that wrote it. Ctrl-C stops all four. If any one of
 * them exits on its own, the rest are stopped too, because a town with three
 * of its four origins up looks like it works and does not.
 *
 * No process-runner dependency on purpose: it is one page of `spawn`, and
 * this has to keep working on a fresh clone before anyone has learned what a
 * process runner is.
 *
 * Environment variables pass through to every process, so
 * `TOWNSQUARE_SEED_COHORT='tswic:tal@example.com:admin' pnpm dev` seeds the API
 * and the builder door together.
 */

import { spawn, spawnSync } from 'node:child_process'
import { createInterface } from 'node:readline'

const PROCESSES = [
  { name: 'api', script: 'dev:api', url: 'http://localhost:3030/api' },
  { name: 'sandbox', script: 'dev:sandbox', url: 'http://<origin-key>.tsq-apps.localhost:3031' },
  { name: 'web', script: 'dev:web', url: 'http://townsquare.localhost:5173' },
  { name: 'mcp', script: 'dev:mcp', url: 'http://localhost:8770/mcp' },
]

const isWindows = process.platform === 'win32'
const width = Math.max(...PROCESSES.map((p) => p.name.length))
const colours = [36, 35, 32, 33] // cyan, magenta, green, yellow
const useColour = process.stdout.isTTY && !process.env['NO_COLOR']

function label(index, name) {
  const text = name.padEnd(width)
  return useColour ? `\x1b[${colours[index % colours.length]}m${text}\x1b[0m |` : `${text} |`
}

console.log('Starting Town Square. Open http://townsquare.localhost:5173 when the web line says ready.')
for (const p of PROCESSES) console.log(`  ${p.name.padEnd(width)}  ${p.url}`)
console.log('Ctrl-C stops all four.\n')

let stopping = false
let exitCode = 0

const children = PROCESSES.map((p, index) => {
  const child = spawn('pnpm', ['run', '--silent', p.script], {
    stdio: ['ignore', 'pipe', 'pipe'],
    // pnpm is a .cmd shim on Windows, which only a shell can run. Elsewhere,
    // a process group of its own lets stop() take tsx's and vite's children
    // down with it rather than leaving a port held.
    shell: isWindows,
    detached: !isWindows,
  })
  const prefix = label(index, p.name)
  for (const stream of [child.stdout, child.stderr]) {
    createInterface({ input: stream }).on('line', (line) => console.log(`${prefix} ${line}`))
  }
  child.on('exit', (code, signal) => {
    child.exited = true
    if (stopping) return
    console.log(`${prefix} exited (${signal ?? `code ${code}`}), stopping the others.`)
    exitCode = code || 1
    stop()
  })
  return child
})

function stop() {
  if (stopping) return
  stopping = true
  for (const child of children) {
    if (child.exited || child.pid === undefined) continue
    try {
      if (isWindows) spawnSync('taskkill', ['/pid', String(child.pid), '/T', '/F'], { stdio: 'ignore' })
      else process.kill(-child.pid, 'SIGTERM')
    } catch {
      // Already gone between the check and the kill.
    }
  }
}

process.on('SIGINT', stop)
process.on('SIGTERM', stop)
process.on('exit', stop)

await Promise.all(children.map((c) => new Promise((resolve) => (c.exited ? resolve() : c.on('exit', resolve)))))
process.exit(exitCode)
