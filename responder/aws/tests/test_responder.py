
"""Tests for responder Lambda: validate -> store -> notify flow for each response type"""

import base64

import pytest
from cryptography.hazmat.primitives.ciphers.aead import AESGCM

from conftest import MSGS_BUCKET, RESP_BUCKET, DOMAIN_UNBRANDED, TOPIC_ARN, to_url64, \
    sym_encrypt


# GET REQUESTS


def inviter_event(responder, **params):
    """Event for an invite image request"""
    return responder.event('GET', '/inviter/image', headers={}, queryStringParameters=params)


def test_inviter_image_decrypts(self_hosted):
    # Store encrypted image and request it
    key = AESGCM.generate_key(256)
    self_hosted.s3.put_object(Bucket=MSGS_BUCKET, Key='messages/_user/invite_images/c1',
        Body=sym_encrypt(key, b'image-bytes'))
    resp = self_hosted.mod.entry(inviter_event(self_hosted, user='_user', copy='c1',
        k=to_url64(key)), None)
    assert resp['statusCode'] == 200
    assert resp['isBase64Encoded'] is True
    assert base64.b64decode(resp['body']) == b'image-bytes'
    assert resp['headers'] == {'content-type': 'image/jpeg', 'cache-control': 'no-store'}


def test_inviter_image_png_format(self_hosted):
    # Format param only accepts png, anything else is jpeg
    key = AESGCM.generate_key(256)
    self_hosted.s3.put_object(Bucket=MSGS_BUCKET, Key='messages/_user/invite_images/c1',
        Body=sym_encrypt(key, b'x'))
    params = dict(user='_user', copy='c1', k=to_url64(key))
    resp = self_hosted.mod.entry(inviter_event(self_hosted, f='png', **params), None)
    assert resp['headers']['content-type'] == 'image/png'
    resp = self_hosted.mod.entry(inviter_event(self_hosted, f='svg', **params), None)
    assert resp['headers']['content-type'] == 'image/jpeg'


def test_inviter_image_expired(self_hosted):
    # Missing image results in placeholder rather than failure
    resp = self_hosted.mod.entry(inviter_event(self_hosted, user='_user', copy='gone', k='x'),
        None)
    assert resp['statusCode'] == 200
    assert resp['body'] == self_hosted.mod.EXPIRED_IMAGE


def test_inviter_image_missing_params(self_hosted):
    # Missing params abort without reporting an error
    resp = self_hosted.mod.entry(inviter_event(self_hosted, user='_user'), None)
    assert resp == {'statusCode': 400}
    assert self_hosted.reports == []


def test_inviter_image_wrong_key(self_hosted):
    # Wrong key is reported but still only returns 400
    key = AESGCM.generate_key(256)
    self_hosted.s3.put_object(Bucket=MSGS_BUCKET, Key='messages/_user/invite_images/c1',
        Body=sym_encrypt(key, b'x'))
    wrong = to_url64(AESGCM.generate_key(256))
    resp = self_hosted.mod.entry(inviter_event(self_hosted, user='_user', copy='c1', k=wrong),
        None)
    assert resp == {'statusCode': 400}
    assert len(self_hosted.reports) == 1


def test_get_unknown_path(self_hosted):
    # Crawlers hitting other paths get 400 without being reported
    resp = self_hosted.mod.entry(self_hosted.event('GET', '/admin', headers={}), None)
    assert resp == {'statusCode': 400}
    assert self_hosted.reports == []


# ORIGIN AND CORS


def test_wrong_origin_forbidden(self_hosted):
    # Requests from other origins are rejected before any processing
    event = self_hosted.event(headers={'origin': 'https://evil.com'}, body={})
    assert self_hosted.mod.entry(event, None) == {'statusCode': 403}


def test_missing_origin_forbidden(self_hosted):
    # A POST without an Origin header (crawlers etc) gets 403, not an error
    event = self_hosted.event(headers={}, body={})
    assert self_hosted.mod.entry(event, None) == {'statusCode': 403}


def test_options_preflight(self_hosted):
    # Preflight gets CORS headers, echoing requested headers
    event = self_hosted.event('OPTIONS', headers={'origin': self_hosted.origin,
        'access-control-request-headers': 'content-type'})
    resp = self_hosted.mod.entry(event, None)
    assert resp['statusCode'] == 200
    assert resp['headers'] == {
        'access-control-allow-origin': self_hosted.origin,
        'access-control-allow-methods': 'GET,POST',
        'access-control-allow-headers': 'content-type',
    }


