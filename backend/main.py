import logging
import asyncio
from datetime import date
from uuid import UUID
from fastapi import FastAPI, Header, HTTPException, Response
from clients import rpc, signed_download_token, http_client, import_path, InvalidImportPath, ExportDataError
from worker import process_import, ImportMessage
from starlette.datastructures import Headers, MutableHeaders

logger = logging.getLogger("agouz.imports")
app = FastAPI(docs_url=None, redoc_url=None, openapi_url=None)
PRIVATE_HEADERS={'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}
EXPORT_DATA_ERRORS = {
    'INVOICE_TOTAL_MISMATCH', 'PDF_ROW_LIMIT', 'EXPORT_ROW_LIMIT', 'EXPORT_SIZE_LIMIT',
    'INVALID_REPORT_VALUE', 'INVALID_FINANCIAL_OPENING', 'EXPORT_SNAPSHOT_MISMATCH',
    'EXPORT_TOTAL_MISMATCH', 'EXPORT_COST_COVERAGE_MISMATCH', 'INVALID_REPORT_RANGE',
}
EXPORT_WORKERS = asyncio.Semaphore(2)
MAX_REQUEST_BYTES = 16384


class PrivateResponses:
    def __init__(self, app):
        self.app = app

    async def __call__(self, scope, receive, send):
        if scope["type"] != "http":
            return await self.app(scope, receive, send)

        async def send_private(message):
            if message["type"] == "http.response.start":
                headers = MutableHeaders(scope=message)
                for key, value in PRIVATE_HEADERS.items():
                    headers[key] = value
            await send(message)

        try:
            size = int(Headers(scope=scope).get("content-length", "0"))
        except ValueError:
            size = -1
        if size < 0 or size > MAX_REQUEST_BYTES:
            return await Response(status_code=400 if size < 0 else 413)(scope, receive, send_private)

        body = bytearray()
        while True:
            message = await receive()
            if message["type"] == "http.disconnect":
                return
            chunk = message.get("body", b"")
            if len(body) + len(chunk) > MAX_REQUEST_BYTES:
                return await Response(status_code=413)(scope, receive, send_private)
            body.extend(chunk)
            if not message.get("more_body", False):
                break

        async def bounded_receive():
            nonlocal body
            if body is None:
                return await receive()
            message = {"type": "http.request", "body": bytes(body), "more_body": False}
            body = None
            return message

        await self.app(scope, bounded_receive, send_private)


app.add_middleware(PrivateResponses)


async def reserve_export(client, bearer):
    allowed = await rpc(client, "bon_erp_reserve_export", {}, bearer)
    if allowed is not True:
        if allowed is not False:
            raise RuntimeError("INVALID_EXPORT_RESERVATION")
        raise HTTPException(status_code=429, detail='EXPORT_RATE_LIMIT', headers={'Retry-After': '300'})


async def generate_export(generate, *args):
    # Keep the slot until the worker actually finishes even if the request ends.
    async def run():
        async with EXPORT_WORKERS:
            return await asyncio.to_thread(generate, *args)
    task = asyncio.create_task(run())
    task.add_done_callback(lambda done: None if done.cancelled() else done.exception())
    return await asyncio.shield(task)


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
            import_path(job["object_path"])
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
    except InvalidImportPath:
        raise HTTPException(status_code=400, detail="INVALID_IMPORT_PATH") from None
    except PermissionError:
        raise HTTPException(status_code=403, detail="IMPORT_PERMISSION_DENIED") from None
    except HTTPException:
        raise
    except Exception:
        logger.exception("import_enqueue_failed job=%s", job_id)
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


def log_export_failure(event, failure):
    from traceback import extract_tb
    frames = [(frame.filename, frame.lineno, frame.name) for frame in extract_tb(failure.__traceback__)]
    logger.warning("%s type=%s trace=%s", event, type(failure).__name__, frames)


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
            await reserve_export(client,bearer)
            source,summary=await report_source(client,bearer,from_date,to_date)
        def generate():
            from reporting import prepare_report,workbook_bytes
            report=prepare_report(source,summary,from_date.isoformat(),to_date.isoformat())
            if format=='xlsx':return workbook_bytes(report)
            from pdf_reports import report_pdf
            return report_pdf(report)
        data=await generate_export(generate)
        mime='application/pdf' if format=='pdf' else 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
        return Response(content=data,media_type=mime,headers={'Content-Disposition':f'attachment; filename="Agouz-{from_date}-{to_date}.{format}"'})
    except PermissionError:
        raise HTTPException(status_code=403,detail='EXPORT_PERMISSION_DENIED') from None
    except HTTPException:raise
    except (ValueError, ExportDataError) as failure:
        if str(failure) in EXPORT_DATA_ERRORS:
            raise HTTPException(status_code=422,detail=str(failure)) from None
        log_export_failure('report_export_data_failed', failure)
        raise HTTPException(status_code=503,detail='EXPORT_NOT_CONFIRMED') from None
    except Exception as failure:
        log_export_failure('report_export_failed', failure)
        raise HTTPException(status_code=503,detail='EXPORT_NOT_CONFIRMED') from None


@app.get('/api/invoices/{invoice_id}/pdf')
async def export_invoice(invoice_id:str,authorization:str=Header(default='')):
    bearer=report_bearer(authorization)
    if len(invoice_id)>160:raise HTTPException(status_code=400,detail='INVALID_INVOICE_ID')
    try:
        async with http_client() as client:
            await reserve_export(client,bearer)
            invoice=await rpc(client,'bon_erp_sale_detail',{'p_id':invoice_id,'p_kind':'invoice'},bearer,decimal=True)
        if invoice is None:raise HTTPException(status_code=404,detail='INVOICE_NOT_FOUND')
        from pdf_reports import invoice_pdf
        data=await generate_export(invoice_pdf,invoice)
        return Response(content=data,media_type='application/pdf',headers={'Content-Disposition':'attachment; filename="Agouz-invoice.pdf"'})
    except PermissionError:
        raise HTTPException(status_code=403,detail='EXPORT_PERMISSION_DENIED') from None
    except HTTPException:raise
    except (ValueError, ExportDataError) as failure:
        if str(failure) in EXPORT_DATA_ERRORS:
            raise HTTPException(status_code=422,detail=str(failure)) from None
        log_export_failure('invoice_export_data_failed', failure)
        raise HTTPException(status_code=503,detail='EXPORT_NOT_CONFIRMED') from None
    except Exception as failure:
        log_export_failure('invoice_pdf_failed', failure)
        raise HTTPException(status_code=503,detail='EXPORT_NOT_CONFIRMED') from None
