import {it,expect,vi} from 'vitest';
import {manageUsersHandler} from '../supabase/functions/manage-users/handler';
const ownerId='11111111-1111-4111-8111-111111111111',targetId='22222222-2222-4222-8222-222222222222';
function setup(owner=true,targetMaster=false){
 const rpc=vi.fn(async(name:string)=>({error:null,data:name==='bon_erp_my_access'?{is_owner:owner}:name==='bon_erp_list_users'?[{user_id:targetId,is_owner:targetMaster}]:{ok:true}}));
 const user={auth:{getUser:vi.fn(async()=>({error:null,data:{user:{id:ownerId}}}))},rpc};
 const admin={auth:{admin:{createUser:vi.fn(async()=>({error:null,data:{user:{id:targetId}}})),deleteUser:vi.fn(async()=>({error:null}))}}};
 return {user,admin,handle:manageUsersHandler(()=>({user,admin}))};
}
const input={email:'employee@example.test',password:'Local-Only-Test-123!',username:'employee',displayName:'Employee',role:'partner',partnerId:null,permissions:{view:true,sales:true}};
const request=(body:unknown,token=true)=>new Request('https://test.invalid/functions/v1/manage-users',{method:'POST',headers:{'Content-Type':'application/json',...(token?{Authorization:'Bearer fixture-token'}:{})},body:JSON.stringify(body)});
it('requires a verified owner and never constructs an account for anonymous or non-owner callers',async()=>{
 const s=setup(false);expect((await s.handle(request(input,false))).status).toBe(401);
 expect((await s.handle(request(input))).status).toBe(403);expect(s.admin.auth.admin.createUser).not.toHaveBeenCalled();
});
it('creates a login account without a financial partner and assigns permissions through the owner-checked RPC',async()=>{
 const s=setup();expect((await s.handle(request(input))).status).toBe(201);
 expect(s.admin.auth.admin.createUser).toHaveBeenCalledWith(expect.objectContaining({email:input.email,password:input.password,email_confirm:true}));
 expect(s.user.rpc).toHaveBeenCalledWith('bon_erp_set_user_access',expect.objectContaining({p_user_id:targetId,p_partner_id:null,p_permissions:input.permissions}));
});
it('rejects weak passwords, unknown privileges and cashier access to the complete store',async()=>{
 const s=setup();
 for(const payload of [{...input,password:'short'},{...input,permissions:{view:true,superuser:true}},{...input,role:'cashier'}])expect((await s.handle(request(payload))).status).toBe(400);
 expect(s.admin.auth.admin.createUser).not.toHaveBeenCalled();
});
it('protects the master account against deletion, suspension and role downgrade before any write',async()=>{
 const s=setup(true,true);const {email,password,...edit}=input;
 for(const payload of [{...edit,id:targetId,deleted:true},{...edit,id:targetId,disabled:true},{...edit,id:targetId,role:'cashier',permissions:{}}])expect((await s.handle(request(payload))).status).toBe(403);
 expect(s.user.rpc.mock.calls.some(([name])=>name==='bon_erp_set_user_access')).toBe(false);
});
it('compensates only its newly-created Auth account if membership persistence fails',async()=>{
 const s=setup();s.user.rpc.mockImplementation(async(name:string)=>name==='bon_erp_set_user_access'?{error:{message:'duplicate username'},data:null} as any:{error:null,data:{is_owner:true}});
 expect((await s.handle(request(input))).status).toBe(400);expect(s.admin.auth.admin.deleteUser).toHaveBeenCalledExactlyOnceWith(targetId);
});
it('never overwrites an existing account or deletes it after a rejected duplicate-email creation',async()=>{
 const s=setup();s.admin.auth.admin.createUser.mockResolvedValueOnce({error:{message:'exists'},data:{user:null}} as any);
 expect((await s.handle(request(input))).status).toBe(400);expect(s.admin.auth.admin.deleteUser).not.toHaveBeenCalled();
 expect(s.user.rpc.mock.calls.some(([name])=>name==='bon_erp_set_user_access')).toBe(false);
});
it('accepts origins configured via AGOUZ_ALLOWED_ORIGINS environment variable',async()=>{
 process.env.AGOUZ_ALLOWED_ORIGINS='https://staging.agouz.example';
 try{
  const s=setup();
  const req=new Request('https://test.invalid/functions/v1/manage-users',{method:'OPTIONS',headers:{Origin:'https://staging.agouz.example'}});
  const res=await s.handle(req);
  expect(res.status).toBe(204);
  expect(res.headers.get('Access-Control-Allow-Origin')).toBe('https://staging.agouz.example');
 }finally{
  delete process.env.AGOUZ_ALLOWED_ORIGINS;
 }
});

it('requires an exact approved origin', async () => {
 const s = setup();
 for (const [origin, status] of [['https://agouz.vercel.app', 204], ['https://agouz-branch-alagoouz.vercel.app', 403], ['http://localhost:5173', 403]] as const) {
  const response = await s.handle(new Request('https://test.invalid/functions/v1/manage-users', {method:'OPTIONS',headers:{Origin:origin}}));
  expect(response.status).toBe(status);
  expect(response.headers.get('Access-Control-Allow-Origin')).toBe(status === 204 ? origin : null);
 }
});