def test_options_preflight_default_headers(self_hosted):
    # Allowed headers default to any when not requested
    resp = self_hosted.mod.entry(self_hosted.event('OPTIONS'), None)
    assert resp['headers']['access-control-allow-headers'] == '*'


def test_post_has_cors_origin(self_hosted):
    # POST responses also include allowed origin (but not preflight-only headers)
    resp = self_hosted.post('reply', content='hi')
    assert resp['headers'] == {'access-control-allow-origin': self_hosted.origin}


# VALIDATION


def test_missing_config_secret(self_hosted):
    # Required fields must be present and strings
    body = {'encrypted': 'x'}
    resp = self_hosted.mod.entry(self_hosted.event(body=body), None)
    assert resp['statusCode'] == 400
    assert len(self_hosted.reports) == 1


def test_wrong_config_secret(self_hosted):
    # Config can't be decrypted with wrong secret
    resp = self_hosted.post('reply', config_secret=to_url64(AESGCM.generate_key(256)))
    assert resp['statusCode'] == 400
    assert self_hosted.stored('reply') == []


def test_invalid_type(self_hosted):
    # Unknown response types (including disabled 'delete') are rejected
    for resp_type in ('unknown', 'delete'):
        assert self_hosted.post(resp_type)['statusCode'] == 400
    assert len(self_hosted.reports) == 2


def test_invalid_json_body(self_hosted):
    # Malformed body is rejected
    event = self_hosted.event(path='/responder/reply')
    event['body'] = '{not json'
    assert self_hosted.mod.entry(event, None)['statusCode'] == 400


# STORAGE


def test_reply_stored_encrypted(self_hosted):
    # Whole event and IP are stored, decryptable only with private key
    resp = self_hosted.post('reply', content='Hello')
    assert resp['statusCode'] == 200
    stored = self_hosted.stored('reply')
    assert len(stored) == 1
    assert stored[0]['ip'] == '1.2.3.4'
    assert stored[0]['event']['content'] == 'Hello'
    assert stored[0]['event']['encrypted'] == 'opaque'


def test_stored_key_format(self_hosted):
    # Object keys are timestamp prefixed for ordering and confined to user's type dir
    self_hosted.post('subscription')
    listing = self_hosted.s3.list_objects_v2(Bucket=RESP_BUCKET, Prefix='responses/')
    key = listing['Contents'][0]['Key']
    parts = key.split('/')
    assert parts[:3] == ['responses', '_user', 'subscription']
    timestamp, _, uuid = parts[3].partition('_')
    assert timestamp.isdigit() and len(uuid) == 36


@pytest.mark.parametrize('resp_type', ['subscription', 'address'])
def test_no_processing_types(self_hosted, resp_type):
    # These types are always stored
    assert self_hosted.post(resp_type)['statusCode'] == 200
    assert len(self_hosted.stored(resp_type)) == 1


# REPLIES, REACTIONS, RESENDS, SUBSCRIBES


@pytest.mark.parametrize('resp_type,option', [
    ('reply', 'allow_replies'),
    ('reaction', 'allow_reactions'),
    ('resend', 'allow_resend_requests'),
])
def test_disabled_types_abort(self_hosted, resp_type, option):
    # Disabled types are rejected silently and not stored
    self_hosted.set_config(**{option: False})
    assert self_hosted.post(resp_type, content='x')['statusCode'] == 400
    assert self_hosted.stored(resp_type) == []
    assert self_hosted.reports == []


@pytest.mark.parametrize('content', ['like', 'heart-2', 'a_b', None])
def test_reaction_valid(self_hosted, content):
    # Short single words are accepted, as is null (clearing a reaction)
    assert self_hosted.post('reaction', content=content)['statusCode'] == 200
    assert self_hosted.stored('reaction')[0]['event']['content'] == content


def test_reaction_without_content(self_hosted):
    # Content may be kept within encrypted data instead
    assert self_hosted.post('reaction')['statusCode'] == 200


@pytest.mark.parametrize('content', ['', 'two words', '<b>', 'x' * 26, 5])
def test_reaction_invalid(self_hosted, content):
    # Long, empty, non-string or non-word reactions are rejected
    assert self_hosted.post('reaction', content=content)['statusCode'] == 400
    assert self_hosted.stored('reaction') == []


