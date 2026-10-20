from types import SimpleNamespace
from unittest.mock import MagicMock

import jwt
import psycopg
import pytest
from fastapi.testclient import TestClient

from app import db, main
from app.api import auth, health


@pytest.fixture
def client():
    return TestClient(main.app)


def test_public_routes(client):
    assert client.get('/').json() == {'message': 'backend works'}
    assert client.get('/health').json() == {'status': 'healthy'}


def test_readiness_success(client, monkeypatch):
    connection = MagicMock()
    monkeypatch.setattr(health, 'get_connection', lambda: connection)
    assert client.get('/health/ready').json() == {'status': 'ready'}
    connection.__enter__.return_value.execute.assert_called_once_with('SELECT 1')
    connection.__exit__.assert_called_once()


def test_readiness_failure(client, monkeypatch):
    def fail():
        raise psycopg.OperationalError('private database details')
    monkeypatch.setattr(health, 'get_connection', fail)
    response = client.get('/health/ready')
    assert response.status_code == 503
    assert response.json() == {'detail': 'Database unavailable'}


def test_database_connection(monkeypatch):
    connect = MagicMock(return_value='connection')
    monkeypatch.setattr(db.psycopg, 'connect', connect)
    monkeypatch.setattr(db, 'DATABASE_URL', 'postgresql://test')
    assert db.get_connection() == 'connection'
    connect.assert_called_once_with('postgresql://test', connect_timeout=3)


def test_database_diagnostic(client, monkeypatch):
    connection = MagicMock()
    connection.cursor.return_value.fetchone.return_value = ['test-time']
    monkeypatch.setattr(main, 'get_connection', lambda: connection)
    assert client.get('/database-test').json() == {'message': 'Database connected!', 'database_time': 'test-time'}
    connection.cursor.return_value.close.assert_called_once()
    connection.close.assert_called_once()


def test_database_diagnostic_failure(client, monkeypatch):
    def fail():
        raise psycopg.OperationalError('offline')
    monkeypatch.setattr(main, 'get_connection', fail)
    assert client.get('/database-test').json() == {'error': 'offline'}


@pytest.mark.parametrize('header', [{}, {'Authorization': 'Basic abc'}])
def test_auth_requires_bearer(client, header):
    assert client.get('/auth/me', headers=header).status_code == 401


def test_auth_missing_configuration(client, monkeypatch):
    monkeypatch.delenv('SUPABASE_URL', raising=False)
    assert client.get('/auth/me', headers={'Authorization': 'Bearer test'}).status_code == 503


@pytest.mark.parametrize('error', [jwt.InvalidTokenError('bad'), jwt.PyJWKClientError('bad')])
def test_auth_invalid_token(client, monkeypatch, error):
    monkeypatch.setenv('SUPABASE_URL', 'https://example.test')
    jwks = MagicMock()
    jwks.get_signing_key_from_jwt.side_effect = error
    monkeypatch.setattr(auth, 'get_jwks_client', lambda: jwks)
    response = client.get('/auth/me', headers={'Authorization': 'Bearer test'})
    assert response.status_code == 401
    assert response.json()['detail'] == 'Invalid authentication token'


@pytest.mark.parametrize('email,status', [('student@RPI.EDU', 200), ('student@rpi.edu.evil', 403), ('', 403), ('student@example.com', 403)])
@pytest.mark.parametrize('metadata', [{}, {'username': 'chosen'}])
def test_auth_claims(client, monkeypatch, email, status, metadata):
    monkeypatch.setenv('SUPABASE_URL', 'https://example.test/')
    jwks = MagicMock()
    jwks.get_signing_key_from_jwt.return_value = SimpleNamespace(key='public-key')
    monkeypatch.setattr(auth, 'get_jwks_client', lambda: jwks)
    decode = MagicMock(return_value={'sub': 'student-id', 'email': email, 'user_metadata': metadata})
    monkeypatch.setattr(auth.jwt, 'decode', decode)
    response = client.get('/auth/me', headers={'Authorization': 'Bearer test'})
    assert response.status_code == status
    decode.assert_called_once_with('test', 'public-key', algorithms=['RS256'], audience='authenticated', issuer='https://example.test/auth/v1')
    if status == 200:
        assert response.json() == {'id': 'student-id', 'email': email, 'username': metadata.get('username', 'student')}


def test_jwks_configuration(monkeypatch):
    auth.get_jwks_client.cache_clear()
    monkeypatch.delenv('SUPABASE_URL', raising=False)
    with pytest.raises(RuntimeError, match='SUPABASE_URL'):
        auth.get_jwks_client()
    monkeypatch.setenv('SUPABASE_URL', 'https://example.test/')
    factory = MagicMock()
    monkeypatch.setattr(jwt, 'PyJWKClient', factory)
    auth.get_jwks_client()
    auth.get_jwks_client()
    factory.assert_called_once_with('https://example.test/auth/v1/.well-known/jwks.json')
    auth.get_jwks_client.cache_clear()
