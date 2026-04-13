
<style lang='sass' scoped>

td:nth-child(2)
    color: hsl(0, 100%, 80%, 0.8)

td:nth-child(3)
    color: hsl(140, 100%, 80%, 0.8)

.transient
    color: hsl(20, 100%, 80%, 0.8)

</style>

# Privacy
Stello's security not only makes it a more secure alternative to other solutions but it also makes it a more private one as well. Your messages cannot be read by the services used to send them because they are encrypted. Your drafts and contacts stay on your device rather than a server, and your sending account doesn't require any personal information that could be used to identify you.

### What the sending service can see

| Information                   | Mailchimp / etc   | Stello
| -                             | -                 | -
| Your name                     | Viewable          | Inaccessible
| Your email address            | Viewable          | Inaccessible
| Your contacts                 | Viewable          | Inaccessible
| Your drafts                   | Viewable          | Inaccessible
| Contents of sent messages     | Viewable          | Inaccessible
| Who messages are sent to      | Viewable          | Inaccessible
| Time messages sent            | Viewable          | <span class='transient'>Transient</span>
| Quantity of messages sent     | Viewable          | <span class='transient'>Transient</span>
| Your IP address (and location)| Viewable          | <span class='transient'>Transient</span>

Some data as seen above is "transient" in that it is impossible for the sending service not to know about it, but it is not preserved and disappears as soon as your messages expire.


### Motivation
Stello was created by a [non-profit Christian organisation](https://gracious.tech) and our motivation has been purely to create apps that help Christian causes. So we have no interest in your data, rather we much prefer not to have any of it. We'll also never charge anything and never introduce a premium plan when used for Christian causes (other use cases are also currently free for the foreseeable future).
