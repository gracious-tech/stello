// Module of webpack-embedded svg strings (relies on svgo-loader and raw-loader)


/* WARN Regarding dynamic imports such as with `require()` and `require.context()`

Webpack can import dynamically, but since it (believes) it cannot know the module path until runtime
it instead imports EVERY FILE in the dir so that they'll all be available to choose from.

require(`dir/${name}.svg`) gets turned into require.context('dir', false, /^.*\.svg$/)

And since it does static analysis it cannot import the following:
    path = 'dir/name.js'; require(path)
as it doesn't know what dir it will be in till runtime.

This could be good for importing all files in a dir (if desired), but NOT for some files only.

See https://webpack.js.org/guides/dependency-management

*/


export default {
    // NOTE `require` used only because `export icon from 'icon.svg'` is not possible
    //      Only `export {icon} from 'icon.svg'` is possible (but not suitable)

    // Custom
    logo:                   require('@/branding/logo.svg').default,
    logo_google:            require('@/assets/logo_google.svg').default,
    logo_microsoft:         require('@/assets/logo_microsoft.svg').default,
    decor_compose:          require('@/assets/decor_compose.svg').default,
    icon_next_plan:         require('@/assets/icon_next_plan.svg').default,
    icon_import:            require('@/assets/icon_import.svg').default,
    icon_post_add:          require('@/assets/icon_post_add.svg').default,
    icon_video:             require('@/assets/icon_video.svg').default,
    icon_checkbox_cross:    require('@/assets/icon_checkbox_cross.svg').default,
    icon_privacy_tip:       require('@/assets/icon_privacy_tip.svg').default,
    icon_groups:            require('@/assets/icon_groups.svg').default,

    // Material icons
    icon_invert_colors:     require('md-icon-svgs/invert_colors.svg').default,
    icon_compare_arrows:    require('md-icon-svgs/compare_arrows.svg').default,
    icon_cloud_download:    require('md-icon-svgs/cloud_download.svg').default,
    icon_settings:          require('md-icon-svgs/settings.svg').default,
    icon_arrow_back:        require('md-icon-svgs/arrow_back.svg').default,
    icon_arrow_forward:     require('md-icon-svgs/arrow_forward.svg').default,
    icon_arrow_upward:      require('md-icon-svgs/arrow_upward.svg').default,
    icon_arrow_downward:    require('md-icon-svgs/arrow_downward.svg').default,
    icon_arrow_drop_down:   require('md-icon-svgs/arrow_drop_down.svg').default,
    icon_more_vert:         require('md-icon-svgs/more_vert.svg').default,
    icon_chevron_left:      require('md-icon-svgs/chevron_left.svg').default,
    icon_chevron_right:     require('md-icon-svgs/chevron_right.svg').default,
    icon_open_in_new:       require('md-icon-svgs/open_in_new.svg').default,
    icon_view_list:         require('md-icon-svgs/view_list.svg').default,
    icon_subject:           require('md-icon-svgs/subject.svg').default,
    icon_group:             require('md-icon-svgs/group.svg').default,
    icon_attach_money:      require('md-icon-svgs/attach_money.svg').default,
    icon_get_app:           require('md-icon-svgs/get_app.svg').default,
    icon_warning:           require('md-icon-svgs/warning.svg').default,
    icon_info:              require('md-icon-svgs/info.svg').default,
    icon_close:             require('md-icon-svgs/close.svg').default,
    icon_share:             require('md-icon-svgs/share.svg').default,
    icon_hearing:           require('md-icon-svgs/hearing.svg').default,
    icon_record_voice_over: require('md-icon-svgs/record_voice_over.svg').default,
    icon_network_check:     require('md-icon-svgs/network_check.svg').default,
    icon_star:              require('md-icon-svgs/star.svg').default,
    icon_star_border:       require('md-icon-svgs/star_border.svg').default,
    icon_schedule:          require('md-icon-svgs/schedule.svg').default,
    icon_chat:              require('md-icon-svgs/chat.svg').default,
    icon_help:              require('md-icon-svgs/help.svg').default,
    icon_mail:              require('md-icon-svgs/mail.svg').default,
    icon_play_arrow:        require('md-icon-svgs/play_arrow.svg').default,
    icon_pause:             require('md-icon-svgs/pause.svg').default,
    icon_skip_next:         require('md-icon-svgs/skip_next.svg').default,
    icon_error:             require('md-icon-svgs/error.svg').default,
    icon_keyboard_tab:      require('md-icon-svgs/keyboard_tab.svg').default,
    icon_meeting_room:      require('md-icon-svgs/meeting_room.svg').default,
    icon_volume_off:        require('md-icon-svgs/volume_off.svg').default,
    icon_volume_up:         require('md-icon-svgs/volume_up.svg').default,
    icon_volume_down:       require('md-icon-svgs/volume_down.svg').default,
    icon_subscriptions:     require('md-icon-svgs/subscriptions.svg').default,
    icon_send:              require('md-icon-svgs/send.svg').default,
    icon_done:              require('md-icon-svgs/done.svg').default,
    icon_delete:            require('md-icon-svgs/delete.svg').default,
    icon_edit:              require('md-icon-svgs/edit.svg').default,
    icon_live_tv:           require('md-icon-svgs/live_tv.svg').default,
    icon_fullscreen:        require('md-icon-svgs/fullscreen.svg').default,
    icon_lock:              require('md-icon-svgs/lock.svg').default,
    icon_color_lens:        require('md-icon-svgs/color_lens.svg').default,
    icon_add:               require('md-icon-svgs/add.svg').default,
    icon_remove:            require('md-icon-svgs/remove.svg').default,
    icon_checkbox_true:     require('md-icon-svgs/check_box.svg').default,
    icon_checkbox_false:    require('md-icon-svgs/check_box_outline_blank.svg').default,
    icon_checkbox_null:     require('md-icon-svgs/indeterminate_check_box.svg').default,
    icon_security:          require('md-icon-svgs/security.svg').default,
    icon_image:             require('md-icon-svgs/image.svg').default,
    icon_library_books:     require('md-icon-svgs/library_books.svg').default,
    icon_fingerprint:       require('md-icon-svgs/fingerprint.svg').default,
    icon_contact_mail:      require('md-icon-svgs/contact_mail.svg').default,
    icon_attach_file:       require('md-icon-svgs/attach_file.svg').default,
    icon_pie_chart:         require('md-icon-svgs/pie_chart.svg').default,
    icon_format_bold:       require('md-icon-svgs/format_bold.svg').default,
    icon_format_italic:     require('md-icon-svgs/format_italic.svg').default,
    icon_link:              require('md-icon-svgs/link.svg').default,
    icon_title:             require('md-icon-svgs/title.svg').default,
    icon_text_fields:       require('md-icon-svgs/text_fields.svg').default,
    icon_list_numbered:     require('md-icon-svgs/format_list_numbered.svg').default,
    icon_list_bulleted:     require('md-icon-svgs/format_list_bulleted.svg').default,
    icon_radio_checked:     require('md-icon-svgs/radio_button_checked.svg').default,
    icon_radio_unchecked:   require('md-icon-svgs/radio_button_unchecked.svg').default,
    icon_format_quote:      require('md-icon-svgs/format_quote.svg').default,
    icon_visibility:        require('md-icon-svgs/visibility.svg').default,
    icon_visibility_off:    require('md-icon-svgs/visibility_off.svg').default,
    icon_cancel:            require('md-icon-svgs/cancel.svg').default,
    icon_check_circle:      require('md-icon-svgs/check_circle.svg').default,
}
