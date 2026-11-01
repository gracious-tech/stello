"""Compatibility tests: configs and requests from every past version must still be accepted

Also generates this version's responder fixture when STELLO_COMPAT_VERSION is set
(run via .bin/generate_compat). See fixtures/compat/README.md
"""

import os
import json
from pathlib import Path

import pytest

from conftest import MSGS_BUCKET, RESP_BUCKET, from_url64


COMPAT_DIR = Path(__file__).parents[3] / 'fixtures' / 'compat'


def versions_with(*fixtures):
    """Versions (oldest first) that have all the given fixture files"""
    if not COMPAT_DIR.exists():
        return []
    versions = [d.name for d in COMPAT_DIR.iterdir()
        if all((d / f).exists() for f in fixtures)]
    return sorted(versions, key=lambda v: [int(p) for p in v.lstrip('v').split('.')])


def read_fixture(version, fixture):
    """Read a fixture file for the given version"""
    return json.loads((COMPAT_DIR / version / fixture).read_text())


def post_fixture_requests(responder, version):
    """Store version's config and copy, then post every request its displayer sent"""
    app = read_fixture(version, 'app.json')
    requests = read_fixture(version, 'displayer.json')['requests']

    # Store config and copy as the app would have uploaded them
    responder.s3.put_object(Bucket=RESP_BUCKET, Key='config/_user/config',
        Body=from_url64(app['storage']['config/responder']))
    copy_id = app['ids']['copy']
    responder.s3.put_object(Bucket=MSGS_BUCKET, Key=f'messages/_user/copies/{copy_id}',
        Body=b'x', Tagging='stello-reads=0&stello-max-reads=3&stello-lifespan=365')
    responder.s3.put_object(Bucket=MSGS_BUCKET, Key=f'messages/_user/invite_images/{copy_id}',
        Body=b'x')

    # Post requests as the displayer would
    return {resp_type: responder.mod.entry(
        responder.event(path=f'/responder/{resp_type}', body=body), None)['statusCode']
        for resp_type, body in requests.items()}


def stored_objects(responder):
    """All stored responses keyed by their path within the user's responses dir"""
    listing = responder.s3.list_objects_v2(Bucket=RESP_BUCKET, Prefix='responses/_user/')
    return {item['Key'].removeprefix('responses/_user/'):
        responder.s3.get_object(Bucket=RESP_BUCKET, Key=item['Key'])['Body'].read().decode()
        for item in listing.get('Contents', [])}


def test_fixtures_exist():
    # Fail if fixtures are ever missing (rather than silently testing nothing)
    assert versions_with('app.json', 'displayer.json')


@pytest.mark.parametrize('version', versions_with('app.json', 'displayer.json'))
def test_accepts_requests_from(self_hosted, version):
    # Every type of response from that version is accepted and stored
    statuses = post_fixture_requests(self_hosted, version)
    assert statuses == {resp_type: 200 for resp_type in statuses}
    stored_types = sorted(key.split('/')[0] for key in stored_objects(self_hosted))
    assert stored_types == sorted(statuses)
    assert not self_hosted.reports


@pytest.mark.skipif(not os.environ.get('STELLO_COMPAT_VERSION'),
    reason="Only run when generating fixtures")
def test_generate_responder_fixture(self_hosted):
    # Record what this version of the responder stores for the app to read
    version = os.environ['STELLO_COMPAT_VERSION']
    statuses = post_fixture_requests(self_hosted, version)
    assert statuses == {resp_type: 200 for resp_type in statuses}
    fixture = {'version': version, 'objects': stored_objects(self_hosted)}
    (COMPAT_DIR / version / 'responder.json').write_text(json.dumps(fixture, indent=4) + '\n')
