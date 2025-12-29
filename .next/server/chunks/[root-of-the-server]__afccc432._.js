module.exports=[93695,(e,t,r)=>{t.exports=e.x("next/dist/shared/lib/no-fallback-error.external.js",()=>require("next/dist/shared/lib/no-fallback-error.external.js"))},70406,(e,t,r)=>{t.exports=e.x("next/dist/compiled/@opentelemetry/api",()=>require("next/dist/compiled/@opentelemetry/api"))},18622,(e,t,r)=>{t.exports=e.x("next/dist/compiled/next-server/app-page-turbo.runtime.prod.js",()=>require("next/dist/compiled/next-server/app-page-turbo.runtime.prod.js"))},56704,(e,t,r)=>{t.exports=e.x("next/dist/server/app-render/work-async-storage.external.js",()=>require("next/dist/server/app-render/work-async-storage.external.js"))},32319,(e,t,r)=>{t.exports=e.x("next/dist/server/app-render/work-unit-async-storage.external.js",()=>require("next/dist/server/app-render/work-unit-async-storage.external.js"))},24725,(e,t,r)=>{t.exports=e.x("next/dist/server/app-render/after-task-async-storage.external.js",()=>require("next/dist/server/app-render/after-task-async-storage.external.js"))},54799,(e,t,r)=>{t.exports=e.x("crypto",()=>require("crypto"))},60453,e=>{"use strict";var t=e.i(54799);async function r(e,r){let n=t.default.randomBytes(32),i=`${e}:${n.toString("hex")}`;return Buffer.from(i).toString("base64url")}function n(e){try{let[t]=Buffer.from(e,"base64url").toString("utf-8").split(":");if(!t)return null;return{listingId:t}}catch(e){return console.error("Error validating magic link:",e),null}}function i(e){return`https://agent.collectiverealtyco.com/seller/${e}`}async function o(e){let r=t.default.randomBytes(32),n=`${e}:${r.toString("hex")}`;return Buffer.from(n).toString("base64url")}function a(e){try{let[t]=Buffer.from(e,"base64url").toString("utf-8").split(":");if(!t)return null;return{formType:t}}catch(e){return console.error("Error validating form token:",e),null}}function s(e,t){return`https://agent.collectiverealtyco.com/forms/${t}/${e}`}e.s(["generateFormToken",()=>o,"generateMagicLink",()=>r,"getFormLinkUrl",()=>s,"getMagicLinkUrl",()=>i,"validateFormToken",()=>a,"validateMagicLink",()=>n])},85034,e=>{"use strict";var t=e.i(89660),r=e.i(60453);async function n(e,i,o=!1){let a=(0,t.createClient)(),s=null,l=null;o||(s=e.mls_link?null:await (0,r.generateFormToken)("pre-listing"),l=e.mls_link?await (0,r.generateFormToken)("just-listed"):null);let{data:c,error:d}=await a.from("listings").insert({agent_id:i||null,agent_name:e.agent_name,property_address:e.property_address,transaction_type:e.transaction_type,client_names:e.client_names,client_phone:e.client_phone,client_email:e.client_email,lead_source:e.lead_source,mls_link:e.mls_link||null,mls_login_info:e.mls_login_info||null,estimated_launch_date:e.estimated_launch_date||null,status:e.mls_link?"active":"pre-listing",pre_listing_form_completed:!e.mls_link,just_listed_form_completed:!!e.mls_link,dotloop_file_created:e.dotloop_file_created,listing_input_requested:e.listing_input_requested,photography_requested:e.photography_requested,listing_input_fee:50,pre_listing_token:s,just_listed_token:l}).select().single();return d?(console.error("Error creating listing:",d),null):c}async function i(e){let r=(0,t.createClient)(),{data:n,error:i}=await r.from("listings").select("*").eq("id",e).single();return i?(console.error("Error fetching listing:",i),null):n}async function o(e,r){let n=(0,t.createClient)(),{error:i}=await n.from("listings").update({...r,updated_at:new Date().toISOString()}).eq("id",e);return!i||(console.error("Error updating listing:",i),!1)}e.s(["createListing",()=>n,"getListingById",()=>i,"updateListing",()=>o])},34999,e=>{"use strict";var t=e.i(89660),r=e.i(60453);async function n(e){let n=(0,t.createClient)(),i=await (0,r.generateMagicLink)(e.listing_id,e.seller_email),o="broker_listing"===e.payment_method,a=o?new Date().toISOString().split("T")[0]:null,{data:s,error:l}=await n.from("listing_coordination").insert({listing_id:e.listing_id,agent_id:e.agent_id,seller_name:e.seller_name,seller_email:e.seller_email,service_fee:e.service_fee,start_date:e.start_date,is_active:!0,seller_magic_link:i,email_schedule_day:"monday",email_schedule_time:"18:00:00",payment_method:e.payment_method||null,payment_due_date:e.payment_due_date||null,service_paid:!!o,payment_date:a}).select().single();return l?(console.error("Error creating coordination:",l),null):s}async function i(e){let r=(0,t.createClient)(),{data:n,error:i}=await r.from("listing_coordination").select("*").eq("id",e).single();return i?(console.error("Error fetching coordination:",i),null):n}async function o(){let e=(0,t.createClient)(),{data:r,error:n}=await e.from("listing_coordination").select("*").eq("is_active",!0).order("created_at",{ascending:!1});return n?(console.error("Error fetching active coordinations:",n),[]):r||[]}async function a(e,r){let n=(0,t.createClient)(),{error:i}=await n.from("listing_coordination").update({...r,updated_at:new Date().toISOString()}).eq("id",e);return!i||(console.error("Error updating coordination:",i),!1)}async function s(e){return a(e,{is_active:!1,end_date:new Date().toISOString().split("T")[0]})}async function l(e){return a(e,{is_active:!0,end_date:null})}e.s(["createCoordination",()=>n,"deactivateCoordination",()=>s,"getAllActiveCoordinations",()=>o,"getCoordinationById",()=>i,"reactivateCoordination",()=>l,"updateCoordination",()=>a])},34138,e=>{"use strict";var t=e.i(46245),r=e.i(60453);let n=new t.Resend(process.env.RESEND_API_KEY),i="transactions@coachingbrokeragetools.com",o="Leah Parpan - Listing & Transaction Coordinator",a="tcandcompliance@collectiverealtyco.com",s="tcandcompliance@collectiverealtyco.com";async function l(e,t,l){try{var c,d,p;let u,g=(c=l.name,d=l.email,p=l.phone,u=(0,r.getMagicLinkUrl)(e.seller_magic_link),`
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
      ${c}<br>
      ${d}<br>
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
  `),{data:m,error:f}=await n.emails.send({from:`${o} <${i}>`,to:e.seller_email,cc:[l.email],bcc:[s],replyTo:a,subject:`Collective Realty Co. - Welcome to Weekly Listing Coordination - ${t.property_address}`,html:g});if(f)return console.error("Error sending welcome email:",f),{success:!1,error:f.message};return{success:!0,emailId:m?.id}}catch(e){return console.error("Error sending welcome email:",e),{success:!1,error:e.message}}}async function c(e,t,l,c,d,p){try{let u,g=(u=(0,r.getMagicLinkUrl)(e.seller_magic_link),`
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
    <p>Sent ${c}</p>
  </div>
  
  <div class="content">
    <p class="greeting">Hi ${e.seller_name},</p>
    
    <p>Your weekly activity report for <strong>${t.property_address}</strong> is ready.</p>
    
    ${d||p?`
    <div class="info-box">
      <h3>This Week's Reports</h3>
      <p style="text-align: center;">
        ${d?`<a href="${d}" class="button" style="margin: 5px;">Download Showing Report</a>`:""}
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
  `),{data:m,error:f}=await n.emails.send({from:`${o} <${i}>`,to:e.seller_email,cc:[l],bcc:[s],replyTo:a,subject:`Collective Realty Co. - Weekly Report - ${t.property_address} | ${c}`,html:g});if(f)return console.error("Error sending weekly report email:",f),{success:!1,error:f.message};return{success:!0,emailId:m?.id}}catch(e){return console.error("Error sending weekly report email:",e),{success:!1,error:e.message}}}async function d({to:e,subject:t,html:r,cc:s}){try{let{data:l,error:c}=await n.emails.send({from:`${o} <${i}>`,to:Array.isArray(e)?e:[e],cc:s?Array.isArray(s)?s:[s]:void 0,replyTo:a,subject:t,html:r});if(c)return console.error("Error sending email:",c),{success:!1,error:c.message};return{success:!0,emailId:l?.id}}catch(e){return console.error("Error sending email:",e),{success:!1,error:e.message}}}e.s(["sendEmail",()=>d,"sendWeeklyReportEmail",()=>c,"sendWelcomeEmail",()=>l],34138)},21734,e=>{"use strict";var t=e.i(89660);async function r(e){let r=(0,t.createClient)(),{data:n,error:i}=await r.from("service_configurations").select("*").eq("service_type",e).single();return i?(console.error("Error fetching service config:",i),null):n}async function n(e,r){let n=(0,t.createClient)(),{error:i}=await n.from("service_configurations").update({...r,updated_at:new Date().toISOString()}).eq("service_type",e);return!i||(console.error("Error updating service config:",i),!1)}e.s(["getServiceConfig",()=>r,"updateServiceConfig",()=>n])},36879,e=>{"use strict";var t=e.i(47909),r=e.i(74017),n=e.i(96250),i=e.i(59756),o=e.i(61916),a=e.i(74677),s=e.i(69741),l=e.i(16795),c=e.i(87718),d=e.i(95169),p=e.i(47587),u=e.i(66012),g=e.i(70101),m=e.i(26937),f=e.i(10372),_=e.i(93695);e.i(20232);var y=e.i(5232),h=e.i(89171),x=e.i(34999),v=e.i(85034),b=e.i(21734),w=e.i(6903),k=e.i(34138),C=e.i(89660);async function R(e){try{let t=(0,C.createClient)(),{listing_id:r,seller_name:n,seller_email:i,listing_website_url:o,agent_id:a,payment_method:s,custom_service_fee:l}=await e.json();if(!s)return h.NextResponse.json({error:"Payment method is required"},{status:400});if(0===l){if(!["client_direct","agent_pays","broker_listing"].includes(s))return h.NextResponse.json({error:"Invalid payment method for broker listing"},{status:400})}else if(!["client_direct","agent_pays"].includes(s))return h.NextResponse.json({error:"Valid payment method is required"},{status:400});let c=await (0,v.getListingById)(r);if(!c)return h.NextResponse.json({error:"Listing not found"},{status:404});let d=await (0,b.getServiceConfig)("listing_coordination"),p=void 0!==l?l:d?.price||250,u=null;if("agent_pays"===s){let e=new Date;e.setDate(e.getDate()+60),u=e.toISOString().split("T")[0]}let{sharingUrl:g}=await (0,w.createListingFolder)(c.property_address,r),m=await (0,x.createCoordination)({listing_id:r,agent_id:a,seller_name:n,seller_email:i,service_fee:p,start_date:new Date().toISOString().split("T")[0],payment_method:s,payment_due_date:u});if(!m)return h.NextResponse.json({error:"Failed to create coordination"},{status:500});await t.from("listing_coordination").update({onedrive_folder_url:g}).eq("id",m.id),o&&await (0,v.updateListing)(r,{listing_website_url:o});let{data:f}=await t.from("users").select("*").eq("id",a).single();if(f){let e=await (0,k.sendWelcomeEmail)(m,c,{name:f.preferred_first_name&&f.preferred_last_name?`${f.preferred_first_name} ${f.preferred_last_name}`:`${f.first_name} ${f.last_name}`,email:f.email,phone:f.business_phone||f.personal_phone||""});e.success?(await t.from("listing_coordination").update({welcome_email_sent:!0,welcome_email_sent_at:new Date().toISOString(),last_email_sent_at:new Date().toISOString(),total_emails_sent:1}).eq("id",m.id),await t.from("coordination_email_history").insert({coordination_id:m.id,email_type:"welcome",recipient_email:m.seller_email,recipient_name:m.seller_name,subject:`Collective Realty Co. - Welcome to Weekly Listing Coordination - ${c.property_address}`,resend_email_id:e.emailId||null,status:"sent",sent_at:new Date().toISOString()})):await t.from("coordination_email_history").insert({coordination_id:m.id,email_type:"welcome",recipient_email:m.seller_email,recipient_name:m.seller_name,subject:`Collective Realty Co. - Welcome to Weekly Listing Coordination - ${c.property_address}`,status:"failed",error_message:e.error||"Unknown error",sent_at:new Date().toISOString()})}return h.NextResponse.json({success:!0,coordination:m})}catch(e){return console.error("Error activating coordination:",e),h.NextResponse.json({error:e.message||"Failed to activate coordination"},{status:500})}}e.s(["POST",()=>R],65382);var E=e.i(65382);let S=new t.AppRouteRouteModule({definition:{kind:r.RouteKind.APP_ROUTE,page:"/api/coordination/activate/route",pathname:"/api/coordination/activate",filename:"route",bundlePath:""},distDir:".next",relativeProjectDir:"",resolvedPagePath:"[project]/app/api/coordination/activate/route.ts",nextConfigOutput:"",userland:E}),{workAsyncStorage:T,workUnitAsyncStorage:$,serverHooks:A}=S;function q(){return(0,n.patchFetch)({workAsyncStorage:T,workUnitAsyncStorage:$})}async function I(e,t,n){S.isDev&&(0,i.addRequestMeta)(e,"devRequestTimingInternalsEnd",process.hrtime.bigint());let h="/api/coordination/activate/route";h=h.replace(/\/index$/,"")||"/";let x=await S.prepare(e,t,{srcPage:h,multiZoneDraftMode:!1});if(!x)return t.statusCode=400,t.end("Bad Request"),null==n.waitUntil||n.waitUntil.call(n,Promise.resolve()),null;let{buildId:v,params:b,nextConfig:w,parsedUrl:k,isDraftMode:C,prerenderManifest:R,routerServerContext:E,isOnDemandRevalidate:T,revalidateOnlyGenerated:$,resolvedPathname:A,clientReferenceManifest:q,serverActionsManifest:I}=x,L=(0,s.normalizeAppPath)(h),D=!!(R.dynamicRoutes[L]||R.routes[A]),O=async()=>((null==E?void 0:E.render404)?await E.render404(e,t,k,!1):t.end("This page could not be found"),null);if(D&&!C){let e=!!R.routes[A],t=R.dynamicRoutes[L];if(t&&!1===t.fallback&&!e){if(w.experimental.adapterPath)return await O();throw new _.NoFallbackError}}let P=null;!D||S.isDev||C||(P="/index"===(P=A)?"/":P);let j=!0===S.isDev||!D,N=D&&!j;I&&q&&(0,a.setManifestsSingleton)({page:h,clientReferenceManifest:q,serverActionsManifest:I});let M=e.method||"GET",W=(0,o.getTracer)(),U=W.getActiveScopeSpan(),H={params:b,prerenderManifest:R,renderOpts:{experimental:{authInterrupts:!!w.experimental.authInterrupts},cacheComponents:!!w.cacheComponents,supportsDynamicResponse:j,incrementalCache:(0,i.getRequestMeta)(e,"incrementalCache"),cacheLifeProfiles:w.cacheLife,waitUntil:n.waitUntil,onClose:e=>{t.on("close",e)},onAfterTaskError:void 0,onInstrumentationRequestError:(t,r,n,i)=>S.onRequestError(e,t,n,i,E)},sharedContext:{buildId:v}},z=new l.NodeNextRequest(e),B=new l.NodeNextResponse(t),F=c.NextRequestAdapter.fromNodeNextRequest(z,(0,c.signalFromNodeResponse)(t));try{let a=async e=>S.handle(F,H).finally(()=>{if(!e)return;e.setAttributes({"http.status_code":t.statusCode,"next.rsc":!1});let r=W.getRootSpanAttributes();if(!r)return;if(r.get("next.span_type")!==d.BaseServerSpan.handleRequest)return void console.warn(`Unexpected root span type '${r.get("next.span_type")}'. Please report this Next.js issue https://github.com/vercel/next.js`);let n=r.get("next.route");if(n){let t=`${M} ${n}`;e.setAttributes({"next.route":n,"http.route":n,"next.span_name":t}),e.updateName(t)}else e.updateName(`${M} ${h}`)}),s=!!(0,i.getRequestMeta)(e,"minimalMode"),l=async i=>{var o,l;let c=async({previousCacheEntry:r})=>{try{if(!s&&T&&$&&!r)return t.statusCode=404,t.setHeader("x-nextjs-cache","REVALIDATED"),t.end("This page could not be found"),null;let o=await a(i);e.fetchMetrics=H.renderOpts.fetchMetrics;let l=H.renderOpts.pendingWaitUntil;l&&n.waitUntil&&(n.waitUntil(l),l=void 0);let c=H.renderOpts.collectedTags;if(!D)return await (0,u.sendResponse)(z,B,o,H.renderOpts.pendingWaitUntil),null;{let e=await o.blob(),t=(0,g.toNodeOutgoingHttpHeaders)(o.headers);c&&(t[f.NEXT_CACHE_TAGS_HEADER]=c),!t["content-type"]&&e.type&&(t["content-type"]=e.type);let r=void 0!==H.renderOpts.collectedRevalidate&&!(H.renderOpts.collectedRevalidate>=f.INFINITE_CACHE)&&H.renderOpts.collectedRevalidate,n=void 0===H.renderOpts.collectedExpire||H.renderOpts.collectedExpire>=f.INFINITE_CACHE?void 0:H.renderOpts.collectedExpire;return{value:{kind:y.CachedRouteKind.APP_ROUTE,status:o.status,body:Buffer.from(await e.arrayBuffer()),headers:t},cacheControl:{revalidate:r,expire:n}}}}catch(t){throw(null==r?void 0:r.isStale)&&await S.onRequestError(e,t,{routerKind:"App Router",routePath:h,routeType:"route",revalidateReason:(0,p.getRevalidateReason)({isStaticGeneration:N,isOnDemandRevalidate:T})},!1,E),t}},d=await S.handleResponse({req:e,nextConfig:w,cacheKey:P,routeKind:r.RouteKind.APP_ROUTE,isFallback:!1,prerenderManifest:R,isRoutePPREnabled:!1,isOnDemandRevalidate:T,revalidateOnlyGenerated:$,responseGenerator:c,waitUntil:n.waitUntil,isMinimalMode:s});if(!D)return null;if((null==d||null==(o=d.value)?void 0:o.kind)!==y.CachedRouteKind.APP_ROUTE)throw Object.defineProperty(Error(`Invariant: app-route received invalid cache entry ${null==d||null==(l=d.value)?void 0:l.kind}`),"__NEXT_ERROR_CODE",{value:"E701",enumerable:!1,configurable:!0});s||t.setHeader("x-nextjs-cache",T?"REVALIDATED":d.isMiss?"MISS":d.isStale?"STALE":"HIT"),C&&t.setHeader("Cache-Control","private, no-cache, no-store, max-age=0, must-revalidate");let _=(0,g.fromNodeOutgoingHttpHeaders)(d.value.headers);return s&&D||_.delete(f.NEXT_CACHE_TAGS_HEADER),!d.cacheControl||t.getHeader("Cache-Control")||_.get("Cache-Control")||_.set("Cache-Control",(0,m.getCacheControlHeader)(d.cacheControl)),await (0,u.sendResponse)(z,B,new Response(d.value.body,{headers:_,status:d.value.status||200})),null};U?await l(U):await W.withPropagatedContext(e.headers,()=>W.trace(d.BaseServerSpan.handleRequest,{spanName:`${M} ${h}`,kind:o.SpanKind.SERVER,attributes:{"http.method":M,"http.target":e.url}},l))}catch(t){if(t instanceof _.NoFallbackError||await S.onRequestError(e,t,{routerKind:"App Router",routePath:L,routeType:"route",revalidateReason:(0,p.getRevalidateReason)({isStaticGeneration:N,isOnDemandRevalidate:T})},!1,E),D)throw t;return await (0,u.sendResponse)(z,B,new Response(null,{status:500})),null}}e.s(["handler",()=>I,"patchFetch",()=>q,"routeModule",()=>S,"serverHooks",()=>A,"workAsyncStorage",()=>T,"workUnitAsyncStorage",()=>$],36879)}];

//# sourceMappingURL=%5Broot-of-the-server%5D__afccc432._.js.map