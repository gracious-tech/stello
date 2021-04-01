
module.exports = {
    presets: [
        ['@vue/app', {
            targets: {
                esmodules: true,
            },
            polyfills: [],
        }],
    ],
    plugins: ['@babel/plugin-proposal-logical-assignment-operators'],
}
