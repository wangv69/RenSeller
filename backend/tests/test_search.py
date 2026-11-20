from types import SimpleNamespace
from unittest.mock import MagicMock

import anthropic
import httpx
import pytest
from fastapi.testclient import TestClient
from pydantic import ValidationError

from app import main
from app.api import auth, search

URL = '/search/interpret'


@pytest.fixture
def client(monkeypatch):
    monkeypatch.setenv('ANTHROPIC_API_KEY', 'test-key')
    monkeypatch.delenv('ANTHROPIC_MODEL', raising=False)
    main.app.dependency_overrides[auth.get_current_user] = lambda: {'sub': 'student-id', 'email': 'student@rpi.edu'}
    yield TestClient(main.app)
    main.app.dependency_overrides.clear()


def fake_claude(monkeypatch, parsed=None, error=None, stop_reason='end_turn'):
    parse = MagicMock(return_value=SimpleNamespace(parsed_output=parsed, stop_reason=stop_reason))
    if error:
        parse.side_effect = error
    monkeypatch.setattr(search, 'get_client', lambda: SimpleNamespace(messages=SimpleNamespace(parse=parse)))
    return parse


def test_requires_authentication():
    response = TestClient(main.app).post(URL, json={'query': 'desk lamp'})
    assert response.status_code == 401


def test_returns_structured_filters(client, monkeypatch):
    filters = search.SearchFilters(keywords='desk lamp', categories=['Electronics', 'Furniture'], condition='Good condition', max_price=20)
    parse = fake_claude(monkeypatch, filters)
    response = client.post(URL, json={'query': '  cheap desk lamp for my dorm under $20  '})
    assert response.status_code == 200
    assert response.json() == {'keywords': 'desk lamp', 'categories': ['Electronics', 'Furniture'], 'condition': 'Good condition', 'max_price': 20.0}
    kwargs = parse.call_args.kwargs
    assert kwargs['model'] == 'claude-opus-5-5'
    assert kwargs['output_format'] is search.SearchFilters
    assert kwargs['output_config'] == {'effort': 'low'}
    # The student's text travels only as user content, never inside the system prompt.
    assert kwargs['messages'] == [{'role': 'user', 'content': 'cheap desk lamp for my dorm under $20'}]
    assert 'cheap desk lamp' not in kwargs['system']


def test_optional_filters_may_be_empty(client, monkeypatch):
    fake_claude(monkeypatch, search.SearchFilters(keywords='calculus', categories=[], condition=None, max_price=None))
    assert client.post(URL, json={'query': 'calculus'}).json() == {'keywords': 'calculus', 'categories': [], 'condition': None, 'max_price': None}


def test_model_can_be_configured(client, monkeypatch):
    monkeypatch.setenv('ANTHROPIC_MODEL', 'claude-sonnet-5-5')
    parse = fake_claude(monkeypatch, search.SearchFilters(keywords='x'))
    client.post(URL, json={'query': 'x'})
    assert parse.call_args.kwargs['model'] == 'claude-sonnet-5-5'


@pytest.mark.parametrize('query', ['', '   ', 'a' * 201])
def test_rejects_invalid_queries_without_calling_claude(client, monkeypatch, query):
    parse = fake_claude(monkeypatch, search.SearchFilters(keywords='x'))
    assert client.post(URL, json={'query': query}).status_code == 422
    parse.assert_not_called()


def test_rejects_missing_query(client):
    assert client.post(URL, json={}).status_code == 422


def test_accepts_a_query_at_the_length_limit(client, monkeypatch):
    fake_claude(monkeypatch, search.SearchFilters(keywords='x'))
    assert client.post(URL, json={'query': 'a' * 200}).status_code == 200


@pytest.mark.parametrize('parsed,stop_reason', [(None, 'refusal'), (None, 'max_tokens')])
def test_falls_back_to_plain_keywords_when_claude_gives_no_filters(client, monkeypatch, parsed, stop_reason):
    fake_claude(monkeypatch, parsed, stop_reason=stop_reason)
    response = client.post(URL, json={'query': 'mini fridge'})
    assert response.status_code == 200
    assert response.json() == {'keywords': 'mini fridge', 'categories': [], 'condition': None, 'max_price': None}


def test_reports_unavailable_without_leaking_provider_details(client, monkeypatch):
    error = anthropic.APIConnectionError(request=httpx.Request('POST', 'https://api.anthropic.com/secret-path'))
    fake_claude(monkeypatch, error=error)
    response = client.post(URL, json={'query': 'lamp'})
    assert response.status_code == 502
    assert response.json() == {'detail': 'Smart search is unavailable'}


def test_reports_not_configured_when_the_api_key_is_missing(client, monkeypatch):
    monkeypatch.delenv('ANTHROPIC_API_KEY')
    parse = fake_claude(monkeypatch, search.SearchFilters(keywords='x'))
    response = client.post(URL, json={'query': 'lamp'})
    assert response.status_code == 503
    assert response.json() == {'detail': 'Smart search is not configured'}
    parse.assert_not_called()


@pytest.mark.parametrize('values', [
    {'keywords': 'x', 'categories': ['Weapons']},
    {'keywords': 'x', 'condition': 'Mint'},
    {'keywords': 'x', 'max_price': -1},
])
def test_filters_reject_values_the_app_does_not_support(values):
    with pytest.raises(ValidationError):
        search.SearchFilters(**values)


def test_client_is_created_once_from_the_environment(monkeypatch):
    search.get_client.cache_clear()
    factory = MagicMock(return_value='claude-client')
    monkeypatch.setattr(search.anthropic, 'Anthropic', factory)
    assert search.get_client() == 'claude-client'
    assert search.get_client() == 'claude-client'
    factory.assert_called_once_with()
    search.get_client.cache_clear()
