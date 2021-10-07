
import os
import json
import base64
import string
from time import time
from uuid import uuid4
from pathlib import Path
from traceback import format_exc
from contextlib import suppress

import rollbar
import boto3
from botocore.config import Config
from cryptography.hazmat.primitives.hashes import SHA256
from cryptography.hazmat.primitives.serialization import load_der_public_key
from cryptography.hazmat.primitives.ciphers.aead import AESGCM
from cryptography.hazmat.primitives.asymmetric.padding import OAEP, MGF1


# Constants
VALID_TYPES = ('read', 'reply', 'reaction', 'subscription', 'address', 'resend')


# A base64-encoded 3w1h solid #ddeeff jpeg
EXPIRED_IMAGE = '/9j/4AAQSkZJRgABAQEBLAEsAAD/2wBDAAoHBwgHBgoICAgLCgoLDhgQDg0NDh0VFhEYIx8lJCIfIiEmKzcvJik0KSEiMEExNDk7Pj4+JS5ESUM8SDc9Pjv/2wBDAQoLCw4NDhwQEBw7KCIoOzs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozv/wAARCAABAAMDAREAAhEBAxEB/8QAFAABAAAAAAAAAAAAAAAAAAAAB//EABQQAQAAAAAAAAAAAAAAAAAAAAD/xAAUAQEAAAAAAAAAAAAAAAAAAAAE/8QAFBEBAAAAAAAAAAAAAAAAAAAAAP/aAAwDAQACEQMRAD8AViR3/9k='


# Sym encryption settings (same as js version)
SYM_IV_BYTES = 12
SYM_TAG_BITS = 128  # Tag is 128 bits by default in AESGCM and not configurable
SYM_KEY_BITS = 256


# Config from env
ENV = os.environ['stello_env']
DEV = ENV == 'development'
VERSION = os.environ['stello_version']
MSGS_BUCKET = os.environ['stello_msgs_bucket']
RESP_BUCKET = MSGS_BUCKET + '-stello-resp'
TOPIC_ARN = os.environ.get('stello_topic_arn')  # Self-hosted only
REGION = os.environ['stello_region']
ROLLBAR_TOKEN = os.environ['stello_rollbar_responder']  # Client token (not server) as public
DOMAINS = os.environ['stello_domains'].split(' ') if os.environ.get('stello_domains') else []


# Setup Rollbar
# WARN Must use blocking handler, otherwise lambda may finish before report is sent
# NOTE Version prefixed with 'v' so that traces match github tags
# SECURITY Don't expose local vars in report as could contain sensitive user content
rollbar.init(ROLLBAR_TOKEN, ENV, handler='blocking', code_version='v'+VERSION,
    locals={'enabled': False}, root=str(Path(__file__).parent), enabled=not DEV)
def _rollbar_add_context(payload, **kwargs):
    payload['data']['platform'] = 'client'  # Allow client token rather than server, since public
    return payload
rollbar.events.add_payload_handler(_rollbar_add_context)


# Access to AWS services
# NOTE Important to set region to avoid unnecessary redirects for e.g. s3
AWS_CONFIG = Config(region_name=REGION)
S3 = boto3.client('s3', config=AWS_CONFIG)


def entry(api_event, context):
    """Entrypoint that wraps main logic to add exception handling and CORS headers"""

    # Determine expected origin (and detect user)
    # NOTE Access-Control-Allow-Origin can only take one value, so must detect right one
    if DOMAINS:
        # Hosted setup -- origin must be a subdomain of one of defined domains
        user, _, root_origin = api_event['headers']['origin'].partition('//')[2].partition('.')
        allowed_origin = f'https://{user}.{root_origin}' if root_origin in DOMAINS else None
    else:
        user = '_user'
        allowed_origin = f'https://{MSGS_BUCKET}.s3-{REGION}.amazonaws.com'

    # If origin not allowed, 403 to prevent further processing of the request
    if not DEV and api_event['headers']['origin'] != allowed_origin:
        return {'statusCode': 403}

    # Process event and catch exceptions
    try:
        response = _entry(api_event, user)
    except Abort:
        response = {'statusCode': 400}
    except:
        # SECURITY Never reveal whether client or server error, just that it didn't work
        _report_error(api_event)
        response = {'statusCode': 400}

    # Add CORS headers so cross-domain request doesn't fail
    response.setdefault('headers', {})
    response['headers']['Access-Control-Allow-Origin'] = '*' if DEV else allowed_origin
    if api_event['requestContext']['http']['method'] == 'OPTIONS':
        response['headers']['Access-Control-Allow-Methods'] = 'GET,POST'
        response['headers']['Access-Control-Allow-Headers'] = '*'

    return response


