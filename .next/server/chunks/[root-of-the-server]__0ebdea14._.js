module.exports=[93695,(e,t,r)=>{t.exports=e.x("next/dist/shared/lib/no-fallback-error.external.js",()=>require("next/dist/shared/lib/no-fallback-error.external.js"))},70406,(e,t,r)=>{t.exports=e.x("next/dist/compiled/@opentelemetry/api",()=>require("next/dist/compiled/@opentelemetry/api"))},18622,(e,t,r)=>{t.exports=e.x("next/dist/compiled/next-server/app-page-turbo.runtime.prod.js",()=>require("next/dist/compiled/next-server/app-page-turbo.runtime.prod.js"))},56704,(e,t,r)=>{t.exports=e.x("next/dist/server/app-render/work-async-storage.external.js",()=>require("next/dist/server/app-render/work-async-storage.external.js"))},32319,(e,t,r)=>{t.exports=e.x("next/dist/server/app-render/work-unit-async-storage.external.js",()=>require("next/dist/server/app-render/work-unit-async-storage.external.js"))},24725,(e,t,r)=>{t.exports=e.x("next/dist/server/app-render/after-task-async-storage.external.js",()=>require("next/dist/server/app-render/after-task-async-storage.external.js"))},54799,(e,t,r)=>{t.exports=e.x("crypto",()=>require("crypto"))},60453,e=>{"use strict";var t=e.i(54799);async function r(e,r){let n=t.default.randomBytes(32),o=`${e}:${n.toString("hex")}`;return Buffer.from(o).toString("base64url")}function n(e){try{let[t]=Buffer.from(e,"base64url").toString("utf-8").split(":");if(!t)return null;return{listingId:t}}catch(e){return console.error("Error validating magic link:",e),null}}function o(e){return`https://agent.collectiverealtyco.com/seller/${e}`}async function i(e){let r=t.default.randomBytes(32),n=`${e}:${r.toString("hex")}`;return Buffer.from(n).toString("base64url")}function a(e){try{let[t]=Buffer.from(e,"base64url").toString("utf-8").split(":");if(!t)return null;return{formType:t}}catch(e){return console.error("Error validating form token:",e),null}}function s(e,t){return`https://agent.collectiverealtyco.com/forms/${t}/${e}`}e.s(["generateFormToken",()=>i,"generateMagicLink",()=>r,"getFormLinkUrl",()=>s,"getMagicLinkUrl",()=>o,"validateFormToken",()=>a,"validateMagicLink",()=>n])},85034,e=>{"use strict";var t=e.i(89660),r=e.i(60453);async function n(e,o,i=!1){let a=(0,t.createClient)(),s=null,l=null;i||(s=e.mls_link?null:await (0,r.generateFormToken)("pre-listing"),l=e.mls_link?await (0,r.generateFormToken)("just-listed"):null);let{data:d,error:c}=await a.from("listings").insert({agent_id:o||null,agent_name:e.agent_name,property_address:e.property_address,transaction_type:e.transaction_type,client_names:e.client_names,client_phone:e.client_phone,client_email:e.client_email,lead_source:e.lead_source,mls_link:e.mls_link||null,mls_login_info:e.mls_login_info||null,estimated_launch_date:e.estimated_launch_date||null,status:e.mls_link?"active":"pre-listing",pre_listing_form_completed:!e.mls_link,just_listed_form_completed:!!e.mls_link,dotloop_file_created:e.dotloop_file_created,listing_input_requested:e.listing_input_requested,photography_requested:e.photography_requested,listing_input_fee:50,pre_listing_token:s,just_listed_token:l}).select().single();return c?(console.error("Error creating listing:",c),null):d}async function o(e){let r=(0,t.createClient)(),{data:n,error:o}=await r.from("listings").select("*").eq("id",e).single();return o?(console.error("Error fetching listing:",o),null):n}async function i(e,r){let n=(0,t.createClient)(),{error:o}=await n.from("listings").update({...r,updated_at:new Date().toISOString()}).eq("id",e);return!o||(console.error("Error updating listing:",o),!1)}e.s(["createListing",()=>n,"getListingById",()=>o,"updateListing",()=>i])},34999,e=>{"use strict";var t=e.i(89660),r=e.i(60453);async function n(e){let n=(0,t.createClient)(),o=await (0,r.generateMagicLink)(e.listing_id,e.seller_email),i="broker_listing"===e.payment_method,a=i?new Date().toISOString().split("T")[0]:null,{data:s,error:l}=await n.from("listing_coordination").insert({listing_id:e.listing_id,agent_id:e.agent_id,seller_name:e.seller_name,seller_email:e.seller_email,service_fee:e.service_fee,start_date:e.start_date,is_active:!0,seller_magic_link:o,email_schedule_day:"monday",email_schedule_time:"18:00:00",payment_method:e.payment_method||null,payment_due_date:e.payment_due_date||null,service_paid:!!i,payment_date:a}).select().single();return l?(console.error("Error creating coordination:",l),null):s}async function o(e){let r=(0,t.createClient)(),{data:n,error:o}=await r.from("listing_coordination").select("*").eq("id",e).single();return o?(console.error("Error fetching coordination:",o),null):n}async function i(){let e=(0,t.createClient)(),{data:r,error:n}=await e.from("listing_coordination").select("*").eq("is_active",!0).order("created_at",{ascending:!1});return n?(console.error("Error fetching active coordinations:",n),[]):r||[]}async function a(e,r){let n=(0,t.createClient)(),{error:o}=await n.from("listing_coordination").update({...r,updated_at:new Date().toISOString()}).eq("id",e);return!o||(console.error("Error updating coordination:",o),!1)}async function s(e){return a(e,{is_active:!1,end_date:new Date().toISOString().split("T")[0]})}async function l(e){return a(e,{is_active:!0,end_date:null})}e.s(["createCoordination",()=>n,"deactivateCoordination",()=>s,"getAllActiveCoordinations",()=>i,"getCoordinationById",()=>o,"reactivateCoordination",()=>l,"updateCoordination",()=>a])},34138,e=>{"use strict";var t=e.i(46245),r=e.i(60453);let n=new t.Resend(process.env.RESEND_API_KEY),o="transactions@coachingbrokeragetools.com",i="Leah Parpan - Listing & Transaction Coordinator",a="tcandcompliance@collectiverealtyco.com",s="tcandcompliance@collectiverealtyco.com";async function l(e,t,l){try{var d,c,p;let u,g=(d=l.name,c=l.email,p=l.phone,u=(0,r.getMagicLinkUrl)(e.seller_magic_link),`
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <style>
    body {
      font-family: 'Montserrat', 'Trebuchet MS', Arial, sans-serif;
      line-height: 1.6;
      color: #333333;
      max-width: 600px;
      margin: 0 auto;
      padding: 20px;
    }
    .header {
      background-color: #2d2d2d;
      color: #ffffff;
      padding: 30px 20px;
      text-align: center;
      border-radius: 8px 8px 0 0;
    }
    .header h1 {
      margin: 0;
      font-size: 22px;
      font-weight: 500;
      letter-spacing: 0.05em;
    }
    .content {
      background-color: #ffffff;
      padding: 30px 20px;
      border: 1px solid #cccccc;
      border-top: none;
      border-radius: 0 0 8px 8px;
    }
    .greeting {
      font-size: 16px;
      margin-bottom: 20px;
    }
    .info-box {
      background-color: #f8f8f8;
      padding: 20px;
      border-radius: 4px;
      margin: 20px 0;
    }
    .info-box h3 {
      margin-top: 0;
      font-size: 14px;
      font-weight: 600;
      color: #C9A961;
    }
    .info-box p {
      margin: 8px 0;
      font-size: 14px;
    }
    .button {
      display: inline-block;
      padding: 12px 30px;
      background-color: #000000;
      color: #ffffff !important;
      text-decoration: none;
      border-radius: 4px;
      font-size: 14px;
      font-weight: 500;
      margin: 20px 0;
    }
    .footer {
      margin-top: 30px;
      padding-top: 20px;
      border-top: 1px solid #cccccc;
      font-size: 12px;
      color: #666666;
      text-align: center;
    }
    ul {
      margin: 10px 0;
      padding-left: 20px;
    }
    li {
      margin: 8px 0;
      font-size: 14px;
    }
  </style>
</head>
<body>
  <div class="header">
    <h1>Welcome to Weekly Listing Coordination</h1>
  </div>
  
  <div class="content">
    <p class="greeting">Hi ${e.seller_name},</p>
    
    <p>Welcome to Collective Realty Co.'s Weekly Listing Coordination service for your property at <strong>${t.property_address}</strong>!</p>
    
    <p>We're excited to keep you informed every step of the way as we market your home.</p>
    
    <div class="info-box">
      <h3>What to Expect</h3>
      <ul>
        <li>Weekly email updates every Monday at 6:00 PM</li>
        <li>Showing activity and agent feedback</li>
        <li>MLS property views and engagement</li>
        <li>Your listing featured in our weekly email to 7,000+ buyers and agents</li>
      </ul>
    </div>
    
    <div class="info-box">
      <h3>Your Listing Dashboard</h3>
      <p>Access your personalized dashboard anytime to view all reports, showing history, and listing details:</p>
      <p style="text-align: center;">
        <a href="${u}" class="button">Access Your Dashboard</a>
      </p>
      <p style="font-size: 12px; color: #666666;">Bookmark this link for easy access to your reports anytime.</p>
    </div>
    
    <div class="info-box">
      <h3>Your Team</h3>
      <p><strong>Listing Agent:</strong><br>
      ${d}<br>
      ${c}<br>
      ${p}</p>
      
      <p style="margin-top: 15px;"><strong>Listing & Transaction Coordinator:</strong><br>
      Leah Parpan<br>
      transactions@coachingbrokeragetools.com<br>
      (281) 638-9416</p>
    </div>
    
    <p>If you have any questions, feel free to reach out to your listing agent or our coordination team.</p>
    
    <p>We look forward to keeping you updated on your listing's progress!</p>
    
    <p style="margin-top: 30px;">Best regards,<br>
    <strong>Leah Parpan</strong><br>
    Listing & Transaction Coordinator<br>
    Collective Realty Co.</p>
  </div>
  
  <div class="footer">
    <p>Collective Realty Co. | Professional Real Estate Services</p>
  </div>
</body>
</html>
  `),{data:m,error:f}=await n.emails.send({from:`${i} <${o}>`,to:e.seller_email,cc:[l.email],bcc:[s],replyTo:a,subject:`Collective Realty Co. - Welcome to Weekly Listing Coordination - ${t.property_address}`,html:g});if(f)return console.error("Error sending welcome email:",f),{success:!1,error:f.message};return{success:!0,emailId:m?.id}}catch(e){return console.error("Error sending welcome email:",e),{success:!1,error:e.message}}}async function d(e,t,l,d,c,p){try{let u,g=(u=(0,r.getMagicLinkUrl)(e.seller_magic_link),`
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <style>
    body {
      font-family: 'Montserrat', 'Trebuchet MS', Arial, sans-serif;
      line-height: 1.6;
      color: #333333;
      max-width: 600px;
      margin: 0 auto;
      padding: 20px;
    }
    .header {
      background-color: #2d2d2d;
      color: #ffffff;
      padding: 30px 20px;
      text-align: center;
      border-radius: 8px 8px 0 0;
    }
    .header h1 {
      margin: 0;
      font-size: 22px;
      font-weight: 500;
      letter-spacing: 0.05em;
    }
    .header p {
      margin: 10px 0 0 0;
      font-size: 14px;
      color: #cccccc;
    }
    .content {
      background-color: #ffffff;
      padding: 30px 20px;
      border: 1px solid #cccccc;
      border-top: none;
      border-radius: 0 0 8px 8px;
    }
    .greeting {
      font-size: 16px;
      margin-bottom: 20px;
    }
    .info-box {
      background-color: #f8f8f8;
      padding: 20px;
      border-radius: 4px;
      margin: 20px 0;
    }
    .button {
      display: inline-block;
      padding: 12px 30px;
      background-color: #000000;
      color: #ffffff !important;
      text-decoration: none;
      border-radius: 4px;
      font-size: 14px;
      font-weight: 500;
      margin: 10px 0;
    }
    .dashboard-link {
      background-color: #f8f8f8;
      padding: 15px;
      border-radius: 4px;
      text-align: center;
      margin: 20px 0;
      border: 1px solid #cccccc;
    }
    .footer {
      margin-top: 30px;
      padding-top: 20px;
      border-top: 1px solid #cccccc;
      font-size: 12px;
      color: #666666;
      text-align: center;
    }
  </style>
</head>
<body>
  <div class="header">
    <h1>Weekly Listing Report</h1>
    <p>${t.property_address}</p>
    <p>Sent ${d}</p>
  </div>
  
  <div class="content">
    <p class="greeting">Hi ${e.seller_name},</p>
    
    <p>Your weekly activity report for <strong>${t.property_address}</strong> is ready.</p>
    
    ${c||p?`
    <div class="info-box">
      <h3>This Week's Reports</h3>
      <p style="text-align: center;">
        ${c?`<a href="${c}" class="button" style="margin: 5px;">Download Showing Report</a>`:""}
        ${p?`<a href="${p}" class="button" style="margin: 5px;">Download Traffic Report</a>`:""}
      </p>
    </div>
    `:""}
    
    <div class="dashboard-link">
      <p style="margin: 0 0 10px 0; font-size: 14px; font-weight: 600;">Access Your Dashboard</p>
      <p style="margin: 0; font-size: 12px; color: #666666;">View all your reports and listing details anytime:</p>
      <p style="margin: 15px 0 0 0;">
        <a href="${u}" class="button">Your Listing Dashboard</a>
      </p>
      <p style="margin: 10px 0 0 0; font-size: 11px; color: #999999;">This link remains active as long as your listing coordination service is active.</p>
    </div>
    
    <p>If you have any questions about this week's activity or your listing, please don't hesitate to reach out to your listing agent.</p>
    
    <p style="margin-top: 30px;">Best regards,<br>
    <strong>Leah Parpan</strong><br>
    Listing & Transaction Coordinator<br>
    Collective Realty Co.<br>
    (281) 638-9416</p>
  </div>
  
  <div class="footer">
    <p>Collective Realty Co. | Professional Real Estate Services</p>
  </div>
</body>
</html>
  `),{data:m,error:f}=await n.emails.send({from:`${i} <${o}>`,to:e.seller_email,cc:[l],bcc:[s],replyTo:a,subject:`Collective Realty Co. - Weekly Report - ${t.property_address} | ${d}`,html:g});if(f)return console.error("Error sending weekly report email:",f),{success:!1,error:f.message};return{success:!0,emailId:m?.id}}catch(e){return console.error("Error sending weekly report email:",e),{success:!1,error:e.message}}}async function c({to:e,subject:t,html:r,cc:s}){try{let{data:l,error:d}=await n.emails.send({from:`${i} <${o}>`,to:Array.isArray(e)?e:[e],cc:s?Array.isArray(s)?s:[s]:void 0,replyTo:a,subject:t,html:r});if(d)return console.error("Error sending email:",d),{success:!1,error:d.message};return{success:!0,emailId:l?.id}}catch(e){return console.error("Error sending email:",e),{success:!1,error:e.message}}}e.s(["sendEmail",()=>c,"sendWeeklyReportEmail",()=>d,"sendWelcomeEmail",()=>l],34138)},94331,e=>{"use strict";var t=e.i(47909),r=e.i(74017),n=e.i(96250),o=e.i(59756),i=e.i(61916),a=e.i(74677),s=e.i(69741),l=e.i(16795),d=e.i(87718),c=e.i(95169),p=e.i(47587),u=e.i(66012),g=e.i(70101),m=e.i(26937),f=e.i(10372),y=e.i(93695);e.i(20232);var h=e.i(5232),_=e.i(89171),x=e.i(34999),v=e.i(85034),w=e.i(34138),b=e.i(89660);async function k(e){try{if(e.headers.get("authorization")!==`Bearer ${process.env.CRON_SECRET}`)return _.NextResponse.json({error:"Unauthorized"},{status:401});let t=(0,b.createClient)(),r=await (0,x.getAllActiveCoordinations)(),n={total:r.length,sent:0,failed:0,errors:[]},o=new Date().toLocaleDateString("en-US",{weekday:"long",month:"long",day:"numeric",year:"numeric"});for(let e of r)try{let r,i,a=await (0,v.getListingById)(e.listing_id);if(!a){n.errors.push(`Listing not found for coordination ${e.id}`),n.failed++;continue}let{data:s}=await t.from("users").select("email").eq("id",e.agent_id).single();if(!s){n.errors.push(`Agent not found for coordination ${e.id}`),n.failed++;continue}let l=null;try{let{data:n}=await t.from("coordination_weekly_reports").select("*").eq("coordination_id",e.id).eq("email_sent",!1).order("week_start_date",{ascending:!1}).limit(1).single();n&&(r=(l=n).report_file_url||void 0,i=l.report_file_url_2||void 0)}catch(e){console.error(`Error getting report for ${a.property_address}:`,e)}let d=await (0,w.sendWeeklyReportEmail)(e,a,s.email,o,r,i);d.success?(await (0,x.updateCoordination)(e.id,{last_email_sent_at:new Date().toISOString(),total_emails_sent:e.total_emails_sent+1}),l&&await t.from("coordination_weekly_reports").update({email_sent:!0,email_sent_at:new Date().toISOString(),email_id:d.emailId}).eq("id",l.id),await t.from("coordination_email_history").insert({coordination_id:e.id,email_type:"weekly_report",recipient_email:e.seller_email,recipient_name:e.seller_name,subject:`Collective Realty Co. - Weekly Report - ${a.property_address} | ${o}`,resend_email_id:d.emailId||null,status:"sent",sent_at:new Date().toISOString(),weekly_report_id:l?.id||null}),n.sent++):(await t.from("coordination_email_history").insert({coordination_id:e.id,email_type:"weekly_report",recipient_email:e.seller_email,recipient_name:e.seller_name,subject:`Collective Realty Co. - Weekly Report - ${a.property_address} | ${o}`,status:"failed",error_message:d.error||"Unknown error",sent_at:new Date().toISOString()}),n.errors.push(`Failed to send email for ${a.property_address}: ${d.error}`),n.failed++)}catch(t){n.errors.push(`Error processing coordination ${e.id}: ${t.message}`),n.failed++}return _.NextResponse.json({success:!0,results:n})}catch(e){return console.error("Error in weekly reports cron:",e),_.NextResponse.json({error:e.message||"Failed to send weekly reports"},{status:500})}}e.s(["GET",()=>k],93263);var R=e.i(93263);let C=new t.AppRouteRouteModule({definition:{kind:r.RouteKind.APP_ROUTE,page:"/api/cron/send-weekly-reports/route",pathname:"/api/cron/send-weekly-reports",filename:"route",bundlePath:""},distDir:".next",relativeProjectDir:"",resolvedPagePath:"[project]/app/api/cron/send-weekly-reports/route.ts",nextConfigOutput:"",userland:R}),{workAsyncStorage:E,workUnitAsyncStorage:S,serverHooks:$}=C;function T(){return(0,n.patchFetch)({workAsyncStorage:E,workUnitAsyncStorage:S})}async function A(e,t,n){C.isDev&&(0,o.addRequestMeta)(e,"devRequestTimingInternalsEnd",process.hrtime.bigint());let _="/api/cron/send-weekly-reports/route";_=_.replace(/\/index$/,"")||"/";let x=await C.prepare(e,t,{srcPage:_,multiZoneDraftMode:!1});if(!x)return t.statusCode=400,t.end("Bad Request"),null==n.waitUntil||n.waitUntil.call(n,Promise.resolve()),null;let{buildId:v,params:w,nextConfig:b,parsedUrl:k,isDraftMode:R,prerenderManifest:E,routerServerContext:S,isOnDemandRevalidate:$,revalidateOnlyGenerated:T,resolvedPathname:A,clientReferenceManifest:q,serverActionsManifest:I}=x,L=(0,s.normalizeAppPath)(_),P=!!(E.dynamicRoutes[L]||E.routes[A]),D=async()=>((null==S?void 0:S.render404)?await S.render404(e,t,k,!1):t.end("This page could not be found"),null);if(P&&!R){let e=!!E.routes[A],t=E.dynamicRoutes[L];if(t&&!1===t.fallback&&!e){if(b.experimental.adapterPath)return await D();throw new y.NoFallbackError}}let O=null;!P||C.isDev||R||(O="/index"===(O=A)?"/":O);let N=!0===C.isDev||!P,j=P&&!N;I&&q&&(0,a.setManifestsSingleton)({page:_,clientReferenceManifest:q,serverActionsManifest:I});let M=e.method||"GET",U=(0,i.getTracer)(),z=U.getActiveScopeSpan(),W={params:w,prerenderManifest:E,renderOpts:{experimental:{authInterrupts:!!b.experimental.authInterrupts},cacheComponents:!!b.cacheComponents,supportsDynamicResponse:N,incrementalCache:(0,o.getRequestMeta)(e,"incrementalCache"),cacheLifeProfiles:b.cacheLife,waitUntil:n.waitUntil,onClose:e=>{t.on("close",e)},onAfterTaskError:void 0,onInstrumentationRequestError:(t,r,n,o)=>C.onRequestError(e,t,n,o,S)},sharedContext:{buildId:v}},H=new l.NodeNextRequest(e),B=new l.NodeNextResponse(t),F=d.NextRequestAdapter.fromNodeNextRequest(H,(0,d.signalFromNodeResponse)(t));try{let a=async e=>C.handle(F,W).finally(()=>{if(!e)return;e.setAttributes({"http.status_code":t.statusCode,"next.rsc":!1});let r=U.getRootSpanAttributes();if(!r)return;if(r.get("next.span_type")!==c.BaseServerSpan.handleRequest)return void console.warn(`Unexpected root span type '${r.get("next.span_type")}'. Please report this Next.js issue https://github.com/vercel/next.js`);let n=r.get("next.route");if(n){let t=`${M} ${n}`;e.setAttributes({"next.route":n,"http.route":n,"next.span_name":t}),e.updateName(t)}else e.updateName(`${M} ${_}`)}),s=!!(0,o.getRequestMeta)(e,"minimalMode"),l=async o=>{var i,l;let d=async({previousCacheEntry:r})=>{try{if(!s&&$&&T&&!r)return t.statusCode=404,t.setHeader("x-nextjs-cache","REVALIDATED"),t.end("This page could not be found"),null;let i=await a(o);e.fetchMetrics=W.renderOpts.fetchMetrics;let l=W.renderOpts.pendingWaitUntil;l&&n.waitUntil&&(n.waitUntil(l),l=void 0);let d=W.renderOpts.collectedTags;if(!P)return await (0,u.sendResponse)(H,B,i,W.renderOpts.pendingWaitUntil),null;{let e=await i.blob(),t=(0,g.toNodeOutgoingHttpHeaders)(i.headers);d&&(t[f.NEXT_CACHE_TAGS_HEADER]=d),!t["content-type"]&&e.type&&(t["content-type"]=e.type);let r=void 0!==W.renderOpts.collectedRevalidate&&!(W.renderOpts.collectedRevalidate>=f.INFINITE_CACHE)&&W.renderOpts.collectedRevalidate,n=void 0===W.renderOpts.collectedExpire||W.renderOpts.collectedExpire>=f.INFINITE_CACHE?void 0:W.renderOpts.collectedExpire;return{value:{kind:h.CachedRouteKind.APP_ROUTE,status:i.status,body:Buffer.from(await e.arrayBuffer()),headers:t},cacheControl:{revalidate:r,expire:n}}}}catch(t){throw(null==r?void 0:r.isStale)&&await C.onRequestError(e,t,{routerKind:"App Router",routePath:_,routeType:"route",revalidateReason:(0,p.getRevalidateReason)({isStaticGeneration:j,isOnDemandRevalidate:$})},!1,S),t}},c=await C.handleResponse({req:e,nextConfig:b,cacheKey:O,routeKind:r.RouteKind.APP_ROUTE,isFallback:!1,prerenderManifest:E,isRoutePPREnabled:!1,isOnDemandRevalidate:$,revalidateOnlyGenerated:T,responseGenerator:d,waitUntil:n.waitUntil,isMinimalMode:s});if(!P)return null;if((null==c||null==(i=c.value)?void 0:i.kind)!==h.CachedRouteKind.APP_ROUTE)throw Object.defineProperty(Error(`Invariant: app-route received invalid cache entry ${null==c||null==(l=c.value)?void 0:l.kind}`),"__NEXT_ERROR_CODE",{value:"E701",enumerable:!1,configurable:!0});s||t.setHeader("x-nextjs-cache",$?"REVALIDATED":c.isMiss?"MISS":c.isStale?"STALE":"HIT"),R&&t.setHeader("Cache-Control","private, no-cache, no-store, max-age=0, must-revalidate");let y=(0,g.fromNodeOutgoingHttpHeaders)(c.value.headers);return s&&P||y.delete(f.NEXT_CACHE_TAGS_HEADER),!c.cacheControl||t.getHeader("Cache-Control")||y.get("Cache-Control")||y.set("Cache-Control",(0,m.getCacheControlHeader)(c.cacheControl)),await (0,u.sendResponse)(H,B,new Response(c.value.body,{headers:y,status:c.value.status||200})),null};z?await l(z):await U.withPropagatedContext(e.headers,()=>U.trace(c.BaseServerSpan.handleRequest,{spanName:`${M} ${_}`,kind:i.SpanKind.SERVER,attributes:{"http.method":M,"http.target":e.url}},l))}catch(t){if(t instanceof y.NoFallbackError||await C.onRequestError(e,t,{routerKind:"App Router",routePath:L,routeType:"route",revalidateReason:(0,p.getRevalidateReason)({isStaticGeneration:j,isOnDemandRevalidate:$})},!1,S),P)throw t;return await (0,u.sendResponse)(H,B,new Response(null,{status:500})),null}}e.s(["handler",()=>A,"patchFetch",()=>T,"routeModule",()=>C,"serverHooks",()=>$,"workAsyncStorage",()=>E,"workUnitAsyncStorage",()=>S],94331)}];

//# sourceMappingURL=%5Broot-of-the-server%5D__0ebdea14._.js.map