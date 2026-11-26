import asyncio
import logging
from pydantic import BaseModel, Field
from uuid import UUID
from clients import rpc, download, http_client, InvalidImportPath
from parser import parse_report, InvalidReport

logger = logging.getLogger("agouz.imports")


class ImportMessage(BaseModel):
    job_id: UUID
    worker_token: str = Field(pattern=r"^[a-f0-9]{64}$")


async def process_import(payload: ImportMessage) -> str:
    job_id = str(payload.job_id)
    stage = "claim"
    try:
        async with http_client() as client:
            job = await rpc(client, "bon_erp_claim_import", {"p_id": job_id, "p_key": payload.worker_token})
            if job is None:
                return "done"
            if job.get("busy"):
                return "busy"
            try:
                stage = "download"
                data = await download(client, job["path"], job["downloadToken"], job["bytes"])
                stage = "parse"
                result = await asyncio.to_thread(parse_report, data, job["fileName"], job["kind"], job.get("catalog"), expected_date=job.get('saleDate'))
                error = None
            except (InvalidReport, InvalidImportPath) as exc:
                result, error = None, str(exc)
            stage = "finish"
            await rpc(client, "bon_erp_finish_import", {"p_id": job_id, "p_key": payload.worker_token, "p_attempt": job["attempt"], "p_result": result, "p_error": error})
            logger.info("import_finished job=%s valid=%s", job_id, error is None)
            return "done"
    except PermissionError:
        logger.warning("import_permission_refused job=%s stage=%s", job_id, stage)
        return "denied"
    except Exception as exc:
        # Exception messages can contain storage URLs or sensitive report details.
        logger.warning("import_retry job=%s stage=%s reason=%s", job_id, stage, type(exc).__name__)
        return "retry"