def _entry(api_event, user):
    """Main processing logic
    NOTE api_event format and response expected below
    https://docs.aws.amazon.com/apigateway/latest/developerguide/http-api-develop-integrations-lambda.html

    SECURITY Assume input may be malicious
    SECURITY Never return anything back to recipient other than success status

    Event data is expected to be: {
        'encrypted': string,
        ...
    }

    Data saved to response bucket is: encrypted JSON {
        'event': ...,
        'ip': string,
    }

    """

    # Handle CORS OPTIONS requests
    if api_event['requestContext']['http']['method'] == 'OPTIONS':
        return {'statusCode': 200}

    # Handle GET requests
    if api_event['requestContext']['http']['method'] == 'GET':
        if api_event['requestContext']['http']['path'] == '/inviter/image':
            query_params = api_event.get('queryStringParameters', {})
            return get_invite_image(user, query_params)
        # NOTE A number of companies crawl AWS services, so don't warn for invalid paths
        raise Abort()

    # Handle POST requests
    ip = api_event['requestContext']['http']['sourceIp']
    event = json.loads(api_event['body'])

    # Must have encrypted key set
    _ensure_type(event, 'encrypted', str)

    # Load config (required to encrypt stored data, so can't do anything without)
    config = _get_config(user)

    # Get event type from path
    resp_type = api_event['requestContext']['http']['path'].partition('/responder/')[2]
    if resp_type not in VALID_TYPES:
        raise Exception(f"Invalid value for response type: {resp_type}")

    # Handle the event and then store it
    handler = globals()[f'handle_{resp_type}']
    handler(user, config, event)
    _put_resp(config, resp_type, event, ip, user)

    # Report success
    return {'statusCode': 200}


# GET HANDLERS


def get_invite_image(user, params):
    """Decrypt and return invite image

    WARN Do not prefix with `handle_` as then a user could trigger it with that response type

    """
    copy_id = params['copy']
    secret = params['k']
    bucket_key = f'messages/{user}/invite_images/{copy_id}'
    try:
        obj = S3.get_object(Bucket=MSGS_BUCKET, Key=bucket_key)
    except:
        body = EXPIRED_IMAGE
    else:
        encrypted = obj['Body'].read()
        decryptor = AESGCM(_url64_to_bytes(secret))
        decrypted = decryptor.decrypt(encrypted[:SYM_IV_BYTES], encrypted[SYM_IV_BYTES:], None)
        body = base64.b64encode(decrypted).decode()
    return {
        'statusCode': 200,
        'headers': {
            'Content-Type': 'image/jpeg',
            'Cache-Control': 'no-store',
        },
        'isBase64Encoded': True,
        'body': body,
    }


# POST HANDLERS


def handle_read(user, config, event):
    """Delete message if reached max reads, otherwise increase read count

    SECURITY While an attacker could circumvent this or send fake msg ids, there isn't much risk
        This is mainly for triggering a delete if message shared widely when not permitted
            Actual attackers would only need a single read anyway
        For example, could be more reliable if separate lambda triggered by bucket requests
            But more reliable doesn't necessarily mean more secure
        resp_token is also still used Stello-side to verify reads

    """

    # Expected fields
    # SECURITY Yes attacker could change these value themselves but see above
    _ensure_type(event, 'copy_id', str)
    _ensure_type(event, 'has_max_reads', bool)

    # Don't need to do anything if not tracking max reads
    if not event['has_max_reads']:
        return

    # Get copies's tags
    copy_key = f"messages/{user}/copies/{event['copy_id']}"
    try:
        resp = S3.get_object_tagging(Bucket=MSGS_BUCKET, Key=copy_key)
    except S3.exceptions.NoSuchKey:
        return  # If msg already deleted, no reason to do any further processing (still report resp)
    tags = {d['Key']: d['Value'] for d in resp['TagSet']}

    # Parse and increase reads
    reads = int(tags['stello-reads'])
    max_reads = int(tags['stello-max-reads'])
    reads += 1
    tags['stello-reads'] = str(reads)

    # Either delete message or update reads
    if reads >= max_reads:
        S3.delete_object(Bucket=MSGS_BUCKET, Key=copy_key)
        # Also delete invite image
        S3.delete_object(Bucket=MSGS_BUCKET, Key=f"messages/{user}/invite_images/{event['copy_id']}")
    else:
        S3.put_object_tagging(
            Bucket=MSGS_BUCKET,
            Key=copy_key,
            Tagging={
                # WARN MUST preserve other tags (like stello-lifespan!)
                'TagSet': [{'Key': k, 'Value': v} for k, v in tags.items()],
            },
        )


