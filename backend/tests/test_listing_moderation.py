"""Run real RLS/RPC checks in a disposable local PostgreSQL cluster, never DATABASE_URL."""
import json
import os
from pathlib import Path
import shutil
import socket
import subprocess
import tempfile

import psycopg
import pytest

ROOT = Path(__file__).resolve().parents[2]
SELLER = '00000000-0000-0000-0000-000000000001'
OTHER = '00000000-0000-0000-0000-000000000002'
ADMIN = '00000000-0000-0000-0000-000000000003'


@pytest.fixture(scope='module')
def database():
    initdb = shutil.which('initdb')
    pg_ctl = shutil.which('pg_ctl')
    if not initdb or not pg_ctl:
        if os.environ.get('REQUIRE_DATABASE_TESTS') == '1':
            pytest.fail('Required isolated database checks need initdb and pg_ctl on PATH')
        pytest.skip('Isolated database checks require local initdb and pg_ctl binaries')
    with tempfile.TemporaryDirectory(prefix='renseller-moderation-') as directory:
        cluster = Path(directory) / 'data'
        with socket.socket() as listener:
            listener.bind(('127.0.0.1', 0))
            port = listener.getsockname()[1]
        subprocess.run([initdb, '-D', str(cluster), '-U', 'postgres', '-A', 'trust', '--no-locale', '--encoding=UTF8'], check=True, capture_output=True)
        subprocess.run([pg_ctl, '-D', str(cluster), '-l', str(Path(directory) / 'postgres.log'), '-o', f'-h 127.0.0.1 -p {port}', '-w', 'start'], check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        try:
            with psycopg.connect(host='127.0.0.1', port=port, user='postgres', dbname='postgres', autocommit=True) as connection:
                connection.execute((ROOT / 'supabase/tests/listings_fixture.sql').read_text())
                migration = ROOT / 'supabase/migrations/202611060001_listing_moderation.sql'
                if migration.exists():
                    connection.execute(migration.read_text())
                yield connection
        finally:
            subprocess.run([pg_ctl, '-D', str(cluster), '-m', 'immediate', '-w', 'stop'], check=True, capture_output=True)


@pytest.fixture
def sql(database):
    with database.transaction(force_rollback=True):
        database.execute('delete from public.listings where id = -1')
        yield database


def login(sql, identity=SELLER, email='student@rpi.edu', **claims):
    sql.execute('reset role')
    sql.execute("select set_config('request.jwt.claims', %s, true)", [json.dumps({'sub': identity, 'email': email, **claims})])
    sql.execute('set local role authenticated' if identity else 'set local role anon')


def create_listing(sql):
    return sql.execute("insert into public.listings (seller_id, name, price, category, condition) values (%s, 'Book', 12, 'Textbooks', 'New') returning id", [SELLER]).fetchone()[0]


def moderate(sql, listing, action='approve', reason='Reviewed for marketplace rules', expected='pending'):
    return sql.execute('select public.moderate_listing(%s, %s, %s, %s)', [listing, action, reason, expected]).fetchone()


def test_existing_listings_enter_review_queue(database):
    assert database.execute('select moderation_status from public.listings where id=-1').fetchone() == ('pending',)


def test_new_listings_require_approval(sql):
    login(sql)
    listing = create_listing(sql)
    assert sql.execute('select moderation_status from public.listings where id=%s', [listing]).fetchone() == ('pending',)
    login(sql, OTHER)
    assert sql.execute('select id from public.listings').fetchall() == []
    login(sql, None)
    assert sql.execute('select id from public.listings').fetchall() == []


def test_admin_approves_and_public_can_read_only_approved(sql):
    login(sql)
    listing = create_listing(sql)
    login(sql, ADMIN)
    assert sql.execute('select id from public.listings where id=%s', [listing]).fetchone() == (listing,)
    moderate(sql, listing)
    login(sql, None)
    assert sql.execute('select id from public.listings').fetchall() == [(listing,)]
    sql.execute('reset role')
    assert sql.execute('select actor_id::text, action, reason from public.listing_moderation_events').fetchall() == [(ADMIN, 'approve', 'Reviewed for marketplace rules')]


@pytest.mark.parametrize('identity', [SELLER, OTHER, None])
def test_users_cannot_moderate_even_with_spoofed_claims(sql, identity):
    login(sql)
    listing = create_listing(sql)
    login(sql, identity, app_metadata={'group': 'admin'}, user_metadata={'group': 'admin'})
    with pytest.raises(psycopg.errors.InsufficientPrivilege):
        moderate(sql, listing)


@pytest.mark.parametrize('statement', [
    "update public.listings set moderation_status='approved'",
    'delete from public.listings',
    "insert into public.listings (seller_id,name,price,category,condition,moderation_status) values ('" + SELLER + "','Bypass',1,'Textbooks','New','approved')",
    "insert into public.listing_moderation_events (listing_id,actor_id,action,reason) values (1,'" + ADMIN + "','approve','Forged')",
])
def test_direct_writes_cannot_bypass_review(sql, statement):
    login(sql)
    create_listing(sql)
    with pytest.raises(psycopg.errors.InsufficientPrivilege):
        sql.execute(statement)


@pytest.mark.parametrize('action,expected', [('reject', 'rejected'), ('remove', 'removed')])
def test_admin_rejects_or_removes_without_public_visibility(sql, action, expected):
    login(sql)
    listing = create_listing(sql)
    login(sql, ADMIN)
    moderate(sql, listing, action)
    assert sql.execute('select moderation_status from public.listings where id=%s', [listing]).fetchone() == (expected,)
    login(sql, OTHER)
    assert sql.execute('select id from public.listings').fetchall() == []


@pytest.mark.parametrize('action,reason,expected', [('edit', 'reason', 'pending'), ('approve', '', 'pending'), ('approve', ' ', 'pending'), ('approve', 'x' * 501, 'pending'), ('approve', 'reason', 'approved'), ('approve', None, 'pending'), (None, 'reason', 'pending')])
def test_invalid_or_stale_decisions_fail(sql, action, reason, expected):
    login(sql)
    listing = create_listing(sql)
    login(sql, ADMIN)
    expected_error = psycopg.errors.SerializationFailure if expected == 'approved' else psycopg.errors.InvalidParameterValue
    with pytest.raises(expected_error):
        moderate(sql, listing, action, reason, expected)


def test_remove_approved_listing_and_reject_duplicate_decision(sql):
    login(sql)
    listing = create_listing(sql)
    login(sql, ADMIN)
    moderate(sql, listing)
    moderate(sql, listing, 'remove', 'Violates policy', 'approved')
    with pytest.raises(psycopg.errors.SerializationFailure):
        moderate(sql, listing, 'approve', 'Stale review')


def test_revoked_admin_cannot_use_stale_token(sql):
    login(sql)
    listing = create_listing(sql)
    sql.execute('reset role')
    sql.execute("update auth.users set raw_app_meta_data='{}' where id=%s", [ADMIN])
    login(sql, ADMIN, app_metadata={'group': 'admin'})
    with pytest.raises(psycopg.errors.InsufficientPrivilege):
        moderate(sql, listing)


def test_cross_account_insert_is_denied(sql):
    login(sql, OTHER)
    with pytest.raises(psycopg.errors.InsufficientPrivilege):
        create_listing(sql)


def test_non_rpi_insert_is_denied(sql):
    login(sql, SELLER, email='student@example.com')
    with pytest.raises(psycopg.errors.InsufficientPrivilege):
        create_listing(sql)


def test_unknown_listing_is_not_a_success(sql):
    login(sql, ADMIN)
    with pytest.raises(psycopg.errors.NoDataFound):
        moderate(sql, 999999)


@pytest.mark.parametrize('reason', ['x', 'x' * 500])
def test_reason_boundaries_are_accepted(sql, reason):
    login(sql)
    listing = create_listing(sql)
    login(sql, ADMIN)
    moderate(sql, listing, reason=reason)
    assert sql.execute('select reason from public.listing_moderation_events').fetchone() == (reason,)


def test_audit_history_is_admin_only_and_immutable(sql):
    login(sql)
    listing = create_listing(sql)
    login(sql, ADMIN)
    moderate(sql, listing)
    assert len(sql.execute('select id from public.listing_moderation_events').fetchall()) == 1
    login(sql, OTHER)
    assert sql.execute('select id from public.listing_moderation_events').fetchall() == []
    login(sql, ADMIN)
    with pytest.raises(psycopg.errors.InsufficientPrivilege):
        sql.execute('delete from public.listing_moderation_events')


@pytest.mark.parametrize('assignment', ["banned_until=now()+interval '1 day'", 'deleted_at=now()', 'email_confirmed_at=null', "email='admin@example.com'"])
def test_ineligible_admins_cannot_moderate(sql, assignment):
    login(sql)
    listing = create_listing(sql)
    sql.execute('reset role')
    sql.execute(f'update auth.users set {assignment} where id=%s', [ADMIN])
    login(sql, ADMIN)
    with pytest.raises(psycopg.errors.InsufficientPrivilege):
        moderate(sql, listing)
