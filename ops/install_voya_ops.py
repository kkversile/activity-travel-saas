#!/usr/bin/env python3
"""Install only the Voya local timers after an explicitly approved deployment."""
import argparse
import hashlib
import json
import os
from pathlib import Path
import re
import shutil
import subprocess

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--service', required=True)
    parser.add_argument('--apply', action='store_true')
    parser.add_argument('--accept-existing-missing-count', type=int, default=0)
    args = parser.parse_args()
    assert os.geteuid() == 0 and args.apply, 'Root and explicit --apply are required'
    assert re.fullmatch(r'voya-api-demo-[a-f0-9]{7}\.service', args.service)
    assert subprocess.check_output(['systemctl','is-active',args.service]).decode().strip() == 'active'
    backend = Path(subprocess.check_output(['systemctl','show',args.service,'-p','WorkingDirectory','--value']).decode().strip())
    assert backend.name == 'activity-saas-backend' and backend.parent.parent == Path('/var/www') and backend.parent.name.startswith('voya-vendor-platform-release-')
    storage = (backend / 'storage').resolve(); assert storage.is_dir()
    pg = Path('/usr/lib/postgresql/15/bin'); assert (pg / 'pg_dump').is_file()
    env = {**os.environ, 'PGOPTIONS':'-c default_transaction_read_only=on'}
    data = subprocess.check_output(['runuser','-u','postgres','--',str(pg/'psql'),'-h','/var/run/postgresql','-X','-At','-v','ON_ERROR_STOP=1','-d','activity_saas','-c','SELECT coalesce(json_agg("storageKey"),\'[]\'::json) FROM "FileAsset"'],env=env,cwd='/tmp')
    missing = sorted(hashlib.sha256(key.encode()).hexdigest() for key in json.loads(data) if not (storage / key).is_file())
    config_dir = Path('/etc/voya-ops'); library = Path('/usr/local/lib/voya-ops')
    os.umask(0o077)
    config_dir.mkdir(mode=0o700,exist_ok=True); library.mkdir(mode=0o755,exist_ok=True)
    filename = config_dir / 'settings.json'
    prior = json.loads(filename.read_text()) if filename.exists() else None
    if prior:
        assert prior.get('managed_by') == 'voya-ops-v1'
        known = prior.get('known_missing_key_sha256', [])
    else:
        assert len(missing) == args.accept_existing_missing_count, 'Inspect existing missing originals before accepting the initial baseline'
        known = missing
    config = {'managed_by':'voya-ops-v1','database':'activity_saas','pg_bin':str(pg),'backup_root':'/root/voya-backups/scheduled','storage_root':str(storage),'state_root':'/var/lib/voya-ops','release_backend':str(backend),'readiness_url':'http://127.0.0.1:4024/api/health/ready','retention_days':14,'known_missing_key_sha256':known}
    for directory in ['/root/voya-backups/scheduled','/var/lib/voya-ops']: Path(directory).mkdir(parents=True,exist_ok=True,mode=0o700)
    source = Path(__file__).resolve().parent
    shutil.copyfile(source/'voya_ops.py',library/'voya_ops.py'); (library/'voya_ops.py').chmod(0o755)
    for name in ['voya-backup.service','voya-backup.timer','voya-monitor.service','voya-monitor.timer']:
        target = Path('/etc/systemd/system')/name
        if target.exists():
            assert 'Voya' in target.read_text(), 'Refusing to overwrite an unrelated service'
        shutil.copyfile(source/name,target); target.chmod(0o644)
    temporary = config_dir/'settings.json.tmp'; temporary.write_text(json.dumps(config,indent=2)); temporary.chmod(0o600); temporary.replace(filename)
    subprocess.run(['systemctl','daemon-reload'],check=True)
    # Run a verified first backup before enabling freshness monitoring.
    subprocess.run(['systemctl','start','voya-backup.service'],check=True)
    subprocess.run(['systemctl','start','voya-monitor.service'],check=True)
    subprocess.run(['systemctl','enable','--now','voya-backup.timer','voya-monitor.timer'],check=True)
    print(json.dumps({'installed':True,'localOnly':True,'retentionDays':14,'knownMissingOriginals':len(known),'externalAlertDelivery':False,'externalBackupStorage':False}))

if __name__ == '__main__': main()
