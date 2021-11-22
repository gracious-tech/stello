
import html

from email_image import base64_image


email_template = '''
<html>

<head>
    <meta name="color-scheme" content="light dark">
    <style>
        @media (prefers-color-scheme: dark) {{
            .button {{
                background-color: #bbddff !important;
                color: #000000 !important;
            }}
        }}
    </style>
</head>

<body style="padding-top:4px;padding-bottom:150px">
    <div style="border-radius:12px;max-width:600px;margin:0 auto;background-color:rgba(127,127,127,0.15)">
        <a href="stello://responses">
            <img src="data:image/jpeg;base64,{image}" height="150" width="600"
                style="border-radius: 12px 12px 0 0; width: 100%; height: auto; border-bottom: 1px solid #cccccc;max-height: 150px; background-color: #ddeeff">
        </a>
        <div style="padding:16px">
            <p><strong>{heading}</strong></p>
            <p><br><br>{body}</p>
        </div>

        <hr style="margin:0;border-style:solid;border-color:#cccccc;border-width:1px 0 0 0">

        <div style="border-radius:0 0 12px 12px;background-color:rgba(87,127,167,0.3);padding:36px 0;text-align:center">

            <a class="button" href="stello://responses"
                style="background-color:#114488;color:#ffffff;padding:12px 0;border-radius:12px;text-decoration:none;font-family:Roboto,sans-serif">
                <span style="mso-text-raise: 20pt;">&nbsp;</span>
                &nbsp;
                <strong style="mso-text-raise: 10pt;">View in Stello</strong>
                &nbsp;&nbsp;
            </a>

        </div>

    </div>

    <hr style="border-style:none">
    <p>&nbsp;</p>
    <p style='text-align: center; color: #aaaaaa; max-width: 600px; margin: 0 auto;'>
        <small style="font-size: 0.8em;">
            Open Stello to identify who responded and to reply to them
            (not possible via email for security reasons).
            <br>
            <br>
            Open <a href="stello://settings" style="color: #aaaaaa;">Stello</a> to customise your notification settings. If you've lost access to your account, or shouldn't be receiving these, <a href="https://gracious.tech/support/stello/" style="color: #aaaaaa;">let us know</a>.
        </small>
    </p>

</body>

</html>
'''

def generate_email(heading, body):
    heading = html.escape(heading)
    body = html.escape(body).replace('\n', '<br>')
    return email_template.format(heading=heading, body=body, image=base64_image)
