import fs from 'node:fs'
import path from 'node:path'

const releaseDir = path.resolve('release')
const packageJson = JSON.parse(fs.readFileSync(path.resolve('package.json'), 'utf8'))
const productName = packageJson.build?.productName ?? packageJson.productName ?? packageJson.name
const packageName = packageJson.name

function fail(message) {
  console.error(message)
  process.exit(1)
}

function assertDir(targetPath, label) {
  if (!fs.existsSync(targetPath) || !fs.statSync(targetPath).isDirectory()) {
    fail(`Missing ${label}: ${targetPath}`)
  }
}

function assertFile(targetPath, label) {
  if (!fs.existsSync(targetPath) || !fs.statSync(targetPath).isFile()) {
    fail(`Missing ${label}: ${targetPath}`)
  }
}

function assertExecutable(targetPath, label) {
  assertFile(targetPath, label)

  if (process.platform !== 'win32' && (fs.statSync(targetPath).mode & 0o111) === 0) {
    fail(`${label} is not executable: ${targetPath}`)
  }
}

function findDirs(root, predicate, depth = 0) {
  if (!fs.existsSync(root) || depth > 5) {
    return []
  }

  return fs.readdirSync(root, { withFileTypes: true }).flatMap(entry => {
    if (!entry.isDirectory()) {
      return []
    }

    const fullPath = path.join(root, entry.name)

    if (predicate(entry.name, fullPath)) {
      return [fullPath]
    }

    return findDirs(fullPath, predicate, depth + 1)
  })
}

function findRootExecutable(appDir) {
  const candidates = fs.readdirSync(appDir, { withFileTypes: true })
    .filter(entry => entry.isFile())
    .map(entry => path.join(appDir, entry.name))

  if (process.platform === 'win32') {
    return candidates.find(candidate => path.basename(candidate).toLowerCase() === `${productName}.exe`.toLowerCase())
      ?? candidates.find(candidate => path.basename(candidate).toLowerCase() === `${packageName}.exe`.toLowerCase())
      ?? candidates.find(candidate => candidate.toLowerCase().endsWith('.exe'))
  }

  return candidates.find(candidate => path.basename(candidate) === productName)
    ?? candidates.find(candidate => path.basename(candidate) === packageName)
    ?? candidates.find(candidate => {
      const stat = fs.statSync(candidate)
      return (stat.mode & 0o111) !== 0 && !path.basename(candidate).includes('.')
    })
}

assertDir(releaseDir, 'release directory')

if (process.platform === 'darwin') {
  const appDirs = findDirs(releaseDir, name => name.endsWith('.app'))
  const appDir = appDirs.find(candidate => path.basename(candidate) === `${productName}.app`) ?? appDirs[0]

  if (!appDir) {
    fail('No macOS .app bundle found in release/')
  }

  assertFile(path.join(appDir, 'Contents', 'Info.plist'), 'macOS Info.plist')
  assertFile(path.join(appDir, 'Contents', 'Resources', 'app.asar'), 'macOS app.asar')
  assertExecutable(path.join(appDir, 'Contents', 'MacOS', productName), 'macOS app executable')
  console.log(`Verified macOS package: ${appDir}`)
} else {
  const unpackedDirs = findDirs(releaseDir, name => name.endsWith('-unpacked'))
  const platformHint = process.platform === 'win32' ? 'win' : 'linux'
  const appDir = unpackedDirs.find(candidate => path.basename(candidate).toLowerCase().includes(platformHint))
    ?? unpackedDirs[0]

  if (!appDir) {
    fail(`No ${platformHint} unpacked app directory found in release/`)
  }

  assertFile(path.join(appDir, 'resources', 'app.asar'), `${platformHint} app.asar`)

  const executable = findRootExecutable(appDir)

  if (!executable) {
    fail(`No ${platformHint} app executable found in ${appDir}`)
  }

  assertExecutable(executable, `${platformHint} app executable`)
  console.log(`Verified ${platformHint} package: ${appDir}`)
}
