(globalThis.TURBOPACK||(globalThis.TURBOPACK=[])).push(["object"==typeof document?document.currentScript:void 0,90002,e=>{"use strict";var t=e.i(43476),r=e.i(71645);function l(){let[e,l]=(0,r.useState)(""),[o,n]=(0,r.useState)(!0),[a,i]=(0,r.useState)(null),[c,d]=(0,r.useState)(!1);(0,r.useEffect)(()=>{fetch(`/agent-roster.html?t=${Date.now()}`).then(e=>{if(!e.ok)throw Error(`Failed to fetch roster: ${e.statusText}`);return e.text()}).then(e=>{let t=new DOMParser().parseFromString(e,"text/html"),r=t.querySelector("style")?.innerHTML||"";r=r.replace(/body\s*\{[^}]*\}/g,`body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
            background: transparent;
            min-height: auto;
            padding: 0;
        }`);let o=t.querySelectorAll("script"),a="";o.forEach(e=>{a+=e.innerHTML+"\n"});let i=t.querySelector("body")?.innerHTML||"",c=new DOMParser().parseFromString(`<div>${i}</div>`,"text/html").querySelector("div");if(c){let e=c.querySelector(".header");e&&e.remove();let t=c.querySelector(".page-title h1");t&&t.remove(),i=c.innerHTML||""}l(`
          <style>${r}</style>
          <div style="padding: 24px; background: linear-gradient(to bottom right, #f9fafb, #f3f4f6, #f9fafb); min-height: calc(100vh - 80px);">
            ${i}
          </div>
        `),window.__rosterScripts=a,n(!1)}).catch(e=>{console.error("Error loading agent roster:",e),l(`
          <div style="padding: 24px; text-align: center;">
            <h2 style="color: #dc2626; margin-bottom: 16px;">Error Loading Roster</h2>
            <p style="color: #6b7280; margin-bottom: 8px;">${e?.message||"Failed to load agent roster"}</p>
            <p style="color: #9ca3af; font-size: 14px;">Please refresh the page or contact support if the issue persists.</p>
          </div>
        `),n(!1)})},[]),(0,r.useEffect)(()=>{if(!e||c)return;let t=window.__rosterScripts;t&&t.trim()?setTimeout(()=>{try{let e=t.replace(/<script[^>]*>/gi,"").replace(/<\/script>/gi,"").trim();if(!e)return void d(!0);let r=`(function() {
            try {
              ${e}
            } catch (e) {
              console.warn('Roster script execution error:', e);
            }
          })();`,l=document.createElement("script");l.type="text/javascript";try{l.textContent=r;let e=document.body;e?(e.appendChild(l),setTimeout(()=>{try{l.parentNode&&l.parentNode.removeChild(l)}catch(e){}},200)):setTimeout(()=>{try{document.body&&(document.body.appendChild(l),setTimeout(()=>{try{l.parentNode&&l.parentNode.removeChild(l)}catch(e){}},200))}catch(e){console.warn("Could not append script to body:",e)}},100)}catch(e){console.warn("Script execution failed:",e)}d(!0)}catch(e){console.error("Error executing roster scripts:",e),d(!0)}},500):d(!0)},[e,c]),(0,r.useEffect)(()=>{if(e)return window.filterTable=function(){if(!document.getElementById("agentTable"))return;let e=document.getElementById("searchInput")?.value.toLowerCase()||"",t=(document.getElementById("officeFilter")?.value||"all").trim(),r=(document.getElementById("teamFilter")?.value||"all").trim(),l=(document.getElementById("divisionFilter")?.value||"all").trim(),o="all"===t?"all":t.toLowerCase(),n="all"===r?"all":r.toLowerCase(),a="all"===l?"all":l.toLowerCase(),i=document.getElementById("agentTable");if(!i)return;let c=i.getElementsByTagName("tbody")[0]?.getElementsByTagName("tr")||[],d=0;for(let t=0;t<c.length;t++){let r=c[t],l=(r.getAttribute("data-name")||"").trim(),i=(r.getAttribute("data-email")||"").trim(),s=(r.getAttribute("data-office")||"").trim().toLowerCase(),u=(r.getAttribute("data-team")||"").trim().toLowerCase(),m=(r.getAttribute("data-division")||"").trim().toLowerCase(),g=r.getAttribute("data-phone")||"",y=r.getAttribute("data-birthday")||"",p=r.getAttribute("data-ig")||"",x=r.getAttribute("data-tiktok")||"",h=r.getAttribute("data-threads")||"",b=r.getAttribute("data-youtube")||"",f=r.getAttribute("data-linkedin")||"",w=r.getAttribute("data-facebook")||"",v=!e||l.includes(e)||i.includes(e)||g.includes(e)||y.includes(e)||p.includes(e)||x.includes(e)||h.includes(e)||b.includes(e)||f.includes(e)||w.includes(e),S="all"===o||s===o,T="all"===n||u===n,E=!1;if("all"===a?E=!0:m&&"-"!==m&&m.trim().length>0&&(E=m.split("|").map(e=>e.trim().toLowerCase()).filter(e=>e.length>0&&"-"!==e).includes(a)),v&&S&&T&&E){r.style.display="",d++;let e=r.querySelector(".row-number");e&&(e.textContent=String(d))}else r.style.display="none"}let s=document.getElementById("agent-count");s&&(s.textContent=d+" agent"+(1!==d?"s":""));let u=document.getElementById("noResults");u&&(u.style.display=0===d?"block":"none")},()=>{try{window.filterTable&&delete window.filterTable}catch(e){}}},[e]),(0,r.useEffect)(()=>{(async()=>{try{i("https://agent.collectiverealtyco.com/roster")}catch(e){console.error("Error generating public link:",e)}})()},[]);let s=async()=>{let e=window.open("","_blank");if(!e)return;let t=`
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>CRC Agent Roster</title>
    ${document.querySelector(".agent-roster-container")?.querySelector("style")?.outerHTML||""}
</head>
<body>
    ${document.querySelector(".agent-roster-container")?.querySelector("div")?.innerHTML||""}
</body>
</html>
    `;e.document.write(t),e.document.close(),e.onload=()=>{e.print()}};return o?(0,t.jsx)("div",{className:"flex items-center justify-center min-h-[400px]",children:(0,t.jsx)("p",{className:"text-luxury-gray-2",children:"Loading agent roster..."})}):(0,t.jsxs)("div",{children:[(0,t.jsx)("div",{className:"flex items-center justify-between mb-5 md:mb-8",children:(0,t.jsx)("h2",{className:"text-xl md:text-2xl font-semibold tracking-luxury",style:{fontWeight:"600"},children:"Agent Roster"})}),(0,t.jsx)("div",{className:"mb-4 md:mb-6 -mx-6 px-6 md:mx-0 md:px-0",children:(0,t.jsxs)("div",{className:"flex flex-col md:flex-row md:items-center gap-3",children:[(0,t.jsxs)("div",{className:"grid grid-cols-2 md:flex md:flex-row gap-2 md:gap-2",children:[(0,t.jsx)("button",{onClick:()=>{if(!e)return;let t=new Blob([`
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>CRC Agent Roster</title>
    ${document.querySelector(".agent-roster-container")?.querySelector("style")?.outerHTML||""}
</head>
<body>
    ${document.querySelector(".agent-roster-container")?.querySelector("div")?.innerHTML||""}
    <script>
        ${window.filterTable?.toString()||""}
    </script>
</body>
</html>
    `],{type:"text/html"}),r=URL.createObjectURL(t),l=document.createElement("a");l.href=r,l.download=`agent-roster-${new Date().toISOString().split("T")[0]}.html`,l.click(),URL.revokeObjectURL(r)},className:"px-2.5 md:px-4 py-2 text-xs md:text-sm rounded transition-colors text-center bg-white border border-luxury-gray-5 text-luxury-gray-1 hover:border-luxury-black",children:"Export HTML"}),(0,t.jsx)("button",{onClick:()=>{let e=document.getElementById("agentTable");if(!e)return;let t="",r=e.querySelectorAll("tr");for(let e=0;e<r.length;e++){let l=r[e].querySelectorAll("th, td"),o=[];for(let e=0;e<l.length;e++){let t=l[e].textContent||"";9===e&&(t=Array.from(l[e].querySelectorAll("a")).map(e=>e.href).join("; ")),((t=t.replace(/"/g,'""')).includes(",")||t.includes("\n")||t.includes('"'))&&(t=`"${t}"`),o.push(t)}t+=o.join(",")+"\n"}let l=new Blob([t],{type:"text/csv;charset=utf-8;"}),o=URL.createObjectURL(l),n=document.createElement("a");n.href=o,n.download=`agent-roster-${new Date().toISOString().split("T")[0]}.csv`,n.click(),URL.revokeObjectURL(o)},className:"px-2.5 md:px-4 py-2 text-xs md:text-sm rounded transition-colors text-center bg-white border border-luxury-gray-5 text-luxury-gray-1 hover:border-luxury-black",children:"Export Excel"}),(0,t.jsx)("button",{onClick:s,className:"px-2.5 md:px-4 py-2 text-xs md:text-sm rounded transition-colors text-center bg-white border border-luxury-gray-5 text-luxury-gray-1 hover:border-luxury-black",children:"Export PDF"}),(0,t.jsx)("button",{onClick:()=>{a?(navigator.clipboard.writeText(a),alert("Public link copied to clipboard!")):alert("Public link not available")},className:"px-2.5 md:px-4 py-2 text-xs md:text-sm rounded transition-colors text-center bg-luxury-black text-white hover:opacity-90",children:"Share Link"})]}),a&&(0,t.jsx)("div",{className:"w-full md:w-auto md:flex-1 md:max-w-md mb-4 md:mb-0",children:(0,t.jsx)("input",{type:"text",readOnly:!0,value:a,className:"input-luxury text-xs w-full md:w-auto",onClick:e=>e.target.select()})})]})}),(0,t.jsx)("div",{className:"agent-roster-container",style:{margin:"0",padding:"0",width:"100%",overflowX:"hidden"},dangerouslySetInnerHTML:{__html:e}})]})}e.s(["default",()=>l])}]);