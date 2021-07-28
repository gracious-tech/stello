
import os
import json
import base64
import string
from time import time
from uuid import uuid4
from urllib import request
from traceback import format_exc
from contextlib import suppress

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
DEV = os.environ['stello_env'] == 'dev'
VERSION = os.environ['stello_version']
MSGS_BUCKET = os.environ['stello_msgs_bucket']
RESP_BUCKET = os.environ['stello_resp_bucket']
TOPIC_ARN = os.environ['stello_topic_arn']
REGION = os.environ['stello_region']
ERRORS_URL = os.environ['stello_errors_url']
MSGS_BUCKET_ORIGIN = f'https://{MSGS_BUCKET}.s3-{REGION}.amazonaws.com'


# Access to AWS services
# NOTE Important to set region to avoid unnecessary redirects for e.g. s3
AWS_CONFIG = Config(region_name=REGION)
S3 = boto3.client('s3', config=AWS_CONFIG)
SNS = boto3.client('sns', config=AWS_CONFIG)


def entry(api_event, context):
    """Entrypoint that wraps main logic to add exception handling and CORS headers"""

    # Process event and catch exceptions
    try:
        response = _entry(api_event, context)
    except Abort:
        response = {'statusCode': 400}
    except:
        # SECURITY Never reveal whether client or server error, just that it didn't work
        _report_error(api_event)
        response = {'statusCode': 400}

    # Add CORS headers
    response.setdefault('headers', {})
    response['headers']['Access-Control-Allow-Origin'] = '*' if DEV else MSGS_BUCKET_ORIGIN
    # These two are required for pre-flight OPTIONS, but possibly not for actual requests
    response['headers']['Access-Control-Allow-Methods'] = 'GET,POST'
    response['headers']['Access-Control-Allow-Headers'] = '*'

    return response


def _entry(api_event, context):
    """Main processing logic
    NOTE api_event format and response expected below
    https://docs.aws.amazon.com/apigateway/latest/developerguide/http-api-develop-integrations-lambda.html

    SECURITY Assume input may be malicious
    SECURITY Never return anything back to recipient other than success status

    Event data is expected to be: {
        'type': string,
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
        return get_invite_image(api_event['queryStringParameters'])

    # Handle POST requests
    ip = api_event['requestContext']['http']['sourceIp']
    event = json.loads(api_event['body'])

    # Load config (required to encrypt stored data, so can't do anything without)
    config = _get_config()

    # Handle the event and then store it
    _general_validation(event)
    handler = globals()[f'handle_{event["type"]}']
    handler(config, event)
    _put_resp(config, event, ip)

    # Report success
    return {'statusCode': 200}


# GET HANDLERS


def get_invite_image(params):
    """Decrypt and return invite image

    WARN Do not prefix with `handle_` as then a user could trigger it with that event['type']

    """
    copy_id = params['image']
    secret = params['k']
    bucket_key = f'invite_images/{copy_id}'
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


def handle_read(config, event):
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

    # Get object's tags
    try:
        resp = S3.get_object_tagging(
            Bucket=MSGS_BUCKET,
            Key=f"copies/{event['copy_id']}",
        )
    except S3.exceptions.NoSuchKey:
        return  # If msg already deleted, no reason to do any further processing (still report resp)
    tags = {d['Key']: d['Value'] for d in resp['TagSet']}

    # Parse and increase reads
    reads = int(tags['stello-reads'])
    max_reads = int(tags['stello-max-reads'])
    reads += 1
    tags['stello-reads'] = str(reads)

    # Either delete message or update reads
    object_key = f"copies/{event['copy_id']}"
    if reads >= max_reads:
        S3.delete_object(Bucket=MSGS_BUCKET, Key=object_key)
        # Also delete invite image
        S3.delete_object(Bucket=MSGS_BUCKET, Key=f"invite_images/{event['copy_id']}")
    else:
        S3.put_object_tagging(
            Bucket=MSGS_BUCKET,
            Key=object_key,
            Tagging={
                # WARN MUST preserve other tags (like stello-lifespan!)
                'TagSet': [{'Key': k, 'Value': v} for k, v in tags.items()],
            },
        )


def handle_reply(config, event):
    """Notify user of replies to their messages"""
    if not config['allow_replies']:
        raise Abort()
    _send_notification(config, event)


def handle_reaction(config, event):
    """Notify user of reactions to their messages"""

    # Shouldn't be getting reactions if disabled them
    if not config['allow_reactions']:
        raise Abort()

    # Ensure reaction is a short single hyphenated word if present
    # SECURITY Prevents inserting long messages as a "reaction" but allows future codes too
    if 'content' in event:
        _ensure_valid_chars(event, 'content', string.ascii_letters + string.digits + '-')
        if len(event['content']) > 25:
            raise Exception("Reaction content too long")

    _send_notification(config, event)


def handle_subscription(config, event):
    """Subscription modifications don't need any processing"""


