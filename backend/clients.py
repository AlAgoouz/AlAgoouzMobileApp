import os
from urllib.parse import quote, urlparse
import httpx


class BackendUnavailable(RuntimeError):
    pass


def settings():
    root = (os.getenv("SUPABASE_URL") or os.getenv("VITE_SUPABASE_URL") or "").rstrip("/")
    key = os.getenv("SUPABASE_PUBLISHABLE_KEY") or os.getenv("VITE_SUPABASE_PUBLISHABLE_KEY") or os.getenv("VITE_SUPABASE_ANON_KEY")
    parsed = urlparse(root)
    if parsed.scheme != "https" or not parsed.hostname or not parsed.hostname.endswith(".supabase.co") or parsed.path or not key:
        raise BackendUnavailable("IMPORT_CONFIGURATION_MISSING")
    return root, key


async def rpc(client, name, args, bearer=None):
    root, key = settings()
    headers = {"apikey": key}
    if bearer or key.startswith("eyJ"):
        headers["Authorization"] = "Bearer " + (bearer or key)
    response = await client.post(root + "/rest/v1/rpc/" + name, headers=headers, json=args)
    if response.status_code in (401, 403):
        raise PermissionError("IMPORT_PERMISSION_DENIED")
    if not response.is_success:
        raise BackendUnavailable("IMPORT_BACKEND_UNAVAILABLE")
    return response.json()


async def signed_download_token(client, path, bearer):
    root, key = settings()
    response = await client.post(root + "/storage/v1/object/sign/agouz-cashier-imports/" + quote(path, safe="/"), headers={"apikey": key, "Authorization": "Bearer " + bearer}, json={"expiresIn": 3600})
    if not response.is_success:
        raise BackendUnavailable("IMPORT_UPLOAD_MISSING")
    from urllib.parse import parse_qs
    values = parse_qs(urlparse(response.json()["signedURL"]).query)
    return values["token"][0]


async def download(client, path, token, expected_bytes):
    from parser import MAX_BYTES
    root, _ = settings()
    url = root + "/storage/v1/object/sign/agouz-cashier-imports/" + quote(path, safe="/") + "?token=" + quote(token, safe="")
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
