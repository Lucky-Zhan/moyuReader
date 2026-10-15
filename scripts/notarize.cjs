/**
 * electron-builder afterSign 钩子：仅在具备 Apple 公证凭据时执行公证。
 *
 * 之前 package.json 里硬编码 `"notarize": true`，导致任何没有 Apple 开发者
 * 凭据的机器（本地开发、CI 的 CSC_IDENTITY_AUTO_DISCOVERY=false 场景）
 * 执行 dist:mac 都会在公证阶段失败。
 *
 * 现在改为按凭据存在与否决定是否公证：
 * - 有凭据：签名 + 公证 + 装订（staple），产物可直接分发给用户
 * - 无凭据：跳过公证并打印提示，本地仍能产出可运行的 dmg/zip
 *
 * 凭据通过环境变量提供（electron-builder 官方推荐的三选一方式）：
 *   APPLE_ID + APPLE_APP_SPECIFIC_PASSWORD + APPLE_TEAM_ID
 *   或 APPLE_API_KEY + APPLE_API_KEY_ID + APPLE_API_ISSUER
 *   或 APPLE_KEYCHAIN_PROFILE
 */

/** 判断当前环境是否具备可用的公证凭据。 */
function hasNotarizeCredentials() {
  const hasAppleId =
    Boolean(process.env.APPLE_ID) &&
    Boolean(process.env.APPLE_APP_SPECIFIC_PASSWORD) &&
    Boolean(process.env.APPLE_TEAM_ID)

  const hasApiKey =
    Boolean(process.env.APPLE_API_KEY) &&
    Boolean(process.env.APPLE_API_KEY_ID) &&
    Boolean(process.env.APPLE_API_ISSUER)

  const hasKeychainProfile = Boolean(process.env.APPLE_KEYCHAIN_PROFILE)

  return hasAppleId || hasApiKey || hasKeychainProfile
}

exports.default = async function notarizing(context) {
  const { electronPlatformName, appOutDir, packager } = context

  if (electronPlatformName !== 'darwin') {
    return
  }

  if (!hasNotarizeCredentials()) {
    console.log(
      '  • skipped macOS notarization  reason=未检测到 Apple 公证凭据\n' +
        '    如需公证，请设置 APPLE_ID / APPLE_APP_SPECIFIC_PASSWORD / APPLE_TEAM_ID，\n' +
        '    或 APPLE_API_KEY / APPLE_API_KEY_ID / APPLE_API_ISSUER。'
    )
    return
  }

  const appName = packager.appInfo.productFilename
  const { notarize } = await import('@electron/notarize')

  console.log(`  • notarizing  app=${appName}`)

  await notarize({
    appPath: `${appOutDir}/${appName}.app`,
    ...(process.env.APPLE_API_KEY
      ? {
        appleApiKey: process.env.APPLE_API_KEY,
        appleApiKeyId: process.env.APPLE_API_KEY_ID,
        appleApiIssuer: process.env.APPLE_API_ISSUER
      }
      : {}),
    ...(process.env.APPLE_ID
      ? {
        appleId: process.env.APPLE_ID,
        appleIdPassword: process.env.APPLE_APP_SPECIFIC_PASSWORD,
        teamId: process.env.APPLE_TEAM_ID
      }
      : {})
  })

  console.log(`  • notarization complete  app=${appName}`)
}
