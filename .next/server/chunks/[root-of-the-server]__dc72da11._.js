module.exports=[93695,(e,r,t)=>{r.exports=e.x("next/dist/shared/lib/no-fallback-error.external.js",()=>require("next/dist/shared/lib/no-fallback-error.external.js"))},70406,(e,r,t)=>{r.exports=e.x("next/dist/compiled/@opentelemetry/api",()=>require("next/dist/compiled/@opentelemetry/api"))},18622,(e,r,t)=>{r.exports=e.x("next/dist/compiled/next-server/app-page-turbo.runtime.prod.js",()=>require("next/dist/compiled/next-server/app-page-turbo.runtime.prod.js"))},56704,(e,r,t)=>{r.exports=e.x("next/dist/server/app-render/work-async-storage.external.js",()=>require("next/dist/server/app-render/work-async-storage.external.js"))},32319,(e,r,t)=>{r.exports=e.x("next/dist/server/app-render/work-unit-async-storage.external.js",()=>require("next/dist/server/app-render/work-unit-async-storage.external.js"))},24725,(e,r,t)=>{r.exports=e.x("next/dist/server/app-render/after-task-async-storage.external.js",()=>require("next/dist/server/app-render/after-task-async-storage.external.js"))},54799,(e,r,t)=>{r.exports=e.x("crypto",()=>require("crypto"))},60453,e=>{"use strict";var r=e.i(54799);async function t(e,t){let n=r.default.randomBytes(32),o=`${e}:${n.toString("hex")}`;return Buffer.from(o).toString("base64url")}function n(e){try{let[r]=Buffer.from(e,"base64url").toString("utf-8").split(":");if(!r)return null;return{listingId:r}}catch(e){return console.error("Error validating magic link:",e),null}}function o(e){return`https://agent.collectiverealtyco.com/seller/${e}`}async function i(e){let t=r.default.randomBytes(32),n=`${e}:${t.toString("hex")}`;return Buffer.from(n).toString("base64url")}function a(e){try{let[r]=Buffer.from(e,"base64url").toString("utf-8").split(":");if(!r)return null;return{formType:r}}catch(e){return console.error("Error validating form token:",e),null}}function s(e,r){return`https://agent.collectiverealtyco.com/forms/${r}/${e}`}e.s(["generateFormToken",()=>i,"generateMagicLink",()=>t,"getFormLinkUrl",()=>s,"getMagicLinkUrl",()=>o,"validateFormToken",()=>a,"validateMagicLink",()=>n])},85034,e=>{"use strict";var r=e.i(89660),t=e.i(60453);async function n(e,o,i=!1){let a=(0,r.createClient)(),s=null,l=null;i||(s=e.mls_link?null:await (0,t.generateFormToken)("pre-listing"),l=e.mls_link?await (0,t.generateFormToken)("just-listed"):null);let c=!1;if(o)try{let{data:e}=await a.from("users").select("preferred_first_name, preferred_last_name, first_name, last_name").eq("id",o).single();if(e){let r=`${e.preferred_first_name||e.first_name} ${e.preferred_last_name||e.last_name}`.toLowerCase();c=r.includes("courtney okanlomo")||r.includes("okanlomo")}}catch(e){console.error("Error checking agent name for listing:",e)}let{data:d,error:p}=await a.from("listings").insert({agent_id:o||null,agent_name:e.agent_name,property_address:e.property_address,transaction_type:e.transaction_type,mls_type:e.mls_type||null,client_names:e.client_names,client_phone:e.client_phone,client_email:e.client_email,lead_source:e.lead_source,mls_link:e.mls_link||null,estimated_launch_date:e.estimated_launch_date||null,status:e.mls_link?"active":"pre-listing",pre_listing_form_completed:!e.mls_link,just_listed_form_completed:!!e.mls_link,dotloop_file_created:e.dotloop_file_created,listing_input_requested:e.listing_input_requested,listing_input_paid:c,photography_requested:e.photography_requested,listing_input_fee:50,pre_listing_token:s,just_listed_token:l}).select().single();return p?(console.error("Error creating listing:",p),null):d}async function o(e){let t=(0,r.createClient)(),{data:n,error:o}=await t.from("listings").select("*").eq("id",e).single();return o?(console.error("Error fetching listing:",o),null):n}async function i(e,t){let n=(0,r.createClient)(),o={},i=["agent_id","agent_name","property_address","transaction_type","mls_type","client_names","client_phone","client_email","mls_link","estimated_launch_date","actual_launch_date","lead_source","status","listing_website_url","dotloop_file_created","photography_requested","listing_input_requested","co_listing_agent","is_broker_listing"];Object.keys(t).forEach(e=>{void 0!==t[e]&&i.includes(e)&&(o[e]=t[e])});let{error:a}=await n.from("listings").update({...o,updated_at:new Date().toISOString()}).eq("id",e);if(a){if(console.error("Error updating listing:",a),console.error("Update data:",o),console.error("Error details:",JSON.stringify(a,null,2)),console.error("Error message:",a.message),console.error("Error code:",a.code),console.error("Error hint:",a.hint),a.message&&a.message.includes("column")){let e=a.message.match(/column "([^"]+)"/);e&&console.error(`Missing column detected: ${e[1]}`)}return!1}return!0}e.s(["createListing",()=>n,"getListingById",()=>o,"updateListing",()=>i])},34999,e=>{"use strict";var r=e.i(89660),t=e.i(60453);async function n(e){let n=(0,r.createClient)(),o=await (0,t.generateMagicLink)(e.listing_id,e.seller_email),i=!1;try{let{data:r}=await n.from("users").select("preferred_first_name, preferred_last_name, first_name, last_name").eq("id",e.agent_id).single();if(r){let e=`${r.preferred_first_name||r.first_name} ${r.preferred_last_name||r.last_name}`.toLowerCase();i=e.includes("courtney okanlomo")||e.includes("okanlomo")}}catch(e){console.error("Error checking agent name:",e)}let a="broker_listing"===e.payment_method,s=!!a||!!i,l=a||i?new Date().toISOString().split("T")[0]:null,{data:c,error:d}=await n.from("listing_coordination").insert({listing_id:e.listing_id,agent_id:e.agent_id,seller_name:e.seller_name,seller_email:e.seller_email,service_fee:e.service_fee,start_date:e.start_date,is_active:!0,seller_magic_link:o,email_schedule_day:"monday",email_schedule_time:"18:00:00",payment_method:e.payment_method||null,payment_due_date:e.payment_due_date||null,service_paid:s,payment_date:l}).select().single();return d?(console.error("Error creating coordination:",d),null):c}async function o(e){let t=(0,r.createClient)(),{data:n,error:o}=await t.from("listing_coordination").select("*").eq("id",e).single();return o?(console.error("Error fetching coordination:",o),null):n}async function i(){let e=(0,r.createClient)(),{data:t,error:n}=await e.from("listing_coordination").select("*").eq("is_active",!0).order("created_at",{ascending:!1});return n?(console.error("Error fetching active coordinations:",n),[]):t||[]}async function a(e,t){let n=(0,r.createClient)(),{error:o}=await n.from("listing_coordination").update({...t,updated_at:new Date().toISOString()}).eq("id",e);return!o||(console.error("Error updating coordination:",o),!1)}async function s(e){return a(e,{is_active:!1,end_date:new Date().toISOString().split("T")[0]})}async function l(e){return a(e,{is_active:!0,end_date:null})}e.s(["createCoordination",()=>n,"deactivateCoordination",()=>s,"getAllActiveCoordinations",()=>i,"getCoordinationById",()=>o,"reactivateCoordination",()=>l,"updateCoordination",()=>a])},34138,e=>{"use strict";var r=e.i(46245),t=e.i(60453);let n=new r.Resend(process.env.RESEND_API_KEY),o="transactions@coachingbrokeragetools.com",i="Leah Parpan - Listing & Transaction Coordinator",a="tcandcompliance@collectiverealtyco.com",s="tcandcompliance@collectiverealtyco.com";async function l(e,r,l){try{let c=e.next_email_scheduled_for||null,d=function(e,r,n,o,i,a){let s=(0,t.getMagicLinkUrl)(e.seller_magic_link),l="every Monday at 6:00 PM";if(a){let e="string"==typeof a?new Date(a):a;if(!isNaN(e.getTime())){let r=e.toLocaleDateString("en-US",{weekday:"long"}),t=e.toLocaleTimeString("en-US",{hour:"numeric",minute:"2-digit",hour12:!0});l=`every ${r} at ${t}`}}return`
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
    
    <p>Welcome to Collective Realty Co.'s Weekly Listing Coordination service for your property at <strong>${r.property_address}</strong>!</p>
    
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
      ${o}<br>
      ${i}</p>
      
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
  `}(e,r,l.name,l.email,l.phone,c),{data:p,error:g}=await n.emails.send({from:`${i} <${o}>`,to:e.seller_email,cc:[l.email],bcc:[s],replyTo:a,subject:`Collective Realty Co. - Welcome to Weekly Listing Coordination - ${r.property_address}`,html:d});if(g)return console.error("Error sending welcome email:",g),{success:!1,error:g.message};return{success:!0,emailId:p?.id}}catch(e){return console.error("Error sending welcome email:",e),{success:!1,error:e.message}}}async function c(e,r,l,c,d,p,g){try{let u,m=(u=(0,t.getMagicLinkUrl)(e.seller_magic_link),`
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
    <p>${r.property_address}</p>
    <p>Sent ${c}</p>
  </div>
  
  <div class="content">
    <p class="greeting">Hi ${e.seller_name},</p>
    
    <p>Your weekly activity report for <strong>${r.property_address}</strong> is ready.</p>
    
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
  `),f={from:`${i} <${o}>`,to:e.seller_email,cc:[l],bcc:[s],replyTo:a,subject:`Collective Realty Co. - Weekly Report - ${r.property_address} | ${c}`,html:m};g&&(f.schedule=g.toISOString());let{data:_,error:y}=await n.emails.send(f);if(y)return console.error("Error sending weekly report email:",y),{success:!1,error:y.message};return{success:!0,emailId:_?.id}}catch(e){return console.error("Error sending weekly report email:",e),{success:!1,error:e.message}}}async function d({to:e,subject:r,html:t,cc:s}){try{let{data:l,error:c}=await n.emails.send({from:`${i} <${o}>`,to:Array.isArray(e)?e:[e],cc:s?Array.isArray(s)?s:[s]:void 0,replyTo:a,subject:r,html:t});if(c)return console.error("Error sending email:",c),{success:!1,error:c.message};return{success:!0,emailId:l?.id}}catch(e){return console.error("Error sending email:",e),{success:!1,error:e.message}}}e.s(["sendEmail",()=>d,"sendWeeklyReportEmail",()=>c,"sendWelcomeEmail",()=>l],34138)},21734,e=>{"use strict";var r=e.i(89660);async function t(e){let t=(0,r.createClient)(),{data:n,error:o}=await t.from("service_configurations").select("*").eq("service_type",e).single();return o?(console.error("Error fetching service config:",o),null):n}async function n(e,t){let n=(0,r.createClient)(),{error:o}=await n.from("service_configurations").update({...t,updated_at:new Date().toISOString()}).eq("service_type",e);return!o||(console.error("Error updating service config:",o),!1)}e.s(["getServiceConfig",()=>t,"updateServiceConfig",()=>n])}];

//# sourceMappingURL=%5Broot-of-the-server%5D__dc72da11._.js.map