
import sys
import json
from shutil import rmtree
from base64 import urlsafe_b64decode
from pathlib import Path
from urllib.request import urlopen

from cryptography.hazmat.primitives.ciphers.aead import AESGCM


# Input
url = sys.argv[1]

# Determine paths
source_url = url.rpartition('/')[0] + '/'
dest_path = Path(__file__).absolute().parent.parent / 'displayer/public/dev'

# Parse hash
raw_hash = url.partition('#')[2]
disp_config, copy_id, copy_secret = raw_hash.split(',')

# Wipe destination dir
if dest_path.is_dir():
    rmtree(dest_path)

# Download helper
def download(path:Path):
    print(path)
    file_path = dest_path / path
    file_path.parent.mkdir(exist_ok=True, parents=True)
    with open(file_path, 'wb') as file:
        with urlopen(source_url + path) as resp:
            file.write(resp.read())

# Download the message copy
download(f'copies/{copy_id}')

# Download display config
download(f'disp_config_{disp_config}')

# Decrypt the message copy
SYM_IV_BYTES = 12
encrypted = (dest_path / f'copies/{copy_id}').read_bytes()
iv = encrypted[:SYM_IV_BYTES]
encrypted_data = encrypted[SYM_IV_BYTES:]
key = urlsafe_b64decode(copy_secret.replace('~', '='))
crypto = AESGCM(key)
data = json.loads(crypto.decrypt(iv, encrypted_data, None))

# Download message assets
base_msg_id = data['base_msg_id']
for row in data['sections']:
    for section in row:
        if section['content']['type'] == 'images':
            for image in section['content']['images']:
                print("Downloading image assets")
                download(f'assets/{base_msg_id}/{image["id"]}')
                download(f'assets/{base_msg_id}/{image["id"]}j')

# Print and save URL for testing
(dest_path / 'hash.txt').write_text(raw_hash)
