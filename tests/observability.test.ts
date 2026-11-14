import {expect,it} from 'vitest';
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
