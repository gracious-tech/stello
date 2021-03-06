
import os
import json
import base64
import string
from time import time
from uuid import uuid4
from traceback import format_exc
from contextlib import suppress

import boto3
from cryptography.hazmat.primitives.hashes import SHA256
from cryptography.hazmat.primitives.serialization import load_der_public_key
from cryptography.hazmat.primitives.ciphers.aead import AESGCM
from cryptography.hazmat.primitives.asymmetric.padding import OAEP, MGF1


# Config from env
DEV = os.environ['stello_env'] == 'dev'
MSGS_BUCKET = os.environ['stello_msgs_bucket']
RESP_BUCKET = os.environ['stello_resp_bucket']
TOPIC_ARN = os.environ['stello_topic_arn']
REGION = os.environ['stello_region']


# Constants
# TODO VALID_TYPES = ('error', 'read', 'reply', 'reaction', 'delete', 'subscription', 'resend')
VALID_TYPES = ('error', 'read', 'reply', 'reaction')


def entry(event, context):
    """Entrypoint for lambda execution

    SECURITY Assume input may be malicious
    SECURITY Never return anything back to recipient other than success boolean

    Event data is expected to be: {
        'type': ...,
        'encrypted': string,
        ...
    }

    Data saved to response bucket is: encrypted JSON {
        'event': ...,
        'ip': ...,
        'error': string|null,
    }

    """
    success = True
    try:
        # Load config (required to encrypt stored data, so can't do anything without)
        config = _get_config()

        # Try handle the event, and store it whether success or not
        try:
            _general_validation(event)
            handler = globals()[f'handle_{event["type"]}']
            handler(config, event)
        except:
            # Have access to `put_resp` so use to report the error to Stello user
            error = format_exc()
            print(error)
            _put_resp(config, event, error)
            success = False
        else:
            _put_resp(config, event)
    except:
        # No matter what happens, ensure recipient knows result and don't 500
        print(format_exc())
        success = False

    # SECURITY Recipient doesn't need to know anything other than success boolean
    print(success)
    return {'success': success}


# HANDLERS


def handle_error(config, event):
    """Handle errors from displayer"""
    pass  # No processing needed


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
    s3_client = boto3.client('s3')
    try:
        resp = s3_client.get_object_tagging(
            Bucket=MSGS_BUCKET,
            Key=f"copies/{event['copy_id']}",
        )
    except s3_client.exceptions.NoSuchKey:
        return  # If msg already deleted, no reason to do any further processing (still report resp)
    tags = {d['Key']: d['Value'] for d in resp['TagSet']}

    # Parse and increase reads
    reads = int(tags['stello-reads'])
    max_reads = int(tags['stello-max-reads'])
    reads += 1
    tags['stello-reads'] = str(reads)

    # Either delete message or update reads
    if reads >= max_reads:
        _get_copy(event['copy_id']).delete()
    else:
        s3_client.put_object_tagging(
            Bucket=MSGS_BUCKET,
            Key=f"copies/{event['copy_id']}",
            Tagging={
                # WARN MUST preserve other tags (like stello-lifespan!)
                'TagSet': [{'Key': k, 'Value': v} for k, v in tags.items()],
            },
        )


def handle_reply(config, event):
    """Notify user of replies to their messages"""

    # Shouldn't be getting replies if disabled them
    if not config['allow_replies']:
        raise Exception("Replies disabled")

    # Ensure content supplied if configured that way
    if config['notify_include_contents'] and 'content' not in event:
        raise Exception(f"Field missing: content")

    _send_notification(config, event)


def handle_reaction(config, event):
    """Notify user of reactions to their messages"""

    # Shouldn't be getting reactions if disabled them
    if not config['allow_reactions']:
        raise Exception("Reactions disabled")

    # Ensure content supplied if configured that way
    if config['notify_include_contents'] and 'content' not in event:
        raise Exception(f"Field missing: content")

    # Ensure reaction is a short single hyphenated word if present
    # SECURITY Prevents inserting long messages as a "reaction" but allows future codes too
    if config['notify_include_contents']:
        _ensure_valid_chars(event, 'content', string.ascii_letters + string.digits + '-')
        if len(event['content']) > 25:
            raise Exception("Reaction content too long")

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
    msg = _get_copy(event['msg_id'])
    with suppress(msg.meta.client.exceptions.NoSuchKey):  # Already deleted is not a failure
        msg.delete()


# HELPERS


def _url64_to_bytes(url64_string):
    """Convert custom-url-base64 encoded string to bytes"""
    return base64.urlsafe_b64decode(url64_string.replace('~', '='))


def _bytes_to_url64(bytes_data):
    """Convert bytes to custom-url-base64 encoded string"""
    return base64.urlsafe_b64encode(bytes_data).decode().replace('=', '~')


