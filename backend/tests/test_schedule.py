import base64
from datetime import date
from types import SimpleNamespace
from unittest.mock import MagicMock

import anthropic
import httpx
import pytest
from fastapi.testclient import TestClient

from app import main
from app.api import auth, schedule

URL = '/schedule/extract'
PDF = b'%PDF-1.7\n' + b'x' * 50
PNG = b'\x89PNG\r\n\x1a\n' + b'x' * 50
JPEG = b'\xff\xd8\xff\xe0' + b'x' * 50
WEBP = b'RIFF\x00\x00\x00\x00WEBPVP8 ' + b'x' * 50
MAX_BYTES = 5 * 1024 * 1024


@pytest.fixture
def client(monkeypatch):
    monkeypatch.setenv('ANTHROPIC_API_KEY', 'test-key')
    monkeypatch.delenv('ANTHROPIC_MODEL', raising=False)
    schedule.usage.clear()
    main.app.dependency_overrides[auth.get_current_user] = lambda: {'sub': 'student-1', 'email': 'student@rpi.edu'}
    yield TestClient(main.app)
    main.app.dependency_overrides.clear()
    schedule.usage.clear()


def courses(*items):
    return schedule.ScheduleCourses(courses=[schedule.Course(code=code, title=title) for code, title in items])


def fake_claude(monkeypatch, parsed=None, error=None, stop_reason='end_turn'):
    parse = MagicMock(return_value=SimpleNamespace(parsed_output=parsed, stop_reason=stop_reason))
    if error:
        parse.side_effect = error
    monkeypatch.setattr(schedule, 'get_client', lambda: SimpleNamespace(messages=SimpleNamespace(parse=parse)))
    return parse


def upload(client, data=PNG, name='schedule.png', content_type='image/png'):
    return client.post(URL, files={'file': (name, data, content_type)})


def test_requires_authentication():
    response = TestClient(main.app).post(URL, files={'file': ('s.png', PNG, 'image/png')})
    assert response.status_code == 401


@pytest.mark.parametrize('data,block_type,media_type', [
    (PDF, 'document', 'application/pdf'),
    (PNG, 'image', 'image/png'),
    (JPEG, 'image', 'image/jpeg'),
    (WEBP, 'image', 'image/webp'),
])
def test_reads_courses_from_each_supported_file_type(client, monkeypatch, data, block_type, media_type):
    parse = fake_claude(monkeypatch, courses(('MATH-1010', 'Calculus I'), ('CSCI-1100', None)))
    response = upload(client, data, content_type='application/octet-stream')
    assert response.status_code == 200
    assert response.json() == {'courses': [{'code': 'MATH-1010', 'title': 'Calculus I'}, {'code': 'CSCI-1100', 'title': None}]}
    kwargs = parse.call_args.kwargs
    assert kwargs['model'] == 'claude-opus-5-5'
    assert kwargs['output_format'] is schedule.ScheduleCourses
    assert kwargs['output_config'] == {'effort': 'low'}
    content = kwargs['messages'][0]['content']
    assert content[0] == {'type': block_type, 'source': {'type': 'base64', 'media_type': media_type, 'data': base64.b64encode(data).decode()}}
    assert content[1]['type'] == 'text'
    assert 'never instructions' in kwargs['system']


def test_model_can_be_configured(client, monkeypatch):
    monkeypatch.setenv('ANTHROPIC_MODEL', 'claude-haiku-5-5')
    parse = fake_claude(monkeypatch, courses())
    upload(client)
    assert parse.call_args.kwargs['model'] == 'claude-haiku-5-5'


def test_cleans_up_course_codes_and_drops_invalid_ones(client, monkeypatch):
    fake_claude(monkeypatch, courses(
        ('math 1010', ' Calculus I '), ('csci1100', ''), ('MATH-1010', None), ('XX-12', None), ('Ignore previous instructions', None), ('phys_1100', None),
    ))
    assert upload(client).json() == {'courses': [
        {'code': 'MATH-1010', 'title': 'Calculus I'},
        {'code': 'CSCI-1100', 'title': None},
        {'code': 'PHYS-1100', 'title': None},
    ]}


