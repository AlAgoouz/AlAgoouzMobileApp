// Runs only on an isolated GitHub runner against the read-only loopback fixture.
import {chromium} from 'playwright';
import assert from 'node:assert/strict';
import fs from 'node:fs';
export async function verifyDesign(){
  assert.equal(process.env.CI,'true','DESIGN_REVIEW_REQUIRES_ISOLATED_CI');
  const browser=await chromium.launch({headless:true});
  const evidence={login:false,recovery:false,resend:false,recoveredPasswordForm:false,sections:[],widths:[],workspaceWidths:[],accountHasNoSectionMenu:false,reportTabsAccessible:false,periods:false,reducedMotion:false,pageErrors:[],layoutErrors:[]};
  const origin='http://127.0.0.1:5284';
  const limit=async (page,stage)=>{
    // Viewport updates are acknowledged before responsive styles reach the
    // compositor. Measure the settled layout, not the previous desktop frame.
    await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
    const layout=await page.evaluate(()=>({width:innerWidth,scrollWidth:document.documentElement.scrollWidth,overflow:[...document.querySelectorAll('body *')].filter(e=>{const r=e.getBoundingClientRect();return r.width&& (r.right>innerWidth+1||r.left< -1);}).slice(0,12).map(e=>({tag:e.tagName,classes:e.className,text:e.textContent?.slice(0,90)}))}));
    if(layout.scrollWidth>layout.width+1){const debug=await page.evaluate(()=>({scrollX,roots:[...document.querySelectorAll('html,body,#root,.agouz-app,.app-workspace,.screen-stage,.account-content,.account-access')].map(e=>{const r=e.getBoundingClientRect(),s=getComputedStyle(e);return {node:e.tagName,classes:e.className,x:r.x,width:r.width,right:r.right,display:s.display,columns:s.gridTemplateColumns,minWidth:s.minWidth,margin:s.margin,padding:s.padding};}),elements:[...document.querySelectorAll('h1,.account-access span')].slice(0,15).map(e=>{const r=e.getBoundingClientRect(),s=getComputedStyle(e);return {text:e.textContent?.slice(0,40),x:r.x,width:r.width,right:r.right,font:s.font,position:s.position,transform:s.transform};})}));evidence.layoutErrors.push({stage,...layout,debug});console.log('Layout overflow',stage,JSON.stringify({...layout,debug}));}
  };
  const reviewModal=async(page,trigger,label,longPermissions=false)=>{
    await trigger.click();
    const dialog=page.getByRole('dialog');await dialog.waitFor();
    const baseUnit=dialog.getByLabel('الوحدة الأساسية',{exact:true});
    if(await baseUnit.count()){
      await baseUnit.selectOption('count');
      assert.equal(await baseUnit.inputValue(),'count','New product forms must expose the distinct count unit');
    }
    if(longPermissions){await dialog.getByRole('combobox').first().selectOption('partner');await dialog.getByText('الاطلاع على جميع بيانات المحل، بما فيها الحسابات والتقارير',{exact:true}).waitFor();}
    assert.equal(await dialog.evaluate(e=>e.matches(':modal')),true,'Dialogs must use the browser top layer');
    assert.ok((await dialog.getAttribute('aria-labelledby'))?.length,'Every dialog needs a named heading');
    const controls=await dialog.locator('button:not(:disabled),input:not(:disabled),select:not(:disabled),textarea:not(:disabled),a[href]').count();
    for(let index=0;index<controls+2;index++){
      await page.keyboard.press('Tab');
      assert.equal(await dialog.evaluate(e=>e.contains(document.activeElement)),true,'Keyboard focus must remain inside the active dialog');
    }
    for(const width of [320,360,1440]){
      await page.setViewportSize({width,height:800});await limit(page,`dialog-${label}-${width}`);
      const bounds=await dialog.boundingBox();assert.ok(bounds&&bounds.x>=0&&bounds.y>=0&&bounds.x+bounds.width<=width+1&&bounds.y+bounds.height<=801,'Dialog must fit the viewport');
      assert.equal(await dialog.getByRole('button',{name:'إغلاق النافذة'}).isVisible(),true);
      assert.equal(await dialog.evaluate(e=>getComputedStyle(e).animationName),'none','Reduced-motion dialogs must remain stable');
      await page.screenshot({path:`design-dialog-${label}-${width}-mobile.png`,fullPage:false});
    }
    await page.keyboard.press('Escape');await dialog.waitFor({state:'hidden'});
    assert.equal(await trigger.evaluate(e=>e===document.activeElement),true,'Closing a dialog must restore the opening control focus');
    assert.notEqual(await page.locator('body').evaluate(e=>e.style.overflow),'hidden','Closing must unlock page scrolling');
    await page.setViewportSize({width:360,height:800});
    await trigger.click();await dialog.waitFor();await dialog.getByRole('button',{name:'إغلاق النافذة'}).click();await dialog.waitFor({state:'hidden'});
  };
  try {
    const context=await browser.newContext({viewport:{width:360,height:800},reducedMotion:'reduce'});
    await context.route('**/*',route=>new URL(route.request().url()).hostname==='127.0.0.1'?route.continue():route.abort());
    const page=await context.newPage();page.on('pageerror',e=>evidence.pageErrors.push(e.message));
    await page.goto(origin);await page.getByRole('heading',{name:'أهلًا برجوعك'}).waitFor();
    assert.equal(await page.getByText(/بوابة الدخول الآمن|إنشاء حساب المالك/).count(),0);
    await page.locator('.login-brand img').evaluate(img=>img.decode());
    await limit(page,'login');await page.screenshot({path:'design-login-mobile.png',fullPage:true});evidence.login=true;
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
    assert.equal(await page.getByText('تعذر تأكيد الحفظ',{exact:true}).count(),0,'Read-only dashboard must not report a failed save before a write exists');
    assert.equal(await page.getByRole('button',{name:'الأقسام',exact:true}).count(),1,'Home must not duplicate the section directory');
    assert.equal(await page.getByRole('button',{name:'المزيد',exact:true}).count(),0);
    await page.getByRole('button',{name:'كل السجل',exact:true}).click();
    await page.getByRole('button',{name:'اليوم',exact:true}).click();
    await page.getByRole('button',{name:'فترة محددة',exact:true}).click();
    await page.getByLabel('بداية الفترة').fill('2026-11-04');await page.getByLabel('نهاية الفترة').fill('2026-11-03');
    assert.equal(await page.getByRole('button',{name:'تطبيق',exact:true}).isDisabled(),true);
    await page.getByLabel('بداية الفترة').fill('2026-11-01');await page.getByRole('button',{name:'تطبيق',exact:true}).click();
    await page.getByRole('button',{name:'كل السجل',exact:true}).click();evidence.periods=true;
    assert.equal(await page.locator('.screen-stage').evaluate(e=>getComputedStyle(e).animationName),'none');evidence.reducedMotion=true;
    for(const width of [320,360,430,768,1024,1440]){
      await page.setViewportSize({width,height:900});await limit(page,`home-${width}`);
      const used=await page.locator('.app-workspace').evaluate(e=>e.getBoundingClientRect().width);evidence.workspaceWidths.push({viewport:width,used});
      if(width>=768)assert.ok(used>=Math.min(width-(width>=1100?252:0),1440)-2,'Workspace must use the available desktop/tablet width');
      assert.equal(await page.locator('.agouz-app').evaluate(e=>getComputedStyle(e).paddingInlineStart),width>=1100?'252px':'0px','Sidebar space must reset after changing viewport');
    }
    await page.screenshot({path:'design-home-desktop-mobile.png',fullPage:true});
    await page.getByRole('button',{name:'حسابي',exact:true}).click();await page.getByRole('heading',{name:'حسابي',exact:true}).waitFor();
    assert.equal(await page.locator('.section-tile').count(),0);
    assert.equal(await page.locator('.account-content').getByRole('button',{name:/قسم الإنتاج|شؤون العمال|المستخدمين|الشركاء والحصص/}).count(),0);
    await page.getByRole('heading',{name:'صلاحيات حسابك',exact:true}).waitFor();
    evidence.accountHasNoSectionMenu=true;await limit(page,'account-desktop');
    await page.screenshot({path:'design-account-desktop-mobile.png',fullPage:true});
    await page.setViewportSize({width:360,height:800});await limit(page,'account-mobile');await page.screenshot({path:'design-account-mobile.png',fullPage:true});
    await page.getByRole('button',{name:'الأقسام',exact:true}).last().click();
    await page.getByRole('heading',{name:'كل شغلك، بخطوة واحدة'}).waitFor();
    await page.screenshot({path:'design-sections-mobile.png',fullPage:true});
    for(const width of [320,360,430,768,1024,1440]){
      await page.setViewportSize({width,height:800});await limit(page,`sections-${width}`);evidence.widths.push(width);
    }
    await page.setViewportSize({width:360,height:800});
    const titles=await page.locator('.section-tile-title').allTextContents();assert.equal(titles.length,17);
    for(const title of titles){
      await page.locator('.section-tile').filter({has:page.locator('.section-tile-title',{hasText:title})}).click();
      await page.locator('.sections-hub').waitFor({state:'hidden'});
      await page.getByText('جارٍ تحميل الشاشة…',{exact:true}).waitFor({state:'hidden'});
      assert.equal(await page.getByText('تعذر فتح الشاشة',{exact:false}).count(),0);
      await limit(page,title);
      assert.equal(await page.locator('.operation-header').count(),1,'Every internal section must share one header');
      assert.equal(await page.locator('.operation-header h1').count(),1);
      if(title==='المنتجات والتسعير'){
        const register=page.getByRole('list',{name:'سجل المنتجات الجاهزة'});
        assert.equal(await register.getByRole('listitem').count(),50,'Catalog rendering must remain bounded');
        await page.getByRole('combobox',{name:'عدد النتائج في الصفحة'}).selectOption('25');
        assert.equal(await register.getByRole('listitem').count(),25);
        await page.getByRole('combobox',{name:'انتقل إلى صفحة المنتجات الجاهزة'}).selectOption('3');
        await page.getByRole('searchbox',{name:'البحث في المنتجات الجاهزة'}).fill('P99');
        assert.equal(await register.getByRole('listitem').count(),1,'Search must reset pagination and cover the whole catalog');
        await page.getByRole('searchbox',{name:'البحث في المنتجات الجاهزة'}).fill('');
        assert.equal(await page.getByRole('combobox',{name:'انتقل إلى صفحة المنتجات الجاهزة'}).inputValue(),'0','Clearing search must not resurrect an old page');
        await page.getByRole('combobox',{name:'عدد النتائج في الصفحة'}).selectOption('50');
        await register.getByRole('button',{name:'تفاصيل',exact:true}).first().click();
        for(const width of [320,360,430,768,1024,1440]){
          await page.setViewportSize({width,height:900});await limit(page,`catalog-register-${width}`);
          await page.screenshot({path:`design-catalog-register-${width}-mobile.png`,fullPage:false});
        }
        await page.setViewportSize({width:360,height:800});
      }
      if(title==='فواتير البيع'){
        await page.getByRole('button',{name:'السجل السابق',exact:true}).click();
        await page.getByRole('button',{name:'طباعة / واتساب',exact:true}).first().waitFor();
        await page.getByRole('button',{name:'طباعة / واتساب',exact:true}).first().click();
        await page.getByRole('dialog').waitFor();await page.getByRole('button',{name:'إغلاق النافذة',exact:true}).click();
      }
      const addDialogs={'المنتجات والتسعير':'منتج جديد','الإنتاج والوصفات':'جديد','مخزن البن':'إضافة','عملاء الجملة':'إضافة','الموردين':'إضافة','المستخدمين':'إضافة مستخدم','العمال والرواتب':'عامل جديد'};
      if(addDialogs[title])await reviewModal(page,page.getByRole('button',{name:addDialogs[title],exact:true}),String(evidence.sections.length+1),title==='المستخدمين');
      if(title==='المصاريف'){
        await page.getByRole('button',{name:'حسابي',exact:true}).click();
        await page.getByRole('heading',{name:'حسابي',exact:true}).waitFor();
        await page.getByRole('button',{name:'الأقسام',exact:true}).click();
        await page.locator('.section-tile').filter({has:page.locator('.section-tile-title',{hasText:title})}).click();
        await page.getByText('جارٍ تحميل الشاشة…',{exact:true}).waitFor({state:'hidden'});
      }
      if(title==='التقارير والأرباح'){
        for(const tab of ['حصص الشركاء','ربحية الأصناف','الفواتير','الملخص']){
          const button=page.getByRole('button',{name:tab,exact:true});await button.click();
          assert.equal(await button.getAttribute('aria-pressed'),'true');
          const rect=await button.boundingBox();assert.ok(rect&&rect.y<450,'Report tabs must be reachable above the primary navigation');
        }
        evidence.reportTabsAccessible=true;
        await reviewModal(page,page.getByRole('button',{name:'مصادر صافي الربح',exact:true}),'report-sources');
        await page.getByRole('button',{name:'تحليلات المحل والتنبيهات',exact:true}).click();
        await page.getByRole('heading',{name:'تحليلات وذكاء بُن العجوز',exact:true}).waitFor();
        assert.equal(await page.getByRole('button',{name:'كل السجل',exact:true}).getAttribute('aria-pressed'),'true','Insights must retain the selected report range');
        await limit(page,'insights-mobile');
        await page.getByRole('button',{name:'التقارير',exact:true}).click();
        await page.getByRole('heading',{name:'تقارير الأرباح وحصص الشركاء',exact:true}).waitFor();
      }
      evidence.sections.push(title);
      await page.screenshot({path:`design-section-${evidence.sections.length}-mobile.png`,fullPage:true});
      await page.getByRole('button',{name:'الأقسام',exact:true}).last().click();
      await page.getByRole('heading',{name:'كل شغلك، بخطوة واحدة'}).waitFor();
    }
    await page.setViewportSize({width:1440,height:900});
    await page.emulateMedia({reducedMotion:'no-preference'});
    await limit(page,'sections-card-effects');
    const hoveredCard=page.locator('.section-tile').first();await hoveredCard.hover();
    await page.screenshot({path:'design-card-hover-mobile.png',fullPage:true,animations:'disabled'});
    assert.notEqual(await hoveredCard.evaluate(e=>getComputedStyle(e).transform),'none','Actionable cards must visibly respond to desktop hover');
    await page.emulateMedia({reducedMotion:'reduce'});await limit(page,'sections-card-reduced-motion');
    assert.equal(await hoveredCard.evaluate(e=>getComputedStyle(e).transform),'none','Reduced-motion cards must remain stable');
    evidence.cardHover=true;
    await page.setViewportSize({width:360,height:800});
    await page.goto(origin+'/#type=recovery');
    // A mail link opens a new document. A hash-only goto from this already-open
    // SPA is same-document navigation and does not rerun its initial-link guard.
    await page.reload();
    await page.getByRole('heading',{name:'اختر كلمة مرور جديدة'}).waitFor();
    await page.locator('.login-brand img').evaluate(img=>img.decode());
    await limit(page,'recovered-password-form');
    await page.screenshot({path:'design-new-password-mobile.png',fullPage:true});
    evidence.recoveredPasswordForm=true;
    assert.deepEqual(evidence.pageErrors,[]);
    assert.deepEqual(evidence.layoutErrors,[],'Every section must fit the mobile viewport');
  } finally { await browser.close();fs.writeFileSync('design-review-performance.json',JSON.stringify(evidence,null,2)); }
}
