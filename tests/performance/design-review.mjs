// Runs only on an isolated GitHub runner against the read-only loopback fixture.
import {chromium} from 'playwright';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import * as XLSX from 'xlsx';
import {fixture} from './fixture.mjs';
import {projectRead} from './read-fixture.mjs';
export async function verifyDesign(){
  assert.equal(process.env.CI,'true','DESIGN_REVIEW_REQUIRES_ISOLATED_CI');
  const browser=await chromium.launch({headless:true});
  const evidence={login:false,recovery:false,resend:false,recoveredPasswordForm:false,sections:[],widths:[],workspaceWidths:[],accountHasNoSectionMenu:false,reportTabsAccessible:false,periods:false,reducedMotion:false,pageErrors:[],layoutErrors:[]};
  const origin='http://127.0.0.1:5284';
  const luminance=color=>{const rgb=color.match(/[\d.]+/g).slice(0,3).map(Number).map(v=>{const s=v/255;return s<=.04045?s/12.92:((s+.055)/1.055)**2.4;});return rgb.reduce((sum,v,i)=>sum+v*[.2126,.7152,.0722][i],0);};
  const contrast=(a,b)=>{const values=[luminance(a),luminance(b)].sort((x,y)=>y-x);return (values[0]+.05)/(values[1]+.05);};
  const settleCard=card=>card.evaluate(async e=>{await Promise.all(e.getAnimations().map(animation=>animation.finished.catch(()=>{})));});
  const reviewCardHover=async(page,selector,label,screenshot)=>{
    const card=page.locator(selector).first();await card.scrollIntoViewIfNeeded();await page.mouse.move(1,1);await settleCard(card);
    const style=()=>card.evaluate(e=>{const s=getComputedStyle(e);return {transform:s.transform,shadow:s.boxShadow,border:s.borderTopColor};});
    const before=await style();await card.hover();await settleCard(card);const after=await style();
    assert.notEqual(after.transform,'none',`${label} must lift on pointer hover`);
    assert.notEqual(after.shadow,before.shadow,`${label} needs a stronger hover shadow`);
    assert.notEqual(after.border,before.border,`${label} needs a distinct hover edge`);
    evidence.hoverCards??=[];evidence.hoverCards.push({card:label,transform:after.transform,shadowChanged:true,edgeChanged:true});
    await page.screenshot({path:screenshot,fullPage:false,animations:'disabled'});return card;
  };
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
    const field=dialog.locator('input:not([type=checkbox]):not([type=radio]):not(:disabled),select:not(:disabled),textarea:not(:disabled)').first();
    if(await field.count()){
      const colors=await field.evaluate(e=>{const s=getComputedStyle(e);return {text:s.color,border:s.borderTopColor,background:s.backgroundColor};});
      const ratios={text:contrast(colors.text,colors.background),boundary:contrast(colors.border,colors.background)};
      assert.ok(ratios.text>=4.5&&ratios.boundary>=3,`Dialog fields need readable text and visible boundaries: ${JSON.stringify(ratios)}`);
      evidence.fieldContrast??=[];evidence.fieldContrast.push({dialog:label,...ratios});
    }
    const baseUnit=dialog.getByLabel('الوحدة الأساسية',{exact:true});
    if(await baseUnit.count()&&await baseUnit.locator('option[value="count"]').count()){
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
    await page.getByRole('heading',{name:'الأقسام',exact:true}).waitFor();
    await page.screenshot({path:'design-sections-mobile.png',fullPage:true});
    for(const width of [320,360,430,768,1024,1440]){
      await page.setViewportSize({width,height:800});await limit(page,`sections-${width}`);evidence.widths.push(width);
    }
    await page.setViewportSize({width:360,height:800});
    let menuDraft=null,menuPublication=null,previousMenu=null;
    const routeMenu=async route=>{
      const path=new URL(route.request().url()).pathname;
      if(path.endsWith('/agouz_menu_draft'))return route.fulfill({json:menuDraft?[menuDraft]:[]});
      if(path.endsWith('/agouz_menu_publication'))return route.fulfill({json:menuPublication?[menuPublication]:[]});
      if(path.endsWith('/agouz_menu_restore_available'))return route.fulfill({json:!!previousMenu});
      const body=route.request().postDataJSON();
      assert.equal(body.p_expected_revision,menuDraft?.revision??0);
      if(path.endsWith('/agouz_restore_menu_image')){
        assert.ok(previousMenu);
        const content=previousMenu;
        previousMenu=menuPublication.content;
        menuDraft={revision:body.p_expected_revision+1,content};
        menuPublication={content,published_at:new Date().toISOString()};
        return route.fulfill({json:menuDraft});
      }
      menuDraft={revision:body.p_expected_revision+1,content:body.p_content};
      if(body.p_publish){
        previousMenu=menuPublication?.content??null;
        menuPublication={content:body.p_content,published_at:new Date().toISOString()};
      }
      return route.fulfill({json:menuDraft.revision});
    };
    await context.route('**/rest/v1/**/agouz_save_menu',routeMenu);
    await context.route('**/rest/v1/**/agouz_menu_restore_available',routeMenu);
    await context.route('**/rest/v1/**/agouz_restore_menu_image',routeMenu);
    await context.route('**/rest/v1/agouz_menu_*?*',routeMenu);
    const group=page.getByRole('button',{name:'المبيعات والعملاء',exact:true});
    await group.click();
    assert.equal(await group.getAttribute('aria-expanded'),'false');
    assert.equal(await page.locator('.section-tile').filter({has:page.locator('.section-tile-title',{hasText:'سجل البيع'})}).isVisible(),false);
    await group.click();
    const titles=await page.locator('.section-tile-title').allTextContents();assert.equal(titles.length,19);
    for(const title of titles){
      await page.locator('.section-tile').filter({has:page.locator('.section-tile-title',{hasText:title})}).click();
      await page.locator('.sections-hub').waitFor({state:'hidden'});
      await page.getByText('جارٍ تحميل الشاشة…',{exact:true}).waitFor({state:'hidden'});
      assert.equal(await page.getByText('تعذر فتح الشاشة',{exact:false}).count(),0);
      await limit(page,title);
      assert.equal(await page.locator('.operation-header').count(),1,'Every internal section must share one header');
      assert.equal(await page.locator('.operation-header h1').count(),1);
      if(title==='صورة المنيو'){
        const upload=page.getByLabel('صورة المنيو',{exact:true});
        const publish=async()=>{
          await page.getByRole('button',{name:'نشر الصورة',exact:true}).click();
          await page.getByRole('dialog',{name:'نشر صورة المنيو'}).getByRole('button',{name:'تأكيد النشر'}).click();
          await page.getByText('تم نشر الصورة. نفس الرابط وكود QR يفتحوا آخر نسخة للعملاء.',{exact:true}).waitFor();
        };
        await upload.setInputFiles({name:'invalid.png',mimeType:'image/png',buffer:Buffer.from('not an image')});
        await page.getByText('تعذر فتح الصورة. جرّب تختار ملف صورة سليم.').waitFor();
        await upload.setInputFiles('public/menu-logo.webp');
        const preview=page.getByRole('img',{name:'معاينة صورة المنيو'});
        await preview.waitFor();
        await preview.evaluate(img=>img.decode());
        const initialImage=await preview.getAttribute('src');
        assert.ok(initialImage?.startsWith('data:image/jpeg;base64,/9j/'));
        assert.equal(menuDraft,null,'Preparing the image must not write a draft');
        assert.equal(menuPublication,null,'The preview must remain private until confirmation');
        assert.equal(await page.getByRole('button',{name:'مشاركة وQR',exact:true}).count(),0);
        await limit(page,'menu-image-preview-360');
        await publish();
        assert.deepEqual(menuPublication.content,{image:initialImage});
        await page.getByRole('button',{name:'مشاركة وQR',exact:true}).click();
        const sharing=page.getByRole('dialog',{name:'مشاركة المنيو'});
        assert.equal(await sharing.getByLabel('رابط المنيو').inputValue(),'https://agouz.vercel.app/menu');
        const png=await sharing.getByRole('link',{name:'تنزيل PNG'}).getAttribute('href');
        const svg=await sharing.getByRole('link',{name:'تنزيل SVG'}).getAttribute('href');
        assert.ok(png?.startsWith('data:image/png;base64,iVBORw0KGgo'));
        assert.match(decodeURIComponent(svg??''),/<svg[\s\S]+<path/);
        await sharing.getByRole('button',{name:'إغلاق النافذة'}).click();

        const guest=await browser.newContext({viewport:{width:320,height:800}});
        try{
          await guest.route('**/rest/v1/agouz_menu_*?*',routeMenu);
          const publicPage=await guest.newPage(),privateRequests=[];
          publicPage.on('request',request=>{
            if(/\/(?:rest|auth)\/v1\//.test(request.url())&&!request.url().includes('/agouz_menu_publication?'))privateRequests.push(request.url());
          });
          await publicPage.goto(origin+'/menu');
          const photo=publicPage.getByRole('img',{name:'صورة منيو بُن العجوز'});
          await photo.evaluate(img=>img.decode());
          assert.equal(await photo.getAttribute('src'),initialImage);
          assert.equal(await publicPage.getByRole('link',{name:'تحميل الصورة'}).getAttribute('download'),'agouz-menu.jpg');
          await upload.setInputFiles('public/logo.png');
          await preview.waitFor();
          const replacement=await preview.getAttribute('src');
          assert.notEqual(replacement,initialImage);
          assert.equal(menuPublication.content.image,initialImage);
          await publish();
          await publicPage.reload();
          await photo.evaluate(img=>img.decode());
          assert.equal(await photo.getAttribute('src'),replacement);
          const zoom=publicPage.getByRole('button',{name:'تكبير الصورة',exact:true});
          await zoom.click();
          assert.equal(await zoom.getAttribute('aria-pressed'),'true');
          assert.ok(await publicPage.getByRole('region',{name:'صورة المنيو المكبرة'}).evaluate(region=>region.scrollWidth>region.clientWidth));
          await zoom.click();
          await page.getByRole('button',{name:'استرجاع الصورة السابقة',exact:true}).click();
          await page.getByRole('button',{name:'تأكيد الاسترجاع',exact:true}).click();
          await page.getByText('تم استرجاع الصورة السابقة على نفس الرابط.',{exact:true}).waitFor();
          await publicPage.reload();
          assert.equal(await photo.getAttribute('src'),initialImage);
          assert.equal(await publicPage.getByRole('heading',{name:'منيو بُن العجوز',exact:true}).count(),1);
          assert.deepEqual(privateRequests,[]);
          await limit(publicPage,'public-menu-320');
          await publicPage.screenshot({path:'design-public-menu-mobile.png',fullPage:true});
        }finally{await guest.close();}
        await page.setViewportSize({width:1440,height:900});
        await page.getByRole('img',{name:'صورة المنيو المنشورة'}).waitFor();
        await limit(page,'menu-editor-desktop');
        await page.screenshot({path:'design-menu-editor-desktop-mobile.png',fullPage:false});
        await page.setViewportSize({width:360,height:800});
        evidence.menu={preview:true,publication:true,replacement:true,rollback:true,zoom:true,publicAccess:true,png:true,svg:true};
        await limit(page,'menu-editor');
      }
      if(title==='فواتير الجملة'){
        const trigger=page.getByRole('button',{name:'اختيار العميل',exact:true});
        for(const width of [320,768,1440]){
          await page.setViewportSize({width,height:800});
          await trigger.click();
          const panel=page.getByRole('dialog',{name:'اختيار عميل',exact:true});
          const search=panel.getByRole('searchbox');
          await search.waitFor();
          assert.equal(await search.evaluate(e=>e===document.activeElement),true);
          const box=await panel.boundingBox();
          assert.ok(box&&box.x>=0&&box.x+box.width<=width+1);
          if(width===320)assert.equal(Math.round(box.width),320);
          if(width===1440)assert.ok(box.width<600&&Math.abs(box.x+box.width-width)<1);
          await search.fill('عميل غير موجود');
          await panel.getByText('مفيش نتائج مطابقة للبحث.').waitFor();
          await page.screenshot({path:'design-invoice-picker-'+width+'-mobile.png',fullPage:false});
          await page.keyboard.press('Escape');
          await panel.waitFor({state:'hidden'});
          assert.equal(await trigger.evaluate(e=>e===document.activeElement),true);
        }
        await page.setViewportSize({width:360,height:800});
      }
      if(title==='تقارير يوم الكاشير'){
        const input = page.getByLabel('ملف التقرير',{exact:true});
        await input.setInputFiles({name:'invalid.txt',mimeType:'text/plain',buffer:Buffer.from('fixture')});
        await page.getByText('الصيغ المقبولة: CSV وXLS وXLSX.',{exact:true}).waitFor();
        assert.equal(await input.getAttribute('aria-invalid'),'true');
        assert.equal(await input.inputValue(),'');
        const book=XLSX.utils.book_new();XLSX.utils.book_append_sheet(book,XLSX.utils.aoa_to_sheet([['Menu Item Sales Report (UWS)\nDate Range 01 11 26 - 01 11 26\nPrinted on 04/11/26 20:00:00'],['100010 Fixture Drink 2 100.00%\n100010 Fixture Drink 2 100.00%'],['20.00 100.00%\n20.00 100.00%'],['TOTAL SLS 2 20.00\nTOTAL SLS 2 20.00']]),'Report');
        await page.getByLabel('ملف التقرير',{exact:true}).setInputFiles({name:'synthetic-2030-wrong-filename.xlsx',mimeType:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',buffer:XLSX.write(book,{type:'buffer',bookType:'xlsx'})});
        await page.getByText('يوم البيع 2026-11-01 مقروء من داخل التقرير؛ تاريخ الطباعة واسم الملف لا يغيّرانه.',{exact:true}).waitFor();
        assert.equal(await page.getByLabel('يوم العمل',{exact:true}).inputValue(),'2026-11-01');
        // The disabled native select's label can include its option text in
        // Chromium; scope the assertion to the upload form's unique select.
        assert.equal(await page.locator('section[aria-label="رفع ومعالجة التقارير"] form select').inputValue(),'items');
        assert.equal(await page.getByLabel('يوم العمل',{exact:true}).evaluate(e=>e.readOnly),true);
        assert.equal(await input.getAttribute('aria-invalid'),'false','Valid replacement clears the file error');
        await limit(page,'uws-detected-day');await page.screenshot({path:'design-uws-detected-day-mobile.png',fullPage:false});
      }
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
      if(title==='سجل البيع'){
        await page.getByRole('button',{name:'السجل السابق',exact:true}).click();
        await page.getByRole('button',{name:'طباعة / واتساب',exact:true}).first().waitFor();
        await page.getByRole('button',{name:'طباعة / واتساب',exact:true}).first().click();
        await page.getByRole('dialog').waitFor();await page.getByRole('button',{name:'إغلاق النافذة',exact:true}).click();
      }
      const addDialogs={'المنتجات والتسعير':'منتج جديد','إنتاج التوليفات':'جديد','الوصفات':'تعريف منتج بوصفة','مخزن البن':'إضافة','عملاء الجملة':'إضافة','الموردين':'إضافة','المستخدمين والصلاحيات':'إضافة مستخدم','العمال والرواتب':'عامل جديد'};
      if(addDialogs[title])await reviewModal(page,page.getByRole('button',{name:addDialogs[title],exact:true}),String(evidence.sections.length+1),title==='المستخدمين والصلاحيات');
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
      await page.getByRole('heading',{name:'الأقسام',exact:true}).waitFor();
    }
    await page.setViewportSize({width:1440,height:900});
    await page.emulateMedia({reducedMotion:'no-preference'});
    await limit(page,'sections-card-effects');
    const hoveredCard=await reviewCardHover(page,'.section-tile','section','design-card-hover-mobile.png');
    await page.emulateMedia({reducedMotion:'reduce'});await limit(page,'sections-card-reduced-motion');
    assert.equal(await hoveredCard.evaluate(e=>getComputedStyle(e).transform),'none','Reduced-motion cards must remain stable');
    evidence.cardHover=true;
    await page.getByRole('button',{name:'نظرة على المحل',exact:true}).click();await page.getByText('ملخص الإحصائيات والأرباح المباشر',{exact:true}).waitFor();
    await page.emulateMedia({reducedMotion:'no-preference'});
    for(const [selector,label] of [['.metric-card','metric'],['.visual-card','panel'],['.attention-card','attention']]){
      const card=await reviewCardHover(page,selector,label,`design-hover-${label}-mobile.png`);
      await page.emulateMedia({reducedMotion:'reduce'});await settleCard(card);
      assert.equal(await card.evaluate(e=>getComputedStyle(e).transform),'none',`${label} must respect reduced motion`);
      await page.emulateMedia({reducedMotion:'no-preference'});
    }
    await page.emulateMedia({reducedMotion:'reduce'});
    await page.setViewportSize({width:360,height:800});
    // Recipe editing uses disposable responses; a save is deliberately refused
    // to verify that missing acknowledgement retains all local ingredients.
    const recipeFixture=fixture(0);
    recipeFixture.items=[{...recipeFixture.items[0],id:'recipe-raw',code:'R1',name:'خام الوصفة',category:'raw_bean',baseUnit:'kg',costPrice:400}];
    recipeFixture.catalog_name_drafts=[{id:'recipe-draft',name:'مشروب تحت الاستكمال',origin:'manual',createdAt:'2026-11-06T00:00:00Z',definition:{code:'DR-1',category:'drink_recipe',baseUnit:'piece',retailPrice:50,openingStock:0,minStock:0}}];
    await page.route('**/rest/v1/bon_elagouz_store?*',async route=>route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(new URL(route.request().url()).searchParams.get('select')==='version'?{version:0}:recipeFixture)}));
    await page.reload();await page.getByRole('button',{name:'الأقسام',exact:true}).last().click();
    await page.locator('.section-tile').filter({has:page.locator('.section-tile-title',{hasText:'الوصفات'})}).click();
    await page.getByRole('button',{name:'المنتج صاحب الوصفة',exact:true}).click();
    await page.getByRole('searchbox',{name:'ابحث باسم المنتج أو الكود'}).fill('DR-1');
    await page.getByRole('button',{name:/مشروب تحت الاستكمال/}).click();
    await page.getByRole('button',{name:'المكون',exact:true}).click();
    await page.getByRole('searchbox',{name:'ابحث باسم المكون أو الكود'}).fill('R1');
    await page.getByRole('button',{name:/خام الوصفة/}).click();
    await page.getByLabel('كمية المكون',{exact:true}).fill('١٨');
    await page.getByRole('button',{name:'إضافة المكون',exact:true}).click();
    assert.equal(await page.getByLabel('إجمالي تكلفة الوصفة').innerText(),new Intl.NumberFormat('ar-EG',{maximumFractionDigits:2}).format(7.2)+' ج.م');
    await page.getByLabel('كمية خام الوصفة',{exact:true}).fill('');
    await page.locator('button:disabled').filter({hasText:'اعتماد الوصفة وتجهيز المنتج'}).waitFor();
    assert.equal(await page.getByRole('button',{name:'اعتماد الوصفة وتجهيز المنتج',exact:true}).isDisabled(),true);
    await page.getByLabel('كمية خام الوصفة',{exact:true}).fill('18');
    for(const width of [320,360,768,1440]){await page.setViewportSize({width,height:900});await limit(page,`recipe-editor-${width}`);await page.screenshot({path:`design-recipe-editor-${width}-mobile.png`,fullPage:true});}
    await page.emulateMedia({reducedMotion:'no-preference'});
    const ingredientCard=await reviewCardHover(page,'.record-card','record','design-hover-record-mobile.png');
    assert.equal(await ingredientCard.evaluate(e=>getComputedStyle(e.parentElement.closest('.visual-card')).transform),'none','Nested records must not lift their parent card too');
    await page.emulateMedia({reducedMotion:'reduce'});await settleCard(ingredientCard);
    assert.equal(await ingredientCard.evaluate(e=>getComputedStyle(e).transform),'none','Record cards must respect reduced motion');
    await page.route('**/rest/v1/rpc/bon_erp_save_store',route=>route.fulfill({status:503,contentType:'application/json',body:JSON.stringify({message:'Isolated fixture refuses writes'})}));
    await page.getByRole('button',{name:'اعتماد الوصفة وتجهيز المنتج',exact:true}).click();
    await page.getByText(/الاتصال بالخادم غير مستقر/).first().waitFor();
    assert.equal(await page.getByLabel('كمية خام الوصفة',{exact:true}).inputValue(),'18');
    await page.screenshot({path:'design-recipe-save-failure-mobile.png',fullPage:true});
    await page.unroute('**/rest/v1/rpc/bon_erp_save_store');
    await page.route('**/rest/v1/rpc/bon_erp_save_store',route=>route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({version:1})}));
    await page.getByRole('button',{name:'إعادة محاولة الحفظ',exact:true}).click();
    await page.getByRole('dialog').waitFor({state:'hidden'});
    assert.equal(await page.getByLabel('كمية خام الوصفة',{exact:true}).inputValue(),'18');
    evidence.recipeEditor=true;
    await page.unroute('**/rest/v1/bon_elagouz_store?*');await page.unroute('**/rest/v1/rpc/bon_erp_save_store');
    await page.setViewportSize({width:360,height:800});
    // Financial acceptance uses a disposable response, never hosted business data.
    const workflow = await browser.newContext({viewport:{width:360,height:800},acceptDownloads:true});
    try {
      await workflow.route('**/*',route=>new URL(route.request().url()).origin===origin?route.continue():route.abort());
      const operator = await workflow.newPage();
      const userId = '11111111-1111-4111-8111-111111111111';
      const rows = [];
      let role = 'cashier';
      await workflow.addInitScript(id=>{
        const b64 = value=>btoa(JSON.stringify(value));
        const user={id,aud:'authenticated',role:'authenticated',email:'workflows@example.test',created_at:'2026-01-01T00:00:00Z',app_metadata:{},user_metadata:{}};
        const now=Math.floor(Date.now()/1000);
        localStorage.setItem('sb-127-auth-token',JSON.stringify({access_token:b64({alg:'HS256',typ:'JWT'})+'.'+b64({sub:id,role:'authenticated',aud:'authenticated',iat:now,exp:now+3600})+'.fixture',refresh_token:'fixture',expires_at:now+3600,token_type:'bearer',user}));
      },userId);
      await workflow.route('**/rest/v1/rpc/bon_erp_my_access',route=>route.fulfill({json:{
        user_id:userId,partner_id:role==='partner'?'p1':null,username:'fixture',display_name:'حساب الاختبار',
        role,is_owner:role==='partner',permissions:{view:role==='partner'},
      }}));
      await workflow.route('**/rest/v1/rpc/bon_erp_read_import',route=>{
        const id=route.request().postDataJSON()?.p_id;
        return route.fulfill({json:id?rows.find(row=>row.id===id):rows});
      });
      await workflow.route('**/rest/v1/rpc/bon_erp_new_import',async route=>{
        const args=route.request().postDataJSON();
        if(rows.some(row=>row.kind===args.p_kind&&row.sale_date===args.p_date))
          return route.fulfill({status:400,json:{message:'CASHIER_IMPORT_ALREADY_PENDING'}});
        const id='11111111-1111-4111-8111-11111111111'+(rows.length+2);
        rows.push({id,file_name:args.p_name,sale_date:args.p_date,kind:args.p_kind,status:'uploading',
          created_at:'2026-11-01T12:00:00Z',updated_at:'2026-11-01T12:00:00Z',error_code:null,reviewed:false,queue_id:null});
        return route.fulfill({json:{id,path:userId+'/'+id+'/report.xlsx'}});
      });
      await workflow.route('**/storage/v1/object/agouz-cashier-imports/**',route=>route.fulfill({json:{Key:'loopback-report'}}));
      await workflow.route('**/api/imports/*/enqueue',route=>{
        const id=new URL(route.request().url()).pathname.split('/')[3];
        const row=rows.find(entry=>entry.id===id);
        assert.ok(row);
        row.status='ready';
        return route.fulfill({status:202,json:{id,status:row.status}});
      });
      await operator.goto(origin);
      await operator.getByRole('heading',{name:'رفع تقارير الكاشير',exact:true}).waitFor();
      assert.equal(await operator.getByRole('button',{name:'الأقسام',exact:true}).count(),0);
      const file = operator.getByLabel('ملف التقرير',{exact:true});
      const submit = operator.getByRole('button',{name:'رفع وبدء المعالجة'});
      const reports = [
        ['financial','System Sales Report (UWS)','Begun 120.00'],
        ['items','Menu Item Sales Report (UWS)','100010 Fixture Drink 2 100.00%'],
      ].map(([kind,title,value])=>{
        const book=XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(book,XLSX.utils.aoa_to_sheet([[title+'\nDate Range 01 11 26 - 01 11 26'],[value]]),'Report');
        return {name:kind+'.xlsx',mimeType:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',buffer:XLSX.write(book,{type:'buffer',bookType:'xlsx'})};
      });
      for (const report of reports) {
        await file.setInputFiles(report);
        await submit.click();
        await operator.getByRole('article').filter({hasText:report.name}).getByText('جاهز للمراجعة').waitFor();
      }
      assert.deepEqual(rows.map(({kind,sale_date})=>[kind,sale_date]),[['financial','2026-11-01'],['items','2026-11-01']]);
      await file.setInputFiles(reports[0]);
      await submit.click();
      await operator.getByText('يوجد ملف من نفس النوع لهذا اليوم؛ راجعه أو ألغِ الملف الخطأ أولًا.',{exact:true}).waitFor();
      assert.equal(rows.length,2);

      role = 'partner';
      const ledger = fixture(0);
      ledger.customers=[{id:'fixture-cafe',name:'مقهى الاختبار',phone:'01012345678',area:'القاهرة',type:'جملة',balance:0,totalSales:0,invoicesCount:0}];
      const raw={...ledger.items[0],id:'fixture-bean',code:'RAW-FX',name:'بن اختبار',category:'raw_bean',baseUnit:'kg'};
      const blend={...raw,id:'fixture-blend',code:'BL-FX',name:'توليفة الاختبار',category:'manufactured_blend',hasRecipe:true,
        recipe:[{ingredientId:raw.id,ingredientName:raw.name,quantity:1,unit:'kg'}]};
      ledger.items=[raw,blend];
      let ledgerState=ledger;
      const saves=[];
      await workflow.route('**/rest/v1/bon_elagouz_store?*',route=>{
        const fields=new URL(route.request().url()).searchParams.get('select');
        return route.fulfill({json:fields==='version'?{version:ledgerState.version}:ledgerState});
      });
      await workflow.route('**/rest/v1/rpc/bon_erp_save_store',route=>{
        const args=route.request().postDataJSON();
        saves.push(args);
        if(saves.length===1){ledgerState={...ledgerState,...args.p_state,version:1};return route.abort('failed');}
        if(saves.length===2){
          assert.equal(args.p_operation_id,saves[0].p_operation_id);
          assert.deepEqual(args.p_state,saves[0].p_state);
        }else{
          assert.equal(args.p_expected_version,ledgerState.version);
          ledgerState={...ledgerState,...args.p_state,version:ledgerState.version+1};
        }
        return route.fulfill({json:{version:ledgerState.version}});
      });
      let requestedPdf=false;
      await workflow.route('**/api/invoices/*/pdf',route=>{
        assert.equal(new URL(route.request().url()).pathname,'/api/invoices/'+ledgerState.sales_invoices[0].id+'/pdf');
        assert.ok(route.request().headers().authorization?.startsWith('Bearer '));
        requestedPdf=true;
        return route.fulfill({contentType:'application/pdf',body:'%PDF-1.4\n% Synthetic transport response'});
      });
      await operator.reload();
      await operator.getByRole('button',{name:'الأقسام',exact:true}).last().click();
      await operator.locator('.section-tile').filter({has:operator.locator('.section-tile-title',{hasText:'فواتير الجملة'})}).click();
      await operator.getByRole('button',{name:'اختيار العميل',exact:true}).click();
      await operator.getByRole('dialog').getByRole('button',{name:/مقهى الاختبار/}).click();
      await operator.getByRole('button',{name:'إضافة توليفة',exact:true}).click();
      await operator.getByRole('dialog').getByRole('button',{name:/توليفة الاختبار/}).click();
      const quantity = operator.getByLabel('الكمية بالكيلو',{exact:true});
      await operator.getByRole('button',{name:'مراجعة الفاتورة',exact:true}).click();
      await operator.waitForFunction(()=>document.activeElement?.id.endsWith('-quantity'));
      assert.equal(await quantity.getAttribute('aria-invalid'),'true');
      await quantity.fill('٢');
      await operator.getByLabel('سعر الكيلو المتفق عليه',{exact:true}).fill('٣٣٣');
      await operator.getByRole('button',{name:'مراجعة الفاتورة',exact:true}).click();
      await operator.getByRole('button',{name:'اعتماد الفاتورة وخصم المخزون',exact:true}).click();
      const retry = operator.getByRole('button',{name:'إعادة محاولة الحفظ',exact:true});
      const confirm = operator.getByRole('button',{name:'اعتماد الفاتورة وخصم المخزون',exact:true});
      await retry.waitFor({state:'visible'});
      await retry.click();
      await confirm.click();
      const downloadPromise=operator.waitForEvent('download');
      await operator.getByRole('button',{name:'تنزيل الفاتورة PDF',exact:true}).click();
      assert.ok((await downloadPromise).suggestedFilename().endsWith('.pdf'));
      assert.equal(saves.length,2);
      assert.equal(ledgerState.sales_invoices.length,1);
      assert.equal(ledgerState.sales_invoices[0].totalAmount,666);
      assert.equal(ledgerState.items.find(item=>item.id===blend.id).stock,998);
      assert.equal(requestedPdf,true);
      const day='2026-11-01';
      rows[0].result={sha256:'a'.repeat(64),rows:[{metric:'Begun',businessDate:day,amount:'120.00'}]};
      rows[1].result={sha256:'b'.repeat(64),businessDate:day,rows:[{code:raw.code,quantity:'2',unit:'kg'}]};
      await operator.getByRole('button',{name:'إغلاق النافذة',exact:true}).click();
      await operator.getByRole('button',{name:'الأقسام',exact:true}).last().click();
      await operator.locator('.section-tile').filter({has:operator.locator('.section-tile-title',{hasText:'تقارير يوم الكاشير'})}).click();
      for(const row of rows){
        await operator.getByRole('article').filter({hasText:row.file_name}).getByRole('button',{name:'مراجعة التقرير'}).click();
        await operator.getByRole('heading',{name:'مراجعة '+row.file_name,exact:true}).waitFor();
        await operator.getByRole('button',{name:'حفظ التقرير لهذا اليوم',exact:true}).click();
        await operator.getByRole('heading',{name:'مراجعة '+row.file_name,exact:true}).waitFor({state:'hidden'});
      }
      await operator.getByRole('button',{name:'مراجعة واعتماد اليوم',exact:true}).click();
      await operator.getByRole('button',{name:'تأكيد الاعتماد وخصم الأصناف',exact:true}).click();
      await operator.getByRole('heading',{name:day+' — معتمد',exact:true}).waitFor();
      assert.equal(ledgerState.cashier_days.length,1);
      assert.equal(ledgerState.cashier_days[0].financialReport.totalRevenue,120);
      assert.equal(ledgerState.cashier_days[0].consumption[0].quantity,2);
      assert.equal(ledgerState.items.find(item=>item.id===raw.id).stock,998);
      evidence.skillWorkflows={cashierFiles:rows.length,duplicateRejected:true,cashierApproved:true,begun:120,
        cashierStockDeduction:2,receiptCount:1,invoiceTotal:666,pdfDownload:true,isolatedBrowserRoutes:true};
    } finally {
      await workflow.close();
    }
    const moneyFixture=fixture(0);
    moneyFixture.financial_openings=[{id:'opening',date:'2026-11-01',account:'treasury',amount:1000,priorPeriodSettled:true,history:[]}];
    moneyFixture.cashier_days=Array.from({length:4},(_,i)=>({id:'money-'+i,date:`2026-11-0${i+1}`,status:'pending',financialReport:{fileName:`day-${i}.csv`,sha256:String(i+1).repeat(64),uploadedAt:'2026-11-05T10:00:00Z',totalRevenue:(i+1)*100}}));
    await page.route('**/rest/v1/rpc/bon_erp_dashboard_v2',async route=>route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(projectRead(moneyFixture,'bon_erp_dashboard_v2',route.request().postDataJSON()))}));
    await page.getByRole('button',{name:'الرئيسية',exact:true}).click();
    // Sections and home share a cached dashboard; start a fresh document so the
    // isolated financial response is actually requested, with the same login.
    await page.reload();
    await page.getByText('بانتظار استكمال تكلفة الأصناف',{exact:true}).waitFor();
    const cashRegion=page.getByRole('region',{name:'رصيد أموال النشاط'});
    assert.ok((await cashRegion.innerText()).includes(new Intl.NumberFormat('ar-EG',{maximumFractionDigits:2}).format(2000)),'Opening plus financial receipts must be visible');
    assert.equal(await page.locator('.point-profit').count(),0,'Unknown cost must not produce zero-profit points');
    await limit(page,'financial-only-revenue-mobile');
    await page.screenshot({path:'design-financial-revenue-mobile.png',fullPage:true});evidence.financialOnlyRevenue=true;
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
