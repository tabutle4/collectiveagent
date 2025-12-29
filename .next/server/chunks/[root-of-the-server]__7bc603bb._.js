module.exports=[93695,(e,t,n)=>{t.exports=e.x("next/dist/shared/lib/no-fallback-error.external.js",()=>require("next/dist/shared/lib/no-fallback-error.external.js"))},70406,(e,t,n)=>{t.exports=e.x("next/dist/compiled/@opentelemetry/api",()=>require("next/dist/compiled/@opentelemetry/api"))},18622,(e,t,n)=>{t.exports=e.x("next/dist/compiled/next-server/app-page-turbo.runtime.prod.js",()=>require("next/dist/compiled/next-server/app-page-turbo.runtime.prod.js"))},56704,(e,t,n)=>{t.exports=e.x("next/dist/server/app-render/work-async-storage.external.js",()=>require("next/dist/server/app-render/work-async-storage.external.js"))},32319,(e,t,n)=>{t.exports=e.x("next/dist/server/app-render/work-unit-async-storage.external.js",()=>require("next/dist/server/app-render/work-unit-async-storage.external.js"))},24725,(e,t,n)=>{t.exports=e.x("next/dist/server/app-render/after-task-async-storage.external.js",()=>require("next/dist/server/app-render/after-task-async-storage.external.js"))},67652,e=>{"use strict";var t=e.i(87464);let n=(0,t.createClient)("https://zuhqqtfnyjlvbpcprdhf.supabase.co","eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inp1aHFxdGZueWpsdmJwY3ByZGhmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjEyNTUyMjAsImV4cCI6MjA3NjgzMTIyMH0.EP5nnbIpWoOVQ7jUrjnkuEJsGAmLY1oVLpS4pnlyjj4"),r=process.env.SUPABASE_SERVICE_ROLE_KEY?(0,t.createClient)("https://zuhqqtfnyjlvbpcprdhf.supabase.co",process.env.SUPABASE_SERVICE_ROLE_KEY):n;e.s(["supabase",0,n,"supabaseAdmin",0,r])},78177,e=>{"use strict";var t=e.i(47909),n=e.i(74017),r=e.i(96250),a=e.i(59756),s=e.i(61916),o=e.i(74677),i=e.i(69741),l=e.i(16795),d=e.i(87718),p=e.i(95169),c=e.i(47587),u=e.i(66012),h=e.i(70101),m=e.i(26937),v=e.i(10372),g=e.i(93695);e.i(20232);var x=e.i(5232),f=e.i(89171),R=e.i(67652),y=e.i(46245);if(!process.env.RESEND_API_KEY)throw Error("Missing env.RESEND_API_KEY");let E=new y.Resend(process.env.RESEND_API_KEY);async function b(e){try{let{campaign_id:t,event_staff_email:n}=await e.json(),{data:r}=await R.supabase.from("campaigns").select("*").eq("id",t).single();if(!r)return f.NextResponse.json({error:"Campaign not found"},{status:404});let{data:a}=await R.supabase.from("campaign_responses").select(`
        *,
        users!inner(
          first_name,
          last_name,
          preferred_first_name,
          preferred_last_name,
          email,
          personal_phone
        )
      `).eq("campaign_id",t).not("attending_luncheon","is",null),s=a?.filter(e=>!0===e.attending_luncheon)||[],o=a?.filter(e=>!1===e.attending_luncheon)||[],i=`
<!DOCTYPE html>
<html>
<head>
  <style>
    body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
    .container { max-width: 800px; margin: 0 auto; padding: 20px; }
    .header { background: #2d2d2d; color: white; padding: 30px; text-align: center; }
    .content { padding: 30px; background: #fff; }
    .stats { display: flex; gap: 20px; margin: 20px 0; }
    .stat-box { flex: 1; padding: 15px; background: #f8f8f8; border-left: 3px solid #C9A961; }
    .attendee { padding: 12px; margin: 8px 0; border-left: 3px solid #C9A961; background: #f8f8f8; }
    .attendee-name { font-weight: bold; margin-bottom: 4px; }
    .comment { font-size: 14px; color: #666; font-style: italic; }
    h2 { color: #2d2d2d; border-bottom: 2px solid #C9A961; padding-bottom: 10px; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>Collective Realty Co. Luncheon RSVP List</h1>
      <p>${r.name}</p>
    </div>
    
    <div class="content">
      <div class="stats">
        <div class="stat-box">
          <div style="font-size: 32px; font-weight: bold; color: #C9A961;">${s.length}</div>
          <div style="font-size: 14px; color: #666;">Attending</div>
        </div>
        <div class="stat-box">
          <div style="font-size: 32px; font-weight: bold; color: #999;">${o.length}</div>
          <div style="font-size: 14px; color: #666;">Not Attending</div>
        </div>
        <div class="stat-box">
          <div style="font-size: 32px; font-weight: bold;">${s.length+o.length}</div>
          <div style="font-size: 14px; color: #666;">Total Responses</div>
        </div>
      </div>

      <h2>Attending (${s.length})</h2>
      ${0===s.length?'<p style="color: #999;">No attendees yet</p>':s.map(e=>`
        <div class="attendee">
          <div class="attendee-name">${e.users.preferred_first_name} ${e.users.preferred_last_name}</div>
          ${e.users.email?`<div style="font-size: 13px; color: #666;">${e.users.email}</div>`:""}
          ${e.users.personal_phone?`<div style="font-size: 13px; color: #666;">${e.users.personal_phone}</div>`:""}
          ${e.luncheon_comments?`<div class="comment">"${e.luncheon_comments}"</div>`:""}
        </div>
      `).join("")}

      <h2 style="margin-top: 40px;">Not Attending (${o.length})</h2>
      ${0===o.length?'<p style="color: #999;">Everyone is attending!</p>':o.map(e=>`
        <div class="attendee">
          <div class="attendee-name">${e.users.preferred_first_name} ${e.users.preferred_last_name}</div>
          ${e.luncheon_comments?`<div class="comment">"${e.luncheon_comments}"</div>`:""}
        </div>
      `).join("")}

      <div style="margin-top: 40px; padding: 20px; background: #f8f8f8; border-left: 3px solid #2d2d2d;">
        <p style="margin: 0; font-size: 13px; color: #666;">
          <strong>Generated:</strong> ${new Date().toLocaleString()}<br>
          <strong>Event:</strong> Tuesday, December 16 at 12:00 PM<br>
          <strong>Venue:</strong> Rhay's Restaurant & Lounge, 11920 Westheimer Rd #J, Houston, TX 77077<br>
          <strong>Dress Code:</strong> Black Tie
        </p>
      </div>
    </div>
  </div>
</body>
</html>
    `;try{await E.emails.send({from:"Collective Realty Co. <notifications@coachingbrokeragetools.com>",to:n,cc:"office@collectiverealtyco.com",subject:`Luncheon RSVP List - ${s.length} Attending`,html:i})}catch(e){return console.error("Resend email error:",e),f.NextResponse.json({error:e?.message||"Failed to send email via Resend"},{status:500})}return f.NextResponse.json({success:!0})}catch(e){return console.error("Send RSVP list error:",e),f.NextResponse.json({error:e?.message||"Failed to send RSVP list"},{status:500})}}e.s(["POST",()=>b],24636);var _=e.i(24636);let w=new t.AppRouteRouteModule({definition:{kind:n.RouteKind.APP_ROUTE,page:"/api/campaign/send-rsvp-list/route",pathname:"/api/campaign/send-rsvp-list",filename:"route",bundlePath:""},distDir:".next",relativeProjectDir:"",resolvedPagePath:"[project]/app/api/campaign/send-rsvp-list/route.ts",nextConfigOutput:"",userland:_}),{workAsyncStorage:C,workUnitAsyncStorage:A,serverHooks:S}=w;function I(){return(0,r.patchFetch)({workAsyncStorage:C,workUnitAsyncStorage:A})}async function N(e,t,r){w.isDev&&(0,a.addRequestMeta)(e,"devRequestTimingInternalsEnd",process.hrtime.bigint());let f="/api/campaign/send-rsvp-list/route";f=f.replace(/\/index$/,"")||"/";let R=await w.prepare(e,t,{srcPage:f,multiZoneDraftMode:!1});if(!R)return t.statusCode=400,t.end("Bad Request"),null==r.waitUntil||r.waitUntil.call(r,Promise.resolve()),null;let{buildId:y,params:E,nextConfig:b,parsedUrl:_,isDraftMode:C,prerenderManifest:A,routerServerContext:S,isOnDemandRevalidate:I,revalidateOnlyGenerated:N,resolvedPathname:j,clientReferenceManifest:P,serverActionsManifest:T}=R,$=(0,i.normalizeAppPath)(f),k=!!(A.dynamicRoutes[$]||A.routes[j]),O=async()=>((null==S?void 0:S.render404)?await S.render404(e,t,_,!1):t.end("This page could not be found"),null);if(k&&!C){let e=!!A.routes[j],t=A.dynamicRoutes[$];if(t&&!1===t.fallback&&!e){if(b.experimental.adapterPath)return await O();throw new g.NoFallbackError}}let q=null;!k||w.isDev||C||(q="/index"===(q=j)?"/":q);let U=!0===w.isDev||!k,D=k&&!U;T&&P&&(0,o.setManifestsSingleton)({page:f,clientReferenceManifest:P,serverActionsManifest:T});let H=e.method||"GET",M=(0,s.getTracer)(),z=M.getActiveScopeSpan(),L={params:E,prerenderManifest:A,renderOpts:{experimental:{authInterrupts:!!b.experimental.authInterrupts},cacheComponents:!!b.cacheComponents,supportsDynamicResponse:U,incrementalCache:(0,a.getRequestMeta)(e,"incrementalCache"),cacheLifeProfiles:b.cacheLife,waitUntil:r.waitUntil,onClose:e=>{t.on("close",e)},onAfterTaskError:void 0,onInstrumentationRequestError:(t,n,r,a)=>w.onRequestError(e,t,r,a,S)},sharedContext:{buildId:y}},V=new l.NodeNextRequest(e),F=new l.NodeNextResponse(t),K=d.NextRequestAdapter.fromNodeNextRequest(V,(0,d.signalFromNodeResponse)(t));try{let o=async e=>w.handle(K,L).finally(()=>{if(!e)return;e.setAttributes({"http.status_code":t.statusCode,"next.rsc":!1});let n=M.getRootSpanAttributes();if(!n)return;if(n.get("next.span_type")!==p.BaseServerSpan.handleRequest)return void console.warn(`Unexpected root span type '${n.get("next.span_type")}'. Please report this Next.js issue https://github.com/vercel/next.js`);let r=n.get("next.route");if(r){let t=`${H} ${r}`;e.setAttributes({"next.route":r,"http.route":r,"next.span_name":t}),e.updateName(t)}else e.updateName(`${H} ${f}`)}),i=!!(0,a.getRequestMeta)(e,"minimalMode"),l=async a=>{var s,l;let d=async({previousCacheEntry:n})=>{try{if(!i&&I&&N&&!n)return t.statusCode=404,t.setHeader("x-nextjs-cache","REVALIDATED"),t.end("This page could not be found"),null;let s=await o(a);e.fetchMetrics=L.renderOpts.fetchMetrics;let l=L.renderOpts.pendingWaitUntil;l&&r.waitUntil&&(r.waitUntil(l),l=void 0);let d=L.renderOpts.collectedTags;if(!k)return await (0,u.sendResponse)(V,F,s,L.renderOpts.pendingWaitUntil),null;{let e=await s.blob(),t=(0,h.toNodeOutgoingHttpHeaders)(s.headers);d&&(t[v.NEXT_CACHE_TAGS_HEADER]=d),!t["content-type"]&&e.type&&(t["content-type"]=e.type);let n=void 0!==L.renderOpts.collectedRevalidate&&!(L.renderOpts.collectedRevalidate>=v.INFINITE_CACHE)&&L.renderOpts.collectedRevalidate,r=void 0===L.renderOpts.collectedExpire||L.renderOpts.collectedExpire>=v.INFINITE_CACHE?void 0:L.renderOpts.collectedExpire;return{value:{kind:x.CachedRouteKind.APP_ROUTE,status:s.status,body:Buffer.from(await e.arrayBuffer()),headers:t},cacheControl:{revalidate:n,expire:r}}}}catch(t){throw(null==n?void 0:n.isStale)&&await w.onRequestError(e,t,{routerKind:"App Router",routePath:f,routeType:"route",revalidateReason:(0,c.getRevalidateReason)({isStaticGeneration:D,isOnDemandRevalidate:I})},!1,S),t}},p=await w.handleResponse({req:e,nextConfig:b,cacheKey:q,routeKind:n.RouteKind.APP_ROUTE,isFallback:!1,prerenderManifest:A,isRoutePPREnabled:!1,isOnDemandRevalidate:I,revalidateOnlyGenerated:N,responseGenerator:d,waitUntil:r.waitUntil,isMinimalMode:i});if(!k)return null;if((null==p||null==(s=p.value)?void 0:s.kind)!==x.CachedRouteKind.APP_ROUTE)throw Object.defineProperty(Error(`Invariant: app-route received invalid cache entry ${null==p||null==(l=p.value)?void 0:l.kind}`),"__NEXT_ERROR_CODE",{value:"E701",enumerable:!1,configurable:!0});i||t.setHeader("x-nextjs-cache",I?"REVALIDATED":p.isMiss?"MISS":p.isStale?"STALE":"HIT"),C&&t.setHeader("Cache-Control","private, no-cache, no-store, max-age=0, must-revalidate");let g=(0,h.fromNodeOutgoingHttpHeaders)(p.value.headers);return i&&k||g.delete(v.NEXT_CACHE_TAGS_HEADER),!p.cacheControl||t.getHeader("Cache-Control")||g.get("Cache-Control")||g.set("Cache-Control",(0,m.getCacheControlHeader)(p.cacheControl)),await (0,u.sendResponse)(V,F,new Response(p.value.body,{headers:g,status:p.value.status||200})),null};z?await l(z):await M.withPropagatedContext(e.headers,()=>M.trace(p.BaseServerSpan.handleRequest,{spanName:`${H} ${f}`,kind:s.SpanKind.SERVER,attributes:{"http.method":H,"http.target":e.url}},l))}catch(t){if(t instanceof g.NoFallbackError||await w.onRequestError(e,t,{routerKind:"App Router",routePath:$,routeType:"route",revalidateReason:(0,c.getRevalidateReason)({isStaticGeneration:D,isOnDemandRevalidate:I})},!1,S),k)throw t;return await (0,u.sendResponse)(V,F,new Response(null,{status:500})),null}}e.s(["handler",()=>N,"patchFetch",()=>I,"routeModule",()=>w,"serverHooks",()=>S,"workAsyncStorage",()=>C,"workUnitAsyncStorage",()=>A],78177)}];

//# sourceMappingURL=%5Broot-of-the-server%5D__7bc603bb._.js.map