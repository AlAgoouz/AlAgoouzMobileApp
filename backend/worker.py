import asyncio
import logging
from pydantic import BaseModel, Field
from uuid import UUID
from vercel.queue import Topic, Message, RetryAfter, subscribe
from clients import rpc, download, http_client, BackendUnavailable
from parser import parse_report, InvalidReport

logger = logging.getLogger("agouz.imports")


class ImportMessage(BaseModel):
    job_id: UUID
    worker_token: str = Field(pattern=r"^[a-f0-9]{64}$")


imports = Topic[ImportMessage]("agouz-cashier-imports")


@subscribe(topic=imports, consumer_group="cashier-parser", max_concurrency=2, max_attempts=6, retry_after=95)
async def process_import(message: Message[ImportMessage]) -> None:
    payload = message.payload
    job_id = str(payload.job_id)
    try:
        async with http_client() as client:
            job = await rpc(client, "bon_erp_claim_import", {"p_id": job_id, "p_key": payload.worker_token})
            if job is None:
                return
            if job.get("busy"):
                raise RetryAfter(95)
            try:
                data = await download(client, job["path"], job["downloadToken"], job["bytes"])
                result = await asyncio.to_thread(parse_report, data, job["fileName"], job["kind"], job.get("catalog"))
                error = None
            except InvalidReport as exc:
                result, error = None, str(exc)
            await rpc(client, "bon_erp_finish_import", {"p_id": job_id, "p_key": payload.worker_token, "p_attempt": job["attempt"], "p_result": result, "p_error": error})
            logger.info("import_finished job=%s valid=%s", job_id, error is None)
    except PermissionError:
        logger.warning("import_permission_refused job=%s", job_id)
        return
    except RetryAfter:
        raise
    except Exception:
        logger.warning("import_retry job=%s", job_id)
        raise RetryAfter(95) from None