def test_subscribe_form(self_hosted):
    # Subscribes only accepted for forms that still exist
    assert self_hosted.post('subscribe', form='form1')['statusCode'] == 200
    assert self_hosted.post('subscribe', form='removed')['statusCode'] == 400
    assert len(self_hosted.stored('subscribe')) == 1


def test_subscribe_old_config(self_hosted):
    # Configs from before v1.5.0 have no subscribe_forms
    self_hosted.set_config(drop=['subscribe_forms'])
    assert self_hosted.post('subscribe', form='form1')['statusCode'] == 400


# READS


def put_copy(responder, reads, max_reads):
    """Store a message copy and invite image with read tags"""
    tagging = f'stello-reads={reads}&stello-max-reads={max_reads}&stello-lifespan=365'
    responder.s3.put_object(Bucket=MSGS_BUCKET, Key='messages/_user/copies/c1', Body=b'x',
        Tagging=tagging)
    responder.s3.put_object(Bucket=MSGS_BUCKET, Key='messages/_user/invite_images/c1', Body=b'x')


def copy_tags(responder):
    """Get tags of copy c1"""
    resp = responder.s3.get_object_tagging(Bucket=MSGS_BUCKET, Key='messages/_user/copies/c1')
    return {t['Key']: t['Value'] for t in resp['TagSet']}


def msg_keys(responder):
    """List keys in messages bucket"""
    listing = responder.s3.list_objects_v2(Bucket=MSGS_BUCKET)
    return [item['Key'] for item in listing.get('Contents', [])]


def test_read_without_max_reads(self_hosted):
    # Reads not counted if no max
    put_copy(self_hosted, 0, 2)
    assert self_hosted.post('read', copy_id='c1', has_max_reads=False)['statusCode'] == 200
    assert copy_tags(self_hosted)['stello-reads'] == '0'
    assert len(self_hosted.stored('read')) == 1


def test_read_increments_and_preserves_tags(self_hosted):
    # Read count increased without losing other tags
    put_copy(self_hosted, 0, 2)
    assert self_hosted.post('read', copy_id='c1', has_max_reads=True)['statusCode'] == 200
    assert copy_tags(self_hosted) == {'stello-reads': '1', 'stello-max-reads': '2',
        'stello-lifespan': '365'}


def test_read_max_deletes_copy_and_image(self_hosted):
    # Reaching max reads deletes copy and its invite image
    put_copy(self_hosted, 1, 2)
    assert self_hosted.post('read', copy_id='c1', has_max_reads=True)['statusCode'] == 200
    assert msg_keys(self_hosted) == []


def test_read_already_deleted(self_hosted):
    # Read of already deleted copy still succeeds and is stored
    assert self_hosted.post('read', copy_id='c1', has_max_reads=True)['statusCode'] == 200
    assert len(self_hosted.stored('read')) == 1


@pytest.mark.parametrize('fields', [{'copy_id': 'c1'}, {'copy_id': 1, 'has_max_reads': True},
    {'has_max_reads': True}])
def test_read_invalid(self_hosted, fields):
    # Read fields must have correct types
    assert self_hosted.post('read', **fields)['statusCode'] == 400


def test_handle_delete(self_hosted):
    # Disabled delete handler removes copy and tolerates already deleted
    put_copy(self_hosted, 0, 2)
    self_hosted.mod.handle_delete('_user', {}, {'copy_id': 'c1'})
    assert msg_keys(self_hosted) == ['messages/_user/invite_images/c1']
    self_hosted.mod.handle_delete('_user', {}, {'copy_id': 'c1'})


# SELF-HOSTED NOTIFICATIONS (SNS)


def published(responder):
    """Return list of (subject, message) published via SNS"""
    return [(c.kwargs['Subject'], c.kwargs['Message'])
        for c in responder.notifier.publish.call_args_list]


def test_notify_none(self_hosted):
    # No notifications when disabled
    self_hosted.post('reply', content='x')
    assert published(self_hosted) == []


def test_notify_not_for_reads(self_hosted):
    # Only replies/reactions/resends/subscribes notify
    self_hosted.set_config(notify_mode='replies_and_reactions')
    self_hosted.post('subscription')
    self_hosted.post('read', copy_id='c1', has_max_reads=False)
    assert published(self_hosted) == []


