module.exports=[93695,(e,t,r)=>{t.exports=e.x("next/dist/shared/lib/no-fallback-error.external.js",()=>require("next/dist/shared/lib/no-fallback-error.external.js"))},70406,(e,t,r)=>{t.exports=e.x("next/dist/compiled/@opentelemetry/api",()=>require("next/dist/compiled/@opentelemetry/api"))},18622,(e,t,r)=>{t.exports=e.x("next/dist/compiled/next-server/app-page-turbo.runtime.prod.js",()=>require("next/dist/compiled/next-server/app-page-turbo.runtime.prod.js"))},56704,(e,t,r)=>{t.exports=e.x("next/dist/server/app-render/work-async-storage.external.js",()=>require("next/dist/server/app-render/work-async-storage.external.js"))},32319,(e,t,r)=>{t.exports=e.x("next/dist/server/app-render/work-unit-async-storage.external.js",()=>require("next/dist/server/app-render/work-unit-async-storage.external.js"))},24725,(e,t,r)=>{t.exports=e.x("next/dist/server/app-render/after-task-async-storage.external.js",()=>require("next/dist/server/app-render/after-task-async-storage.external.js"))},54799,(e,t,r)=>{t.exports=e.x("crypto",()=>require("crypto"))},60453,e=>{"use strict";var t=e.i(54799);async function r(e,r){let n=t.default.randomBytes(32),i=`${e}:${n.toString("hex")}`;return Buffer.from(i).toString("base64url")}function n(e){try{let[t]=Buffer.from(e,"base64url").toString("utf-8").split(":");if(!t)return null;return{listingId:t}}catch(e){return console.error("Error validating magic link:",e),null}}function i(e){return`http://localhost:3000/seller/${e}`}async function a(e){let r=t.default.randomBytes(32),n=`${e}:${r.toString("hex")}`;return Buffer.from(n).toString("base64url")}function o(e){try{let[t]=Buffer.from(e,"base64url").toString("utf-8").split(":");if(!t)return null;return{formType:t}}catch(e){return console.error("Error validating form token:",e),null}}function s(e,t){return`http://localhost:3000/forms/${t}/${e}`}e.s(["generateFormToken",()=>a,"generateMagicLink",()=>r,"getFormLinkUrl",()=>s,"getMagicLinkUrl",()=>i,"validateFormToken",()=>o,"validateMagicLink",()=>n])},85034,e=>{"use strict";var t=e.i(89660),r=e.i(60453);async function n(e,i,a=!1){let o=(0,t.createClient)(),s=null,l=null;a||(s=e.mls_link?null:await (0,r.generateFormToken)("pre-listing"),l=e.mls_link?await (0,r.generateFormToken)("just-listed"):null);let c=!1;if(i)try{let{data:e}=await o.from("users").select("preferred_first_name, preferred_last_name, first_name, last_name").eq("id",i).single();if(e){let t=`${e.preferred_first_name||e.first_name} ${e.preferred_last_name||e.last_name}`.toLowerCase();c=t.includes("courtney okanlomo")||t.includes("okanlomo")}}catch(e){console.error("Error checking agent name for listing:",e)}let{data:d,error:p}=await o.from("transactions").insert({property_address:e.property_address,transaction_type:e.transaction_type,mls_type:e.mls_type||null,mls_link:e.mls_link||null,lead_source:e.lead_source,listing_date:e.estimated_launch_date||null,status:e.mls_link?"active":"pre-listing",pre_listing_form_completed:!e.mls_link,just_listed_form_completed:!!e.mls_link,dotloop_file_created:e.dotloop_file_created,listing_input_requested:e.listing_input_requested,listing_input_paid:c,photography_requested:e.photography_requested,listing_input_fee:50,pre_listing_token:s,just_listed_token:l,compliance_status:"not_submitted",cda_status:"pending_compliance"}).select().single();if(p)return console.error("Error creating transaction:",p),null;if(i){let{error:t}=await o.from("transaction_internal_agents").insert({transaction_id:d.id,agent_id:i,agent_role:(e.transaction_type,"listing_agent"),payment_status:"pending"});t&&console.error("Error adding agent to transaction:",t)}if(e.client_names||e.client_phone||e.client_email){let t="lease"===e.transaction_type?"landlord":"seller",{error:r}=await o.from("transaction_contacts").insert({transaction_id:d.id,contact_type:t,name:e.client_names||null,phone:e.client_phone||null,email:e.client_email||null});r&&console.error("Error adding contact to transaction:",r)}return d}async function i(e){let r=(0,t.createClient)(),{data:n,error:i}=await r.from("transactions").select("*").eq("id",e).single();return i?(console.error("Error fetching transaction:",i),null):n}async function a(e,r){let n=(0,t.createClient)(),i={},a=["property_address","transaction_type","mls_type","mls_link","listing_date","lead_source","status","listing_website_url","dotloop_file_created","photography_requested","listing_input_requested","compliance_status","cda_status","funding_status"];Object.keys(r).forEach(e=>{void 0!==r[e]&&a.includes(e)&&(i[e]=r[e])});let{error:o}=await n.from("transactions").update({...i,updated_at:new Date().toISOString()}).eq("id",e);return!o||(console.error("Error updating transaction:",o),!1)}e.s(["createListing",()=>n,"getListingById",()=>i,"updateListing",()=>a])},34999,e=>{"use strict";var t=e.i(89660),r=e.i(60453);async function n(e){let n=(0,t.createClient)(),i=await (0,r.generateMagicLink)(e.listing_id,e.seller_email),a=!1;try{let{data:t}=await n.from("users").select("preferred_first_name, preferred_last_name, first_name, last_name").eq("id",e.agent_id).single();if(t){let e=`${t.preferred_first_name||t.first_name} ${t.preferred_last_name||t.last_name}`.toLowerCase();a=e.includes("courtney okanlomo")||e.includes("okanlomo")}}catch(e){console.error("Error checking agent name:",e)}let o="broker_listing"===e.payment_method,s=!!o||!!a,l=o||a?new Date().toISOString().split("T")[0]:null,{data:c,error:d}=await n.from("listing_coordination").insert({listing_id:e.listing_id,agent_id:e.agent_id,seller_name:e.seller_name,seller_email:e.seller_email,service_fee:e.service_fee,start_date:e.start_date,is_active:!0,seller_magic_link:i,email_schedule_day:"monday",email_schedule_time:"18:00:00",payment_method:e.payment_method||null,payment_due_date:e.payment_due_date||null,service_paid:s,payment_date:l}).select().single();return d?(console.error("Error creating coordination:",d),null):c}async function i(e){let r=(0,t.createClient)(),{data:n,error:i}=await r.from("listing_coordination").select("*").eq("id",e).single();return i?(console.error("Error fetching coordination:",i),null):n}async function a(){let e=(0,t.createClient)(),{data:r,error:n}=await e.from("listing_coordination").select("*").eq("is_active",!0).order("created_at",{ascending:!1});return n?(console.error("Error fetching active coordinations:",n),[]):r||[]}async function o(e,r){let n=(0,t.createClient)(),{error:i}=await n.from("listing_coordination").update({...r,updated_at:new Date().toISOString()}).eq("id",e);return!i||(console.error("Error updating coordination:",i),!1)}async function s(e){return o(e,{is_active:!1,end_date:new Date().toISOString().split("T")[0]})}async function l(e){return o(e,{is_active:!0,end_date:null})}e.s(["createCoordination",()=>n,"deactivateCoordination",()=>s,"getAllActiveCoordinations",()=>a,"getCoordinationById",()=>i,"reactivateCoordination",()=>l,"updateCoordination",()=>o])},34138,e=>{"use strict";var t=e.i(46245),r=e.i(60453);let n=new t.Resend(process.env.RESEND_API_KEY),i="transactions@coachingbrokeragetools.com",a="Leah Parpan - Listing & Transaction Coordinator",o="tcandcompliance@collectiverealtyco.com",s="tcandcompliance@collectiverealtyco.com";async function l(e,t,l){try{let c=e.next_email_scheduled_for||null,d=function(e,t,n,i,a,o){let s=(0,r.getMagicLinkUrl)(e.seller_magic_link),l="every Monday at 6:00 PM";if(o){let e="string"==typeof o?new Date(o):o;if(!isNaN(e.getTime())){let t=e.toLocaleDateString("en-US",{weekday:"long"}),r=e.toLocaleTimeString("en-US",{hour:"numeric",minute:"2-digit",hour12:!0});l=`every ${t} at ${r}`}}return`
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
      ${a}</p>
      
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
  `}(e,t,l.name,l.email,l.phone,c),{data:p,error:u}=await n.emails.send({from:`${a} <${i}>`,to:e.seller_email,cc:[l.email],bcc:[s],replyTo:o,subject:`Collective Realty Co. - Welcome to Weekly Listing Coordination - ${t.property_address}`,html:d});if(u)return console.error("Error sending welcome email:",u),{success:!1,error:u.message};return{success:!0,emailId:p?.id}}catch(e){return console.error("Error sending welcome email:",e),{success:!1,error:e.message}}}async function c(e,t,l,c,d,p,u){try{let g,m=(g=(0,r.getMagicLinkUrl)(e.seller_magic_link),`
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
  `),f={from:`${a} <${i}>`,to:e.seller_email,cc:[l],bcc:[s],replyTo:o,subject:`Collective Realty Co. - Weekly Report - ${t.property_address} | ${c}`,html:m};u&&(f.schedule=u.toISOString());let{data:_,error:y}=await n.emails.send(f);if(y)return console.error("Error sending weekly report email:",y),{success:!1,error:y.message};return{success:!0,emailId:_?.id}}catch(e){return console.error("Error sending weekly report email:",e),{success:!1,error:e.message}}}async function d({to:e,subject:t,html:r,cc:s}){try{let{data:l,error:c}=await n.emails.send({from:`${a} <${i}>`,to:Array.isArray(e)?e:[e],cc:s?Array.isArray(s)?s:[s]:void 0,replyTo:o,subject:t,html:r});if(c)return console.error("Error sending email:",c),{success:!1,error:c.message};return{success:!0,emailId:l?.id}}catch(e){return console.error("Error sending email:",e),{success:!1,error:e.message}}}e.s(["sendEmail",()=>d,"sendWeeklyReportEmail",()=>c,"sendWelcomeEmail",()=>l],34138)},21734,e=>{"use strict";var t=e.i(89660);async function r(e){let r=(0,t.createClient)(),{data:n,error:i}=await r.from("service_configurations").select("*").eq("service_type",e).single();return i?(console.error("Error fetching service config:",i),null):n}async function n(e,r){let n=(0,t.createClient)(),{error:i}=await n.from("service_configurations").update({...r,updated_at:new Date().toISOString()}).eq("service_type",e);return!i||(console.error("Error updating service config:",i),!1)}e.s(["getServiceConfig",()=>r,"updateServiceConfig",()=>n])},36879,e=>{"use strict";var t=e.i(47909),r=e.i(74017),n=e.i(96250),i=e.i(59756),a=e.i(61916),o=e.i(74677),s=e.i(69741),l=e.i(16795),c=e.i(87718),d=e.i(95169),p=e.i(47587),u=e.i(66012),g=e.i(70101),m=e.i(26937),f=e.i(10372),_=e.i(93695);e.i(20232);var y=e.i(5232),h=e.i(89171),x=e.i(34999),v=e.i(85034),w=e.i(21734),b=e.i(6903),k=e.i(34138),C=e.i(89660);async function R(e){try{let t=(0,C.createClient)(),r=await e.json(),{listing_id:n,seller_name:i,seller_email:a,listing_website_url:o,agent_id:s,payment_method:l,custom_service_fee:c}=r;if(!l)return h.NextResponse.json({error:"Payment method is required"},{status:400});if(0===c){if(!["client_direct","agent_pays","broker_listing"].includes(l))return h.NextResponse.json({error:"Invalid payment method for broker listing"},{status:400})}else if(!["client_direct","agent_pays"].includes(l))return h.NextResponse.json({error:"Valid payment method is required"},{status:400});let d=await (0,v.getListingById)(n);if(!d)return h.NextResponse.json({error:"Listing not found"},{status:404});let p=await (0,w.getServiceConfig)("listing_coordination"),u=void 0!==c?c:p?.price||250,g=null;if("agent_pays"===l){let e=new Date;e.setDate(e.getDate()+60),g=e.toISOString().split("T")[0]}let{sharingUrl:m}=await (0,b.createListingFolder)(d.property_address,n,d.transaction_type||"sale"),f=await (0,x.createCoordination)({listing_id:n,agent_id:s,seller_name:i,seller_email:a,service_fee:u,start_date:new Date().toISOString().split("T")[0],payment_method:l,payment_due_date:g});if(!f)return h.NextResponse.json({error:"Failed to create coordination"},{status:500});if(await t.from("listing_coordination").update({onedrive_folder_url:m}).eq("id",f.id),o&&await (0,v.updateListing)(n,{listing_website_url:o}),r.scheduleDate&&r.scheduleTime){let e=new Date(`${r.scheduleDate}T${r.scheduleTime}`);if(!isNaN(e.getTime())){await t.from("listing_coordination").update({next_email_scheduled_for:e.toISOString()}).eq("id",f.id);let{data:r}=await t.from("listing_coordination").select("*").eq("id",f.id).single();r&&(f=r)}}let{data:_}=await t.from("users").select("*").eq("id",s).single();if(_&&f){let e=await (0,k.sendWelcomeEmail)(f,d,{name:_.preferred_first_name&&_.preferred_last_name?`${_.preferred_first_name} ${_.preferred_last_name}`:`${_.first_name} ${_.last_name}`,email:_.email,phone:_.business_phone||_.personal_phone||""});e.success?(await t.from("listing_coordination").update({welcome_email_sent:!0,welcome_email_sent_at:new Date().toISOString(),last_email_sent_at:new Date().toISOString(),total_emails_sent:1}).eq("id",f.id),await t.from("coordination_email_history").insert({coordination_id:f.id,email_type:"welcome",recipient_email:f.seller_email,recipient_name:f.seller_name,subject:`Collective Realty Co. - Welcome to Weekly Listing Coordination - ${d.property_address}`,resend_email_id:e.emailId||null,status:"sent",sent_at:new Date().toISOString()})):await t.from("coordination_email_history").insert({coordination_id:f.id,email_type:"welcome",recipient_email:f.seller_email,recipient_name:f.seller_name,subject:`Collective Realty Co. - Welcome to Weekly Listing Coordination - ${d.property_address}`,status:"failed",error_message:e.error||"Unknown error",sent_at:new Date().toISOString()})}return h.NextResponse.json({success:!0,coordination:f})}catch(e){return console.error("Error activating coordination:",e),h.NextResponse.json({error:e.message||"Failed to activate coordination"},{status:500})}}e.s(["POST",()=>R],65382);var E=e.i(65382);let S=new t.AppRouteRouteModule({definition:{kind:r.RouteKind.APP_ROUTE,page:"/api/coordination/activate/route",pathname:"/api/coordination/activate",filename:"route",bundlePath:""},distDir:".next",relativeProjectDir:"",resolvedPagePath:"[project]/app/api/coordination/activate/route.ts",nextConfigOutput:"",userland:E}),{workAsyncStorage:$,workUnitAsyncStorage:T,serverHooks:q}=S;function A(){return(0,n.patchFetch)({workAsyncStorage:$,workUnitAsyncStorage:T})}async function L(e,t,n){S.isDev&&(0,i.addRequestMeta)(e,"devRequestTimingInternalsEnd",process.hrtime.bigint());let h="/api/coordination/activate/route";h=h.replace(/\/index$/,"")||"/";let x=await S.prepare(e,t,{srcPage:h,multiZoneDraftMode:!1});if(!x)return t.statusCode=400,t.end("Bad Request"),null==n.waitUntil||n.waitUntil.call(n,Promise.resolve()),null;let{buildId:v,params:w,nextConfig:b,parsedUrl:k,isDraftMode:C,prerenderManifest:R,routerServerContext:E,isOnDemandRevalidate:$,revalidateOnlyGenerated:T,resolvedPathname:q,clientReferenceManifest:A,serverActionsManifest:L}=x,D=(0,s.normalizeAppPath)(h),I=!!(R.dynamicRoutes[D]||R.routes[q]),O=async()=>((null==E?void 0:E.render404)?await E.render404(e,t,k,!1):t.end("This page could not be found"),null);if(I&&!C){let e=!!R.routes[q],t=R.dynamicRoutes[D];if(t&&!1===t.fallback&&!e){if(b.experimental.adapterPath)return await O();throw new _.NoFallbackError}}let N=null;!I||S.isDev||C||(N="/index"===(N=q)?"/":N);let P=!0===S.isDev||!I,j=I&&!P;L&&A&&(0,o.setManifestsSingleton)({page:h,clientReferenceManifest:A,serverActionsManifest:L});let M=e.method||"GET",U=(0,a.getTracer)(),W=U.getActiveScopeSpan(),H={params:w,prerenderManifest:R,renderOpts:{experimental:{authInterrupts:!!b.experimental.authInterrupts},cacheComponents:!!b.cacheComponents,supportsDynamicResponse:P,incrementalCache:(0,i.getRequestMeta)(e,"incrementalCache"),cacheLifeProfiles:b.cacheLife,waitUntil:n.waitUntil,onClose:e=>{t.on("close",e)},onAfterTaskError:void 0,onInstrumentationRequestError:(t,r,n,i)=>S.onRequestError(e,t,n,i,E)},sharedContext:{buildId:v}},z=new l.NodeNextRequest(e),B=new l.NodeNextResponse(t),F=c.NextRequestAdapter.fromNodeNextRequest(z,(0,c.signalFromNodeResponse)(t));try{let o=async e=>S.handle(F,H).finally(()=>{if(!e)return;e.setAttributes({"http.status_code":t.statusCode,"next.rsc":!1});let r=U.getRootSpanAttributes();if(!r)return;if(r.get("next.span_type")!==d.BaseServerSpan.handleRequest)return void console.warn(`Unexpected root span type '${r.get("next.span_type")}'. Please report this Next.js issue https://github.com/vercel/next.js`);let n=r.get("next.route");if(n){let t=`${M} ${n}`;e.setAttributes({"next.route":n,"http.route":n,"next.span_name":t}),e.updateName(t)}else e.updateName(`${M} ${h}`)}),s=!!(0,i.getRequestMeta)(e,"minimalMode"),l=async i=>{var a,l;let c=async({previousCacheEntry:r})=>{try{if(!s&&$&&T&&!r)return t.statusCode=404,t.setHeader("x-nextjs-cache","REVALIDATED"),t.end("This page could not be found"),null;let a=await o(i);e.fetchMetrics=H.renderOpts.fetchMetrics;let l=H.renderOpts.pendingWaitUntil;l&&n.waitUntil&&(n.waitUntil(l),l=void 0);let c=H.renderOpts.collectedTags;if(!I)return await (0,u.sendResponse)(z,B,a,H.renderOpts.pendingWaitUntil),null;{let e=await a.blob(),t=(0,g.toNodeOutgoingHttpHeaders)(a.headers);c&&(t[f.NEXT_CACHE_TAGS_HEADER]=c),!t["content-type"]&&e.type&&(t["content-type"]=e.type);let r=void 0!==H.renderOpts.collectedRevalidate&&!(H.renderOpts.collectedRevalidate>=f.INFINITE_CACHE)&&H.renderOpts.collectedRevalidate,n=void 0===H.renderOpts.collectedExpire||H.renderOpts.collectedExpire>=f.INFINITE_CACHE?void 0:H.renderOpts.collectedExpire;return{value:{kind:y.CachedRouteKind.APP_ROUTE,status:a.status,body:Buffer.from(await e.arrayBuffer()),headers:t},cacheControl:{revalidate:r,expire:n}}}}catch(t){throw(null==r?void 0:r.isStale)&&await S.onRequestError(e,t,{routerKind:"App Router",routePath:h,routeType:"route",revalidateReason:(0,p.getRevalidateReason)({isStaticGeneration:j,isOnDemandRevalidate:$})},!1,E),t}},d=await S.handleResponse({req:e,nextConfig:b,cacheKey:N,routeKind:r.RouteKind.APP_ROUTE,isFallback:!1,prerenderManifest:R,isRoutePPREnabled:!1,isOnDemandRevalidate:$,revalidateOnlyGenerated:T,responseGenerator:c,waitUntil:n.waitUntil,isMinimalMode:s});if(!I)return null;if((null==d||null==(a=d.value)?void 0:a.kind)!==y.CachedRouteKind.APP_ROUTE)throw Object.defineProperty(Error(`Invariant: app-route received invalid cache entry ${null==d||null==(l=d.value)?void 0:l.kind}`),"__NEXT_ERROR_CODE",{value:"E701",enumerable:!1,configurable:!0});s||t.setHeader("x-nextjs-cache",$?"REVALIDATED":d.isMiss?"MISS":d.isStale?"STALE":"HIT"),C&&t.setHeader("Cache-Control","private, no-cache, no-store, max-age=0, must-revalidate");let _=(0,g.fromNodeOutgoingHttpHeaders)(d.value.headers);return s&&I||_.delete(f.NEXT_CACHE_TAGS_HEADER),!d.cacheControl||t.getHeader("Cache-Control")||_.get("Cache-Control")||_.set("Cache-Control",(0,m.getCacheControlHeader)(d.cacheControl)),await (0,u.sendResponse)(z,B,new Response(d.value.body,{headers:_,status:d.value.status||200})),null};W?await l(W):await U.withPropagatedContext(e.headers,()=>U.trace(d.BaseServerSpan.handleRequest,{spanName:`${M} ${h}`,kind:a.SpanKind.SERVER,attributes:{"http.method":M,"http.target":e.url}},l))}catch(t){if(t instanceof _.NoFallbackError||await S.onRequestError(e,t,{routerKind:"App Router",routePath:D,routeType:"route",revalidateReason:(0,p.getRevalidateReason)({isStaticGeneration:j,isOnDemandRevalidate:$})},!1,E),I)throw t;return await (0,u.sendResponse)(z,B,new Response(null,{status:500})),null}}e.s(["handler",()=>L,"patchFetch",()=>A,"routeModule",()=>S,"serverHooks",()=>q,"workAsyncStorage",()=>$,"workUnitAsyncStorage",()=>T],36879)}];

//# sourceMappingURL=%5Broot-of-the-server%5D__afccc432._.js.map