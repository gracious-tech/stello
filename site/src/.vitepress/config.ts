
import path from 'path'

import plugin_svg from 'vite-svg-loader'
import {defineConfig} from 'vitepress'


export default defineConfig({
    outDir: path.resolve(__dirname, '../../dist'),
    title: "Stello",
    // NOTE Description overwritten for root page
    description: "The official guide on Stello, a new way to send newsletters that are secure and interactive.",
    head: [
        ['link', {rel: 'icon', href: '/icon.png'}],
        ['meta', {property: 'og:image', content: '/social_preview.png'}],
        ['meta', {property: 'og:image:width', content: '1200'}],
        ['meta', {property: 'og:image:height', content: '628'}],
    ],
    vite: {
        resolve: {
            alias: [{find: '@', replacement: path.resolve(__dirname, '..')}],
        },
        plugins: [
            plugin_svg({
                svgoConfig: {
                    plugins: [
                        // Include default plugins
                        {
                            name: 'preset-default',
                            params: {
                                overrides: {
                                    // Don't remove `viewBox` as it's needed for scaling correctly
                                    // NOTE Also not removing width/height as overwise svg is 100%/100%
                                    removeViewBox: false,
                                    // Don't merge paths as can't then style individually via CSS
                                    mergePaths: false,
                                    // Don't collapse groups as can use to group elements for styling
                                    collapseGroups: false,
                                    // Don't remove ids which can be used for styling
                                    cleanupIDs: false,
                                },
                            },
                        },
                        // Extra plugins
                        'removeXMLNS',  // Unnecessary for inline SVGs
                    ],
                },
            }),
        ],
    },
    themeConfig: {
        logo: '/basic_logo.svg',
        nav: [
            {text: "Creator", link: 'https://gracious.tech/'},
            {text: "Source code", link: 'https://github.com/gracious-tech/stello'},
            {text: "Contact", link: 'https://gracious.tech/contact'},
            {text: "Donate", link: 'https://gracious.tech/donate'},
        ],
        sidebar: {
            '/': [
                // Though sidebar is flexible, current system is:
                // First level = Categories, Second level = Pages, Third level = Headings
                {
                    text: '',
                    children: [
                        {text: "Introduction", link: '/guide/'},
                    ],
                },
                {
                    text: "Getting started",
                    children: [
                        {text: "Installing", link: '/guide/installing/'},
                        {text: "Importing contacts", link: '/guide/migrating/'},
                        {text: "Creating a sending profile", link: '/guide/profile/'},
                    ],
                },
                {
                    text: "Using Stello",
                    children: [
                        {text: "Managing contacts", link: '/guide/contacts/'},
                        {text: "Writing messages", link: '/guide/writing/'},
                        {text: "Sending", link: '/guide/sending/'},
                        {text: "Responses", link: '/guide/responses/'},
                        {text: "Backup & transfer", link: '/guide/backup/'},
                        {text: "Portable mode", link: '/guide/portable/'},
                    ],
                },
                {
                    text: "In depth",
                    children: [
                        {text: "How Stello works", link: '/guide/system/'},
                        {text: "Security", link: '/guide/security/'},
                        {text: "Privacy", link: '/guide/privacy/'},
                        {text: "Design philosophy", link: '/guide/design/'},
                        {text: "Self-hosting", link: '/guide/hosting/'},
                    ],
                },
                {
                    text: "Troubleshooting",
                    children: [
                        {text: "How do I ...?", link: '/guide/problem-procedures/'},
                        {text: "Can't connect email account", link: '/guide/problem-connecting/'},
                        {text: "Trouble sending", link: '/guide/problem-sending/'},
                        {text: "Messages not received", link: '/guide/problem-opens/'},
                        {text: "Messages marked as spam", link: '/guide/problem-spam/'},
                        {text: "Recovering data", link: '/guide/problem-recovery/'},
                        {text: "Issues with ProtonMail", link: '/guide/problem-protonmail/'},
                        {text: "Something else...", link: '/guide/problem-other/'},
                    ]
                },
            ],
        },
    },
})
