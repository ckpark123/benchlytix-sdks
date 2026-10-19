#!/usr/bin/env node
/**
 * Publish-manifest tool for benchlytix-mcp-server.
 *
 * Why this exists: in the repo, package.json depends on the SDK as
 * `"@benchlytixai/sdk": "file:../sdk-ts"` so local dev, tests and CI build
 * against the in-tree SDK (the lockfile records it as a link, so `npm ci`
 * works with no registry round-trip and no chicken-and-egg on an unpublished
 * SDK version). npm would publish that `file:` spec verbatim, which breaks
 * every install from the registry (0.1.0 had to be hand-edited).
 *
 *   --write  rewrite the SDK dependency to `^<packages/sdk-ts version>` in
 *            place. Run ONLY in the publish workflow (or a throwaway checkout)
 *            right before `npm publish`; never commit the result.
 *   --check  fail if any runtime dependency still uses a local protocol
 *            (file:, link:, workspace:, portal:). Wired into prepublishOnly so
 *            a hand-run `npm publish` cannot ship the local spec.
 *   --print-sdk-version  print the SDK version the manifest will require.
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const pkgPath = resolve(here, '..', 'package.json')
const sdkPkgPath = resolve(here, '..', '..', 'sdk-ts', 'package.json')
const SDK = '@benchlytixai/sdk'
const LOCAL = /^(file|link|workspace|portal):/

const readJson = (p) => JSON.parse(readFileSync(p, 'utf8'))
const mode = process.argv[2]

if (mode === '--print-sdk-version') {
  process.stdout.write(readJson(sdkPkgPath).version + '\n')
} else if (mode === '--write') {
  const pkg = readJson(pkgPath)
  const sdkVersion = readJson(sdkPkgPath).version
  if (!pkg.dependencies?.[SDK]) {
    console.error(`publish-manifest: ${SDK} missing from dependencies`)
    process.exit(1)
  }
  pkg.dependencies[SDK] = `^${sdkVersion}`
  writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + '\n')
  console.log(`publish-manifest: ${SDK} -> ^${sdkVersion}`)
} else if (mode === '--check') {
  const pkg = readJson(pkgPath)
  const bad = Object.entries({
    ...pkg.dependencies,
    ...pkg.optionalDependencies,
    ...pkg.peerDependencies,
  }).filter(([, spec]) => LOCAL.test(String(spec)))
  if (bad.length > 0) {
    for (const [name, spec] of bad) {
      console.error(`publish-manifest: refusing to publish ${name}@"${spec}" (local protocol)`)
    }
    console.error('Run `node scripts/publish-manifest.mjs --write` first (the publish workflow does this).')
    process.exit(1)
  }
  console.log('publish-manifest: no local dependency specs')
} else {
  console.error('usage: publish-manifest.mjs --write | --check | --print-sdk-version')
  process.exit(2)
}
