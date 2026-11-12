import logging
import re
import asyncio
from datetime import date
from uuid import UUID
from fastapi import FastAPI, Header, HTTPException, Response
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
    if size < 0:
        return Response(status_code=400)
    if size > 16384:
        return Response(status_code=413)
    body = b""
    async for chunk in request.stream():
        body += chunk
        if len(body) > 16384:
            return Response(status_code=413)
    request._body = body
    response = await call_next(request)
    response.headers["Cache-Control"] = "no-store"
    response.headers["X-Content-Type-Options"] = "nosniff"
    return response


@app.get("/api/health")
async def health():
    return {"service": "agouz-online-imports", "parserVersion": 2, "formats": ["csv", "xls", "xlsx"], "maxBytes": 10485760}


@app.post("/api/imports/{job_id}/enqueue", status_code=202)
async def enqueue(job_id: UUID, authorization: str = Header(default="")):
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
            result = await process_import(payload)
            if result == "denied":
                raise HTTPException(status_code=403, detail="IMPORT_WORKER_DENIED")
            if result == "retry":
                raise HTTPException(status_code=503, detail="IMPORT_RETRY_PENDING")
            if result == "busy":
                return {"id": str(job_id), "status": "processing"}
            current = await rpc(client, "bon_erp_read_import", {"p_id": str(job_id)}, bearer)
            if not current:
                raise HTTPException(status_code=404, detail="IMPORT_NOT_FOUND")
            return {"id": str(job_id), "status": current["status"]}
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


def report_bearer(authorization):
    if not authorization.startswith('Bearer ') or not 8<len(authorization)<=8192:
        raise HTTPException(status_code=401,detail='EXPORT_LOGIN_REQUIRED')
    return authorization[7:]


@app.get('/api/reports/{format}')
async def export_report(format:str,from_date:date,to_date:date,authorization:str=Header(default='')):
    bearer=report_bearer(authorization)
    if format not in ('xlsx','pdf') or from_date>to_date:
        raise HTTPException(status_code=400,detail='INVALID_REPORT_RANGE')
    try:
        from report_source import report_source
        async with http_client() as client:
            source,summary=await report_source(client,bearer,from_date,to_date)
        def generate():
            from reporting import prepare_report,workbook_bytes
            report=prepare_report(source,summary,from_date.isoformat(),to_date.isoformat())
            if format=='xlsx':return workbook_bytes(report)
            from pdf_reports import report_pdf
            return report_pdf(report)
        data=await asyncio.to_thread(generate)
        mime='application/pdf' if format=='pdf' else 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
        return Response(content=data,media_type=mime,headers={'Content-Disposition':f'attachment; filename="Agouz-{from_date}-{to_date}.{format}"'})
    except PermissionError:
        raise HTTPException(status_code=403,detail='EXPORT_PERMISSION_DENIED') from None
    except Exception:
        logger.warning('report_export_failed format=%s',format)
        raise HTTPException(status_code=503,detail='EXPORT_NOT_CONFIRMED') from None


@app.get('/api/invoices/{invoice_id}/pdf')
async def export_invoice(invoice_id:str,authorization:str=Header(default='')):
    bearer=report_bearer(authorization)
    if len(invoice_id)>160:raise HTTPException(status_code=400,detail='INVALID_INVOICE_ID')
    try:
        async with http_client() as client:
            invoice=await rpc(client,'bon_erp_sale_detail',{'p_id':invoice_id,'p_kind':'invoice'},bearer,decimal=True)
        if invoice is None:raise HTTPException(status_code=404,detail='INVOICE_NOT_FOUND')
        from pdf_reports import invoice_pdf
        data=await asyncio.to_thread(invoice_pdf,invoice)
        return Response(content=data,media_type='application/pdf',headers={'Content-Disposition':'attachment; filename="Agouz-invoice.pdf"'})
    except PermissionError:
        raise HTTPException(status_code=403,detail='EXPORT_PERMISSION_DENIED') from None
    except HTTPException:raise
    except Exception:
        logger.warning('invoice_pdf_failed')
        raise HTTPException(status_code=503,detail='EXPORT_NOT_CONFIRMED') from None
