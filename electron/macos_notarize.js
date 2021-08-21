
const notarize = require('electron-notarize')


exports.default = async function(context){
    // Run during electron build after signing

    // Don't run if not on macOS
    if (context.electronPlatformName !== 'darwin'){
        return
    }

    // Extract some config
    const appId = context.packager.appInfo.id  // appId is only exposed as `id`
    const productFilename = context.packager.appInfo.productFilename

    // Notarize
    return await notarize({
        appBundleId: appId,
        appPath: `${context.appOutDir}/${productFilename}.app`,
        appleId: process.env.APPLE_ID,
        appleIdPassword: process.env.APPLE_ID_PASS,
    })

}
