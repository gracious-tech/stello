
<template lang='pug'>

v-card

    v-card-title Files

    v-card-text

        v-list
            v-list-item(v-for='file of files' dense)
                v-list-item-content
                    app-text.name(v-model='file.name' outlined dense)
                v-list-item-action(class='ml-4')
                    div {{ file.megabytes }}
                v-list-item-action
                    app-btn(@click='file.remove' icon='remove' color='error')

        div(class='text-center mb-4')
            app-file(@input='add_files' multiple) Add files

        p(v-if='files.length > 1' class='warning--text text-center')
            | Multiple files will be combined into a zip file
            | <br>(you could instead create a separate section for each)

        p(v-if='files.length' class='text-center') Total size is {{ total_megabytes }}

        v-alert(v-if='exceeded_limit.length' color='warning' text)
            div
                strong These files would exceed the {{ limit_mb }} limit
            v-list
                v-list-item(v-for='file of exceeded_limit' dense)
                    v-list-item-content
                        v-list-item-title {{ file.filename }}
                    v-list-item-action
                        v-list-item-title {{ file.megabytes }}

        template(v-if='files.length')

            div(class='stello-displayer-styles text-center my-6' :style='theme_style_props'
                    :class='style')
                div(class='btn-text s-primary')
                    div.contents
                        shared-files-icon(:download='will_download')
                        input(v-model='label')

            app-switch(v-if='section.files_can_open' v-model='download' class='align-center'
                label="Download" label_false="Open in tab")


    v-card-actions
        app-btn(@click='dismiss') Done

</template>


<script lang='ts'>

import {Component, Vue, Prop} from 'vue-property-decorator'

import SharedFilesIcon from '@/shared/SharedFilesIcon.vue'
import {Section} from '@/services/database/sections'
import {ContentFiles} from '@/services/database/types'
import {partition} from '@/services/utils/strings'


function mb(bytes:number){
    // Format bytes as a megabytes string
    return `${Math.ceil(bytes / 1000 / 1000)} MB`
}


@Component({
    components: {SharedFilesIcon},
})
export default class extends Vue {

    @Prop({type: Section, required: true}) declare readonly section:Section<ContentFiles>
    @Prop({type: Object, required: true}) declare readonly theme_style_props:Record<string, string>

    limit = 50 * 1000 * 1000  // 50 MB
    exceeded_limit:{filename:string, megabytes:string}[] = []  // Files rejected due to limit

    get content(){
        // Easier access to content
        return this.section.content
    }

    get style(){
        // Theme style as a class string
        return 'style-' + this.theme_style_props["--stello-style"]!
    }

    get limit_mb(){
        // Limit as mb string
        return mb(this.limit)
    }

    get total_bytes(){
        // The total bytes of all files currently added
        return this.content.files.reduce((total, file) => total + file.data.size, 0)
    }

    get total_megabytes(){
        // Total in megabytes form
        return mb(this.total_bytes)
    }

    get label(){
        return this.content.label
    }
    set label(value){
        this.content.label = value
        this.save()
    }

    get download(){
        return this.content.download
    }
    set download(value){
        this.content.download = value
        this.save()
    }

    get will_download(){
        return this.download || !this.section.files_can_open
    }

    get files(){
        // Access to attached files and methods to manipulate them
        // eslint-disable-next-line @typescript-eslint/no-this-alias -- set can't be arrow fn
        const component = this
        return this.content.files.map((file, i) => {
            return {
                get megabytes(){
                    return mb(file.data.size)
                },
                get name(){
                    return file.name
                },
                set name(value){
                    file.name = value
                    component.save()
                },
                remove: () => {
                    this.content.files.splice(i, 1)
                    this.save()
                },
            }
        })
    }

    add_files(files:File[]){
        // Add files (if within limits)

        // Clear records of previously rejected files
        this.exceeded_limit = []

        for (const file of files){

            // Check limit
            if (this.total_bytes + file.size > this.limit){
                // Adding this file will exceed limit so skip
                this.exceeded_limit.push({filename: file.name, megabytes: mb(file.size)})
                continue
            }

            // Separate filename parts
            // NOTE All parts of extension (e.g. '.tar.gz') should be kept
            // WARN Keep . as prefix of extension as will just join name+ext latter
            let [name, ext] = partition(file.name, '.')
            ext = ext ? '.' + ext.toLowerCase() : ''

            this.content.files.push({
                data: new Blob([file], {type: file.type}),
                name,
                ext,
            })

            // Use file name for label if not set yet
            if (!this.label){
                const verb = this.section.files_can_open && !this.download ? "Open" : "Download"
                this.label = `${verb} ${name}`
            }
        }

        this.save()
    }

    save(){
        // Save changes to db
        void self.app_db.sections.set(this.section)
    }

    dismiss(){
        this.$emit('close')
    }

}

</script>


<style lang='sass' scoped>

.name ::v-deep .v-text-field__details
    display: none

.btn-text input
    text-align: center

</style>