def handle_reply(user, config, event):
    """Notify user of replies to their messages"""
    if not config['allow_replies']:
        raise Abort()
    _send_notification(config, 'reply', event, user)


def handle_reaction(user, config, event):
    """Notify user of reactions to their messages"""

    # Shouldn't be getting reactions if disabled them
    if not config['allow_reactions']:
        raise Abort()

    # Ensure reaction is a short single hyphenated word if present (or null)
    # SECURITY Prevents inserting long messages as a "reaction" but allows future codes too
    #   Noting that user may have enabled notifications for reactions, putting their value in emails
    if 'content' in event and event['content'] is not None:
        _ensure_valid_chars(event, 'content', string.ascii_letters + string.digits + '-')
        if len(event['content']) > 25:
            raise Exception("Reaction content too long")

    _send_notification(config, 'reaction', event, user)


def handle_subscription(user, config, event):
    """Subscription modifications don't need any processing"""


def handle_address(user, config, event):
    """Subscription address modifications don't need any processing"""


def handle_resend(user, config, event):
    """Handle resend requests"""
    if not config['allow_resend_requests']:
        raise Abort()
    _send_notification(config, 'resend', event, user)


def handle_delete(user, config, event):
    # TODO Review this (event type currently disabled)
    """Handle a request to delete the recipient's copy of the message

    SECURITY Stello config not checked, so technically recipient could delete manually even if the
        option to is not presented in the message. Not considered a security risk.

    SECURITY Recipient could technically delete any message copy
        Since copies have unique ids, considered low risk, as they would only know their own

    SECURITY Ensure this lambda fn can only delete messages (not other objects in bucket)

    """
    copy_id = event['copy_id']
    with suppress(S3.exceptions.NoSuchKey):  # Already deleted is not a failure
        S3.delete_object(Bucket=MSGS_BUCKET, Key=f'messages/{user}/copies/{copy_id}')


# HELPERS


class Abort(Exception):
    """Abort and respond with failure, but don't report any error"""


def _url64_to_bytes(url64_string):
    """Convert custom-url-base64 encoded string to bytes"""
    return base64.urlsafe_b64decode(url64_string.replace('~', '='))


def _bytes_to_url64(bytes_data):
    """Convert bytes to custom-url-base64 encoded string"""
    return base64.urlsafe_b64encode(bytes_data).decode().replace('=', '~')


def _get_config(user):
    """Download and parse responder config"""
    data = S3.get_object(Bucket=RESP_BUCKET, Key=f'config/{user}/config')['Body'].read()
    return json.loads(data)


def _ensure_type(event, key, type_):
    """Ensure key's value is of given type"""
    if not isinstance(event.get(key), type_):
        raise Exception(f"Invalid or missing value for '{key}'")


def _ensure_valid_chars(event, key, valid_chars):
    """Ensure key's value is a string made of valid chars"""
    _ensure_type(event, key, str)
    if not event[key]:
        raise Exception(f"Empty string for '{key}'")
    for char in event[key]:
        if char not in valid_chars:
            raise Exception(f"Invalid character '{char}' in {key}")


def _report_error(api_event):
    """Report error"""
    print(format_exc())

    # Add request metadata if available
    payload_data = {}
    try:
        payload_data = {
            'request': {
                'user_ip': api_event['requestContext']['http']['sourceIp'],
                'headers': {
                    'User-Agent': api_event['requestContext']['http']['userAgent'],
                },
            },
        }
    except:
        pass

    # Send to Rollbar
    rollbar.report_exc_info(payload_data=payload_data)


