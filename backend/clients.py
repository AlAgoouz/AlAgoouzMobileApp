import os
import re
from urllib.parse import quote, urlparse
import httpx


class BackendUnavailable(RuntimeError):
    pass


class InvalidImportPath(ValueError):
    pass


class ExportDataError(ValueError):
    pass


_UUID = r"[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}"
_IMPORT_PATH = re.compile(rf"{_UUID}/{_UUID}/report\.(csv|xls|xlsx)")


def import_path(path):
    if not isinstance(path, str) or not _IMPORT_PATH.fullmatch(path):
        raise InvalidImportPath("INVALID_IMPORT_PATH")
    return quote(path, safe="/")


def settings():
    root = (os.getenv("SUPABASE_URL") or os.getenv("VITE_SUPABASE_URL") or "").rstrip("/")
    key = os.getenv("SUPABASE_PUBLISHABLE_KEY") or os.getenv("VITE_SUPABASE_PUBLISHABLE_KEY") or os.getenv("VITE_SUPABASE_ANON_KEY")
    parsed = urlparse(root)
    if parsed.scheme != "https" or not parsed.hostname or not parsed.hostname.endswith(".supabase.co") or parsed.path or not key:
        raise BackendUnavailable("IMPORT_CONFIGURATION_MISSING")
    return root, key


async def rpc(client, name, args, bearer=None, *, decimal=False):
    root, key = settings()
    headers = {"apikey": key}
    if bearer or key.startswith("eyJ"):
        headers["Authorization"] = "Bearer " + (bearer or key)
    response = await client.post(root + "/rest/v1/rpc/" + name, headers=headers, json=args)
    if response.status_code in (401, 403):
        raise PermissionError("IMPORT_PERMISSION_DENIED")
    if not response.is_success:
        if name == 'bon_erp_export_report_v2' and response.status_code == 400:
            try:
                code = response.json().get('message')
            except (AttributeError, ValueError):
                code = None
            if code in ('EXPORT_ROW_LIMIT', 'EXPORT_SIZE_LIMIT', 'INVALID_REPORT_RANGE'):
                raise ExportDataError(code)
        raise BackendUnavailable("IMPORT_BACKEND_UNAVAILABLE")
    if decimal:
        from decimal import Decimal
        return response.json(parse_float=Decimal)
    return response.json()


async def signed_download_token(client, path, bearer):
    encoded_path = import_path(path)
    root, key = settings()
    response = await client.post(root + "/storage/v1/object/sign/agouz-cashier-imports/" + encoded_path, headers={"apikey": key, "Authorization": "Bearer " + bearer}, json={"expiresIn": 3600})
    if not response.is_success:
        raise BackendUnavailable("IMPORT_UPLOAD_MISSING")
    from urllib.parse import parse_qs
    values = parse_qs(urlparse(response.json()["signedURL"]).query)
    return values["token"][0]


async def download(client, path, token, expected_bytes):
    from parser import MAX_BYTES
    encoded_path = import_path(path)
    root, _ = settings()
    url = root + "/storage/v1/object/sign/agouz-cashier-imports/" + encoded_path + "?token=" + quote(token, safe="")
    data = bytearray()
    async with client.stream("GET", url) as response:
        if not response.is_success:
            raise BackendUnavailable("IMPORT_DOWNLOAD_UNAVAILABLE")
        async for chunk in response.aiter_bytes():
            data.extend(chunk)
            if len(data) > MAX_BYTES:
                raise BackendUnavailable("IMPORT_DOWNLOAD_TOO_LARGE")
    if len(data) != expected_bytes:
        raise BackendUnavailable("IMPORT_FILE_SIZE_CHANGED")
    return bytes(data)


def http_client():
    return httpx.AsyncClient(timeout=httpx.Timeout(30, connect=10), follow_redirects=False)