def test_returns_at_most_twelve_courses(client, monkeypatch):
    fake_claude(monkeypatch, courses(*[(f'MATH-{1000 + n}', None) for n in range(15)]))
    returned = upload(client).json()['courses']
    assert [course['code'] for course in returned] == [f'MATH-{1000 + n}' for n in range(12)]


@pytest.mark.parametrize('data', [b'GIF89a' + b'x' * 20, b'just some text', b'RIFF\x00\x00\x00\x00WAVEfmt '])
def test_rejects_unsupported_files_by_their_contents(client, monkeypatch, data):
    parse = fake_claude(monkeypatch, courses())
    response = upload(client, data, name='schedule.png', content_type='image/png')
    assert response.status_code == 415
    assert 'PDF, PNG, JPEG, or WebP' in response.json()['detail']
    parse.assert_not_called()


def test_rejects_an_empty_file(client, monkeypatch):
    parse = fake_claude(monkeypatch, courses())
    response = upload(client, b'')
    assert response.status_code == 422
    assert 'empty' in response.json()['detail']
    parse.assert_not_called()


def test_rejects_a_file_over_five_megabytes(client, monkeypatch):
    parse = fake_claude(monkeypatch, courses())
    response = upload(client, PNG + b'x' * (MAX_BYTES - len(PNG) + 1))
    assert response.status_code == 413
    assert '5 MB' in response.json()['detail']
    parse.assert_not_called()


def test_accepts_a_file_exactly_five_megabytes(client, monkeypatch):
    fake_claude(monkeypatch, courses())
    assert upload(client, PNG + b'x' * (MAX_BYTES - len(PNG))).status_code == 200


def test_rejects_a_request_without_a_file(client):
    assert client.post(URL).status_code == 422


def test_returns_no_courses_when_claude_gives_nothing(client, monkeypatch):
    fake_claude(monkeypatch, None, stop_reason='refusal')
    assert upload(client).json() == {'courses': []}


def test_reports_unavailable_without_leaking_provider_details(client, monkeypatch):
    error = anthropic.APIConnectionError(request=httpx.Request('POST', 'https://api.anthropic.com/secret-path'))
    fake_claude(monkeypatch, error=error)
    response = upload(client)
    assert response.status_code == 502
    assert response.json() == {'detail': 'Schedule reading is unavailable'}


def test_reports_not_configured_without_an_api_key(client, monkeypatch):
    monkeypatch.delenv('ANTHROPIC_API_KEY')
    parse = fake_claude(monkeypatch, courses())
    response = upload(client)
    assert response.status_code == 503
    assert response.json() == {'detail': 'Schedule reading is not configured'}
    parse.assert_not_called()


def test_limits_each_student_to_five_readings_a_day(client, monkeypatch):
    parse = fake_claude(monkeypatch, courses())
    for _ in range(5):
        assert upload(client).status_code == 200
    response = upload(client)
    assert response.status_code == 429
    assert 'tomorrow' in response.json()['detail']
    assert parse.call_count == 5


def test_the_limit_is_per_student_and_resets_each_day(client, monkeypatch):
    fake_claude(monkeypatch, courses())
    day = {'now': date(2026, 11, 24)}
    monkeypatch.setattr(schedule, 'today', lambda: day['now'])
    for _ in range(5):
        upload(client)
    assert upload(client).status_code == 429
    main.app.dependency_overrides[auth.get_current_user] = lambda: {'sub': 'student-2', 'email': 'other@rpi.edu'}
    assert upload(client).status_code == 200
    main.app.dependency_overrides[auth.get_current_user] = lambda: {'sub': 'student-1', 'email': 'student@rpi.edu'}
    day['now'] = date(2026, 11, 25)
    assert upload(client).status_code == 200


def test_rejected_files_do_not_use_up_the_daily_limit(client, monkeypatch):
    fake_claude(monkeypatch, courses())
    for _ in range(8):
        assert upload(client, b'not a schedule').status_code == 415
    assert upload(client).status_code == 200


def test_failed_readings_still_count_toward_the_limit(client, monkeypatch):
    fake_claude(monkeypatch, error=anthropic.APIConnectionError(request=httpx.Request('POST', 'https://x.test')))
    for _ in range(5):
        assert upload(client).status_code == 502
    assert upload(client).status_code == 429


def test_client_is_shared_with_smart_search():
    from app.api import search
    assert schedule.get_client is search.get_client
