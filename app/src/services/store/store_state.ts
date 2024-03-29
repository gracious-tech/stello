
import {nested_objects_set, NestedKeyMissing} from '@/services/utils/objects'
import {catch_only} from '@/services/utils/exceptions'
import {Database} from '@/services/database/database'
import {AppStoreState} from './types'


export const KEY_SEPARATOR = '$'

export async function get_initial_state(db:Database):Promise<AppStoreState>{

    // Construct full state with defaults
    // WARN Defaults must be constants as won't be saved until changed (e.g. no dates or random)
    const state:AppStoreState = {

        // Configurable
        // NOTE dark defaults to true since `matches` will be false both if dark & if not supported
        dark: matchMedia('(prefers-color-scheme: light)').matches === false,
        dark_message: false,
        default_profile: null,
        default_template: null,
        default_contacts: null,
        manager_aws_key_id: '',
        manager_aws_max_lifespan: Infinity,
        fallback_secret: null,

        // Private state
        usage_installed: null,  // Will be inited via main.ts if null
        usage_opens: 0,  // This will soon be increased to 1 via main.ts
        usage_sends: 0,  // This doesn't track replies after 1.1.0
        show_splash_welcome: true,
        show_splash_disclaimer: true,
        show_guide_default: true,

        // Tmp
        tmp: {

            // Viewport dimensions (excluding scrollbars)
            // NOTE clientWidth of <html> returns viewport less scrollbars (unlike innerWidth)
            viewport_width: self.document.documentElement.clientWidth,
            viewport_height: self.document.documentElement.clientHeight,

            // User UI
            snackbar: null,
            dialog: null,
            prev_route: null,
            prev_state_contacts: null,
            cut_section: null,

            // Unread responses
            unread_replies: {},
            unread_reactions: {},

            // Copy property changes (for watching)
            uploaded: null,
            invited: null,

            // Secrets that shouldn't be preserved
            manager_aws_key_secret: '',
        },
    }

    // Get stored dict values
    const items = await db.state.list()

    // Override store defaults with all stored values
    // NOTE Values are only written when changed, so many keys will not have values stored
    for (const item of items){
        try {
            const keys = item.key.split(KEY_SEPARATOR) as MinOne<string>
            nested_objects_set(state, keys, item.value)
        } catch (error){
            catch_only(NestedKeyMissing, error)
            // Key is obsolete (from old app version or old room residue from mulitple tabs)
            // TODO Ignoring for now, for review later and possible auto-deletion if safe
        }
    }

    // Return the state
    // WARN Do not return until updating it has finished (await all async tasks)
    return state
}