def test_notify_reply_with_contents(self_hosted):
    # Contents included with instructions for self-hosted users
    self_hosted.set_config(notify_mode='replies', notify_include_contents=True)
    self_hosted.post('reply', content='Hello there')
    [(subject, message)] = published(self_hosted)
    assert self_hosted.notifier.publish.call_args.kwargs['TopicArn'] == TOPIC_ARN
    assert subject == f'Stello: New reply [{MSGS_BUCKET}]'
    assert message.startswith('Someone replied with:\n\n\nHello there\n')
    assert '#### MESSAGE END ####' in message


def test_notify_reactions_only_when_enabled(self_hosted):
    # Reactions only notify in replies_and_reactions mode
    self_hosted.set_config(notify_mode='replies', notify_include_contents=True)
    self_hosted.post('reaction', content='like')
    assert published(self_hosted) == []
    self_hosted.set_config(notify_mode='replies_and_reactions', notify_include_contents=True)
    self_hosted.post('reaction', content='like')
    [(subject, message)] = published(self_hosted)
    assert subject.startswith('Stello: New reaction')
    assert message.startswith('Someone reacted with:\n\n\nlike')


def test_notify_cleared_reaction_ignored(self_hosted):
    # Clearing a reaction doesn't notify
    self_hosted.set_config(notify_mode='replies_and_reactions', notify_include_contents=True)
    self_hosted.post('reaction', content=None)
    assert published(self_hosted) == []


def test_notify_counts(self_hosted):
    # Without contents, a summary of pending response counts is sent
    self_hosted.set_config(notify_mode='replies_and_reactions')
    self_hosted.post('reply')
    self_hosted.post('reaction')
    self_hosted.post('resend')
    subjects = [subject for subject, _ in published(self_hosted)]
    assert subjects == [
        f'Stello: 1 new reply [{MSGS_BUCKET}]',
        f'Stello: 1 new reply and 1 new reaction [{MSGS_BUCKET}]',
        f'Stello: 2 new replies and 1 new reaction [{MSGS_BUCKET}]',
    ]
    assert published(self_hosted)[0][1].startswith(
        'You have 1 new reply to your messages\n\n\nOpen Stello to see them')


def test_notify_counts_reactions_only(self_hosted):
    # Summary pluralises reactions
    self_hosted.set_config(notify_mode='replies_and_reactions')
    self_hosted.post('reaction')
    self_hosted.post('reaction')
    assert published(self_hosted)[1][0] == f'Stello: 2 new reactions [{MSGS_BUCKET}]'


def test_notify_counts_when_contents_encrypted(self_hosted):
    # Displayer may have encrypted contents (older config) so counts used instead
    self_hosted.set_config(notify_mode='replies', notify_include_contents=True)
    self_hosted.post('reply')
    assert published(self_hosted)[0][0] == f'Stello: 1 new reply [{MSGS_BUCKET}]'


def test_notify_first_new_reply(self_hosted):
    # Only first pending reply notifies, and contents are never included
    self_hosted.set_config(notify_mode='first_new_reply', notify_include_contents=True)
    self_hosted.post('reply', content='secret')
    self_hosted.post('reply', content='secret')
    self_hosted.post('reaction', content='like')
    [(subject, message)] = published(self_hosted)
    assert subject == f'Stello: 1 new reply [{MSGS_BUCKET}]'
    assert 'secret' not in message


def test_notify_subscribe_with_contents(self_hosted):
    # Subscribe requests name the subscriber
    self_hosted.set_config(notify_mode='replies', notify_include_contents=True)
    self_hosted.post('subscribe', form='form1', name='Bob', address='bob@x.com', content='Hi')
    [(subject, message)] = published(self_hosted)
    assert subject == f'Stello: Bob wants to subscribe [{MSGS_BUCKET}]'
    assert message.startswith('Bob <bob@x.com> wants to subscribe\n\n\nHi')


def test_notify_subject_valid_for_sns(self_hosted):
    # BUG #sns-subject-invalid: SNS rejects subjects that are non-ASCII, contain line breaks or
    #   are 100+ chars, and the subscriber's name is put in the subject unchecked, so
    #   self-hosted users never get notified of subscribe requests from e.g. "José"
    self_hosted.set_config(notify_mode='replies', notify_include_contents=True)
    for name in ('José', 'Bob\nSmith', 'x' * 100):
        self_hosted.post('subscribe', form='form1', name=name, address='a@x.com', content='')
    for subject, _ in published(self_hosted):
        assert subject.isascii()
        assert '\n' not in subject
        assert len(subject) < 100


