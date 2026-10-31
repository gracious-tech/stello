
"""Fixtures for responder tests (AWS is mocked with moto, crypto is real)"""

import os
import sys
import json
import base64
import importlib.util
from pathlib import Path
from unittest.mock import MagicMock

import boto3
import pytest
from moto import mock_aws
from cryptography.hazmat.primitives.hashes import SHA256
from cryptography.hazmat.primitives.serialization import Encoding, PublicFormat
from cryptography.hazmat.primitives.asymmetric import rsa
from cryptography.hazmat.primitives.asymmetric.padding import OAEP, MGF1
from cryptography.hazmat.primitives.ciphers.aead import AESGCM


# Make responder's sibling modules (e.g. email_template) importable
FUNCTION_DIR = Path(__file__).parent.parent / 'function'
sys.path.insert(0, str(FUNCTION_DIR))


# Common values
REGION = 'us-west-2'
MSGS_BUCKET = 'test-msgs'
RESP_BUCKET = MSGS_BUCKET + '-stello-resp'
TOPIC_ARN = f'arn:aws:sns:{REGION}:123456789012:stello'
DOMAIN_BRANDED = 'stello.news'
DOMAIN_UNBRANDED = 'encrypted.news'


# Single RSA key pair shared by all tests (generation is slow)
PRIVATE_KEY = rsa.generate_private_key(public_exponent=65537, key_size=2048)


def to_url64(data):
    """Encode bytes the same way the app/displayer do"""
    return base64.urlsafe_b64encode(data).decode().replace('=', '~')


def from_url64(data):
    """Decode app/displayer style url64"""
    return base64.urlsafe_b64decode(data.replace('~', '='))


def sym_encrypt(key, data):
    """Encrypt bytes with AES-GCM, prefixing the IV (as the app does)"""
    iv = os.urandom(12)
    return iv + AESGCM(key).encrypt(iv, data, None)


def default_config(**overrides):
    """Responder config as the app would upload it"""
    public = PRIVATE_KEY.public_key().public_bytes(Encoding.DER, PublicFormat.SubjectPublicKeyInfo)
    config = {
        'resp_key_public': to_url64(public),
        'allow_replies': True,
        'allow_reactions': True,
        'allow_resend_requests': True,
        'subscribe_forms': ['form1'],
        'notify_mode': 'none',
        'notify_include_contents': False,
        'email': 'sender@example.com',
    }
    config.update(overrides)
    return config


class Responder:
    """Wrapper around a freshly imported responder module with helpers for making requests"""

    def __init__(self, module, user, origin):
        self.mod = module
        self.user = user
        self.origin = origin
        self.s3 = boto3.client('s3', region_name=REGION)
        self.config_key = AESGCM.generate_key(256)
        self.reports = []
        self.notifier = MagicMock()

        # Capture rollbar reports rather than sending them
        module.rollbar.report_exc_info = lambda **kwargs: self.reports.append(kwargs)

        # Capture SNS/SES calls while still using real (mocked) boto3 for everything else
        real_boto3 = module.boto3
        fake_boto3 = MagicMock()
        fake_boto3.client = lambda service, **kwargs: self.notifier if service in ('sns', 'ses') \
            else real_boto3.client(service, **kwargs)
        module.boto3 = fake_boto3

    def set_config(self, drop=(), **overrides):
        """Upload an encrypted responder config (optionally dropping some keys)"""
        config = {k: v for k, v in default_config(**overrides).items() if k not in drop}
        data = json.dumps(config).encode()
        self.s3.put_object(Bucket=RESP_BUCKET, Key=f'config/{self.user}/config',
            Body=sym_encrypt(self.config_key, data))

    def event(self, method='POST', path='/responder/reply', body=None, headers=None, **extra):
        """Generate an API Gateway HTTP API event"""
        api_event = {
            'requestContext': {
                'http': {
                    'method': method,
                    'path': path,
                    'sourceIp': '1.2.3.4',
                    'userAgent': 'test-agent',
                },
            },
            'headers': {'origin': self.origin} if headers is None else headers,
            **extra,
        }
        if body is not None:
            api_event['body'] = json.dumps(body)
        return api_event

    def post(self, resp_type, **fields):
        """POST a response of given type with valid config secret"""
        body = {
            'config_secret': to_url64(self.config_key),
            'encrypted': 'opaque',
            **fields,
        }
        return self.mod.entry(self.event(path=f'/responder/{resp_type}', body=body), None)

    def stored(self, resp_type):
        """Return decrypted stored responses of given type"""
        prefix = f'responses/{self.user}/{resp_type}/'
        listing = self.s3.list_objects_v2(Bucket=RESP_BUCKET, Prefix=prefix)
        results = []
        for item in listing.get('Contents', []):
            obj = self.s3.get_object(Bucket=RESP_BUCKET, Key=item['Key'])
            body = json.loads(obj['Body'].read())
            sym_key = PRIVATE_KEY.decrypt(from_url64(body['encrypted_key']),
                OAEP(MGF1(SHA256()), SHA256(), None))
            encrypted = from_url64(body['encrypted_data'])
            results.append(json.loads(AESGCM(sym_key).decrypt(encrypted[:12], encrypted[12:], None)))
        return results


