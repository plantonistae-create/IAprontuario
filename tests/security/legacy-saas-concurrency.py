"""Real independent PostgreSQL transactions; exclusively disposable synthetic CI DBs."""
import os
import subprocess
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
        self.control = psycopg.connect(dbname='postgres',autocommit=True)
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

    def decision(self, db, choice, reason):
        return db.execute("""INSERT INTO private.nexa_historical_evidence_decisions
          (evidence_id,organization_id,proposer_id,approver_id,decision,rationale,decided_at)
          SELECT id,organization_id,collected_by,verified_by,%s,%s,clock_timestamp()
          FROM private.nexa_historical_evidence WHERE entity_id='legacy-text-id-1'
          RETURNING id,decided_at""", (choice, reason)).fetchone()

    def latest_decision(self):
        return self.db.execute("""SELECT decision FROM private.nexa_historical_evidence_decisions
          WHERE evidence_id=(""" + EVIDENCE + ") ORDER BY decided_at DESC,id DESC LIMIT 1").fetchone()[0]

    def decision_count(self):
        return self.db.execute('SELECT count(*) FROM private.nexa_historical_evidence_decisions WHERE evidence_id=('+EVIDENCE+')').fetchone()[0]

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

    def test_two_simultaneous_approvals_are_durable_and_idempotent(self):
        first, second = self.connect(), self.connect()
        a = self.decision(first, 'approved', 'synthetic-concurrent-approval-A')
        time.sleep(.03)
        b = self.decision(second, 'approved', 'synthetic-concurrent-approval-B')
        second.commit()
        first.commit()  # Commit order deliberately differs from decision order.
        self.assertLess(a[1], b[1])
        self.assertEqual(self.decision_count(), 3)
        self.assertEqual(self.latest_decision(), 'approved')
        self.assertEqual(sum(row[1] for row in self.db.execute(APPLY)), 1)
        self.assertEqual(sum(row[1] for row in self.db.execute(APPLY)), 0)
        self.assertEqual(self.snapshot(), self.baseline)

    def test_approval_and_rejection_race_rejects_mapping(self):
        first, second = self.connect(), self.connect()
        a = self.decision(first, 'approved', 'synthetic-competing-approval')
        time.sleep(.03)
        b = self.decision(second, 'rejected', 'synthetic-competing-rejection')
        second.commit()
        first.commit()
        self.assertLess(a[1], b[1])
        self.assertEqual(self.decision_count(), 3)
        self.assertEqual(self.latest_decision(), 'rejected')
        with self.assertRaises(psycopg.Error):
            self.db.execute(APPLY).fetchall()
        self.assertIsNone(self.owner())
        self.assertEqual(self.snapshot(), self.baseline)

    def test_approval_and_contestation_race_rejects_mapping(self):
        first, second = self.connect(), self.connect()
        self.decision(first, 'approved', 'synthetic-contested-approval')
        second.execute("UPDATE private.nexa_historical_evidence SET status='contested' WHERE entity_id='legacy-text-id-1'")
        first.commit()
        second.commit()
        self.assertEqual(self.decision_count(), 2)
        with self.assertRaises(psycopg.Error):
            self.db.execute(APPLY).fetchall()
        self.assertIsNone(self.owner())

    def test_approver_revocation_and_approval_race_rejects_mapping(self):
        first, second = self.connect(), self.connect()
        self.decision(first, 'approved', 'synthetic-revoked-approver')
        second.execute("UPDATE public.organization_memberships SET status='revoked',revoked_at=clock_timestamp() WHERE user_id='00000000-0000-4000-8000-000000000003' AND organization_id=%s", (ORG_A,))
        first.commit()
        second.commit()
        self.assertEqual(self.decision_count(), 2)
        with self.assertRaises(psycopg.Error):
            self.db.execute(APPLY).fetchall()
        self.assertIsNone(self.owner())

    def test_older_rejection_then_new_approval_uses_latest_decision(self):
        self.decision(self.db, 'rejected', 'synthetic-rejection-superseded')
        with self.assertRaises(psycopg.Error):
            self.db.execute(APPLY).fetchall()
        self.assertIsNone(self.owner())
        self.decision(self.db, 'approved', 'synthetic-later-approval')
        self.assertEqual(self.decision_count(), 3)
        self.assertEqual(self.latest_decision(), 'approved')
        self.assertEqual(sum(row[1] for row in self.db.execute(APPLY)), 1)
        self.assertEqual(self.snapshot(), self.baseline)

    def test_backfill_waits_for_uncommitted_decision(self):
        self.decision(self.db, 'rejected', 'synthetic-initial-rejection')
        writer = self.connect()
        self.decision(writer, 'approved', 'synthetic-pending-approval')
        worker, future = self.start()
        try:
            self.blocked_by(worker, writer, future)
        finally:
            writer.commit()
        self.assertEqual(sum(row[1] for row in future.result(timeout=12)), 1)
        self.assertEqual(self.decision_count(), 3)
        self.assertEqual(self.snapshot(), self.baseline)


