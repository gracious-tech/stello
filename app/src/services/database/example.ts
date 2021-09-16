
import {sample} from 'lodash'

import {request_blob} from '../utils/http'
import {cycle, percent, range} from '../utils/iteration'
import {Section} from './sections'
import {ContentImages, RecordProfileHost} from './types'
import {Database} from './database'
import {generate_token} from '../utils/crypt'
import {Draft} from './drafts'


export async function generate_example_data(db:Database, multiplier:number):Promise<void>{
    // Generate dummy data for testing (can be called multiple times for even more data)
    // WARN Must await everything, otherwise browser will refresh before all saved to disk

    // Make multiplier more exponential by timesing by itself
    // NOTE Multiplier should usually be 1|2|3, so will end up as 1|4|9
    multiplier *= multiplier

    // Create a profile
    const profile = await db.profiles.create()
    profile.email = 'blackhole+sender@gracious.tech'
    profile.smtp = {
        oauth: null,
        host: 'localhost',
        port: 25,
        user: 'user',
        pass: 'pass',
        starttls: true,
    }
    profile.msg_options_identity.sender_name = "Sender Name"
    profile.host = JSON.parse(import.meta.env.VITE_DEV_HOST_SETTINGS) as RecordProfileHost
    profile.setup_step = null
    await db.profiles.set(profile)
    await db.state.set({key: 'default_profile', value: profile.id})

    // Create contacts
    const first_names = ['Adam', 'Ben', 'Charlie', 'David', 'Edward', 'Fred', 'Greg',
        'Harry']
    const last_names = ['Andrews', 'Beaver', 'Chapman', 'Driver', 'Edmonds', 'Fudge',
        'Goods', 'Harvard']
    const contacts = await Promise.all([...range(100 * multiplier)].map(async i => {
        const contact = await db.contacts.create(
            `${sample(first_names)!} ${sample(last_names)!}`,
            Math.random() > 0.8 ? '' : `blackhole+stello${i}@gracious.tech`,
        )
        // Sometimes unsubscribe them
        if (Math.random() > 0.75){
            await db.unsubscribes.set({
                profile: profile.id,
                contact: contact.id,
                sent: new Date(),
                ip: null,
                user_agent: null,
            })
        }
        // Sometimes request to change address
        if (Math.random() > 0.9 && contact.address){
            await db._conn.put('request_address', {
                contact: contact.id,
                new_address: contact.address + '.new',
                old_address: contact.address,
                sent: new Date(),
                ip: null,
                user_agent: null,
            })
        }
        return contact
    }))

    // Create groups
    await db.groups.create('Friends', [...percent(contacts, 0.2)].map(c => c.id))
    await db.groups.create('Subscribers', [...percent(contacts, 0.5)].map(c => c.id))

    // Create a text section
    const section_text = await db.sections.create({
        type: 'text',
        html: '<p>' + "A super interesting sentence. ".repeat(30) + '</p>',
        standout: null,
    })

    // Create a image section
    const image_blob = await request_blob('default_invite_image.jpg')
    const section_image = await db.sections.create({
        type: 'images',
        images: [{id: generate_token(), data: image_blob, caption: "An example image"}],
        crop: true,
    }) as Section<ContentImages>

    // Create a youtube section
    const section_youtube = await db.sections.create({
        type: 'video',
        format: 'iframe_youtube',
        id: '_fMSjImgJcI',
        caption: "This is a caption for the video",
        start: null,
        end: null,
    })

    // Create a vimeo section
    const section_vimeo = await db.sections.create({
        type: 'video',
        format: 'iframe_vimeo',
        id: '168213438',
        caption: '',
        start: null,
        end: null,
    })

    // Create base draft
    const draft = await db.drafts.create_object()
    draft.title = "A dummy newsletter"
    draft.profile = profile.id
    draft.sections = [
        [section_text.id, section_image.id],
        [section_youtube.id, section_vimeo.id],
    ]
    draft.recipients.include_contacts = contacts.slice(0, 10 * multiplier).map(c => c.id)
    await db.drafts.set(draft)

    // Create sent messages
    const titles = cycle<string>([
        "How to write a newsletter",
        "November News",
        "Stello is cool!",
        "I can't think of an interesting title",
    ])
    const messages = await Promise.all([...range(10 * multiplier)].map(async i => {
        const draft_copy = await db.draft_copy(
            new Draft({...draft, title: titles.next().value}))
        const msg = await db.draft_to_message(draft_copy.id)

        // Sometimes create resend requests
        if (Math.random() > 0.9){
            await db._conn.put('request_resend', {
                contact: draft.recipients.include_contacts[0]!,
                message: msg.id,
                reason: "I'd like another copy of this message please. "
                    .repeat(Math.random() * 10 + 1),
                sent: new Date(),
                ip: null,
                user_agent: null,
            })
        }

        return msg
    }))

    // Date creation helper
    const random_date = () => {
        const date = new Date()
        date.setDate(date.getDate() - Math.random() * 365)  // In last year
        return date
    }

    // Response contents generation
    const reactions = cycle(['like', 'love', 'laugh', 'wow', 'yay', 'pray', 'sad'])
    const reply_text = "Cool, great to hear about https://stello.news. "
    const random_reply = () => {
        return reply_text.repeat(Math.random() * 10 + 1)
    }

    // Create responses
    for (const msg of percent(messages)){
        const msg_section_ids = cycle(msg.draft.sections.flat() as MinOne<string>)
        const msg_subsection_ids =
            cycle([null, section_image.content.images[0]!.id, null, null])
        for (const msg_copy of percent(await db.copies.list_for_msg(msg.id))){
            if (Math.random() > 0.5){
                await db.reply_create(random_reply(), random_date(), msg_copy.resp_token,
                    null, null, '', '')
            }
            if (Math.random() > 0.5){
                await db.reply_create(random_reply(), random_date(), msg_copy.resp_token,
                    msg_section_ids.next().value, msg_subsection_ids.next().value, '', '')
            }
            if (Math.random() > 0.5){
                await db.reaction_create(reactions.next().value, random_date(),
                    msg_copy.resp_token, msg_section_ids.next().value,
                    msg_subsection_ids.next().value, '', '')
            }
        }
    }
}