// Runs only on an isolated GitHub runner against the read-only loopback fixture.
import {chromium} from 'playwright';
import assert from 'node:assert/strict';
import fs from 'node:fs';
export async function verifyDesign(){
  assert.equal(process.env.CI,'true','DESIGN_REVIEW_REQUIRES_ISOLATED_CI');
  const browser=await chromium.launch({headless:true});
  const evidence={login:false,recovery:false,resend:false,sections:[],widths:[],pageErrors:[]};
  const origin='http://127.0.0.1:5284';
  const limit=async page=>assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth+1),'Horizontal page overflow');
  try {
    const context=await browser.newContext({viewport:{width:360,height:800},reducedMotion:'reduce'});
    await context.route('**/*',route=>new URL(route.request().url()).hostname==='127.0.0.1'?route.continue():route.abort());
    const page=await context.newPage();page.on('pageerror',e=>evidence.pageErrors.push(e.message));
    await page.goto(origin);await page.getByRole('heading',{name:'أهلًا برجوعك'}).waitFor();
    assert.equal(await page.getByText(/بوابة الدخول الآمن|إنشاء حساب المالك/).count(),0);
    await limit(page);await page.screenshot({path:'design-login-mobile.png',fullPage:true});evidence.login=true;
    await page.getByRole('button',{name:'نسيت كلمة المرور؟'}).click();
    await page.getByRole('heading',{name:'استعادة كلمة المرور'}).waitFor();
    assert.equal(await page.getByLabel('كلمة المرور',{exact:true}).count(),0);
    await page.screenshot({path:'design-recovery-mobile.png',fullPage:true});evidence.recovery=true;
    await page.getByRole('button',{name:'العودة لتسجيل الدخول'}).click();
    await page.getByRole('button',{name:'إعادة إرسال تأكيد البريد'}).click();
    await page.getByRole('heading',{name:'تأكيد بريد الحساب'}).waitFor();evidence.resend=true;
    // Fixture-only token; it is not valid against any external project.
    await context.addInitScript(()=>{
      const encode=x=>btoa(JSON.stringify(x)).replaceAll('=','').replaceAll('+','-').replaceAll('/','_');
      const user={id:'11111111-1111-4111-8111-111111111111',aud:'authenticated',role:'authenticated',email:'owner@example.test',created_at:'2026-01-01T00:00:00Z',app_metadata:{},user_metadata:{}};
      localStorage.setItem('sb-127-auth-token',JSON.stringify({access_token:encode({alg:'HS256',typ:'JWT'})+'.'+encode({sub:user.id,role:'authenticated',aud:'authenticated',iat:Math.floor(Date.now()/1000),exp:Math.floor(Date.now()/1000)+3600})+'.fixture',refresh_token:'fixture',expires_at:Math.floor(Date.now()/1000)+3600,token_type:'bearer',user}));
    });
    await page.reload();await page.getByText('ملخص الإحصائيات والأرباح المباشر',{exact:true}).waitFor();
    await page.getByRole('button',{name:'الأقسام',exact:true}).last().click();
    await page.getByRole('heading',{name:'كل شغلك، بخطوة واحدة'}).waitFor();
    await page.screenshot({path:'design-sections-mobile.png',fullPage:true});
    for(const width of [320,360,430,1024]){
      await page.setViewportSize({width,height:800});await limit(page);evidence.widths.push(width);
    }
    await page.setViewportSize({width:360,height:800});
    const titles=await page.locator('.section-tile-title').allTextContents();assert.equal(titles.length,15);
    for(const title of titles){
      await page.locator('.section-tile').filter({has:page.locator('.section-tile-title',{hasText:title})}).click();
      await page.locator('.sections-hub').waitFor({state:'hidden'});
      await page.getByText('جارٍ تحميل الشاشة…',{exact:true}).waitFor({state:'hidden'});
      assert.equal(await page.getByText('تعذر فتح الشاشة',{exact:false}).count(),0);
      await limit(page);
      evidence.sections.push(title);
      await page.screenshot({path:`design-section-${evidence.sections.length}-mobile.png`,fullPage:true});
      await page.getByRole('button',{name:'الأقسام',exact:true}).last().click();
      await page.getByRole('heading',{name:'كل شغلك، بخطوة واحدة'}).waitFor();
    }
    assert.deepEqual(evidence.pageErrors,[]);
  } finally { await browser.close();fs.writeFileSync('design-review-performance.json',JSON.stringify(evidence,null,2)); }
}
