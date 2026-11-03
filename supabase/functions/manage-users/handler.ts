const permissionKeys=['view','catalog','purchases','sales','cashier','production','stocktaking','contacts','collections','staff','expenses','partners'];
const fullPermissions=Object.fromEntries(permissionKeys.map(k=>[k,true]));
const allowedOrigin=(origin:string|null)=>origin==='https://agouz.vercel.app'||origin==='https://agouz-alagoouz.vercel.app'||!!origin&&/^https:\/\/agouz-[a-z0-9-]+-alagoouz\.vercel\.app$/.test(origin)||!!origin&&/^http:\/\/127\.0\.0\.1:\d+$/.test(origin);
type Services={user:any;admin:any};

export function manageUsersHandler(services:(authorization:string)=>Services){
 return async(req:Request):Promise<Response>=>{
  const origin=req.headers.get('origin');
  const headers:Record<string,string>={'Content-Type':'application/json','Vary':'Origin','Access-Control-Allow-Headers':'authorization,apikey,x-client-info,content-type','Access-Control-Allow-Methods':'POST,OPTIONS','Cache-Control':'no-store'};
  if(allowedOrigin(origin))headers['Access-Control-Allow-Origin']=origin!;
  const respond=(status:number,value:object)=>new Response(JSON.stringify(value),{status,headers});
  if(req.method==='OPTIONS')return new Response(null,{status:204,headers});
  if(req.method!=='POST')return respond(405,{error:'طريقة الطلب غير متاحة'});
  if(origin&&!allowedOrigin(origin))return respond(403,{error:'المصدر غير مسموح'});
  const authorization=req.headers.get('authorization')??'';
  if(!/^Bearer\s+\S+$/i.test(authorization))return respond(401,{error:'سجّل الدخول أولًا'});
  try{
   const {user,admin}=services(authorization);
   const verified=await user.auth.getUser(authorization.replace(/^Bearer\s+/i,''));
   if(verified.error||!verified.data?.user)return respond(401,{error:'انتهت جلسة الدخول'});
   const identity=await user.rpc('bon_erp_my_access');
   if(identity.error||identity.data?.is_owner!==true)return respond(403,{error:'إدارة المستخدمين للمالك الرئيسي فقط'});
   const text=await req.text();if(text.length>32768)return respond(413,{error:'الطلب أكبر من الحد المسموح'});
   let input:any;try{input=JSON.parse(text);}catch{return respond(400,{error:'بيانات المستخدم غير صالحة'});}
   if(!input||Array.isArray(input)||typeof input!=='object')return respond(400,{error:'بيانات المستخدم غير صالحة'});
   if(Object.keys(input).some(k=>!['id','email','password','username','displayName','role','partnerId','permissions','disabled','deleted'].includes(k)))return respond(400,{error:'يوجد حقل غير مسموح'});
   const username=typeof input.username==='string'?input.username.trim():'';
   const displayName=typeof input.displayName==='string'?input.displayName.trim():'';
   if(!/^[A-Za-z0-9_.-]{3,40}$/.test(username)||!displayName||displayName.length>80||!['partner','cashier'].includes(input.role))return respond(400,{error:'أدخل الاسم واسم مستخدم من 3 إلى 40 حرفًا إنجليزيًا أو رقمًا أو . _ - واختر نوع الحساب'});
   if((input.disabled!==undefined&&typeof input.disabled!=='boolean')||(input.deleted!==undefined&&typeof input.deleted!=='boolean'))return respond(400,{error:'حالة المستخدم غير صالحة'});
   const permissions=input.permissions;
   if(!permissions||typeof permissions!=='object'||Array.isArray(permissions)||Object.entries(permissions).some(([k,v])=>!permissionKeys.includes(k)||typeof v!=='boolean'))return respond(400,{error:'صلاحيات المستخدم غير صالحة'});
   if(Object.entries(permissions).some(([k,v])=>k!=='view'&&v===true)&&permissions.view!==true)return respond(400,{error:'صلاحية التعديل تتطلب الاطلاع على بيانات المحل'});
   if(input.role==='cashier'&&Object.values(permissions).some(v=>v===true))return respond(400,{error:'حساب رفع التقارير لا يملك صلاحيات لوحة الإدارة'});
   const partnerId=input.partnerId??null;
   if(partnerId!==null&&typeof partnerId!=='string')return respond(400,{error:'الحساب المالي غير صالح'});
   let target:any=null;
   if(input.id){
    if(typeof input.id!=='string'||!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(input.id))return respond(400,{error:'معرّف المستخدم غير صالح'});
    const roster=await user.rpc('bon_erp_list_users');
    if(roster.error)return respond(503,{error:'تعذر التحقق من حساب المستخدم'});
    target=roster.data?.find((u:any)=>u.user_id===input.id);
    if(!target)return respond(404,{error:'المستخدم غير موجود'});
    if(target.is_owner&&(input.disabled||input.deleted||input.role!=='partner'))return respond(403,{error:'لا يمكن حذف المالك الرئيسي أو تعطيله أو تغيير صلاحياته'});
    if(input.password!==undefined||input.email!==undefined)return respond(400,{error:'البريد وكلمة المرور لا يُعدّلان من بيانات الصلاحيات'});
   }
   const values={p_username:username,p_display_name:displayName,p_role:input.role,p_partner_id:partnerId,
    p_permissions:target?.is_owner?fullPermissions:permissions,
    p_disabled:input.disabled===true||input.deleted===true,p_deleted:input.deleted===true};
   if(target){
    const result=await user.rpc('bon_erp_set_user_access',{p_user_id:input.id,...values});
    if(result.error)return respond(400,{error:'تعذر تحديث المستخدم؛ راجع اسم المستخدم والربط المالي'});
    return respond(200,{ok:true,userId:input.id});
   }
   const email=typeof input.email==='string'?input.email.trim().toLowerCase():'';
   if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)||email.length>254||typeof input.password!=='string'||input.password.length<12||input.password.length>256||input.disabled||input.deleted)return respond(400,{error:'أدخل بريدًا صحيحًا وكلمة مرور من 12 إلى 256 حرفًا'});
   const created=await admin.auth.admin.createUser({email,password:input.password,email_confirm:true,user_metadata:{display_name:displayName}});
   if(created.error||!created.data?.user)return respond(400,{error:'تعذر إنشاء الحساب؛ قد يكون البريد مستخدمًا بالفعل أو كلمة المرور غير مقبولة'});
   const id=created.data.user.id;
   // Only compensate an account created by this request. Never modify an
   // existing Auth user because an email happens to match.
   if(id===verified.data.user.id)return respond(500,{error:'تعذر استكمال إنشاء الحساب'});
   const inserted=await user.rpc('bon_erp_set_user_access',{p_user_id:id,...values});
   if(inserted.error){
    const cleanup=await admin.auth.admin.deleteUser(id);
    return respond(400,{error:cleanup.error?'أُنشئ حساب دون صلاحيات؛ راجع المالك لاستكماله من إدارة الدخول':'تعذر حفظ صلاحيات المستخدم؛ راجع اسم المستخدم وأعد المحاولة'});
   }
   return respond(201,{ok:true,userId:id});
  }catch{return respond(503,{error:'تعذر إتمام إدارة المستخدمين؛ حدّث القائمة للتحقق من نتيجة الطلب قبل إعادة المحاولة'});}
 };
}
