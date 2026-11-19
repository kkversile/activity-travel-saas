#!/usr/bin/env python3
"""Root-only, credential-free local backup and monitoring for the Voya service.

Never sends mail, changes business records, stops the API or restores live data.
PostgreSQL backups use peer authentication and read-only session settings.
"""
import argparse
import csv
import datetime as dt
import hashlib
import json
import logging
import os
from pathlib import Path
import re
import shutil
import subprocess
import tarfile
import urllib.request
import uuid

UTC = dt.timezone.utc
BACKUP_NAME = re.compile(r'voya-daily-\d{8}T\d{6}Z-[a-f0-9]{8}')
TYPE = 'voya-scheduled-backup-v1'

def utcnow():
    return dt.datetime.now(UTC)

def safe_key(key):
    return bool(re.fullmatch(r'[A-Za-z0-9][A-Za-z0-9/_.-]*', key)) and all(part not in ('', '.', '..') for part in key.split('/'))

def asset_keys(copy_sql):
    """Read FileAsset keys from the dump's own MVCC snapshot, not a later query."""
    result, index, in_copy = [], None, False
    for line in copy_sql.splitlines():
        match = re.match(r'COPY public\."?FileAsset"? \((.*)\) FROM stdin;', line)
        if match:
            columns = [column.strip().strip('"') for column in next(csv.reader([match.group(1)], skipinitialspace=True))]
            index = columns.index('storageKey'); in_copy = True; continue
        if in_copy and line == r'\.':
            in_copy = False; continue
        if in_copy:
            key = line.split('\t')[index]
            if not safe_key(key):
                raise ValueError('Unsafe storage key in backup snapshot')
            result.append(key)
    if index is None:
        raise ValueError('FileAsset COPY section not found in database backup')
    return result

def load_config(filename):
    config = json.loads(Path(filename).read_text())
    for key in ['backup_root', 'storage_root', 'state_root', 'release_backend', 'pg_bin']:
        value = Path(config[key])
        if not value.is_absolute() or len(value.parts) < 3 or value.is_symlink():
            raise ValueError('Unsafe operational directory: ' + key)
    if not re.fullmatch(r'activity_saas|voya_readiness_[a-zA-Z0-9_]+', config['database']):
        raise ValueError('Unexpected Voya database')
    if config.get('readiness_url') != 'http://127.0.0.1:4024/api/health/ready':
        raise ValueError('Monitoring is restricted to the Voya loopback readiness endpoint')
    if not 2 <= config.get('retention_days', 14) <= 90:
        raise ValueError('Retention must be between 2 and 90 days')
    return config

def pg_command(config, executable, args, stdout=subprocess.PIPE):
    # No DATABASE_URL/password is accepted or logged. No remote PG host is used.
    env = dict(os.environ)
    for key in ['PGHOST', 'PGPORT', 'PGUSER', 'PGDATABASE', 'PGPASSWORD', 'PGSERVICE', 'PGSERVICEFILE']:
        env.pop(key, None)
    env['PGOPTIONS'] = '-c default_transaction_read_only=on -c lock_timeout=5000 -c statement_timeout=120000'
    command = [str(Path(config['pg_bin']) / executable)] + args
    if executable == 'pg_dump':
        command = ['runuser', '-u', 'postgres', '--'] + command
    result = subprocess.run(command, stdout=stdout, stderr=subprocess.PIPE, env=env, cwd='/tmp', timeout=180)
    if result.returncode:
        # Raw PostgreSQL errors/configuration remain private, not in shared logs.
        raise RuntimeError('PostgreSQL backup operation failed: ' + executable)
    return result.stdout.decode() if stdout == subprocess.PIPE else None

def completed_backups(root):
    found = []
    if not root.exists():
        return found
    for directory in root.iterdir():
        if directory.is_symlink() or not directory.is_dir() or not BACKUP_NAME.fullmatch(directory.name):
            continue
        try:
            manifest = json.loads((directory / 'manifest.json').read_text())
            if manifest.get('type') != TYPE or not manifest.get('completed') or manifest.get('backup_root') != str(root.resolve()):
                continue
            created = dt.datetime.fromisoformat(manifest['created_at'])
            if created.tzinfo is None:
                continue
            found.append((created, directory, manifest))
        except (OSError, ValueError, KeyError):
            continue
    return sorted(found, key=lambda entry: entry[0], reverse=True)

def retain(root, days):
    # Only our marked, completed archives can expire; keep at least two.
    cutoff = utcnow() - dt.timedelta(days=days)
    removed = 0
    for created, directory, _ in completed_backups(root)[2:]:
        if created >= cutoff or directory.resolve().parent != root.resolve():
            continue
        # Backups contain regular archive/config files only. Refuse symlink trees.
        if any(item.is_symlink() or item.is_dir() for item in directory.iterdir()):
            continue
        shutil.rmtree(directory)
        removed += 1
    return removed

