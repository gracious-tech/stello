
import DefaultTheme from 'vitepress/theme'
import {Theme} from 'vitepress'

import CustomLayout from './CustomLayout.vue'
import NotFound from '@/.comp/NotFound.vue'
import {EXAMPLE_URL} from '@/globals'

import './custom.sass'


export default {
    ...DefaultTheme,
    Layout: CustomLayout,
    NotFound,
    enhanceApp({app}){
        // Make $EXAMPLE_URL available in all components/pages
        app.config.globalProperties.$EXAMPLE_URL = EXAMPLE_URL
    },
} as Theme
