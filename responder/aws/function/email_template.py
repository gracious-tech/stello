
import html

from email_image import base64_image


email_template = '''
<!DOCTYPE html>
<html>
    <head></head>
    <body style='margin: 0; padding: 24px; padding-bottom: 150px; background-color: #222222;'>
        <div style='border-radius: 12px; max-width: 600px; margin: 0 auto; background-color: #eeeeee; color: #000000;'>
            <a href='stello://responses'>
                <img src='data:image/jpeg;base64,{image}' height='1' width='4' style='border-radius: 12px 12px 0 0; width: 100%; height: auto; border-bottom: 1px solid #cccccc;max-height: 150px; background-color: #ddeeff'>
            </a>
            <div style='padding: 24px;'>
                <p><strong>{heading}</strong></p>
                <p><br><br>{body}</p>
            </div>

            <hr style='margin: 0; border-style: solid; border-color: #cccccc; border-width: 1px 0 0 0;'>

            <div style='padding: 12px; border-radius: 0 0 12px 12px; text-align: center;
                    background-color: #ddeeff; color: #000000; font-family: Roboto, sans-serif;'>

                <p style='margin: 36px 0;'>
                    <a href='stello://responses' style='background-color: #224477; color: #ffffff;
                            padding: 12px 18px; border-radius: 12px; text-decoration: none;'>
                        <strong>View in Stello</strong>
                    </a>
                </p>

            </div>

        </div>

        <hr style='border-style: none;'>
        <p>&nbsp;</p>

        <p style='text-align: center; color: #aaaaaa; max-width: 600px; margin: 0 auto;'>
            <small style="font-size: 0.8em;">
                Open Stello to identify who responded and to reply to them
                (not possible via email for security reasons).
                <br>
                <br>
                Open <a href="https://stello.news/" style="color: #aaaaaa;">Stello</a> to customise your notification settings. If you've lost access to your account, or shouldn't be receiving these, <a href="https://gracious.tech/support/stello/" style="color: #aaaaaa;">let us know</a>.
            </small>
        </p>

    </body>
</html>
'''

def generate_email(heading, body):
    heading = html.escape(heading)
    body = html.escape(body).replace('\n', '<br>')
    return email_template.format(heading=heading, body=body, image=base64_image)