def handle_address(config, event):
    """Subscription address modifications don't need any processing"""


def handle_resend(config, event):
    """Handle resend requests"""
    if not config['allow_resend_requests']:
        raise Abort()
    _send_notification(config, event)


def handle_delete(config, event):
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
        S3.delete_object(Bucket=MSGS_BUCKET, Key=f'copies/{copy_id}')


# HELPERS


class Abort(Exception):
    """Abort and respond with failure, but don't report any error"""


def _url64_to_bytes(url64_string):
    """Convert custom-url-base64 encoded string to bytes"""
    return base64.urlsafe_b64decode(url64_string.replace('~', '='))


def _bytes_to_url64(bytes_data):
    """Convert bytes to custom-url-base64 encoded string"""
    return base64.urlsafe_b64encode(bytes_data).decode().replace('=', '~')


def _get_config():
    """Download and parse responder config"""
    # TODO Add prefix for multi-user buckets
    data = S3.get_object(Bucket=RESP_BUCKET, Key='config')['Body'].read()
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


def _general_validation(event):
    """Perform validation common to all event types"""

    # Must have a valid type
    _ensure_type(event, 'type', str)
    if event['type'] not in VALID_TYPES:
        raise Exception(f"Invalid value for event type: {event['type']}")

    # Must have encrypted key set
    _ensure_type(event, 'encrypted', str)


def _report_error(api_event):
    """Send error data to errors URL (unless dev)"""

    # Form message using stack trace and IP/UA if available
    msg = format_exc()
    try:
        request_ip = api_event['requestContext']['http']['sourceIp']
        request_ua = api_event['requestContext']['http']['userAgent']
        msg += f'\n\nRequest IP: {request_ip}\nRequest UA: {request_ua}'
    except:
        pass

    # Just print if in dev
    if DEV:
        print(msg)
        return

    # Otherwise send to errors url
    data = {
        'app': 'stello',
        'type': 'responder-fatal',
        'version': VERSION,
        'message': msg,
    }
    headers = {'Content-type': 'application/json'}
    request.urlopen(request.Request(ERRORS_URL, json.dumps(data).encode(), headers))


def _put_resp(config, event, ip):
    """Save response object with encrypted data

    SECURITY Ensure objects can't be placed in other dirs which app would never download

    """

    # Work out object id
    # Timestamp prefix for order, uuid suffix for uniqueness
    resp_type = event['type']
    object_id = f'responses/{resp_type}/{int(time())}_{uuid4()}'

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


def _count_resp_objects(resp_type):
    """Return a count of stored objects for the given response type

    TODO Paginates at 1000, which may be a concern when counting reactions for popular users

    """
    resp = S3.list_objects_v2(
        Bucket=RESP_BUCKET,
        Prefix=f'responses/{resp_type}/',
    )
    return resp['KeyCount']


def _send_notification(config, event):
    """Notify user of replies/reactions/resends for their messages (if configured to)

    Notify modes: none, first_new_reply, replies, replies_and_reactions
    Including contents only applies to: replies, replies_and_reactions

    """

    # Determine if a reaction or reply/resend
    # NOTE To keep things simple, resends are considered "replies" for purpose of notifications
    reaction = event['type'] == 'reaction'

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
        reply_count = _count_resp_objects('reply') + _count_resp_objects('resend')
        reaction_count = _count_resp_objects('reaction')
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
    SNS.publish(TopicArn=TOPIC_ARN, Subject=subject, Message=msg)