def _get_config():
    """Download and parse responder config"""
    # TODO Add prefix for multi-user buckets
    if DEV:
        data = b'{"notify_mode":"replies","notify_include_contents":true,"allow_replies":false,"allow_reactions":true,"allow_delete":false,"allow_resend_requests":true,"resp_key_public":"MIICIjANBgkqhkiG9w0BAQEFAAOCAg8AMIICCgKCAgEAmd5k2txzKWFwsJJ4LSSGc7SczQMsEWhuI_Hp4ZhTsPV_PsrP1nLiBux0IpKAYUUc5_0Uzb-b7rf7lHbl0DgSMSWREHSwWYZIpx7DPSd7K2yoGH75On0t_tfAjcQdpijRRl5r8NiIwNYbj3F8MDoZE8CZ0w3-xWQD9nVQ7V7N4vcxcCqk4Eq6bNm-7oCb_gvCDNlJSxqP5qMFmzCc5jrxBBjRQzh3QFpKwXBLSUPwoxXADKesdCfZ8nTtGQZ-HHytyBbvTkeqRqYPoDNA1YRJCBS5RdeJ3ORJPmeZwb9yNu2msZbDtFfp3Gp7klWMFnNAD2ahx6u-XvpW6d1xO_ZnNnRMAIlaz0JA-ZvI3CLdVL5un_KlX7F5-2jJgRr3zvj6B_X3N9u8knxkwhLCdY4WBumWw1gc99hInjRKQDpH3ycwgNBYp08nVOife4fhS7eGOK5joA5vTCWqWaQbaQ2_D01tpSYP8bHEijSheEP_1LQ384G73GcRLT6tZjILbFcm2vbc8czNpEWmxNHgQvg9soFEFaehI934qZgYgIsAThOWhqwYccYRiF6dXE3a1ib3t5nVrqo3nvnqIMX3-WfTGoC4f4sTlunx5IstL_G6nbG-MLdNo2Rz4L60s2KwtQ7OU8OyToxyHO_xFVzvIAh-X_836rVRXVEaWUfU0mplwekCAwEAAQ~~","email":"user@localhost"}'
    else:
        data = boto3.resource('s3').Bucket(RESP_BUCKET).Object('config').get()['Body'].read()
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


def _put_resp(config, event, error=None):
    """Save response object with encrypted data and optionally error if any

    SECURITY Ensure objects can't be placed in other dirs which app would never download
    NOTE event data may be invalid if `put_resp` called in response to a validation error

    """

    # Work out object id
    # Timestamp prefix for order, uuid suffix for uniqueness
    resp_type = event['type'] if event.get('type') in VALID_TYPES and not error else 'error'
    object_id = f'responses/{resp_type}/{int(time())}_{uuid4()}'

    # Encode data
    data = json.dumps({
        'event': event,
        'ip': None,  # TODO Can't get this without using API Gateway
        'error': error,
    }).encode()

    # Decode asym public key and setup asym encrypter
    asym_key = _url64_to_bytes(config['resp_key_public'])
    asym_encryter = load_der_public_key(asym_key)

    # Sym encryption settings (same as js version)
    SYM_IV_BYTES = 12
    SYM_TAG_BITS = 128  # Tag is 128 bits by default in AESGCM and not configurable
    SYM_KEY_BITS = 256

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
    resp_bucket = boto3.resource('s3').Bucket(RESP_BUCKET)
    resp_bucket.put_object(Key=object_id, Body=output.encode())


def _get_copy(copy_id):
    """Get object for message with given id"""
    # SECURITY Ensure cannot get any object other than messages (otherwise could delete displayer!)
    msgs_bucket = boto3.resource('s3').Bucket(MSGS_BUCKET)
    object_id = f'copies/{copy_id}'
    return msgs_bucket.Object(object_id)


def _count_resp_objects(resp_type):
    """Return a count of stored objects for the given response type

    TODO Paginates at 1000, which may be a concern when counting reactions for popular users

    """
    resp = boto3.client('s3').list_objects_v2(
        Bucket=RESP_BUCKET,
        Prefix=f'responses/{resp_type}/',
    )
    return resp['KeyCount']


def _send_notification(config, event):
    """Notify user of replies/reactions to their messages (if configured to)

    Notify modes: none, first_new_reply, replies, replies_and_reactions
    Including contents only applies to: replies, replies_and_reactions

    """

    # Determine if a reply or a reaction
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
    if config['notify_include_contents']:
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
        reply_count = _count_resp_objects('reply')
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
    boto3.resource('sns').Topic(TOPIC_ARN).publish(Subject=subject, Message=msg)
