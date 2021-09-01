
import sys
from pathlib import Path

from invoke import task, Collection, Program
from ruamel.yaml import YAML


@task(default=True)
def release(inv):
    """Release a new version"""

    # Ensure no uncommited changes
    if inv.run('git status --porcelain', hide='out').stdout.strip():
        sys.exit("Uncommited changes present")

    # Ensure on master branch
    if not inv.run('git status --branch --porcelain', hide='out').stdout.startswith('## master'):
        sys.exit("Must be on master branch")

    # Ensure changes since last release
    if inv.run('git tag --points-at HEAD', hide='out').stdout.strip():
        sys.exit("No changes since last release")

    # TODO Preferably don't do this here, but currently too complex for CI
    inv.run('build_responder_aws')
    inv.run('git add app/static/responder_aws.zip')
    inv.run(f'git commit -m "Add latest build of responder for AWS (auto)"')

    # Load app config
    app_config_path = Path('app_config/app_config.yaml')
    app_config_data = YAML().load(app_config_path)

    # Confirm new version with user
    prev_version = app_config_data['version']
    suggest_version = prev_version.split('.')
    suggest_version = '.'.join(suggest_version[0:2] + [str(int(suggest_version[2]) + 1)])
    print(f"Previous version was: {prev_version}")
    new_version = input(f"New version [{suggest_version}]: ").strip() or suggest_version

    # Update app config
    app_config_data['version'] = new_version
    YAML().dump(app_config_data, app_config_path)
    inv.run('apply_app_config stello')
    inv.run('git add .')
    inv.run(f'git commit -m "Version {new_version}"')

    # Tag the new version
    inv.run(f'git tag --annotate -m "Version {new_version}" v{new_version}')

    # Notes
    print("\n\nNow push and once built, test using below before running release_publish\n")
    print("https://releases-stello-news.s3-us-west-2.amazonaws.com/electron_proposed/stello.AppImage")


if __name__ == '__main__':
    collection = Collection.from_module(sys.modules[__name__])
    Program('0.0.0', namespace=collection).run()
