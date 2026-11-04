import logging
import re
from uuid import UUID
from fastapi import FastAPI, Header, HTTPException, Response, BackgroundTasks
from clients import rpc, signed_download_token, http_client, BackendUnavailable
from worker import process_import, ImportMessage

logger = logging.getLogger("agouz.imports")
app = FastAPI(docs_url=None, redoc_url=None, openapi_url=None)


@app.middleware("http")
async def private_responses(request, call_next):
    try:
        size = int(request.headers.get("content-length", "0"))
    except ValueError:
        return Response(status_code=400)
    if size > 16384:
        return Response(status_code=413)
    response = await call_next(request)
    response.headers["Cache-Control"] = "no-store"
    response.headers["X-Content-Type-Options"] = "nosniff"
    return response


@app.get("/api/health")
async def health():
    return {"service": "agouz-online-imports", "parserVersion": 1, "formats": ["csv", "xls", "xlsx"], "maxBytes": 10485760}


@app.post("/api/imports/{job_id}/enqueue", status_code=202)
async def enqueue(job_id: UUID, background_tasks: BackgroundTasks, authorization: str = Header(default="")):
    if not authorization.startswith("Bearer ") or len(authorization) > 8192:
        raise HTTPException(status_code=401, detail="IMPORT_LOGIN_REQUIRED")
    bearer = authorization[7:]
    try:
        async with http_client() as client:
            job = await rpc(client, "bon_erp_read_import", {"p_id": str(job_id)}, bearer)
            if not job:
                raise HTTPException(status_code=404, detail="IMPORT_NOT_FOUND")
            if job["status"] in ("ready", "cancelled"):
                return {"id": str(job_id), "status": job["status"]}
            if not re.fullmatch(r"[a-f0-9-]{36}/[a-f0-9-]{36}/report\.(csv|xls|xlsx)", job["object_path"]):
                raise HTTPException(status_code=400, detail="INVALID_IMPORT_PATH")
            token = await signed_download_token(client, job["object_path"], bearer)
            prepared = await rpc(client, "bon_erp_prepare_import", {"p_id": str(job_id), "p_token": token}, bearer)
            if "workerToken" not in prepared:
                return {"id": str(job_id), "status": prepared["status"]}
            payload = ImportMessage(job_id=job_id, worker_token=prepared["workerToken"])
            background_tasks.add_task(process_import,payload)
            return {"id": str(job_id), "status": "queued"}
    except PermissionError:
        raise HTTPException(status_code=403, detail="IMPORT_PERMISSION_DENIED") from None
    except HTTPException:
        raise
    except Exception:
        logger.warning("import_enqueue_failed job=%s", job_id)
        raise HTTPException(status_code=503, detail="IMPORT_RETRY_AVAILABLE") from None


@app.post("/api/import-worker",include_in_schema=False)
async def scheduled_import(payload: ImportMessage):
    # A database-generated capability authorizes one job only. SQL checks it
    # before any file read, and rechecks the original uploader's live access.
    result=await process_import(payload)
    if result=="denied":
        raise HTTPException(status_code=403,detail="IMPORT_WORKER_DENIED")
    if result=="retry":
        raise HTTPException(status_code=503,detail="IMPORT_RETRY_PENDING")
    return {"status":result}
