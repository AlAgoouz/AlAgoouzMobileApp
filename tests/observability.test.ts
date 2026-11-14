import {expect,it} from 'vitest';
import {init} from '@sentry/browser';
import {safeSentryOptions} from '../src/lib/observability';

it('emits only a fixed browser incident and strips customer, document, session and browser data',()=>{
  const options=safeSentryOptions('https://abc@o1.ingest.sentry.io/1','1177ccb');
  expect(options.defaultIntegrations).toBe(false);
  const event={
    type:undefined, message:'render_failure', event_id:'fixture', timestamp:10,
    user:{email:'customer@example.test'},
    extra:{invoice:'fixture-invoice',filename:'sales.xls'},
    request:{url:'https://example.test/#access_token=fixture'},
    breadcrumbs:[{message:'fixture-data'}],
  };
  expect(options.beforeSend?.(event,{})).toEqual({
    type:undefined,event_id:'fixture',timestamp:10,message:'render_failure',level:'error',
    release:'1177ccb',environment:'test',platform:'javascript',
  });
  expect(options.beforeSend?.({...event,message:'private error'},{})).toBeNull();
});


it('passes a synthetic render incident through the SDK to a local transport', async()=>{
  const sent: unknown[] = [];
  const client = init({
    ...safeSentryOptions('https://abc@o1.ingest.sentry.io/1','1177ccb'),
    transport: ()=>({
      send: async envelope => {
        sent.push(...envelope[1].map(([, event])=>event));
        return {statusCode:200};
      },
      flush: async ()=>true,
    }),
  });
  if (!client) throw Error('Sentry test client was not initialized');

  try {
    client.captureMessage('render_failure','error');
    client.captureMessage('synthetic private invoice detail','error');
    expect(await client.flush(2000)).toBe(true);
    expect(sent).toHaveLength(1);
    expect(sent[0]).toMatchObject({message:'render_failure',release:'1177ccb',environment:'test'});
    expect(JSON.stringify(sent)).not.toContain('synthetic private invoice detail');
  } finally {
    await client.close(2000);
  }
});
