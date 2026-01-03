module.exports=[93695,(e,t,r)=>{t.exports=e.x("next/dist/shared/lib/no-fallback-error.external.js",()=>require("next/dist/shared/lib/no-fallback-error.external.js"))},70406,(e,t,r)=>{t.exports=e.x("next/dist/compiled/@opentelemetry/api",()=>require("next/dist/compiled/@opentelemetry/api"))},18622,(e,t,r)=>{t.exports=e.x("next/dist/compiled/next-server/app-page-turbo.runtime.prod.js",()=>require("next/dist/compiled/next-server/app-page-turbo.runtime.prod.js"))},56704,(e,t,r)=>{t.exports=e.x("next/dist/server/app-render/work-async-storage.external.js",()=>require("next/dist/server/app-render/work-async-storage.external.js"))},32319,(e,t,r)=>{t.exports=e.x("next/dist/server/app-render/work-unit-async-storage.external.js",()=>require("next/dist/server/app-render/work-unit-async-storage.external.js"))},24725,(e,t,r)=>{t.exports=e.x("next/dist/server/app-render/after-task-async-storage.external.js",()=>require("next/dist/server/app-render/after-task-async-storage.external.js"))},54799,(e,t,r)=>{t.exports=e.x("crypto",()=>require("crypto"))},60453,e=>{"use strict";var t=e.i(54799);async function r(e,r){let n=t.default.randomBytes(32),i=`${e}:${n.toString("hex")}`;return Buffer.from(i).toString("base64url")}function n(e){try{let[t]=Buffer.from(e,"base64url").toString("utf-8").split(":");if(!t)return null;return{listingId:t}}catch(e){return console.error("Error validating magic link:",e),null}}function i(e){return`https://agent.collectiverealtyco.com/seller/${e}`}async function o(e){let r=t.default.randomBytes(32),n=`${e}:${r.toString("hex")}`;return Buffer.from(n).toString("base64url")}function a(e){try{let[t]=Buffer.from(e,"base64url").toString("utf-8").split(":");if(!t)return null;return{formType:t}}catch(e){return console.error("Error validating form token:",e),null}}function s(e,t){return`https://agent.collectiverealtyco.com/forms/${t}/${e}`}e.s(["generateFormToken",()=>o,"generateMagicLink",()=>r,"getFormLinkUrl",()=>s,"getMagicLinkUrl",()=>i,"validateFormToken",()=>a,"validateMagicLink",()=>n])},85034,e=>{"use strict";var t=e.i(89660),r=e.i(60453);async function n(e,i,o=!1){let a=(0,t.createClient)(),s=null,l=null;o||(s=e.mls_link?null:await (0,r.generateFormToken)("pre-listing"),l=e.mls_link?await (0,r.generateFormToken)("just-listed"):null);let d=!1;if(i)try{let{data:e}=await a.from("users").select("preferred_first_name, preferred_last_name, first_name, last_name").eq("id",i).single();if(e){let t=`${e.preferred_first_name||e.first_name} ${e.preferred_last_name||e.last_name}`.toLowerCase();d=t.includes("courtney okanlomo")||t.includes("okanlomo")}}catch(e){console.error("Error checking agent name for listing:",e)}let{data:c,error:p}=await a.from("listings").insert({agent_id:i||null,agent_name:e.agent_name,property_address:e.property_address,transaction_type:e.transaction_type,mls_type:e.mls_type||null,client_names:e.client_names,client_phone:e.client_phone,client_email:e.client_email,lead_source:e.lead_source,mls_link:e.mls_link||null,estimated_launch_date:e.estimated_launch_date||null,status:e.mls_link?"active":"pre-listing",pre_listing_form_completed:!e.mls_link,just_listed_form_completed:!!e.mls_link,dotloop_file_created:e.dotloop_file_created,listing_input_requested:e.listing_input_requested,listing_input_paid:d,photography_requested:e.photography_requested,listing_input_fee:50,pre_listing_token:s,just_listed_token:l}).select().single();return p?(console.error("Error creating listing:",p),null):c}async function i(e){let r=(0,t.createClient)(),{data:n,error:i}=await r.from("listings").select("*").eq("id",e).single();return i?(console.error("Error fetching listing:",i),null):n}async function o(e,r){let n=(0,t.createClient)(),i={},o=["agent_id","agent_name","property_address","transaction_type","mls_type","client_names","client_phone","client_email","mls_link","estimated_launch_date","actual_launch_date","lead_source","status","listing_website_url","dotloop_file_created","photography_requested","listing_input_requested","co_listing_agent","is_broker_listing"];Object.keys(r).forEach(e=>{void 0!==r[e]&&o.includes(e)&&(i[e]=r[e])});let{error:a}=await n.from("listings").update({...i,updated_at:new Date().toISOString()}).eq("id",e);if(a){if(console.error("Error updating listing:",a),console.error("Update data:",i),console.error("Error details:",JSON.stringify(a,null,2)),console.error("Error message:",a.message),console.error("Error code:",a.code),console.error("Error hint:",a.hint),a.message&&a.message.includes("column")){let e=a.message.match(/column "([^"]+)"/);e&&console.error(`Missing column detected: ${e[1]}`)}return!1}return!0}e.s(["createListing",()=>n,"getListingById",()=>i,"updateListing",()=>o])},34999,e=>{"use strict";var t=e.i(89660),r=e.i(60453);async function n(e){let n=(0,t.createClient)(),i=await (0,r.generateMagicLink)(e.listing_id,e.seller_email),o=!1;try{let{data:t}=await n.from("users").select("preferred_first_name, preferred_last_name, first_name, last_name").eq("id",e.agent_id).single();if(t){let e=`${t.preferred_first_name||t.first_name} ${t.preferred_last_name||t.last_name}`.toLowerCase();o=e.includes("courtney okanlomo")||e.includes("okanlomo")}}catch(e){console.error("Error checking agent name:",e)}let a="broker_listing"===e.payment_method,s=!!a||!!o,l=a||o?new Date().toISOString().split("T")[0]:null,{data:d,error:c}=await n.from("listing_coordination").insert({listing_id:e.listing_id,agent_id:e.agent_id,seller_name:e.seller_name,seller_email:e.seller_email,service_fee:e.service_fee,start_date:e.start_date,is_active:!0,seller_magic_link:i,email_schedule_day:"monday",email_schedule_time:"18:00:00",payment_method:e.payment_method||null,payment_due_date:e.payment_due_date||null,service_paid:s,payment_date:l}).select().single();return c?(console.error("Error creating coordination:",c),null):d}async function i(e){let r=(0,t.createClient)(),{data:n,error:i}=await r.from("listing_coordination").select("*").eq("id",e).single();return i?(console.error("Error fetching coordination:",i),null):n}async function o(){let e=(0,t.createClient)(),{data:r,error:n}=await e.from("listing_coordination").select("*").eq("is_active",!0).order("created_at",{ascending:!1});return n?(console.error("Error fetching active coordinations:",n),[]):r||[]}async function a(e,r){let n=(0,t.createClient)(),{error:i}=await n.from("listing_coordination").update({...r,updated_at:new Date().toISOString()}).eq("id",e);return!i||(console.error("Error updating coordination:",i),!1)}async function s(e){return a(e,{is_active:!1,end_date:new Date().toISOString().split("T")[0]})}async function l(e){return a(e,{is_active:!0,end_date:null})}e.s(["createCoordination",()=>n,"deactivateCoordination",()=>s,"getAllActiveCoordinations",()=>o,"getCoordinationById",()=>i,"reactivateCoordination",()=>l,"updateCoordination",()=>a])},34138,e=>{"use strict";var t=e.i(46245),r=e.i(60453);let n=new t.Resend(process.env.RESEND_API_KEY),i="transactions@coachingbrokeragetools.com",o="Leah Parpan - Listing & Transaction Coordinator",a="tcandcompliance@collectiverealtyco.com",s="tcandcompliance@collectiverealtyco.com";async function l(e,t,l){try{let d=e.next_email_scheduled_for||null,c=function(e,t,n,i,o,a){let s=(0,r.getMagicLinkUrl)(e.seller_magic_link),l="every Monday at 6:00 PM";if(a){let e="string"==typeof a?new Date(a):a;if(!isNaN(e.getTime())){let t=e.toLocaleDateString("en-US",{weekday:"long"}),r=e.toLocaleTimeString("en-US",{hour:"numeric",minute:"2-digit",hour12:!0});l=`every ${t} at ${r}`}}return`
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
        <li>Weekly email updates ${l}</li>
        <li>Showing activity and agent feedback</li>
        <li>MLS property views and engagement</li>
        <li>Your listing featured in our weekly email to 7,000+ buyers and agents</li>
      </ul>
    </div>
    
    <div class="info-box">
      <h3>Your Listing Dashboard</h3>
      <p>Access your personalized dashboard anytime to view all reports, showing history, and listing details:</p>
      <p style="text-align: center;">
        <a href="${s}" class="button">Access Your Dashboard</a>
      </p>
      <p style="font-size: 12px; color: #666666;">Bookmark this link for easy access to your reports anytime.</p>
    </div>
    
    <div class="info-box">
      <h3>Your Team</h3>
      <p><strong>Listing Agent:</strong><br>
      ${n}<br>
      ${i}<br>
      ${o}</p>
      
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
  `}(e,t,l.name,l.email,l.phone,d),{data:p,error:u}=await n.emails.send({from:`${o} <${i}>`,to:e.seller_email,cc:[l.email],bcc:[s],replyTo:a,subject:`Collective Realty Co. - Welcome to Weekly Listing Coordination - ${t.property_address}`,html:c});if(u)return console.error("Error sending welcome email:",u),{success:!1,error:u.message};return{success:!0,emailId:p?.id}}catch(e){return console.error("Error sending welcome email:",e),{success:!1,error:e.message}}}async function d(e,t,l,d,c,p,u){try{let g,m=(g=(0,r.getMagicLinkUrl)(e.seller_magic_link),`
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
        <a href="${g}" class="button">Your Listing Dashboard</a>
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
  `),f={from:`${o} <${i}>`,to:e.seller_email,cc:[l],bcc:[s],replyTo:a,subject:`Collective Realty Co. - Weekly Report - ${t.property_address} | ${d}`,html:m};u&&(f.schedule=u.toISOString());let{data:_,error:y}=await n.emails.send(f);if(y)return console.error("Error sending weekly report email:",y),{success:!1,error:y.message};return{success:!0,emailId:_?.id}}catch(e){return console.error("Error sending weekly report email:",e),{success:!1,error:e.message}}}async function c({to:e,subject:t,html:r,cc:s}){try{let{data:l,error:d}=await n.emails.send({from:`${o} <${i}>`,to:Array.isArray(e)?e:[e],cc:s?Array.isArray(s)?s:[s]:void 0,replyTo:a,subject:t,html:r});if(d)return console.error("Error sending email:",d),{success:!1,error:d.message};return{success:!0,emailId:l?.id}}catch(e){return console.error("Error sending email:",e),{success:!1,error:e.message}}}e.s(["sendEmail",()=>c,"sendWeeklyReportEmail",()=>d,"sendWelcomeEmail",()=>l],34138)},37933,e=>{"use strict";var t=e.i(47909),r=e.i(74017),n=e.i(96250),i=e.i(59756),o=e.i(61916),a=e.i(74677),s=e.i(69741),l=e.i(16795),d=e.i(87718),c=e.i(95169),p=e.i(47587),u=e.i(66012),g=e.i(70101),m=e.i(26937),f=e.i(10372),_=e.i(93695);e.i(20232);var y=e.i(5232),h=e.i(89171),x=e.i(89660),v=e.i(85034),w=e.i(34999),b=e.i(34138);async function k(e){try{let t,r,n=(0,x.createClient)(),{coordination_id:i}=await e.json();if(!i)return h.NextResponse.json({error:"Coordination ID is required"},{status:400});let o=await (0,w.getCoordinationById)(i);if(!o)return h.NextResponse.json({error:"Coordination not found"},{status:404});let a=await (0,v.getListingById)(o.listing_id);if(!a)return h.NextResponse.json({error:"Listing not found"},{status:404});let s="";if(o.agent_id){let{data:e}=await n.from("users").select("email").eq("id",o.agent_id).single();e&&(s=e.email||"")}let{data:l}=await n.from("coordination_weekly_reports").select("*").eq("coordination_id",i).eq("email_sent",!1).order("week_start_date",{ascending:!1}).limit(1).single();l&&(t=l.report_file_url||void 0,r=l.report_file_url_2||void 0);let d=new Date().toLocaleDateString("en-US",{weekday:"long",month:"long",day:"numeric",year:"numeric"}),c=await (0,b.sendWeeklyReportEmail)(o,a,s,d,t,r);if(!c.success)return h.NextResponse.json({error:c.error||"Failed to send email"},{status:500});return await (0,w.updateCoordination)(i,{last_email_sent_at:new Date().toISOString(),total_emails_sent:(o.total_emails_sent||0)+1}),l&&await n.from("coordination_weekly_reports").update({email_sent:!0,email_sent_at:new Date().toISOString(),email_id:c.emailId}).eq("id",l.id),await n.from("coordination_email_history").insert({coordination_id:i,email_type:"weekly_report",recipient_email:o.seller_email,recipient_name:o.seller_name,subject:`Collective Realty Co. - Weekly Report - ${a.property_address} | ${d}`,resend_email_id:c.emailId||null,status:"sent",sent_at:new Date().toISOString(),weekly_report_id:l?.id||null}),h.NextResponse.json({success:!0,message:"Weekly report email sent successfully",emailId:c.emailId})}catch(e){return console.error("Error sending weekly report email:",e),h.NextResponse.json({error:e.message||"Failed to send weekly report email"},{status:500})}}e.s(["POST",()=>k],76836);var R=e.i(76836);let C=new t.AppRouteRouteModule({definition:{kind:r.RouteKind.APP_ROUTE,page:"/api/coordination/send-weekly-email/route",pathname:"/api/coordination/send-weekly-email",filename:"route",bundlePath:""},distDir:".next",relativeProjectDir:"",resolvedPagePath:"[project]/app/api/coordination/send-weekly-email/route.ts",nextConfigOutput:"",userland:R}),{workAsyncStorage:E,workUnitAsyncStorage:S,serverHooks:$}=C;function T(){return(0,n.patchFetch)({workAsyncStorage:E,workUnitAsyncStorage:S})}async function A(e,t,n){C.isDev&&(0,i.addRequestMeta)(e,"devRequestTimingInternalsEnd",process.hrtime.bigint());let h="/api/coordination/send-weekly-email/route";h=h.replace(/\/index$/,"")||"/";let x=await C.prepare(e,t,{srcPage:h,multiZoneDraftMode:!1});if(!x)return t.statusCode=400,t.end("Bad Request"),null==n.waitUntil||n.waitUntil.call(n,Promise.resolve()),null;let{buildId:v,params:w,nextConfig:b,parsedUrl:k,isDraftMode:R,prerenderManifest:E,routerServerContext:S,isOnDemandRevalidate:$,revalidateOnlyGenerated:T,resolvedPathname:A,clientReferenceManifest:q,serverActionsManifest:I}=x,L=(0,s.normalizeAppPath)(h),D=!!(E.dynamicRoutes[L]||E.routes[A]),O=async()=>((null==S?void 0:S.render404)?await S.render404(e,t,k,!1):t.end("This page could not be found"),null);if(D&&!R){let e=!!E.routes[A],t=E.dynamicRoutes[L];if(t&&!1===t.fallback&&!e){if(b.experimental.adapterPath)return await O();throw new _.NoFallbackError}}let P=null;!D||C.isDev||R||(P="/index"===(P=A)?"/":P);let N=!0===C.isDev||!D,j=D&&!N;I&&q&&(0,a.setManifestsSingleton)({page:h,clientReferenceManifest:q,serverActionsManifest:I});let M=e.method||"GET",U=(0,o.getTracer)(),W=U.getActiveScopeSpan(),H={params:w,prerenderManifest:E,renderOpts:{experimental:{authInterrupts:!!b.experimental.authInterrupts},cacheComponents:!!b.cacheComponents,supportsDynamicResponse:N,incrementalCache:(0,i.getRequestMeta)(e,"incrementalCache"),cacheLifeProfiles:b.cacheLife,waitUntil:n.waitUntil,onClose:e=>{t.on("close",e)},onAfterTaskError:void 0,onInstrumentationRequestError:(t,r,n,i)=>C.onRequestError(e,t,n,i,S)},sharedContext:{buildId:v}},z=new l.NodeNextRequest(e),B=new l.NodeNextResponse(t),F=d.NextRequestAdapter.fromNodeNextRequest(z,(0,d.signalFromNodeResponse)(t));try{let a=async e=>C.handle(F,H).finally(()=>{if(!e)return;e.setAttributes({"http.status_code":t.statusCode,"next.rsc":!1});let r=U.getRootSpanAttributes();if(!r)return;if(r.get("next.span_type")!==c.BaseServerSpan.handleRequest)return void console.warn(`Unexpected root span type '${r.get("next.span_type")}'. Please report this Next.js issue https://github.com/vercel/next.js`);let n=r.get("next.route");if(n){let t=`${M} ${n}`;e.setAttributes({"next.route":n,"http.route":n,"next.span_name":t}),e.updateName(t)}else e.updateName(`${M} ${h}`)}),s=!!(0,i.getRequestMeta)(e,"minimalMode"),l=async i=>{var o,l;let d=async({previousCacheEntry:r})=>{try{if(!s&&$&&T&&!r)return t.statusCode=404,t.setHeader("x-nextjs-cache","REVALIDATED"),t.end("This page could not be found"),null;let o=await a(i);e.fetchMetrics=H.renderOpts.fetchMetrics;let l=H.renderOpts.pendingWaitUntil;l&&n.waitUntil&&(n.waitUntil(l),l=void 0);let d=H.renderOpts.collectedTags;if(!D)return await (0,u.sendResponse)(z,B,o,H.renderOpts.pendingWaitUntil),null;{let e=await o.blob(),t=(0,g.toNodeOutgoingHttpHeaders)(o.headers);d&&(t[f.NEXT_CACHE_TAGS_HEADER]=d),!t["content-type"]&&e.type&&(t["content-type"]=e.type);let r=void 0!==H.renderOpts.collectedRevalidate&&!(H.renderOpts.collectedRevalidate>=f.INFINITE_CACHE)&&H.renderOpts.collectedRevalidate,n=void 0===H.renderOpts.collectedExpire||H.renderOpts.collectedExpire>=f.INFINITE_CACHE?void 0:H.renderOpts.collectedExpire;return{value:{kind:y.CachedRouteKind.APP_ROUTE,status:o.status,body:Buffer.from(await e.arrayBuffer()),headers:t},cacheControl:{revalidate:r,expire:n}}}}catch(t){throw(null==r?void 0:r.isStale)&&await C.onRequestError(e,t,{routerKind:"App Router",routePath:h,routeType:"route",revalidateReason:(0,p.getRevalidateReason)({isStaticGeneration:j,isOnDemandRevalidate:$})},!1,S),t}},c=await C.handleResponse({req:e,nextConfig:b,cacheKey:P,routeKind:r.RouteKind.APP_ROUTE,isFallback:!1,prerenderManifest:E,isRoutePPREnabled:!1,isOnDemandRevalidate:$,revalidateOnlyGenerated:T,responseGenerator:d,waitUntil:n.waitUntil,isMinimalMode:s});if(!D)return null;if((null==c||null==(o=c.value)?void 0:o.kind)!==y.CachedRouteKind.APP_ROUTE)throw Object.defineProperty(Error(`Invariant: app-route received invalid cache entry ${null==c||null==(l=c.value)?void 0:l.kind}`),"__NEXT_ERROR_CODE",{value:"E701",enumerable:!1,configurable:!0});s||t.setHeader("x-nextjs-cache",$?"REVALIDATED":c.isMiss?"MISS":c.isStale?"STALE":"HIT"),R&&t.setHeader("Cache-Control","private, no-cache, no-store, max-age=0, must-revalidate");let _=(0,g.fromNodeOutgoingHttpHeaders)(c.value.headers);return s&&D||_.delete(f.NEXT_CACHE_TAGS_HEADER),!c.cacheControl||t.getHeader("Cache-Control")||_.get("Cache-Control")||_.set("Cache-Control",(0,m.getCacheControlHeader)(c.cacheControl)),await (0,u.sendResponse)(z,B,new Response(c.value.body,{headers:_,status:c.value.status||200})),null};W?await l(W):await U.withPropagatedContext(e.headers,()=>U.trace(c.BaseServerSpan.handleRequest,{spanName:`${M} ${h}`,kind:o.SpanKind.SERVER,attributes:{"http.method":M,"http.target":e.url}},l))}catch(t){if(t instanceof _.NoFallbackError||await C.onRequestError(e,t,{routerKind:"App Router",routePath:L,routeType:"route",revalidateReason:(0,p.getRevalidateReason)({isStaticGeneration:j,isOnDemandRevalidate:$})},!1,S),D)throw t;return await (0,u.sendResponse)(z,B,new Response(null,{status:500})),null}}e.s(["handler",()=>A,"patchFetch",()=>T,"routeModule",()=>C,"serverHooks",()=>$,"workAsyncStorage",()=>E,"workUnitAsyncStorage",()=>S],37933)}];

//# sourceMappingURL=%5Broot-of-the-server%5D__3c3e8463._.js.map