const { withAndroidManifest } = require('@expo/config-plugins');

const googlePermissions = [
    'com.google.android.c2dm.permission.RECEIVE',
    'com.google.android.finsky.permission.BIND_GET_INSTALL_REFERRER_SERVICE',
];

const withConditionalGoogleServices = (config) => {
    const region = process.env.REGION || 'global';
    const isCn = region === 'cn';

    return withAndroidManifest(config, (manifestConfig) => {
        const manifest = manifestConfig.modResults.manifest;

        if (isCn) {
            // Remove Google permissions
            manifest['uses-permission'] = manifest['uses-permission'].filter(
                (perm) => !googlePermissions.includes(perm.$?.['android:name'])
            );

            // Remove Firebase meta-data from application
            if (manifest.application) {
                manifest.application.forEach((app) => {
                    if (app['meta-data']) {
                        app['meta-data'] = app['meta-data'].filter(
                            (meta) => !meta.$?.['android:name']?.startsWith('com.google.firebase')
                        );
                    }
                });
            }
        }

        return manifestConfig;
    });
};

module.exports = withConditionalGoogleServices;