def _put_resp(config, resp_type, event, ip, user):
    """Save response object with encrypted data

    SECURITY Ensure objects can't be placed in other dirs which app would never download

    """

    # Work out object id
    # Timestamp prefix for order, uuid suffix for uniqueness
    object_id = f'responses/{user}/{resp_type}/{int(time())}_{uuid4()}'

    # Encode data
    data = json.dumps({
        'event': event,
        'ip': ip,
    }).encode()

    # Decode asym public key and setup asym encrypter
    asym_key = _url64_to_bytes(config['resp_key_public'])
    asym_encryter = load_der_public_key(asym_key)

    # Generate sym key and encrypted form of it
    sym_key = AESGCM.generate_key(SYM_KEY_BITS)
    encrypted_key = asym_encryter.encrypt(sym_key, OAEP(MGF1(SHA256()), SHA256(), None))

    # Encrypt data and produce output
    sym_encrypter = AESGCM(sym_key)
    iv = os.urandom(SYM_IV_BYTES)
    encrypted_data = iv + sym_encrypter.encrypt(iv, data, None)
    output = json.dumps({
        'encrypted_data': _bytes_to_url64(encrypted_data),
        'encrypted_key': _bytes_to_url64(encrypted_key),
    })

    # Store in bucket
    S3.put_object(Bucket=RESP_BUCKET, Key=object_id, Body=output.encode())


def _count_resp_objects(user, resp_type):
    """Return a count of stored objects for the given response type

    TODO Paginates at 1000, which may be a concern when counting reactions for popular users

    """
    resp = S3.list_objects_v2(
        Bucket=RESP_BUCKET,
        Prefix=f'responses/{user}/{resp_type}/',
    )
    return resp['KeyCount']


def _send_notification(config, resp_type, event, user):
    """Notify user of replies/reactions/resends for their messages (if configured to)

    Notify modes: none, first_new_reply, replies, replies_and_reactions
    Including contents only applies to: replies, replies_and_reactions

    """

    # Determine if a reaction or reply/resend
    # NOTE To keep things simple, resends are considered "replies" for purpose of notifications
    reaction = resp_type == 'reaction'

    # Do nothing if notifications disabled
    if config['notify_mode'] == 'none':
        return
    if reaction and config['notify_mode'] != 'replies_and_reactions':
        return

    # Ensure notify_include_contents takes into account notify_mode
    if config['notify_mode'] == 'first_new_reply':
        config['notify_include_contents'] = False

    # Prepare message
    # NOTE Possible to have race condition where contents should be included but isn't, so check
    if config['notify_include_contents'] and 'content' in event:

        # If content is null, just clearing a previous reaction, so don't notify
        if event['content'] is None:
            return

        subject = "Stello: New reaction" if reaction else "Stello: New reply"
        msg = f"Someone reacted with: {event['content']}" if reaction else event['content']
        msg += "\n" * 10
        msg += (
            "#### MESSAGE END ####\n"
            "Open Stello to reply and confirm author. Ignore storage provider's notes below."
            "Instead, change notification settings in Stello."
        )
    else:
        # Work out counts
        reply_count = _count_resp_objects(user, 'reply') + _count_resp_objects(user, 'resend')
        reaction_count = _count_resp_objects(user, 'reaction')
        if reaction:
            reaction_count += 1
        else:
            reply_count += 1

        # If notify_mode is first_new_reply then only continue if this is the first
        # NOTE Already returned if a reaction and in this notify_mode
        if config['notify_mode'] == 'first_new_reply' and reply_count != 1:
            return

        # Work out summary line (for both subject and msg)
        reply_s = "reply" if reply_count == 1 else "replies"
        reaction_s = "reaction" if reaction_count == 1 else "reactions"
        summary = ""
        if reply_count:
            summary += f"{reply_count} new {reply_s}"
        if reply_count and reaction_count:
            summary += " and "
        if reaction_count:
            summary += f"{reaction_count} new {reaction_s}"

        # Work out subject
        subject = "Stello: " + summary

        # Work out msg
        msg = f"You have {summary} to your Stello messages (open Stello to see them)"
        msg += "\n" * 10
        msg += "Ignore storage provider's notes below. Instead, change notification settings in Stello."

    # In case multiple sending profiles, note the bucket name in the subject
    subject += f" ({MSGS_BUCKET})"

    # Send notification
    if not DEV:
        if DOMAINS:
            boto3.client('ses', config=AWS_CONFIG).send_email(
                Source="Stello <response@stello.news>",
                Destination={'ToAddresses': [config['email']]},
                Message={
                    'Subject': {
                        'Data': subject,
                        'Charset': 'UTF-8',
                    },
                    'Body': {
                        'Text': {  # TODO Change to html
                            'Data': msg,
                            'Charset': 'UTF-8',
                        },
                    },
                },
            )
        else:
            boto3.client('sns', config=AWS_CONFIG).publish(
                TopicArn=TOPIC_ARN, Subject=subject, Message=msg)
