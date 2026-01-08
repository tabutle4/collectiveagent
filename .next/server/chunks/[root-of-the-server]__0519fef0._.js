module.exports=[93695,(e,t,r)=>{t.exports=e.x("next/dist/shared/lib/no-fallback-error.external.js",()=>require("next/dist/shared/lib/no-fallback-error.external.js"))},70406,(e,t,r)=>{t.exports=e.x("next/dist/compiled/@opentelemetry/api",()=>require("next/dist/compiled/@opentelemetry/api"))},18622,(e,t,r)=>{t.exports=e.x("next/dist/compiled/next-server/app-page-turbo.runtime.prod.js",()=>require("next/dist/compiled/next-server/app-page-turbo.runtime.prod.js"))},56704,(e,t,r)=>{t.exports=e.x("next/dist/server/app-render/work-async-storage.external.js",()=>require("next/dist/server/app-render/work-async-storage.external.js"))},32319,(e,t,r)=>{t.exports=e.x("next/dist/server/app-render/work-unit-async-storage.external.js",()=>require("next/dist/server/app-render/work-unit-async-storage.external.js"))},24725,(e,t,r)=>{t.exports=e.x("next/dist/server/app-render/after-task-async-storage.external.js",()=>require("next/dist/server/app-render/after-task-async-storage.external.js"))},54799,(e,t,r)=>{t.exports=e.x("crypto",()=>require("crypto"))},60453,e=>{"use strict";var t=e.i(54799);async function r(e,r){let o=t.default.randomBytes(32),n=`${e}:${o.toString("hex")}`;return Buffer.from(n).toString("base64url")}function o(e){try{let[t]=Buffer.from(e,"base64url").toString("utf-8").split(":");if(!t)return null;return{listingId:t}}catch(e){return console.error("Error validating magic link:",e),null}}function n(e){return`http://localhost:3000/seller/${e}`}async function a(e){let r=t.default.randomBytes(32),o=`${e}:${r.toString("hex")}`;return Buffer.from(o).toString("base64url")}function i(e){try{let[t]=Buffer.from(e,"base64url").toString("utf-8").split(":");if(!t)return null;return{formType:t}}catch(e){return console.error("Error validating form token:",e),null}}function s(e,t){return`http://localhost:3000/forms/${t}/${e}`}e.s(["generateFormToken",()=>a,"generateMagicLink",()=>r,"getFormLinkUrl",()=>s,"getMagicLinkUrl",()=>n,"validateFormToken",()=>i,"validateMagicLink",()=>o])},34138,e=>{"use strict";var t=e.i(46245),r=e.i(60453);let o=new t.Resend(process.env.RESEND_API_KEY),n="transactions@coachingbrokeragetools.com",a="Leah Parpan - Listing & Transaction Coordinator",i="tcandcompliance@collectiverealtyco.com",s="tcandcompliance@collectiverealtyco.com";async function l(e,t,l){try{let d=e.next_email_scheduled_for||null,p=function(e,t,o,n,a,i){let s=(0,r.getMagicLinkUrl)(e.seller_magic_link),l="every Monday at 6:00 PM";if(i){let e="string"==typeof i?new Date(i):i;if(!isNaN(e.getTime())){let t=e.toLocaleDateString("en-US",{weekday:"long"}),r=e.toLocaleTimeString("en-US",{hour:"numeric",minute:"2-digit",hour12:!0});l=`every ${t} at ${r}`}}return`
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
      ${o}<br>
      ${n}<br>
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
  `}(e,t,l.name,l.email,l.phone,d),{data:c,error:u}=await o.emails.send({from:`${a} <${n}>`,to:e.seller_email,cc:[l.email],bcc:[s],replyTo:i,subject:`Collective Realty Co. - Welcome to Weekly Listing Coordination - ${t.property_address}`,html:p});if(u)return console.error("Error sending welcome email:",u),{success:!1,error:u.message};return{success:!0,emailId:c?.id}}catch(e){return console.error("Error sending welcome email:",e),{success:!1,error:e.message}}}async function d(e,t,l,d,p,c,u){try{let g,f=(g=(0,r.getMagicLinkUrl)(e.seller_magic_link),`
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
    
    ${p||c?`
    <div class="info-box">
      <h3>This Week's Reports</h3>
      <p style="text-align: center;">
        ${p?`<a href="${p}" class="button" style="margin: 5px;">Download Showing Report</a>`:""}
        ${c?`<a href="${c}" class="button" style="margin: 5px;">Download Traffic Report</a>`:""}
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
  `),m={from:`${a} <${n}>`,to:e.seller_email,cc:[l],bcc:[s],replyTo:i,subject:`Collective Realty Co. - Weekly Report - ${t.property_address} | ${d}`,html:f};u&&(m.schedule=u.toISOString());let{data:h,error:x}=await o.emails.send(m);if(x)return console.error("Error sending weekly report email:",x),{success:!1,error:x.message};return{success:!0,emailId:h?.id}}catch(e){return console.error("Error sending weekly report email:",e),{success:!1,error:e.message}}}async function p({to:e,subject:t,html:r,cc:s}){try{let{data:l,error:d}=await o.emails.send({from:`${a} <${n}>`,to:Array.isArray(e)?e:[e],cc:s?Array.isArray(s)?s:[s]:void 0,replyTo:i,subject:t,html:r});if(d)return console.error("Error sending email:",d),{success:!1,error:d.message};return{success:!0,emailId:l?.id}}catch(e){return console.error("Error sending email:",e),{success:!1,error:e.message}}}e.s(["sendEmail",()=>p,"sendWeeklyReportEmail",()=>d,"sendWelcomeEmail",()=>l],34138)},89808,e=>{"use strict";var t=e.i(47909),r=e.i(74017),o=e.i(96250),n=e.i(59756),a=e.i(61916),i=e.i(74677),s=e.i(69741),l=e.i(16795),d=e.i(87718),p=e.i(95169),c=e.i(47587),u=e.i(66012),g=e.i(70101),f=e.i(26937),m=e.i(10372),h=e.i(93695);e.i(20232);var x=e.i(5232),y=e.i(89171),v=e.i(89660),b=e.i(34138);async function w(e){try{let t=(0,v.createClient)(),{listing_id:r,agent_id:o,agent_name:n,agent_email:a,message:i,property_address:s}=await e.json();if(!r||!o||!i||!s)return y.NextResponse.json({error:"Missing required fields"},{status:400});let{data:l}=await t.from("listings").select("agent_id").eq("id",r).single();if(!l||l.agent_id!==o)return y.NextResponse.json({error:"Unauthorized - You can only request updates for your own listings"},{status:403});let{data:d}=await t.from("users").select("email, preferred_first_name, preferred_last_name").contains("roles",["admin"]);if(!d||0===d.length)return y.NextResponse.json({error:"No admin users found to notify"},{status:500});let p=d.map(e=>e.email).filter(Boolean);if(p.length>0)try{await (0,b.sendEmail)({to:p,subject:`Update Request: ${s}`,html:`
            <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
              <h2 style="color: #000;">Update Request for Listing</h2>
              
              <div style="background: #f5f5f5; padding: 20px; border-radius: 4px; margin: 20px 0;">
                <p><strong>Agent:</strong> ${n}</p>
                <p><strong>Agent Email:</strong> ${a}</p>
                <p><strong>Property Address:</strong> ${s}</p>
                <p><strong>Listing ID:</strong> ${r}</p>
              </div>
              
              <div style="margin: 20px 0;">
                <h3 style="color: #000;">Requested Update:</h3>
                <p style="white-space: pre-wrap; background: #fff; padding: 15px; border-left: 3px solid #000;">${i}</p>
              </div>
              
              <p style="color: #666; font-size: 14px;">
                Please review this request and update the listing information in the admin dashboard.
              </p>
              
              <p style="color: #666; font-size: 14px; margin-top: 20px;">
                <a href="http://localhost:3000/admin/form-responses" style="color: #000; text-decoration: underline;">
                  View in Admin Dashboard
                </a>
              </p>
            </div>
          `})}catch(e){console.error("Error sending email notification:",e)}return y.NextResponse.json({success:!0,message:"Update request sent successfully"})}catch(e){return console.error("Error processing update request:",e),y.NextResponse.json({error:e.message||"Failed to process update request"},{status:500})}}e.s(["POST",()=>w],53875);var R=e.i(53875);let k=new t.AppRouteRouteModule({definition:{kind:r.RouteKind.APP_ROUTE,page:"/api/listings/request-update/route",pathname:"/api/listings/request-update",filename:"route",bundlePath:""},distDir:".next",relativeProjectDir:"",resolvedPagePath:"[project]/app/api/listings/request-update/route.ts",nextConfigOutput:"",userland:R}),{workAsyncStorage:E,workUnitAsyncStorage:C,serverHooks:$}=k;function A(){return(0,o.patchFetch)({workAsyncStorage:E,workUnitAsyncStorage:C})}async function T(e,t,o){k.isDev&&(0,n.addRequestMeta)(e,"devRequestTimingInternalsEnd",process.hrtime.bigint());let y="/api/listings/request-update/route";y=y.replace(/\/index$/,"")||"/";let v=await k.prepare(e,t,{srcPage:y,multiZoneDraftMode:!1});if(!v)return t.statusCode=400,t.end("Bad Request"),null==o.waitUntil||o.waitUntil.call(o,Promise.resolve()),null;let{buildId:b,params:w,nextConfig:R,parsedUrl:E,isDraftMode:C,prerenderManifest:$,routerServerContext:A,isOnDemandRevalidate:T,revalidateOnlyGenerated:_,resolvedPathname:S,clientReferenceManifest:q,serverActionsManifest:P}=v,N=(0,s.normalizeAppPath)(y),L=!!($.dynamicRoutes[N]||$.routes[S]),U=async()=>((null==A?void 0:A.render404)?await A.render404(e,t,E,!1):t.end("This page could not be found"),null);if(L&&!C){let e=!!$.routes[S],t=$.dynamicRoutes[N];if(t&&!1===t.fallback&&!e){if(R.experimental.adapterPath)return await U();throw new h.NoFallbackError}}let j=null;!L||k.isDev||C||(j="/index"===(j=S)?"/":j);let D=!0===k.isDev||!L,M=L&&!D;P&&q&&(0,i.setManifestsSingleton)({page:y,clientReferenceManifest:q,serverActionsManifest:P});let O=e.method||"GET",I=(0,a.getTracer)(),z=I.getActiveScopeSpan(),H={params:w,prerenderManifest:$,renderOpts:{experimental:{authInterrupts:!!R.experimental.authInterrupts},cacheComponents:!!R.cacheComponents,supportsDynamicResponse:D,incrementalCache:(0,n.getRequestMeta)(e,"incrementalCache"),cacheLifeProfiles:R.cacheLife,waitUntil:o.waitUntil,onClose:e=>{t.on("close",e)},onAfterTaskError:void 0,onInstrumentationRequestError:(t,r,o,n)=>k.onRequestError(e,t,o,n,A)},sharedContext:{buildId:b}},W=new l.NodeNextRequest(e),B=new l.NodeNextResponse(t),F=d.NextRequestAdapter.fromNodeNextRequest(W,(0,d.signalFromNodeResponse)(t));try{let i=async e=>k.handle(F,H).finally(()=>{if(!e)return;e.setAttributes({"http.status_code":t.statusCode,"next.rsc":!1});let r=I.getRootSpanAttributes();if(!r)return;if(r.get("next.span_type")!==p.BaseServerSpan.handleRequest)return void console.warn(`Unexpected root span type '${r.get("next.span_type")}'. Please report this Next.js issue https://github.com/vercel/next.js`);let o=r.get("next.route");if(o){let t=`${O} ${o}`;e.setAttributes({"next.route":o,"http.route":o,"next.span_name":t}),e.updateName(t)}else e.updateName(`${O} ${y}`)}),s=!!(0,n.getRequestMeta)(e,"minimalMode"),l=async n=>{var a,l;let d=async({previousCacheEntry:r})=>{try{if(!s&&T&&_&&!r)return t.statusCode=404,t.setHeader("x-nextjs-cache","REVALIDATED"),t.end("This page could not be found"),null;let a=await i(n);e.fetchMetrics=H.renderOpts.fetchMetrics;let l=H.renderOpts.pendingWaitUntil;l&&o.waitUntil&&(o.waitUntil(l),l=void 0);let d=H.renderOpts.collectedTags;if(!L)return await (0,u.sendResponse)(W,B,a,H.renderOpts.pendingWaitUntil),null;{let e=await a.blob(),t=(0,g.toNodeOutgoingHttpHeaders)(a.headers);d&&(t[m.NEXT_CACHE_TAGS_HEADER]=d),!t["content-type"]&&e.type&&(t["content-type"]=e.type);let r=void 0!==H.renderOpts.collectedRevalidate&&!(H.renderOpts.collectedRevalidate>=m.INFINITE_CACHE)&&H.renderOpts.collectedRevalidate,o=void 0===H.renderOpts.collectedExpire||H.renderOpts.collectedExpire>=m.INFINITE_CACHE?void 0:H.renderOpts.collectedExpire;return{value:{kind:x.CachedRouteKind.APP_ROUTE,status:a.status,body:Buffer.from(await e.arrayBuffer()),headers:t},cacheControl:{revalidate:r,expire:o}}}}catch(t){throw(null==r?void 0:r.isStale)&&await k.onRequestError(e,t,{routerKind:"App Router",routePath:y,routeType:"route",revalidateReason:(0,c.getRevalidateReason)({isStaticGeneration:M,isOnDemandRevalidate:T})},!1,A),t}},p=await k.handleResponse({req:e,nextConfig:R,cacheKey:j,routeKind:r.RouteKind.APP_ROUTE,isFallback:!1,prerenderManifest:$,isRoutePPREnabled:!1,isOnDemandRevalidate:T,revalidateOnlyGenerated:_,responseGenerator:d,waitUntil:o.waitUntil,isMinimalMode:s});if(!L)return null;if((null==p||null==(a=p.value)?void 0:a.kind)!==x.CachedRouteKind.APP_ROUTE)throw Object.defineProperty(Error(`Invariant: app-route received invalid cache entry ${null==p||null==(l=p.value)?void 0:l.kind}`),"__NEXT_ERROR_CODE",{value:"E701",enumerable:!1,configurable:!0});s||t.setHeader("x-nextjs-cache",T?"REVALIDATED":p.isMiss?"MISS":p.isStale?"STALE":"HIT"),C&&t.setHeader("Cache-Control","private, no-cache, no-store, max-age=0, must-revalidate");let h=(0,g.fromNodeOutgoingHttpHeaders)(p.value.headers);return s&&L||h.delete(m.NEXT_CACHE_TAGS_HEADER),!p.cacheControl||t.getHeader("Cache-Control")||h.get("Cache-Control")||h.set("Cache-Control",(0,f.getCacheControlHeader)(p.cacheControl)),await (0,u.sendResponse)(W,B,new Response(p.value.body,{headers:h,status:p.value.status||200})),null};z?await l(z):await I.withPropagatedContext(e.headers,()=>I.trace(p.BaseServerSpan.handleRequest,{spanName:`${O} ${y}`,kind:a.SpanKind.SERVER,attributes:{"http.method":O,"http.target":e.url}},l))}catch(t){if(t instanceof h.NoFallbackError||await k.onRequestError(e,t,{routerKind:"App Router",routePath:N,routeType:"route",revalidateReason:(0,c.getRevalidateReason)({isStaticGeneration:M,isOnDemandRevalidate:T})},!1,A),L)throw t;return await (0,u.sendResponse)(W,B,new Response(null,{status:500})),null}}e.s(["handler",()=>T,"patchFetch",()=>A,"routeModule",()=>k,"serverHooks",()=>$,"workAsyncStorage",()=>E,"workUnitAsyncStorage",()=>C],89808)}];

//# sourceMappingURL=%5Broot-of-the-server%5D__0519fef0._.js.map