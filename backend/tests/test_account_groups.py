"""Account administration uses the same disposable cluster as listing RLS tests."""
import psycopg
import pytest
from concurrent.futures import ThreadPoolExecutor
from threading import Barrier

from test_listing_moderation import ADMIN, OTHER, SELLER, database, login, sql


def accounts(sql, search='', offset=0):
    return sql.execute('select user_id::text, email, account_group, eligible from public.list_account_groups(%s, %s)', [search, offset]).fetchall()


def test_admin_lists_accounts_with_regular_users_as_the_default(sql):
    login(sql, ADMIN)
    rows = accounts(sql)
    assert rows == [
        (ADMIN, 'admin@rpi.edu', 'admin', True),
        (OTHER, 'other@rpi.edu', 'user', True),
        (SELLER, 'seller@rpi.edu', 'user', True),
    ]


@pytest.mark.parametrize('identity', [None, SELLER, OTHER])
def test_only_current_admins_can_read_account_directory(sql, identity):
    login(sql, identity, app_metadata={'group': 'admin'}, user_metadata={'group': 'admin'})
    with pytest.raises(psycopg.errors.InsufficientPrivilege):
        accounts(sql)


def test_search_is_case_insensitive_literal_and_trimmed(sql):
    login(sql, ADMIN)
    assert accounts(sql, ' OTHER@RPI.EDU ') == [(OTHER, 'other@rpi.edu', 'user', True)]
    assert accounts(sql, '%') == []
    assert accounts(sql, 'missing') == []


@pytest.mark.parametrize('search,offset', [(None, 0), ('x' * 201, 0), ('', -1), ('', None)])
def test_invalid_directory_input_is_rejected(sql, search, offset):
    login(sql, ADMIN)
    with pytest.raises(psycopg.errors.InvalidParameterValue):
        accounts(sql, search, offset)


def test_directory_paginates_without_exposing_non_rpi_or_deleted_accounts(sql):
    sql.execute("insert into auth.users (id,email) select md5('account' || i::text)::uuid, 'student' || lpad(i::text, 3, '0') || '@rpi.edu' from generate_series(1, 55) i")
    sql.execute("insert into auth.users (id,email) values (md5('outsider')::uuid,'outside@example.com')")
    sql.execute('update auth.users set deleted_at=now() where id=%s', [SELLER])
    login(sql, ADMIN)
    first = accounts(sql, 'student')
    second = accounts(sql, 'student', 50)
    assert len(first) == 51  # One extra row lets the UI know another page exists.
    assert len(second) == 5
    assert first[50] == second[0]
    assert len({row[0] for row in first[:50] + second}) == 55
    assert all(row[1].endswith('@rpi.edu') and row[0] != SELLER for row in accounts(sql))


@pytest.mark.parametrize('metadata', [None, '"admin"', '{"group":"Admin"}', '{"group":["admin"]}'])
def test_directory_defaults_malformed_groups_to_user(sql, metadata):
    sql.execute('update auth.users set raw_app_meta_data=%s::jsonb where id=%s', [metadata, OTHER])
    login(sql, ADMIN)
    assert accounts(sql, 'other')[0][2] == 'user'


@pytest.mark.parametrize('assignment', ["raw_app_meta_data='{}'", 'email_confirmed_at=null', 'deleted_at=now()', "banned_until=now()+interval '1 day'", "email='admin@example.com'"])
def test_directory_denies_revoked_or_ineligible_admins(sql, assignment):
    sql.execute(f'update auth.users set {assignment} where id=%s', [ADMIN])
    login(sql, ADMIN, app_metadata={'group': 'admin'})
    with pytest.raises(psycopg.errors.InsufficientPrivilege):
        accounts(sql)


def change_group(sql, target=OTHER, group='admin', reason='Team administrator', expected='user'):
    sql.execute('select public.set_account_group(%s, %s, %s, %s)', [target, group, reason, expected])


def test_admin_promotes_preserving_other_metadata_and_auditing(sql):
    sql.execute("update auth.users set raw_app_meta_data='{" + '"provider":"email","custom":{"keep":true}' + "}' where id=%s", [OTHER])
    login(sql, ADMIN)
    change_group(sql)
    assert accounts(sql, 'other')[0][2] == 'admin'
    rows = sql.execute('select actor_id::text, target_user_id::text, old_group, new_group, reason from public.account_group_events order by id').fetchall()
    assert rows == [(ADMIN, OTHER, 'user', 'admin', 'Team administrator')]
    sql.execute('reset role')
    assert sql.execute('select raw_app_meta_data from auth.users where id=%s', [OTHER]).fetchone()[0] == {'provider': 'email', 'custom': {'keep': True}, 'group': 'admin'}


@pytest.mark.parametrize('identity', [None, SELLER, OTHER])
def test_regular_users_cannot_change_groups_or_self_promote(sql, identity):
    login(sql, identity, app_metadata={'group': 'admin'}, user_metadata={'group': 'admin'})
    with pytest.raises(psycopg.errors.InsufficientPrivilege):
        change_group(sql, target=identity or OTHER)


@pytest.mark.parametrize('group,reason,expected', [('owner', 'reason', 'user'), (None, 'reason', 'user'), ('admin', '', 'user'), ('admin', ' ', 'user'), ('admin', 'x' * 501, 'user'), ('admin', None, 'user'), ('admin', 'reason', None), ('admin', 'reason', 'owner')])
def test_invalid_role_changes_are_rejected(sql, group, reason, expected):
    login(sql, ADMIN)
    with pytest.raises(psycopg.errors.InvalidParameterValue):
        change_group(sql, group=group, reason=reason, expected=expected)


