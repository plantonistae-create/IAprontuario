"""Real independent PostgreSQL transactions; exclusively disposable synthetic CI DBs."""
import os
import time
import unittest
import uuid
from concurrent.futures import ThreadPoolExecutor

import psycopg
from psycopg import sql

APPLY = 'SELECT * FROM private.nexa_apply_verified_legacy_mapping()'
EVIDENCE = "SELECT id FROM private.nexa_historical_evidence WHERE entity_id='legacy-text-id-1'"
ORG_A = '40000000-0000-4000-8000-000000000001'


class Concurrency(unittest.TestCase):
    def setUp(self):
        host = os.environ.get('PGHOST', '')
        local_socket = os.path.realpath(host) == '/private/tmp/nexa-pr92-pg'
        if (host != '127.0.0.1' and not local_socket) or os.environ.get('PGDATABASE') != 'nexa_legacy_synthetic':
            raise RuntimeError('Only the local synthetic PostgreSQL CI service is permitted')
        self.control = psycopg.connect(autocommit=True)
        self.name = 'nexa_concurrency_' + uuid.uuid4().hex
        self.control.execute(sql.SQL('CREATE DATABASE {} TEMPLATE nexa_legacy_synthetic').format(sql.Identifier(self.name)))
        self.connections = []
        self.pool = ThreadPoolExecutor(max_workers=2)
        self.db = self.connect(autocommit=True)
        self.db.execute("DELETE FROM private.nexa_legacy_tenant_mapping WHERE entity_id <> 'legacy-text-id-1'")
        self.db.execute('UPDATE private.nexa_legacy_tenant_mapping SET applied_at=NULL')
        self.db.execute("UPDATE public.consultation_history SET organization_id=NULL WHERE id='legacy-text-id-1'")
        self.baseline = self.snapshot()

    def connect(self, autocommit=False):
        db = psycopg.connect(dbname=self.name, autocommit=autocommit, options='-c statement_timeout=10000 -c lock_timeout=8000')
        self.connections.append(db)
        return db

    def tearDown(self):
        for db in self.connections:
            db.close()
        self.pool.shutdown(wait=True)
        self.control.execute(sql.SQL('DROP DATABASE {} WITH (FORCE)').format(sql.Identifier(self.name)))
        self.control.close()

    def snapshot(self):
        return self.db.execute("SELECT id,clinical_text,user_id,encounter_id FROM public.consultation_history ORDER BY id").fetchall()

    def owner(self):
        return self.db.execute("SELECT organization_id FROM public.consultation_history WHERE id='legacy-text-id-1'").fetchone()[0]

    def start(self, statement=APPLY):
        db = self.connect(autocommit=True)
        return db, self.pool.submit(lambda: db.execute(statement).fetchall())

    def blocked_by(self, db, holder, future):
        deadline = time.monotonic() + 5
        while time.monotonic() < deadline:
            blockers = self.db.execute('SELECT pg_blocking_pids(%s)', (db.info.backend_pid,)).fetchone()[0]
            if holder.info.backend_pid in blockers:
                return
            if future.done():
                self.fail('Operation completed using stale authorization instead of waiting for the competing transaction')
            time.sleep(.02)
        self.fail('Competing transaction did not acquire the expected blocking lock')

    def denied_after(self, statement):
        writer = self.connect()
        writer.execute(statement)
        worker, future = self.start()
        try:
            self.blocked_by(worker, writer, future)
        finally:
            writer.commit()
        with self.assertRaises(psycopg.Error):
            future.result(timeout=12)
        self.assertIsNone(self.owner())
        self.assertEqual(self.snapshot(), self.baseline)

    def test_evidence_revocation_before_backfill(self):
        self.denied_after("UPDATE private.nexa_historical_evidence SET status='revoked' WHERE entity_id='legacy-text-id-1'")

    def test_evidence_contestation_before_backfill(self):
        self.denied_after("UPDATE private.nexa_historical_evidence SET status='contested' WHERE entity_id='legacy-text-id-1'")

    def test_source_revocation_before_backfill(self):
        self.denied_after("""INSERT INTO private.nexa_evidence_source_verifications
          (evidence_id,issuer_identity,issuer_organization_id,method,source_reference,proof_reference,document_sha256,verifier_id,outcome,verified_at)
          SELECT id,issuer,organization_id,'institutional_registry','synthetic-concurrent-revocation','synthetic-proof',document_sha256,
          verified_by,'revoked',clock_timestamp()+interval '1 minute' FROM private.nexa_historical_evidence WHERE entity_id='legacy-text-id-1'""")

    def test_approver_membership_revocation_before_backfill(self):
        self.denied_after("UPDATE public.organization_memberships SET status='revoked',revoked_at=clock_timestamp() WHERE user_id='00000000-0000-4000-8000-000000000003'")

    def test_concurrent_decision_rescission_before_backfill(self):
        self.denied_after("""INSERT INTO private.nexa_historical_evidence_decisions
          (evidence_id,organization_id,proposer_id,approver_id,decision,rationale,decided_at)
          SELECT id,organization_id,collected_by,verified_by,'rescinded','synthetic-concurrent-rescission',clock_timestamp()+interval '1 minute'
          FROM private.nexa_historical_evidence WHERE entity_id='legacy-text-id-1'""")

    def test_two_backfills_serialize_and_replay(self):
        first = self.connect()
        self.assertEqual(sum(row[1] for row in first.execute(APPLY)), 1)
        second, future = self.start()
        try:
            self.blocked_by(second, first, future)
        finally:
            first.commit()
        self.assertEqual(sum(row[1] for row in future.result(timeout=12)), 0)
        self.assertEqual(str(self.owner()), ORG_A)
        self.assertEqual(self.snapshot(), self.baseline)

    def test_competing_ownership_is_never_overwritten(self):
        writer = self.connect()
        writer.execute("UPDATE public.consultation_history SET organization_id='40000000-0000-4000-8000-000000000002' WHERE id='legacy-text-id-1'")
        worker, future = self.start()
        try:
            self.blocked_by(worker, writer, future)
        finally:
            writer.commit()
        # Revalidation may reject the conflicting owner, or the guarded UPDATE may skip it.
        try:
            future.result(timeout=12)
        except psycopg.Error:
            pass
        self.assertEqual(str(self.owner()), '40000000-0000-4000-8000-000000000002')
        self.assertIsNone(self.db.execute('SELECT applied_at FROM private.nexa_legacy_tenant_mapping').fetchone()[0])
        self.assertEqual(self.snapshot(), self.baseline)

    def test_rollback_and_retry_are_atomic(self):
        first = self.connect()
        first.execute(APPLY).fetchall()
        self.assertIsNone(self.owner(), 'Uncommitted mapping became visible')
        first.rollback()
        self.assertIsNone(self.owner())
        self.assertEqual(sum(row[1] for row in self.db.execute(APPLY)), 1)
        self.assertEqual(sum(row[1] for row in self.db.execute(APPLY)), 0)
        self.assertEqual(self.snapshot(), self.baseline)

    def test_repeatable_read_snapshot_cannot_bypass_revocation(self):
        stale = self.connect()
        stale.execute('SET TRANSACTION ISOLATION LEVEL REPEATABLE READ')
        stale.execute(EVIDENCE).fetchall()  # Establish snapshot before the competing commit.
        self.db.execute("UPDATE private.nexa_historical_evidence SET status='revoked' WHERE entity_id='legacy-text-id-1'")
        with self.assertRaises(psycopg.Error):
            stale.execute(APPLY).fetchall()
        stale.rollback()
        self.assertIsNone(self.owner())

    def test_failure_after_clinical_update_rolls_back_and_retries(self):
        self.db.execute("""CREATE FUNCTION private.synthetic_fail_final_step() RETURNS trigger
          LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'synthetic final-step interruption'; END $$""")
        self.db.execute("""CREATE TRIGGER synthetic_final_step_failure BEFORE UPDATE
          ON private.nexa_legacy_tenant_mapping FOR EACH ROW EXECUTE FUNCTION private.synthetic_fail_final_step()""")
        with self.assertRaisesRegex(psycopg.Error, 'synthetic final-step interruption'):
            self.db.execute(APPLY).fetchall()
        self.assertIsNone(self.owner(), 'Partial update survived statement rollback')
        self.assertEqual(self.snapshot(), self.baseline)
        self.db.execute('DROP TRIGGER synthetic_final_step_failure ON private.nexa_legacy_tenant_mapping')
        self.assertEqual(sum(row[1] for row in self.db.execute(APPLY)), 1)
        self.assertEqual(sum(row[1] for row in self.db.execute(APPLY)), 0)


if __name__ == '__main__':
    unittest.main(verbosity=2)