def backup(config):
    os.umask(0o077)
    root = Path(config['backup_root']); root.mkdir(parents=True, exist_ok=True, mode=0o700)
    root.chmod(0o700)
    if shutil.disk_usage(root).free < 512 * 1024 * 1024:
        raise RuntimeError('Backup filesystem has less than 512 MiB free')
    storage = Path(config['storage_root']).resolve()
    if not storage.is_dir():
        raise RuntimeError('Shared storage is unavailable')
    created = utcnow()
    backup_name = 'voya-daily-' + created.strftime('%Y%m%dT%H%M%SZ') + '-' + uuid.uuid4().hex[:8]
    directory = root / ('.incomplete-' + backup_name); directory.mkdir(mode=0o700)
    dump = directory / 'database.dump'
    with dump.open('wb') as output:
        pg_command(config, 'pg_dump', ['--host=/var/run/postgresql', '-d', config['database'], '-Fc', '--no-owner', '--no-acl'], output)
    toc = pg_command(config, 'pg_restore', ['--list', str(dump)])
    if not all('TABLE DATA public ' + name in toc for name in ['FileAsset', 'Booking', 'FinancialEvent', 'VendorOutlet']):
        raise RuntimeError('Database archive is incomplete')
    keys = asset_keys(pg_command(config, 'pg_restore', ['--data-only', '--table=FileAsset', '--file=-', str(dump)]))
    hashes = {}
    archive = directory / 'uploads.tar.gz'
    with tarfile.open(archive, 'w:gz', compresslevel=1) as output:
        for file in sorted(storage.rglob('*')):
            relative = file.relative_to(storage).as_posix()
            if relative == 'private/health' or relative.startswith('private/health/'):
                continue
            if file.is_symlink():
                raise RuntimeError('Unexpected symlink in upload storage')
            if file.is_file():
                # File keys are immutable in the application. Verify completeness
                # against the FileAsset rows in the dump before publishing backup.
                hashes[relative] = hashlib.sha256(file.read_bytes()).hexdigest()
                output.add(file, arcname=relative, recursive=False)
    with tarfile.open(archive) as source:
        for member in source.getmembers():
            if not member.isfile() or not safe_key(member.name):
                raise RuntimeError('Invalid uploads archive member')
            if hashlib.sha256(source.extractfile(member).read()).hexdigest() != hashes[member.name]:
                raise RuntimeError('Upload changed while archiving; retry backup')
    missing = sorted(hashlib.sha256(key.encode()).hexdigest() for key in keys if key not in hashes)
    known = set(config.get('known_missing_key_sha256', []))
    new_missing = sorted(set(missing) - known)
    for index, env_name in enumerate(['.env', '.runtime.env']):
        source = Path(config['release_backend']) / env_name
        if not source.is_file() or source.is_symlink():
            raise RuntimeError('Voya recovery environment is missing')
        shutil.copyfile(source, directory / ('environment-' + str(index) + '.env'))
    manifest = {'type': TYPE, 'completed': True, 'created_at': created.isoformat(), 'backup_root': str(root.resolve()), 'database': config['database'],
                'database_sha256': hashlib.sha256(dump.read_bytes()).hexdigest(), 'uploads_sha256': hashlib.sha256(archive.read_bytes()).hexdigest(),
                'file_count': len(hashes), 'referenced_file_count': len(keys), 'missing_reference_count': len(missing), 'new_missing_reference_count': len(new_missing),
                'missing_key_sha256': missing, 'file_sha256': hashes, 'status': 'error' if new_missing else 'warning' if missing else 'ok'}
    (directory / 'manifest.json').write_text(json.dumps(manifest, indent=2))
    directory.rename(root / backup_name)
    removed = retain(root, config.get('retention_days', 14))
    logging.log(logging.ERROR if new_missing else logging.WARNING if missing else logging.INFO,
                'Voya backup status=%s files=%d missing_references=%d new_missing=%d expired=%d', manifest['status'], len(hashes), len(missing), len(new_missing), removed)
    return manifest['status'] != 'error'

def monitor(config):
    os.umask(0o077)
    state_root = Path(config['state_root']); state_root.mkdir(parents=True, exist_ok=True, mode=0o700)
    healthy = False
    try:
        with urllib.request.urlopen(config['readiness_url'], timeout=4) as response:
            result = json.load(response)
            healthy = response.status == 200 and result.get('status') == 'ok' and result.get('checks') == {'database': 'up', 'storage': 'up'}
    except (OSError, ValueError):
        pass
    backups = completed_backups(Path(config['backup_root']))
    fresh = bool(backups and utcnow() - backups[0][0] < dt.timedelta(hours=26))
    missing = backups[0][2].get('new_missing_reference_count', 0) if backups else 0
    state = {'checked_at': utcnow().isoformat(), 'readiness': 'up' if healthy else 'down', 'backup_fresh': fresh,
             'new_missing_references': missing, 'known_missing_references': backups[0][2].get('missing_reference_count', 0) if backups else 0}
    good = healthy and fresh and missing == 0
    status = 'ok' if good and not state['known_missing_references'] else 'warning' if good else 'error'
    (state_root / 'status.json.tmp').write_text(json.dumps({**state, 'status': status}, indent=2))
    (state_root / 'status.json.tmp').replace(state_root / 'status.json')
    logging.log(logging.ERROR if not good else logging.WARNING if status == 'warning' else logging.INFO,
                'Voya monitor status=%s readiness=%s backup_fresh=%s known_missing=%d new_missing=%d', status, state['readiness'], fresh, state['known_missing_references'], missing)
    return good

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('action', choices=['backup', 'monitor'])
    parser.add_argument('--config', default='/etc/voya-ops/settings.json')
    args = parser.parse_args()
    logging.basicConfig(level=logging.INFO, format='%(levelname)s %(message)s')
    try:
        ok = globals()[args.action](load_config(args.config))
    except Exception as error:
        # Deliberately no repr/traceback containing provider/configuration secrets.
        logging.error('Voya %s failed (%s); inspect protected operational configuration', args.action, type(error).__name__)
        ok = False
    raise SystemExit(0 if ok else 1)

if __name__ == '__main__':
    main()
