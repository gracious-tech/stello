
# Managing Contacts

Stello provides a basic contact management system that is designed to be sufficient for designating who messages are sent to but not much beyond that. You may wish to use an existing contact management system alongside Stello that can record more detailed information such as addresses and phone numbers. Stello does support ongoing syncing with Google Contacts though.

## Contact names
Stello has a single fullname field for contacts as well as a name for greetings. The name for greetings will default to the full name except for the last part of it. So by default the greeting name will be as follows:
 * Adam Builder -> Adam
 * Charlie & Diana Edwards -> Charlie & Diana

Where as you could specify a different name for greetings if the default does not work, such as "Dr Redman" for "Dr Robert Redman", or a nickname for a friend, etc.

## Grouping contacts
It is up to you how you'd like to organise your contacts. Most users will generally have at least one group for their "subscribers", but you could also create multiple groups based on newsletter, relationship, location, etc.

For example, you might have the following groups where contacts overlap several of them, and send to each of them different messages depending on the occasion:

| Group                     | Contacts                      |
| -                         | -                             |
| Annual report subscribers | Adam, Betty, Charlie, Diana   |
| Newsletter subscribers    | Adam, Betty, Charlie          |
| Financial supporters      | Adam, Diana                   |
| London                    | Adam, Betty                   |
| New York                  | Charlie, Diana                |
| Family                    | Betty, Diana                  |

You could then, for example, send a message to only subscribers in London by selecting the newsletter group and excluding the New York group.

## Sending to mailing lists
You may wish to include a mailing list as one of your contacts, such as an email address that forwards messages to a larger group. In such cases you should select the "This is a mailing list" option for that contact. Stello will then hide unsubscribe buttons (so one person will not unsubscribe the whole group) and allow infinite opens (so that one person cannot make the message expire for everyone in the group).

## Sending to non-email contacts
Stello messages can be sent via any messaging platform you like since they are accessed via a single link. Stello can only automatically send via email though. To send via other channels (like social media) you must copy and paste the link yourself. Stello makes this easier by providing a button for each email-less contact after you send a message that will copy the link and a short message that can then be pasted straight into a text message.

## Disengaged contacts
There is a special list in the contacts page which is the "Disengaged" contacts list. Contacts appear in this list when they have not opened at least 2 messages in a row. You can see how many messages they haven't opened between now and the last time they opened a message, as well as the time duration. You can use this page to either follow up disengaged contacts or remove them.

## Unsubscribed contacts
When contacts unsubscribe they unsubscribe from the sending profile you used to send the message. If you try to send to a group they are included in using the same sending profile then they will appear crossed out and not be sent to. However they will be included if you use a different sending profile (representing a different newsletter) or if you explicity include them individually.


## Exporting contacts
You can export contacts from Stello by first selecting the contacts you wish to export and then performing the "Export selected" bulk action. You can also export them all from the settings page.
