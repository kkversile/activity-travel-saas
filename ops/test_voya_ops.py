import datetime as dt
import importlib.util
import io
import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

spec = importlib.util.spec_from_file_location('voya_ops', Path(__file__).with_name('voya_ops.py'))
ops = importlib.util.module_from_spec(spec)
spec.loader.exec_module(ops)

class OperationalSafetyTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(prefix='voya-ops-fixture-')
        self.root = Path(self.temp.name)
        self.config = {'backup_root': str(self.root / 'backups'), 'storage_root': str(self.root / 'storage'), 'state_root': str(self.root / 'state'), 'release_backend': str(self.root / 'backend'), 'pg_bin': '/usr/lib/postgresql/15/bin', 'database': 'voya_readiness_ops', 'readiness_url': 'http://127.0.0.1:4024/api/health/ready', 'retention_days': 14}
        Path(self.config['storage_root']).mkdir(); Path(self.config['release_backend']).mkdir()
        for name in ['.env', '.runtime.env']:
            (Path(self.config['release_backend']) / name).write_text('SYNTHETIC_SECRET=not-a-client-key')
    def tearDown(self):
        self.temp.cleanup()
    def marker(self, age=0, suffix='12345678', **extra):
        root = Path(self.config['backup_root']); root.mkdir(exist_ok=True)
        now = ops.utcnow() - dt.timedelta(days=age)
        directory = root / ('voya-daily-' + now.strftime('%Y%m%dT%H%M%SZ') + '-' + suffix)
        directory.mkdir()
        for name in ['database.dump', 'uploads.tar.gz', 'environment-0.env', 'environment-1.env']:
            (directory / name).write_bytes(b'synthetic recovery fixture')
        manifest = {'type': ops.TYPE, 'completed': True, 'backup_root': str(root.resolve()), 'created_at': now.isoformat(), 'database_sha256': ops.file_sha256(directory/'database.dump'), 'uploads_sha256': ops.file_sha256(directory/'uploads.tar.gz'), 'environment_sha256': {name: ops.file_sha256(directory/name) for name in ['environment-0.env','environment-1.env']}, **extra}
        (directory / 'manifest.json').write_text(json.dumps(manifest))
        return directory
    def test_snapshot_copy_keys_are_read_from_actual_column_order(self):
        self.assertEqual(ops.asset_keys('COPY public."FileAsset" (id, "storageKey", purpose) FROM stdin;\na\tprivate/one.pdf\tVENDOR_DOCUMENT\n\\.\n'), ['private/one.pdf'])
    def test_unsafe_keys_and_missing_copy_section_fail_closed(self):
        for key in ['../outside', '/etc/passwd', 'private/../../secret', r'private\file', 'private//file']:
            with self.assertRaises(ValueError):
                ops.asset_keys('COPY public."FileAsset" ("storageKey") FROM stdin;\n' + key + '\n\\.\n')
        with self.assertRaises(ValueError): ops.asset_keys('SELECT 1;')
    def test_config_refuses_remote_monitoring_and_unsafe_backup_directory(self):
        filename = self.root / 'settings.json'
        for change in [{'backup_root': '/'}, {'readiness_url': 'https://other.invalid/secret'}, {'database': 'unrelated_db'}, {'retention_days': 0}]:
            filename.write_text(json.dumps({**self.config, **change}))
            with self.assertRaises(ValueError): ops.load_config(filename)
    def test_retention_preserves_unmarked_data_and_two_newest_backups(self):
        recent = self.marker(0, '00000000'); previous = self.marker(1, '11111111'); expired = self.marker(30, '22222222')
        unmarked = Path(self.config['backup_root']) / 'voya-daily-20000101T000000Z-33333333'; unmarked.mkdir(); (unmarked / 'important').write_text('keep')
        self.assertEqual(ops.retain(Path(self.config['backup_root']), 14), 1)
        self.assertTrue(recent.exists() and previous.exists() and unmarked.exists()); self.assertFalse(expired.exists())
    def fake_pg(self, config, command, args, stdout=ops.subprocess.PIPE):
        if command == 'pg_dump': stdout.write(b'synthetic dump'); return None
        if '--list' in args: return '\n'.join('TABLE DATA public ' + n for n in ['FileAsset','Booking','FinancialEvent','VendorOutlet'])
        return 'COPY public."FileAsset" (id, "storageKey") FROM stdin;\na\tprivate/document.pdf\n\\.\n'
    def test_backup_validates_archives_includes_recovery_environment_and_excludes_health_probes(self):
        storage = Path(self.config['storage_root']); (storage / 'private/health').mkdir(parents=True)
        (storage / 'private/document.pdf').write_bytes(b'original synthetic document'); (storage / 'private/health/one.probe').write_bytes(b'ephemeral')
        with patch.object(ops, 'pg_command', side_effect=self.fake_pg): self.assertTrue(ops.backup(self.config))
        _, directory, manifest = ops.completed_backups(Path(self.config['backup_root']))[0]
        self.assertEqual(manifest['file_count'], 1); self.assertEqual(manifest['missing_reference_count'], 0)
        self.assertTrue((directory / 'environment-0.env').is_file()); self.assertEqual(manifest['status'], 'ok')
        self.assertTrue(ops.backup_integrity(directory, manifest))
        self.assertEqual(set(manifest['environment_sha256']), {'environment-0.env','environment-1.env'})
    def test_backup_reports_new_missing_references_as_failure_but_retains_recovery_archive(self):
        with patch.object(ops, 'pg_command', side_effect=self.fake_pg): self.assertFalse(ops.backup(self.config))
        manifest = ops.completed_backups(Path(self.config['backup_root']))[0][2]
        self.assertEqual(manifest['status'], 'error'); self.assertEqual(manifest['new_missing_reference_count'], 1)
    def test_known_missing_references_remain_visible_as_warning(self):
        self.config['known_missing_key_sha256'] = [ops.hashlib.sha256(b'private/document.pdf').hexdigest()]
        with patch.object(ops, 'pg_command', side_effect=self.fake_pg): self.assertTrue(ops.backup(self.config))
        self.assertEqual(ops.completed_backups(Path(self.config['backup_root']))[0][2]['status'], 'warning')
    def response(self, value):
        stream = io.BytesIO(json.dumps(value).encode()); stream.status = 200; return stream
    def test_monitor_requires_real_dependency_checks_and_fresh_backup(self):
        self.marker(new_missing_reference_count=0, missing_reference_count=0)
        with patch.object(ops.urllib.request, 'urlopen', return_value=self.response({'status':'ok','checks':{'database':'up','storage':'up'}})):
            self.assertTrue(ops.monitor(self.config))
        with patch.object(ops.urllib.request, 'urlopen', return_value=self.response({'status':'ok'})):
            self.assertFalse(ops.monitor(self.config))
    def test_monitor_rejects_outage_and_stale_backup_without_exposing_errors(self):
        self.marker(2)
        with patch.object(ops.urllib.request, 'urlopen', side_effect=OSError('private password/url')): self.assertFalse(ops.monitor(self.config))
        state = (Path(self.config['state_root']) / 'status.json').read_text()
        self.assertNotIn('password', state); self.assertFalse(json.loads(state)['backup_fresh'])
    def assert_bad_backup(self):
        with patch.object(ops.urllib.request, 'urlopen', return_value=self.response({'status':'ok','checks':{'database':'up','storage':'up'}})):
            self.assertFalse(ops.monitor(self.config))
        state = json.loads((Path(self.config['state_root']) / 'status.json').read_text())
        self.assertEqual(state['status'], 'error'); self.assertFalse(state['backup_integrity'])
    def test_monitor_rejects_deleted_archive_without_falling_back_to_previous(self):
        self.marker(1, '11111111'); latest=self.marker(); (latest/'database.dump').unlink()
        self.assert_bad_backup()
    def test_monitor_rejects_corrupted_uploads(self):
        latest=self.marker(); (latest/'uploads.tar.gz').write_bytes(b'corruption')
        self.assert_bad_backup()
    def test_monitor_rejects_corrupted_recovery_configuration(self):
        latest=self.marker(); (latest/'environment-0.env').write_bytes(b'changed private recovery key')
        self.assert_bad_backup()
        self.assertNotIn('private recovery key', (Path(self.config['state_root'])/'status.json').read_text())
    def test_legacy_backup_requires_archives_and_recovery_files(self):
        latest=self.marker(); manifest=json.loads((latest/'manifest.json').read_text()); manifest.pop('environment_sha256')
        self.assertTrue(ops.backup_integrity(latest,manifest)); (latest/'environment-1.env').unlink()
        self.assertFalse(ops.backup_integrity(latest,manifest))
    def test_integrity_rejects_invalid_hashes_and_unexpected_configuration_names(self):
        latest=self.marker(); manifest=json.loads((latest/'manifest.json').read_text())
        self.assertFalse(ops.backup_integrity(latest,{**manifest,'database_sha256':'not-a-checksum'}))
        self.assertFalse(ops.backup_integrity(latest,{**manifest,'environment_sha256':{'../secret':'a'*64}}))
    def test_monitor_rejects_future_backup_timestamp(self):
        self.marker(-1)
        with patch.object(ops.urllib.request, 'urlopen', return_value=self.response({'status':'ok','checks':{'database':'up','storage':'up'}})):
            self.assertFalse(ops.monitor(self.config))
        self.assertFalse(json.loads((Path(self.config['state_root'])/'status.json').read_text())['backup_fresh'])

if __name__ == '__main__': unittest.main()