class ClinicalPolicy(unittest.TestCase):
    """Actual repo migrations + observed staging tenant policies; role contexts, not signed JWTs."""

    def setUp(self):
        host = os.environ.get('PGHOST', '')
        if (host != '127.0.0.1' and os.path.realpath(host) != '/private/tmp/nexa-pr92-pg') or os.environ.get('PGDATABASE') != 'nexa_legacy_synthetic':
            raise RuntimeError('Only the local synthetic PostgreSQL CI service is permitted')
        self.control = psycopg.connect(dbname='postgres',autocommit=True)
        self.name = 'nexa_clinical_' + uuid.uuid4().hex
        self.control.execute(sql.SQL('CREATE DATABASE {} TEMPLATE nexa_legacy_synthetic').format(sql.Identifier(self.name)))
        env = {**os.environ, 'PGDATABASE': self.name}
        try:
            subprocess.run(['psql','-X','-v','ON_ERROR_STOP=1','-f','tests/security/clinical-positive-schema.sql'],
                           env=env, check=True, capture_output=True, text=True)
        except Exception:
            self.control.execute(sql.SQL('DROP DATABASE {} WITH (FORCE)').format(sql.Identifier(self.name)))
            self.control.close()
            raise
        self.admin = psycopg.connect(dbname=self.name, autocommit=True)
        self.clients = []

    def tearDown(self):
        for db in self.clients:
            db.close()
        self.admin.close()
        self.control.execute(sql.SQL('DROP DATABASE {} WITH (FORCE)').format(sql.Identifier(self.name)))
        self.control.close()

    def actor(self, user_id=None):
        db = psycopg.connect(dbname=self.name, autocommit=True)
        self.clients.append(db)
        db.execute('SET ROLE authenticated' if user_id else 'SET ROLE anon')
        if user_id:
            db.execute('SELECT set_config(%s,%s,false)', ('request.jwt.claim.sub',user_id))
        return db

    def doctor(self, suffix):
        return self.actor('00000000-0000-4000-8000-00000000000'+suffix)

    def test_positive_read_insert_update_and_tenant_assignment(self):
        a = self.doctor('1')
        self.assertEqual([row[0] for row in a.execute('SELECT id FROM public.consultation_history ORDER BY id')], ['legacy-text-id-1'])
        self.assertTrue(a.execute('SELECT has_active_clinical_access()').fetchone()[0])
        created = a.execute("""INSERT INTO public.consultation_history(id,professional_id,user_id,fields,clinical_text)
          VALUES ('synthetic-new-A','professional-a','00000000-0000-4000-8000-000000000001','{"queixa_principal":"Synthetic"}','synthetic clinical draft')
          RETURNING organization_id""").fetchone()[0]
        self.assertEqual(str(created), ORG_A)
        a.execute("UPDATE public.consultation_history SET clinical_text='synthetic revised' WHERE id='synthetic-new-A'")
        self.assertEqual(a.execute("SELECT clinical_text FROM public.consultation_history WHERE id='synthetic-new-A'").fetchone()[0], 'synthetic revised')
        self.assertEqual(self.admin.execute("SELECT count(*) FROM public.consultation_history WHERE id='synthetic-new-A' AND organization_id=%s AND user_id=%s", (ORG_A,'00000000-0000-4000-8000-000000000001')).fetchone()[0], 1)

    def test_foreign_read_and_update_are_filtered_by_rls(self):
        a = self.doctor('1')
        b = self.doctor('2')
        self.assertEqual(a.execute("SELECT count(*) FROM public.consultation_history WHERE id='legacy-text-id-2'").fetchone()[0], 0)
        self.assertEqual(b.execute("SELECT count(*) FROM public.consultation_history WHERE id='legacy-text-id-1'").fetchone()[0], 0)
        self.assertEqual(a.execute("UPDATE public.consultation_history SET clinical_text='bad' WHERE id='legacy-text-id-2' RETURNING id").fetchall(), [])
        self.assertEqual(self.admin.execute("SELECT clinical_text FROM public.consultation_history WHERE id='legacy-text-id-2'").fetchone()[0], 'synthetic-ambiguous')

    def test_unprivileged_admin_and_anonymous_have_no_assistential_access(self):
        admin = self.doctor('3')
        self.assertFalse(admin.execute('SELECT has_active_clinical_access()').fetchone()[0])
        self.assertEqual(admin.execute('SELECT id FROM public.consultation_history').fetchall(), [])
        with self.assertRaises(psycopg.Error):
            admin.execute("INSERT INTO public.consultation_history(id,user_id,clinical_text) VALUES ('bad-admin','00000000-0000-4000-8000-000000000003','synthetic')")
        anonymous = self.actor()
        with self.assertRaises(psycopg.Error):
            anonymous.execute('SELECT id FROM public.consultation_history')

    def test_no_clinical_slot_denies_read_and_write(self):
        self.admin.execute("UPDATE public.profiles SET clinical_access=false WHERE id='00000000-0000-4000-8000-000000000002'")
        b = self.doctor('2')
        self.assertFalse(b.execute('SELECT has_active_clinical_access()').fetchone()[0])
        self.assertEqual(b.execute('SELECT id FROM public.consultation_history').fetchall(), [])
        with self.assertRaises(psycopg.Error):
            b.execute("INSERT INTO public.consultation_history(id,user_id,clinical_text) VALUES ('bad-no-slot','00000000-0000-4000-8000-000000000002','synthetic')")

    def test_revocation_invalidates_existing_role_context(self):
        a = self.doctor('1')
        self.assertEqual(a.execute("SELECT count(*) FROM public.consultation_history WHERE id='legacy-text-id-1'").fetchone()[0], 1)
        self.admin.execute("UPDATE public.organization_memberships SET status='revoked',revoked_at=now() WHERE user_id='00000000-0000-4000-8000-000000000001' AND organization_id=%s", (ORG_A,))
        self.assertEqual(a.execute('SELECT id FROM public.consultation_history').fetchall(), [])
        self.assertEqual(a.execute("UPDATE public.consultation_history SET clinical_text='bad' WHERE id='legacy-text-id-1' RETURNING id").fetchall(), [])
        with self.assertRaises(psycopg.Error):
            a.execute("INSERT INTO public.consultation_history(id,user_id,clinical_text) VALUES ('bad-revoked','00000000-0000-4000-8000-000000000001','synthetic')")

    def test_identity_and_organization_cannot_be_reassigned(self):
        self.admin.execute("INSERT INTO public.organization_memberships(organization_id,user_id,roles,status,activated_at) VALUES ('40000000-0000-4000-8000-000000000002','00000000-0000-4000-8000-000000000001',ARRAY['clinician'],'active',now())")
        a = self.doctor('1')
        with self.assertRaises(psycopg.Error):
            a.execute("UPDATE public.consultation_history SET organization_id='40000000-0000-4000-8000-000000000002' WHERE id='legacy-text-id-1'")
        self.assertEqual(str(self.admin.execute("SELECT organization_id FROM public.consultation_history WHERE id='legacy-text-id-1'").fetchone()[0]), ORG_A)

    def test_owner_delete_and_identity_fields_follow_real_policy(self):
        a = self.doctor('1')
        a.execute("""INSERT INTO public.consultation_history(id,user_id,clinical_text)
          VALUES ('synthetic-delete-A','00000000-0000-4000-8000-000000000001','synthetic')""")
        for change in ["user_id='00000000-0000-4000-8000-000000000002'",
                       "encounter_id='10000000-0000-4000-8000-000000000099'"]:
            with self.assertRaises(psycopg.Error):
                a.execute("UPDATE public.consultation_history SET " + change + " WHERE id='synthetic-delete-A'")
        self.assertEqual(a.execute("DELETE FROM public.consultation_history WHERE id='synthetic-delete-A' RETURNING id").fetchall(), [('synthetic-delete-A',)])
        self.assertEqual(self.admin.execute("SELECT count(*) FROM public.consultation_history WHERE id='synthetic-delete-A'").fetchone()[0], 0)


if __name__ == '__main__':
    unittest.main(verbosity=2)
