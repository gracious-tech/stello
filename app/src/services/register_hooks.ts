/* FIX noted in https://github.com/vuejs/vue-class-component/issues/264#issuecomment-426618715

For some reason calling `registerHooks` directly in `main.ts` (even if before everything else)
will not work. Webpack may be moving all imports up before any other code executes, which would
cause this, as `Component` would be used in other imports before `registerHooks` is called.

By placing this code here and importing it, it can get executed before any components are imported.

*/

import Component from 'vue-class-component'


// Register router hooks for all components
Component.registerHooks(['beforeRouteEnter', 'beforeRouteLeave', 'beforeRouteUpdate'])
