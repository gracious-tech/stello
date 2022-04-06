
<template lang='pug'>

v-card

    v-card-text(class='pt-6')
        //- NOTE No title & all fields dense/outlined to save space so can see both chart & data

        app-text(v-model='title' label="Chart title" dense outlined)
        app-textarea(v-model='caption' label="Caption" :rows='1' @keydown.enter.prevent dense
            outlined)

        app-text(v-model='threshold' label="Threshold" placeholder="Number / % / $" class='mb-4'
            dense outlined
            hint="A budget/goal/limit/etc that all other numbers will be relative to (optional)")

        div.item(v-for='row of rows' class='d-flex')
            app-text(v-model='row.label' placeholder="Label" class='mr-4' dense outlined)
            app-text.number(v-model='row.number' placeholder="Number" dense outlined)
            app-menu-more.hue(:color='row.color' icon='palette')
                app-list-item.hue(v-for='hue of hues' @click='row.hue = hue'
                    :color='`hsl(${hue}, 50%, 50%)`' :input-value='true')
            app-btn(@click='row.up' :disabled='rows.length < 2' icon='arrow_upward')
            app-btn(@click='row.remove' icon='remove' color='error')

        div(class='text-center mt-2')
            app-btn(@click='new_row' outlined small) Add item

        v-radio-group(v-model='chart' row class='mt-4')
            span(class='mr-6')
                strong Chart type:
            v-radio(label="Comparison" value='bar' color='accent')
            v-radio(label="Trend" value='line' color='accent')
            v-radio(label="Breakdown" value='doughnut' color='accent')

        //- Disable animation while editing so chart doesn't constantly jump around
        shared-chart.chart(:type='content.chart' :data='content.data' :threshold='content.threshold'
            :title='content.title' :caption='content.caption' :dark='$store.state.dark'
            :animate='false')

    v-card-actions
        app-btn(@click='dismiss') Done

</template>


<script lang='ts'>

import {Component, Vue, Prop} from 'vue-property-decorator'

import SharedChart from '@/shared/SharedChart.vue'
import {Section} from '@/services/database/sections'
import {ContentChart} from '@/services/database/types'
import {range} from '@/services/utils/iteration'


@Component({
    components: {SharedChart},
})
export default class extends Vue {

    @Prop({type: Section, required: true}) declare readonly section:Section<ContentChart>

    hues = [...range(0, 360, 30)]

    get content(){
        // Easier access to content
        return this.section.content
    }

    get chart(){
        return this.content.chart
    }
    set chart(value){
        this.content.chart = value
        this.save()
    }

    get title(){
        return this.content.title
    }
    set title(value){
        this.content.title = value
        this.save()
    }

    get caption(){
        return this.content.caption
    }
    set caption(value){
        this.content.caption = value
        this.save()
    }

    get threshold(){
        return this.content.threshold
    }
    set threshold(value){
        this.content.threshold = value
        this.save()
    }

    get rows(){
        // Get access to row data and provide methods for manipulating it
        // eslint-disable-next-line @typescript-eslint/no-this-alias -- get/set can't be arrow fn
        const component = this
        return this.content.data.map((row, i) => {
            return {
                get number(){
                    return row.number
                },
                set number(value){
                    row.number = value
                    component.save()
                },
                get label(){
                    return row.label
                },
                set label(value){
                    row.label = value
                    component.save()
                },
                get color(){
                    return `hsla(${row.hue}, 50%, 50%, 0.5)`
                },
                set hue(value:number){
                    row.hue = value
                    component.save()
                },
                remove: () => {
                    this.content.data.splice(i, 1)
                    component.save()
                },
                up: () => {
                    // Move up (or to end if already first)
                    const desired_position = (i === 0 ? this.content.data.length : i) - 1
                    this.content.data.splice(i, 1)  // Rm self
                    this.content.data.splice(desired_position, 0, row)  // Re-insert self
                    component.save()
                },
            }
        })
    }

    new_row(){
        // Add a new row of data

        // Auto-pick hue for the new row by jumping to different part of color spectrum
        // NOTE Intentionally doesn't default to red (0) when adding first item
        // NOTE Repeating +150 will cycle through all eventually (+60/90/120 would never reach some)
        const hue = ((this.content.data.at(-1)?.hue ?? 0) + 150) % 360

        this.content.data.push({number: '', label: '', hue})
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

@import 'src/styles/utils'


.item ::v-deep .v-text-field__details
    display: none

.number
    max-width: 120px

.hue
    background-color: currentColor
    margin: 4px 8px
    min-width: 100px
    min-height: 36px

.chart
    @include themed(background-color, #eee, #111)  // Should be same as displayer content bg
    padding: 18px 0  // Since bg different from dialog, don't let title/caption touch edge

</style>
