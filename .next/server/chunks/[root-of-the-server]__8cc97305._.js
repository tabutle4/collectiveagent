module.exports=[93695,(e,t,r)=>{t.exports=e.x("next/dist/shared/lib/no-fallback-error.external.js",()=>require("next/dist/shared/lib/no-fallback-error.external.js"))},70406,(e,t,r)=>{t.exports=e.x("next/dist/compiled/@opentelemetry/api",()=>require("next/dist/compiled/@opentelemetry/api"))},18622,(e,t,r)=>{t.exports=e.x("next/dist/compiled/next-server/app-page-turbo.runtime.prod.js",()=>require("next/dist/compiled/next-server/app-page-turbo.runtime.prod.js"))},56704,(e,t,r)=>{t.exports=e.x("next/dist/server/app-render/work-async-storage.external.js",()=>require("next/dist/server/app-render/work-async-storage.external.js"))},32319,(e,t,r)=>{t.exports=e.x("next/dist/server/app-render/work-unit-async-storage.external.js",()=>require("next/dist/server/app-render/work-unit-async-storage.external.js"))},24725,(e,t,r)=>{t.exports=e.x("next/dist/server/app-render/after-task-async-storage.external.js",()=>require("next/dist/server/app-render/after-task-async-storage.external.js"))},67652,e=>{"use strict";var t=e.i(87464);let r=(0,t.createClient)("https://zuhqqtfnyjlvbpcprdhf.supabase.co","eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inp1aHFxdGZueWpsdmJwY3ByZGhmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjEyNTUyMjAsImV4cCI6MjA3NjgzMTIyMH0.EP5nnbIpWoOVQ7jUrjnkuEJsGAmLY1oVLpS4pnlyjj4"),o=process.env.SUPABASE_SERVICE_ROLE_KEY?(0,t.createClient)("https://zuhqqtfnyjlvbpcprdhf.supabase.co",process.env.SUPABASE_SERVICE_ROLE_KEY):r;e.s(["supabase",0,r,"supabaseAdmin",0,o])},133,e=>{"use strict";var t=e.i(46245);if(!process.env.RESEND_API_KEY)throw Error("Missing env.RESEND_API_KEY");let r=new t.Resend(process.env.RESEND_API_KEY),o="Collective Support <support@coachingbrokeragetools.com>",n="office@collectiverealtyco.com";async function a(e){let t=l({greeting:`Hi ${e.preferred_first_name},`,content:`
      <p class="intro-text">Thank you for submitting your information. We're excited to learn more about you and your goals in real estate.</p>
      
      <p class="intro-text">At Collective Realty Co., we believe in offering real support, real structure, and real freedom so you can grow your business your way. Linked below, you'll find details about our commission plans and company offerings to help you explore whether we're the right fit for you.</p>
      
      <div class="section-box">
        <h2 class="section-title">Commission Plans & Offerings</h2>
        
        <div style="text-align: center; margin: 20px 0;">
          <a href="https://collectiverealtyco.sharepoint.com/sites/agenttrainingcenter/SitePages/Commission-Plans.aspx" class="btn btn-black">View Plans & Offerings</a>
        </div>
        
        <div class="password-box">
          Password: <span class="password-code">thefirm357</span>
        </div>
      </div>
    `,darkSection:`
      <h2 class="dark-section-title">Choose Your Next Step</h2>
      
      <div class="option-box">
        <h3 class="option-title">Ready to Move Forward?</h3>
        <p class="option-description">Submit the Join Our Firm form to request partnership.</p>
        <div style="text-align: center;">
          <a href="https://forms.office.com/Pages/ResponsePage.aspx?id=57xJl6bLKUG8z_SmhG224abx-HwYOq9AjRqZoiPnxy5UMzVUMkQyVjNRQUlQUkZOVllUNkJCM1ZHWS4u" class="btn btn-white">Join Our Firm</a>
        </div>
      </div>
      
      <div class="divider">OR</div>
      
      <div class="option-box">
        <h3 class="option-title">Schedule a Quick Call with Our Broker</h3>
        <p class="option-description">Connect with us to discuss your goals and learn how we can support your success.</p>
        <div style="text-align: center;">
          <a href="https://collectiverealtyco.setmore.com/services/1fe35e59-6d4f-4392-8227-c831b31cefd0" class="btn btn-white">Schedule Call</a>
        </div>
      </div>
    `,closing:`
      <div class="signature">
        <p>We're here to help, so feel free to reach out if you have any questions as you review everything.</p>
        <p style="margin-top: 15px;">Looking forward to connecting soon.</p>
      </div>
    `});return r.emails.send({from:"Collective Realty Co. <onboarding@coachingbrokeragetools.com>",to:e.email,cc:n,subject:"Next Steps with Collective Realty Co.",html:t})}async function i(e,t){let o=l({greeting:"New Prospective Agent Submission",content:`
      <p class="intro-text">A new prospect has submitted the prospective agent form.</p>
      
      <div class="section-box">
        <h3 style="margin-top: 0; color: #000;">CONTACT INFORMATION</h3>
        <p style="margin: 8px 0;"><strong>Name:</strong> ${t.preferred_first_name} ${t.preferred_last_name}</p>
        <p style="margin: 8px 0;"><strong>Legal Name:</strong> ${t.first_name} ${t.last_name}</p>
        <p style="margin: 8px 0;"><strong>Email:</strong> ${t.email}</p>
        <p style="margin: 8px 0;"><strong>Phone:</strong> ${t.phone}</p>
        <p style="margin: 8px 0;"><strong>Location:</strong> ${t.location}</p>
        ${t.instagram_handle?`<p style="margin: 8px 0;"><strong>Instagram:</strong> @${t.instagram_handle}</p>`:""}
        
        <h3 style="margin-top: 25px; color: #000;">MLS INFORMATION</h3>
        <p style="margin: 8px 0;"><strong>MLS:</strong> ${t.mls_choice}</p>
       <p style="margin: 8px 0;"><strong>Association Status:</strong> ${"new_agent"===t.association_status_on_join?"Brand new licensed agent":"Previously a member with another brokerage"}</p>
        ${t.previous_brokerage?`<p style="margin: 8px 0;"><strong>Previous Brokerage:</strong> ${t.previous_brokerage}</p>`:""}
        
        <h3 style="margin-top: 25px; color: #000;">EXPECTATIONS</h3>
        <p style="margin: 8px 0;"><strong>What expectations do you have for Collective Realty Co.?</strong></p>
        <p style="margin: 8px 0 16px 0; color: #666;">"${t.expectations}"</p>
        
        <p style="margin: 8px 0;"><strong>Do you want to be held accountable?</strong></p>
        <p style="margin: 8px 0 16px 0; color: #666;">"${t.accountability}"</p>
        
        <p style="margin: 8px 0;"><strong>How do you plan to produce business leads?</strong></p>
        <p style="margin: 8px 0 16px 0; color: #666;">"${t.lead_generation}"</p>
        
        <p style="margin: 8px 0;"><strong>Is there anything you would like to add?</strong></p>
        <p style="margin: 8px 0 16px 0; color: #666;">"${t.additional_info}"</p>
        
        <h3 style="margin-top: 25px; color: #000;">REFERRAL & TEAM INFORMATION</h3>
        <p style="margin: 8px 0;"><strong>How did you hear about us?</strong> ${t.how_heard}${t.how_heard_other?` - ${t.how_heard_other}`:""}</p>
        ${t.referred_by_agent?`<p style="margin: 8px 0;"><strong>Referring Agent:</strong> ${t.referred_by_agent}</p>`:'<p style="margin: 8px 0;"><strong>Referring Agent:</strong> N/A</p>'}
        ${t.joining_team?`<p style="margin: 8px 0;"><strong>Joining Team:</strong> ${t.joining_team}</p>`:'<p style="margin: 8px 0;"><strong>Joining Team:</strong> N/A</p>'}
        
        <p style="margin: 25px 0 0 0; color: #666; font-size: 14px;"><strong>Submitted:</strong> ${new Date(t.created_at).toLocaleString("en-US",{dateStyle:"long",timeStyle:"short"})}</p>
      </div>
      
      <div style="text-align: center; margin: 30px 0;">
        <a href="http://localhost:3000/admin/prospects/${t.id}" class="btn btn-black">View in Dashboard</a>
      </div>
    `,closing:`
      <p style="text-align: center; color: #666; font-size: 14px; font-style: italic;">Collective Realty Co. Admin Notification</p>
    `}),a=[n,...e];return r.emails.send({from:"Collective Notifications <notifications@coachingbrokeragetools.com>",to:a,subject:`New Prospective Agent: ${t.preferred_first_name} ${t.preferred_last_name}`,html:o})}async function s(e,t,a){let i=`http://localhost:3000/auth/reset-password?token=${t}`,s=l({greeting:`Hi ${a},`,content:`
      <p class="intro-text">We received a request to reset your password for your Collective Realty Co. admin account.</p>
      
      <div class="section-box">
        <h2 class="section-title">Reset Your Password</h2>
        
        <p style="text-align: center; margin: 20px 0; color: #666;">Click the button below to create a new password. This link will expire in 1 hour.</p>
        
        <div style="text-align: center; margin: 20px 0;">
          <a href="${i}" class="btn btn-black">Reset Password</a>
        </div>
        
        <p style="text-align: center; margin: 20px 0; color: #999; font-size: 13px;">If you didn't request this, you can safely ignore this email.</p>
      </div>
    `,closing:`
      <p style="text-align: center; color: #666;">If the button doesn't work, copy and paste this link into your browser:</p>
      <p style="text-align: center; color: #999; font-size: 13px; word-break: break-all;">${i}</p>
    `});return r.emails.send({from:o,to:e,cc:n,subject:"Reset Your Password - Collective Realty Co.",html:s})}function l({greeting:e,content:t,darkSection:r,closing:o}){return`
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <meta name="color-scheme" content="light only">
    <meta name="supported-color-schemes" content="light only">
    <title>Collective Realty Co.</title>
    <style>
        :root {
            color-scheme: light only;
            supported-color-schemes: light only;
        }
        
        body {
            margin: 0 !important;
            padding: 0 !important;
            background-color: #ffffff !important;
            font-family: 'Trebuchet MS', Arial, sans-serif !important;
        }
        
        [data-ogsc] body {
            background-color: #ffffff !important;
        }
        
        @media (prefers-color-scheme: dark) {
            body {
                background-color: #ffffff !important;
            }
            .email-container {
                background-color: #ffffff !important;
            }
        }
        
        .email-container {
            max-width: 600px;
            margin: 0 auto;
            background-color: #ffffff !important;
            box-shadow: 0 4px 20px rgba(0,0,0,0.3);
        }
        
        .header {
            background: #ffffff !important;
            padding: 50px 40px;
            text-align: center;
            margin: 0;
        }
        
        .header-title {
            margin: 0;
            font-size: 18px;
            color: #000000 !important;
            font-weight: normal;
            letter-spacing: 4px;
            text-transform: uppercase;
        }
        
        .header-subtitle {
            margin: 8px 0 0 0;
            font-size: 14px;
            color: #000000 !important;
            font-weight: normal;
            letter-spacing: 2px;
        }
        
        .header-divider {
            width: 60px;
            height: 2px;
            background: linear-gradient(90deg, transparent, #000000, transparent) !important;
            margin: 20px auto 0 auto;
        }
        
        .content {
            padding: 40px;
            background-color: #ffffff !important;
        }
        
        .greeting {
            font-size: 16px;
            color: #000000 !important;
            margin-bottom: 20px;
            font-weight: 600;
        }
        
        .intro-text {
            margin: 0 0 16px 0;
            font-size: 16px;
            line-height: 1.6;
            color: #333333 !important;
        }
        
        .section-box {
            background-color: #f8f8f8 !important;
            padding: 35px;
            margin: 30px 0;
            border-left: 3px solid #000000;
        }
        
        .section-title {
            font-size: 20px;
            color: #000000 !important;
            font-weight: 300;
            margin: 0 0 20px 0;
            text-align: center;
            letter-spacing: 1px;
        }
        
        .password-box {
            text-align: center;
            margin-top: 20px;
            font-size: 13px;
            color: #666 !important;
        }
        
        .password-code {
            font-family: 'Courier New', monospace;
            background-color: #ffffff !important;
            padding: 8px 16px;
            border: 1px solid #999999;
            letter-spacing: 1px;
            display: inline-block;
            margin-top: 8px;
            color: #000000 !important;
        }
        
        .dark-section {
            background: linear-gradient(135deg, #1a1a1a 0%, #0d0d0d 100%) !important;
            padding: 40px;
            margin: 30px 0;
        }
        
        .dark-section-title {
            margin: 0 0 30px 0;
            font-size: 24px;
            color: #ffffff !important;
            font-weight: 300;
            text-align: center;
            letter-spacing: 2px;
        }
        
        .option-box {
            background-color: #2d2d2d !important;
            padding: 30px;
            margin-bottom: 20px;
            border-left: 3px solid #ffffff;
        }
        
        .option-box:last-child {
            margin-bottom: 0;
        }
        
        .option-title {
            font-size: 18px;
            color: #ffffff !important;
            font-weight: 400;
            margin: 0 0 12px 0;
            text-align: center;
        }
        
        .option-description {
            font-size: 14px;
            color: #aaaaaa !important;
            line-height: 1.6;
            margin: 0 0 20px 0;
            text-align: center;
        }
        
        .divider {
            text-align: center;
            margin: 25px 0;
            font-size: 14px;
            color: #999999 !important;
            letter-spacing: 2px;
        }
        
        .btn {
            display: inline-block;
            padding: 14px 32px;
            text-decoration: none;
            font-size: 13px;
            letter-spacing: 2px;
            text-transform: uppercase;
            border-radius: 2px;
            transition: all 0.3s ease;
        }
        
        .btn-white {
            background-color: #ffffff !important;
            color: #000000 !important;
            border: 2px solid #ffffff;
        }
        
        .btn-black {
            background-color: #000000 !important;
            color: #ffffff !important;
            border: 2px solid #000000;
        }
        
        .signature {
            margin-top: 30px;
            color: #333 !important;
            text-align: center;
        }
        
        .signature p {
            margin: 0 0 10px 0;
            font-size: 15px;
            line-height: 1.6;
            color: #333333 !important;
        }
        
        .footer {
            background: linear-gradient(135deg, #2d2d2d 0%, #1a1a1a 100%) !important;
            padding: 30px;
            text-align: center;
        }
        
        .footer p {
            margin: 0;
            font-size: 13px;
            color: #aaaaaa !important;
            font-style: italic;
            letter-spacing: 1px;
        }
        
        @media (max-width: 640px) {
            .content,
            .dark-section {
                padding: 30px 25px;
            }
        }
    </style>
</head>
<body>
    <div class="email-container">
        <div class="header">
            <h1 class="header-title">Collective Realty Co.</h1>
            <p class="header-subtitle">The Coaching Brokerage</p>
            <div class="header-divider"></div>
        </div>
        
        <div class="content">
            <p class="greeting">${e}</p>
            ${t}
        </div>
        
        ${r?`<div class="dark-section">${r}</div>`:""}
        
        <div class="content">
            ${o}
        </div>
        
        <div class="footer">
            <p>Welcome to Collective Realty Co. - Where Excellence Meets Opportunity</p>
        </div>
    </div>
</body>
</html>
  `}async function p({message:e,userName:t,userEmail:n}){let a=l({greeting:`Hello ${t.split(" ")[0]},`,content:`
      <p style="margin-bottom: 20px;">Thank you for contacting the office. We will respond within 24 business hours.</p>
      
      <p style="margin-bottom: 25px;">For urgent matters, please call or text the office at <strong style="color: #C9A961;">281-638-9407</strong>.</p>
      
      <div class="section-box">
        <h3 style="margin-top: 0; color: #000;">YOUR MESSAGE</h3>
        <div style="background: #f8f8f8; padding: 15px; border-left: 3px solid #C9A961; margin-top: 10px;">
          <p style="margin: 0; color: #333; white-space: pre-wrap;">${e}</p>
        </div>
      </div>
    `,closing:`
      <p style="text-align: center; color: #666; font-size: 14px; margin-top: 30px;">
        This message was sent from the Collective Agent admin portal.
      </p>
    `});await r.emails.send({from:o,to:n,cc:"office@collectiverealtyco.com",subject:"Support Request Received",html:a})}e.s(["sendAdminProspectNotification",()=>i,"sendContactEmail",()=>p,"sendPasswordResetEmail",()=>s,"sendProspectWelcomeEmail",()=>a])},56148,e=>{"use strict";var t=e.i(47909),r=e.i(74017),o=e.i(96250),n=e.i(59756),a=e.i(61916),i=e.i(74677),s=e.i(69741),l=e.i(16795),p=e.i(87718),c=e.i(95169),d=e.i(47587),g=e.i(66012),u=e.i(70101),m=e.i(26937),f=e.i(10372),h=e.i(93695);e.i(20232);var x=e.i(5232),y=e.i(89171),b=e.i(67652),v=e.i(133);async function w(e){try{let t=await e.json();for(let e of["first_name","last_name","preferred_first_name","preferred_last_name","email","phone","location","mls_choice","association_status","expectations","accountability","lead_generation","additional_info","how_heard"])if(!t[e])return y.NextResponse.json({error:`${e} is required`},{status:400});let r=t.phone.replace(/\D/g,"");if(10!==r.length)return y.NextResponse.json({error:"Phone number must be exactly 10 digits"},{status:400});let{data:o}=await b.supabase.from("users").select("id").eq("email",t.email.toLowerCase()).single();if(o)return y.NextResponse.json({error:"This email is already registered in our system"},{status:409});let{data:n,error:a}=await b.supabase.from("users").insert({email:t.email.toLowerCase(),password_hash:"",first_name:t.first_name,last_name:t.last_name,preferred_first_name:t.preferred_first_name,preferred_last_name:t.preferred_last_name,status:"prospect",is_active:!1,roles:[],phone:r,location:t.location,instagram_handle:t.instagram_handle||null,mls_choice:t.mls_choice,association_status_on_join:t.association_status,previous_brokerage:t.previous_brokerage||null,expectations:t.expectations,accountability:t.accountability,lead_generation:t.lead_generation,additional_info:t.additional_info,how_heard:t.how_heard,how_heard_other:t.how_heard_other||null,referring_agent:t.referring_agent||null,joining_team:t.joining_team||null,prospect_status:"new"}).select().single();if(a)throw console.error("Insert error:",a),a;try{await (0,v.sendProspectWelcomeEmail)({preferred_first_name:n.preferred_first_name,email:n.email})}catch(e){console.error("Error sending prospect email:",e)}let{data:i}=await b.supabase.from("users").select("email").contains("roles",["admin"]).eq("is_active",!0),s=i?.map(e=>e.email)||[];try{await (0,v.sendAdminProspectNotification)(s,n)}catch(e){console.error("Error sending admin notification:",e)}return y.NextResponse.json({message:"Prospect submitted successfully",prospect:{id:n.id,preferred_first_name:n.preferred_first_name,email:n.email}})}catch(e){return console.error("Prospect submission error:",e),y.NextResponse.json({error:"An error occurred while submitting your information"},{status:500})}}async function _(e){try{let{data:e,error:t}=await b.supabase.from("users").select("*").eq("status","prospect").order("created_at",{ascending:!1});if(t)throw t;return y.NextResponse.json({prospects:e})}catch(e){return console.error("Get prospects error:",e),y.NextResponse.json({error:"An error occurred while fetching prospects"},{status:500})}}e.s(["GET",()=>_,"POST",()=>w],67882);var R=e.i(67882);let C=new t.AppRouteRouteModule({definition:{kind:r.RouteKind.APP_ROUTE,page:"/api/prospects/route",pathname:"/api/prospects",filename:"route",bundlePath:""},distDir:".next",relativeProjectDir:"",resolvedPagePath:"[project]/app/api/prospects/route.ts",nextConfigOutput:"",userland:R}),{workAsyncStorage:E,workUnitAsyncStorage:k,serverHooks:A}=C;function N(){return(0,o.patchFetch)({workAsyncStorage:E,workUnitAsyncStorage:k})}async function P(e,t,o){C.isDev&&(0,n.addRequestMeta)(e,"devRequestTimingInternalsEnd",process.hrtime.bigint());let y="/api/prospects/route";y=y.replace(/\/index$/,"")||"/";let b=await C.prepare(e,t,{srcPage:y,multiZoneDraftMode:!1});if(!b)return t.statusCode=400,t.end("Bad Request"),null==o.waitUntil||o.waitUntil.call(o,Promise.resolve()),null;let{buildId:v,params:w,nextConfig:_,parsedUrl:R,isDraftMode:E,prerenderManifest:k,routerServerContext:A,isOnDemandRevalidate:N,revalidateOnlyGenerated:P,resolvedPathname:S,clientReferenceManifest:$,serverActionsManifest:I}=b,j=(0,s.normalizeAppPath)(y),O=!!(k.dynamicRoutes[j]||k.routes[S]),T=async()=>((null==A?void 0:A.render404)?await A.render404(e,t,R,!1):t.end("This page could not be found"),null);if(O&&!E){let e=!!k.routes[S],t=k.dynamicRoutes[j];if(t&&!1===t.fallback&&!e){if(_.experimental.adapterPath)return await T();throw new h.NoFallbackError}}let q=null;!O||C.isDev||E||(q="/index"===(q=S)?"/":q);let M=!0===C.isDev||!O,U=O&&!M;I&&$&&(0,i.setManifestsSingleton)({page:y,clientReferenceManifest:$,serverActionsManifest:I});let z=e.method||"GET",H=(0,a.getTracer)(),D=H.getActiveScopeSpan(),L={params:w,prerenderManifest:k,renderOpts:{experimental:{authInterrupts:!!_.experimental.authInterrupts},cacheComponents:!!_.cacheComponents,supportsDynamicResponse:M,incrementalCache:(0,n.getRequestMeta)(e,"incrementalCache"),cacheLifeProfiles:_.cacheLife,waitUntil:o.waitUntil,onClose:e=>{t.on("close",e)},onAfterTaskError:void 0,onInstrumentationRequestError:(t,r,o,n)=>C.onRequestError(e,t,o,n,A)},sharedContext:{buildId:v}},F=new l.NodeNextRequest(e),J=new l.NodeNextResponse(t),Y=p.NextRequestAdapter.fromNodeNextRequest(F,(0,p.signalFromNodeResponse)(t));try{let i=async e=>C.handle(Y,L).finally(()=>{if(!e)return;e.setAttributes({"http.status_code":t.statusCode,"next.rsc":!1});let r=H.getRootSpanAttributes();if(!r)return;if(r.get("next.span_type")!==c.BaseServerSpan.handleRequest)return void console.warn(`Unexpected root span type '${r.get("next.span_type")}'. Please report this Next.js issue https://github.com/vercel/next.js`);let o=r.get("next.route");if(o){let t=`${z} ${o}`;e.setAttributes({"next.route":o,"http.route":o,"next.span_name":t}),e.updateName(t)}else e.updateName(`${z} ${y}`)}),s=!!(0,n.getRequestMeta)(e,"minimalMode"),l=async n=>{var a,l;let p=async({previousCacheEntry:r})=>{try{if(!s&&N&&P&&!r)return t.statusCode=404,t.setHeader("x-nextjs-cache","REVALIDATED"),t.end("This page could not be found"),null;let a=await i(n);e.fetchMetrics=L.renderOpts.fetchMetrics;let l=L.renderOpts.pendingWaitUntil;l&&o.waitUntil&&(o.waitUntil(l),l=void 0);let p=L.renderOpts.collectedTags;if(!O)return await (0,g.sendResponse)(F,J,a,L.renderOpts.pendingWaitUntil),null;{let e=await a.blob(),t=(0,u.toNodeOutgoingHttpHeaders)(a.headers);p&&(t[f.NEXT_CACHE_TAGS_HEADER]=p),!t["content-type"]&&e.type&&(t["content-type"]=e.type);let r=void 0!==L.renderOpts.collectedRevalidate&&!(L.renderOpts.collectedRevalidate>=f.INFINITE_CACHE)&&L.renderOpts.collectedRevalidate,o=void 0===L.renderOpts.collectedExpire||L.renderOpts.collectedExpire>=f.INFINITE_CACHE?void 0:L.renderOpts.collectedExpire;return{value:{kind:x.CachedRouteKind.APP_ROUTE,status:a.status,body:Buffer.from(await e.arrayBuffer()),headers:t},cacheControl:{revalidate:r,expire:o}}}}catch(t){throw(null==r?void 0:r.isStale)&&await C.onRequestError(e,t,{routerKind:"App Router",routePath:y,routeType:"route",revalidateReason:(0,d.getRevalidateReason)({isStaticGeneration:U,isOnDemandRevalidate:N})},!1,A),t}},c=await C.handleResponse({req:e,nextConfig:_,cacheKey:q,routeKind:r.RouteKind.APP_ROUTE,isFallback:!1,prerenderManifest:k,isRoutePPREnabled:!1,isOnDemandRevalidate:N,revalidateOnlyGenerated:P,responseGenerator:p,waitUntil:o.waitUntil,isMinimalMode:s});if(!O)return null;if((null==c||null==(a=c.value)?void 0:a.kind)!==x.CachedRouteKind.APP_ROUTE)throw Object.defineProperty(Error(`Invariant: app-route received invalid cache entry ${null==c||null==(l=c.value)?void 0:l.kind}`),"__NEXT_ERROR_CODE",{value:"E701",enumerable:!1,configurable:!0});s||t.setHeader("x-nextjs-cache",N?"REVALIDATED":c.isMiss?"MISS":c.isStale?"STALE":"HIT"),E&&t.setHeader("Cache-Control","private, no-cache, no-store, max-age=0, must-revalidate");let h=(0,u.fromNodeOutgoingHttpHeaders)(c.value.headers);return s&&O||h.delete(f.NEXT_CACHE_TAGS_HEADER),!c.cacheControl||t.getHeader("Cache-Control")||h.get("Cache-Control")||h.set("Cache-Control",(0,m.getCacheControlHeader)(c.cacheControl)),await (0,g.sendResponse)(F,J,new Response(c.value.body,{headers:h,status:c.value.status||200})),null};D?await l(D):await H.withPropagatedContext(e.headers,()=>H.trace(c.BaseServerSpan.handleRequest,{spanName:`${z} ${y}`,kind:a.SpanKind.SERVER,attributes:{"http.method":z,"http.target":e.url}},l))}catch(t){if(t instanceof h.NoFallbackError||await C.onRequestError(e,t,{routerKind:"App Router",routePath:j,routeType:"route",revalidateReason:(0,d.getRevalidateReason)({isStaticGeneration:U,isOnDemandRevalidate:N})},!1,A),O)throw t;return await (0,g.sendResponse)(F,J,new Response(null,{status:500})),null}}e.s(["handler",()=>P,"patchFetch",()=>N,"routeModule",()=>C,"serverHooks",()=>A,"workAsyncStorage",()=>E,"workUnitAsyncStorage",()=>k],56148)}];

//# sourceMappingURL=%5Broot-of-the-server%5D__8cc97305._.js.map