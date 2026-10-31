
"""Tests for notification email template"""

from email_template import generate_email
from email_image import base64_image


def test_escapes_and_formats():
    # Heading and body are escaped, and body newlines become line breaks
    html = generate_email('A & <B>', '<i>one</i>\ntwo')
    assert '<strong>A &amp; &lt;B&gt;</strong>' in html
    assert '&lt;i&gt;one&lt;/i&gt;<br>two' in html


def test_embeds_image():
    # Banner image is embedded as data URI
    assert f'data:image/jpeg;base64,{base64_image}' in generate_email('h', 'b')