def test_stale_role_changes_and_duplicate_decisions_are_rejected(sql):
    login(sql, ADMIN)
    change_group(sql)
    with pytest.raises(psycopg.errors.SerializationFailure):
        change_group(sql)


def test_admin_cannot_change_own_group(sql):
    login(sql, ADMIN)
    with pytest.raises(psycopg.errors.InvalidParameterValue):
        change_group(sql, target=ADMIN, group='user', expected='admin')


def test_missing_account_fails(sql):
    login(sql, ADMIN)
    with pytest.raises(psycopg.errors.NoDataFound):
        change_group(sql, target='00000000-0000-0000-0000-000000000099')


@pytest.mark.parametrize('assignment', ['email_confirmed_at=null', 'deleted_at=now()', "banned_until=now()+interval '1 day'", "email='outside@example.com'"])
def test_ineligible_accounts_cannot_be_promoted(sql, assignment):
    sql.execute(f'update auth.users set {assignment} where id=%s', [OTHER])
    login(sql, ADMIN)
    with pytest.raises(psycopg.errors.InvalidParameterValue):
        change_group(sql)


def test_ineligible_admin_cannot_be_demoted(sql):
    sql.execute("update auth.users set raw_app_meta_data='{" + '"group":"admin"' + "}', banned_until=now()+interval '1 day' where id=%s", [OTHER])
    login(sql, ADMIN)
    with pytest.raises(psycopg.errors.InsufficientPrivilege):
        change_group(sql, group='user', expected='admin')


@pytest.mark.parametrize('assignment', ["raw_app_meta_data='{}'", 'email_confirmed_at=null', 'deleted_at=now()', "banned_until=now()+interval '1 day'", "email='admin@example.com'"])
def test_revoked_or_ineligible_admin_cannot_change_roles(sql, assignment):
    sql.execute(f'update auth.users set {assignment} where id=%s', [ADMIN])
    login(sql, ADMIN, app_metadata={'group': 'admin'})
    with pytest.raises(psycopg.errors.InsufficientPrivilege):
        change_group(sql)


@pytest.mark.parametrize('reason', ['x', 'x' * 500])
def test_group_change_reason_boundaries(sql, reason):
    login(sql, ADMIN)
    change_group(sql, reason=reason)
    assert sql.execute('select reason from public.account_group_events').fetchone() == (reason,)


@pytest.mark.parametrize('statement', [
    "update auth.users set raw_app_meta_data='{}'",
    'delete from public.account_group_events',
    "update public.account_group_events set reason='Forged'",
    "insert into public.account_group_events (actor_id,target_user_id,old_group,new_group,reason) values ('" + ADMIN + "','" + OTHER + "','user','admin','Forged')",
])
def test_direct_role_and_audit_writes_are_denied_even_for_admin(sql, statement):
    login(sql, ADMIN)
    change_group(sql)
    with pytest.raises(psycopg.errors.InsufficientPrivilege):
        sql.execute(statement)


def test_role_audit_is_not_visible_to_regular_users(sql):
    login(sql, ADMIN)
    change_group(sql)
    login(sql, SELLER)
    assert sql.execute('select * from public.account_group_events').fetchall() == []


def test_concurrent_demotions_cannot_remove_both_admins(database):
    database.execute("update auth.users set raw_app_meta_data='{" + '"group":"admin"' + "}' where id=%s", [OTHER])
    barrier = Barrier(2)

    def demote(actor, target):
        with psycopg.connect(database.info.dsn, autocommit=True) as connection:
            try:
                with connection.transaction():
                    connection.execute("set local lock_timeout='5s'")
                    login(connection, actor)
                    barrier.wait(timeout=10)
                    change_group(connection, target=target, group='user', expected='admin')
                return 'changed'
            except psycopg.errors.InsufficientPrivilege:
                return 'denied'

    try:
        with ThreadPoolExecutor(max_workers=2) as executor:
            first = executor.submit(demote, ADMIN, OTHER)
            second = executor.submit(demote, OTHER, ADMIN)
            assert sorted([first.result(timeout=15), second.result(timeout=15)]) == ['denied', 'denied']
        assert database.execute("select count(*) from auth.users where raw_app_meta_data->>'group'='admin'").fetchone() == (2,)
    finally:
        database.execute('delete from public.account_group_events')
        database.execute("update auth.users set raw_app_meta_data='{}' where id=%s", [OTHER])
        database.execute("update auth.users set raw_app_meta_data='{" + '"group":"admin"' + "}' where id=%s", [ADMIN])


@pytest.mark.parametrize('expected', ['admin', 'user'])
def test_admin_cannot_demote_another_admin_even_with_forged_expected_group(sql, expected):
    sql.execute("update auth.users set raw_app_meta_data=jsonb_build_object('group','admin') where id=%s", [OTHER])
    login(sql, ADMIN)
    with pytest.raises(psycopg.errors.InsufficientPrivilege):
        change_group(sql, group='user', expected=expected)


def test_project_owner_can_restore_admin_access_when_no_admin_remains(sql):
    sql.execute("update auth.users set raw_app_meta_data='{}'")
    login(sql, SELLER)
    with pytest.raises(psycopg.errors.InsufficientPrivilege):
        with sql.transaction():
            change_group(sql, target=SELLER)
    sql.execute('reset role')
    sql.execute("update auth.users set raw_app_meta_data=jsonb_build_object('group','admin') where id=%s", [SELLER])
    login(sql, SELLER)
    assert accounts(sql)
    change_group(sql, target=OTHER)
    assert accounts(sql, 'other')[0][2] == 'admin'
