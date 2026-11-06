from datetime import date
from clients import rpc


async def report_source(client,bearer,from_date:date,to_date:date):
    if from_date>to_date:
        raise ValueError('INVALID_REPORT_RANGE')
    payload=await rpc(client,'bon_erp_export_report_v2',{'p_from':from_date.isoformat(),'p_to':to_date.isoformat()},bearer,decimal=True)
    return payload,payload['summary']