def test_notify_failure_still_succeeds(self_hosted):
    # Notification failure is reported but response still stored and successful
    self_hosted.set_config(notify_mode='replies', notify_include_contents=True)
    self_hosted.notifier.publish.side_effect = Exception('SNS down')
    assert self_hosted.post('reply', content='x')['statusCode'] == 200
    assert len(self_hosted.stored('reply')) == 1
    assert len(self_hosted.reports) == 1


# HOSTED


def test_hosted_user_from_origin(hosted):
    # User is detected from subdomain and responses stored under it
    resp = hosted.post('reply', content='x')
    assert resp['statusCode'] == 200
    assert resp['headers']['access-control-allow-origin'] == 'https://alice.stello.news'
    assert len(hosted.stored('reply')) == 1


def test_hosted_unbranded_domain(hosted):
    # Unbranded domain is also accepted
    hosted.origin = f'https://alice.{DOMAIN_UNBRANDED}'
    resp = hosted.post('reply', content='x')
    assert resp['statusCode'] == 200
    assert resp['headers']['access-control-allow-origin'] == hosted.origin


def test_hosted_other_domain_forbidden(hosted):
    # Other domains, including lookalikes, are forbidden
    for origin in ('https://alice.evil.com', 'https://alice.stello.news.evil.com',
            'http://alice.stello.news'):
        hosted.origin = origin
        assert hosted.post('reply')['statusCode'] == 403


def test_hosted_other_user_config(hosted):
    # A user with no uploaded config can't receive responses
    hosted.origin = 'https://bob.stello.news'
    assert hosted.post('reply')['statusCode'] == 400


def test_hosted_notify_via_ses(hosted):
    # Hosted users are emailed via SES with escaped HTML content
    hosted.set_config(notify_mode='replies', notify_include_contents=True)
    hosted.post('reply', content='<script>x</script>\nline2')
    kwargs = hosted.notifier.send_email.call_args.kwargs
    assert kwargs['Source'] == 'Stello <no-reply@stello.news>'
    assert kwargs['Destination'] == {'ToAddresses': ['sender@example.com']}
    assert kwargs['Message']['Subject']['Data'] == 'Stello: New reply [alice]'
    html = kwargs['Message']['Body']['Html']['Data']
    assert '&lt;script&gt;x&lt;/script&gt;<br>line2' in html
    assert '<script>' not in html
    assert 'MESSAGE END' not in html


def test_hosted_notify_counts(hosted):
    # Hosted count notifications have no extra self-hosted instructions
    hosted.set_config(notify_mode='replies')
    hosted.post('reply')
    kwargs = hosted.notifier.send_email.call_args.kwargs
    assert kwargs['Message']['Subject']['Data'] == 'Stello: 1 new reply [alice]'
    assert 'Open Stello to see them' not in kwargs['Message']['Body']['Html']['Data']


# DEVELOPMENT MODE


def test_dev_allows_any_origin(dev):
    # Origin not checked and CORS permissive
    dev.origin = 'http://anything'
    resp = dev.post('reply', content='x')
    assert resp['statusCode'] == 200
    assert resp['headers']['access-control-allow-origin'] == '*'


def test_dev_no_notifications(dev):
    # Notifications never sent in dev
    dev.set_config(notify_mode='replies', notify_include_contents=True)
    dev.post('reply', content='x')
    assert dev.notifier.mock_calls == []


# ERROR REPORTING


def test_report_error_metadata(self_hosted):
    # Request metadata included when available
    self_hosted.post('unknown')
    assert self_hosted.reports[0]['payload_data'] == {
        'request': {'user_ip': '1.2.3.4', 'headers': {'User-Agent': 'test-agent'}}}


def test_report_error_without_metadata(self_hosted):
    # Reporting still works for malformed events
    try:
        raise ValueError()
    except ValueError:
        self_hosted.mod._report_error({})
    assert self_hosted.reports == [{'payload_data': {}}]


def test_rollbar_payload_handler(self_hosted):
    # Rollbar payloads are marked as client so public token can be used
    payload = self_hosted.mod._rollbar_add_context({'data': {}})
    assert payload['data']['platform'] == 'client'