def load_responder(monkeypatch, env, hosted):
    """Import a fresh copy of responder module with given env (config is read at import)"""

    # Set env
    monkeypatch.setenv('AWS_ACCESS_KEY_ID', 'testing')
    monkeypatch.setenv('AWS_SECRET_ACCESS_KEY', 'testing')
    monkeypatch.setenv('AWS_DEFAULT_REGION', REGION)
    monkeypatch.setenv('stello_env', env)
    monkeypatch.setenv('stello_version', '0.0.0')
    monkeypatch.setenv('stello_msgs_bucket', MSGS_BUCKET)
    monkeypatch.setenv('stello_region', REGION)
    monkeypatch.setenv('stello_rollbar_responder', 'token')
    if hosted:
        monkeypatch.setenv('stello_domain_branded', DOMAIN_BRANDED)
        monkeypatch.setenv('stello_domain_unbranded', DOMAIN_UNBRANDED)
    else:
        monkeypatch.delenv('stello_domain_branded', raising=False)
        monkeypatch.setenv('stello_topic_arn', TOPIC_ARN)

    # Import fresh module
    spec = importlib.util.spec_from_file_location('responder', FUNCTION_DIR / 'responder.py')
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def create_buckets():
    """Create the buckets the responder expects"""
    s3 = boto3.client('s3', region_name=REGION)
    for bucket in (MSGS_BUCKET, RESP_BUCKET):
        s3.create_bucket(Bucket=bucket,
            CreateBucketConfiguration={'LocationConstraint': REGION})


@pytest.fixture
def self_hosted(monkeypatch):
    """Responder configured as a self-hosted (SNS notifying) production deployment"""
    with mock_aws():
        module = load_responder(monkeypatch, 'production', hosted=False)
        create_buckets()
        origin = f'https://{MSGS_BUCKET}.s3-{REGION}.amazonaws.com'
        responder = Responder(module, '_user', origin)
        responder.set_config()
        yield responder


@pytest.fixture
def hosted(monkeypatch):
    """Responder configured as Gracious hosted (SES notifying) production deployment"""
    with mock_aws():
        module = load_responder(monkeypatch, 'production', hosted=True)
        create_buckets()
        responder = Responder(module, 'alice', f'https://alice.{DOMAIN_BRANDED}')
        responder.set_config()
        yield responder


@pytest.fixture
def dev(monkeypatch):
    """Responder configured for development (no origin checks or notifications)"""
    with mock_aws():
        module = load_responder(monkeypatch, 'development', hosted=False)
        create_buckets()
        responder = Responder(module, '_user', 'http://localhost:8002')
        responder.set_config()
        yield responder
