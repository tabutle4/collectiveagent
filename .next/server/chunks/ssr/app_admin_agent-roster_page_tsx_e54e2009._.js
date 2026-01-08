module.exports=[32450,a=>{"use strict";var b=a.i(87924),c=a.i(72131);function d(){let[a,d]=(0,c.useState)(""),[e,f]=(0,c.useState)(!0),[g,h]=(0,c.useState)(null),[i,j]=(0,c.useState)(!1);(0,c.useEffect)(()=>{fetch(`/agent-roster.html?t=${Date.now()}`).then(a=>{if(!a.ok)throw Error(`Failed to fetch roster: ${a.statusText}`);return a.text()}).then(a=>{let b=new DOMParser().parseFromString(a,"text/html"),c=b.querySelector("style")?.innerHTML||"";c=c.replace(/body\s*\{[^}]*\}/g,`body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
            background: transparent;
            min-height: auto;
            padding: 0;
        }`);let e=b.querySelectorAll("script"),g="";e.forEach(a=>{g+=a.innerHTML+"\n"});let h=b.querySelector("body")?.innerHTML||"",i=new DOMParser().parseFromString(`<div>${h}</div>`,"text/html").querySelector("div");if(i){let a=i.querySelector(".header");a&&a.remove();let b=i.querySelector(".page-title h1");b&&b.remove(),h=i.innerHTML||""}d(`
          <style>${c}</style>
          <div style="padding: 24px; background: linear-gradient(to bottom right, #f9fafb, #f3f4f6, #f9fafb); min-height: calc(100vh - 80px);">
            ${h}
          </div>
        `),window.__rosterScripts=g,f(!1)}).catch(a=>{console.error("Error loading agent roster:",a),d(`
          <div style="padding: 24px; text-align: center;">
            <h2 style="color: #dc2626; margin-bottom: 16px;">Error Loading Roster</h2>
            <p style="color: #6b7280; margin-bottom: 8px;">${a?.message||"Failed to load agent roster"}</p>
            <p style="color: #9ca3af; font-size: 14px;">Please refresh the page or contact support if the issue persists.</p>
          </div>
        `),f(!1)})},[]),(0,c.useEffect)(()=>{if(!a||i)return;let b=window.__rosterScripts;b&&b.trim()?setTimeout(()=>{try{let a=b.replace(/<script[^>]*>/gi,"").replace(/<\/script>/gi,"").trim();if(!a)return void j(!0);let c=`(function() {
            try {
              ${a}
            } catch (e) {
              console.warn('Roster script execution error:', e);
            }
          })();`,d=document.createElement("script");d.type="text/javascript";try{d.textContent=c;let a=document.body;a?(a.appendChild(d),setTimeout(()=>{try{d.parentNode&&d.parentNode.removeChild(d)}catch(a){}},200)):setTimeout(()=>{try{document.body&&(document.body.appendChild(d),setTimeout(()=>{try{d.parentNode&&d.parentNode.removeChild(d)}catch(a){}},200))}catch(a){console.warn("Could not append script to body:",a)}},100)}catch(a){console.warn("Script execution failed:",a)}j(!0)}catch(a){console.error("Error executing roster scripts:",a),j(!0)}},500):j(!0)},[a,i]),(0,c.useEffect)(()=>{if(a)return window.filterTable=function(){if(!document.getElementById("agentTable"))return;let a=document.getElementById("searchInput")?.value.toLowerCase()||"",b=(document.getElementById("officeFilter")?.value||"all").trim(),c=(document.getElementById("teamFilter")?.value||"all").trim(),d=(document.getElementById("divisionFilter")?.value||"all").trim(),e="all"===b?"all":b.toLowerCase(),f="all"===c?"all":c.toLowerCase(),g="all"===d?"all":d.toLowerCase(),h=document.getElementById("agentTable");if(!h)return;let i=h.getElementsByTagName("tbody")[0]?.getElementsByTagName("tr")||[],j=0;for(let b=0;b<i.length;b++){let c=i[b],d=(c.getAttribute("data-name")||"").trim(),h=(c.getAttribute("data-email")||"").trim(),k=(c.getAttribute("data-office")||"").trim().toLowerCase(),l=(c.getAttribute("data-team")||"").trim().toLowerCase(),m=(c.getAttribute("data-division")||"").trim().toLowerCase(),n=c.getAttribute("data-phone")||"",o=c.getAttribute("data-birthday")||"",p=c.getAttribute("data-ig")||"",q=c.getAttribute("data-tiktok")||"",r=c.getAttribute("data-threads")||"",s=c.getAttribute("data-youtube")||"",t=c.getAttribute("data-linkedin")||"",u=c.getAttribute("data-facebook")||"",v=!a||d.includes(a)||h.includes(a)||n.includes(a)||o.includes(a)||p.includes(a)||q.includes(a)||r.includes(a)||s.includes(a)||t.includes(a)||u.includes(a),w="all"===e||k===e,x="all"===f||l===f,y=!1;if("all"===g?y=!0:m&&"-"!==m&&m.trim().length>0&&(y=m.split("|").map(a=>a.trim().toLowerCase()).filter(a=>a.length>0&&"-"!==a).includes(g)),v&&w&&x&&y){c.style.display="",j++;let a=c.querySelector(".row-number");a&&(a.textContent=String(j))}else c.style.display="none"}let k=document.getElementById("agent-count");k&&(k.textContent=j+" agent"+(1!==j?"s":""));let l=document.getElementById("noResults");l&&(l.style.display=0===j?"block":"none")},()=>{try{window.filterTable&&delete window.filterTable}catch(a){}}},[a]),(0,c.useEffect)(()=>{(async()=>{try{h("http://localhost:3000/roster")}catch(a){console.error("Error generating public link:",a)}})()},[]);let k=async()=>{let a=window.open("","_blank");if(!a)return;let b=`
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
    `;a.document.write(b),a.document.close(),a.onload=()=>{a.print()}};return e?(0,b.jsx)("div",{className:"flex items-center justify-center min-h-[400px]",children:(0,b.jsx)("p",{className:"text-luxury-gray-2",children:"Loading agent roster..."})}):(0,b.jsxs)("div",{children:[(0,b.jsx)("div",{className:"flex items-center justify-between mb-5 md:mb-8",children:(0,b.jsx)("h2",{className:"text-xl md:text-2xl font-semibold tracking-luxury",style:{fontWeight:"600"},children:"Agent Roster"})}),(0,b.jsx)("div",{className:"mb-4 md:mb-6 -mx-6 px-6 md:mx-0 md:px-0",children:(0,b.jsxs)("div",{className:"flex flex-col md:flex-row md:items-center gap-3",children:[(0,b.jsxs)("div",{className:"grid grid-cols-2 md:flex md:flex-row gap-2 md:gap-2",children:[(0,b.jsx)("button",{onClick:()=>{if(!a)return;let b=new Blob([`
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
    `],{type:"text/html"}),c=URL.createObjectURL(b),d=document.createElement("a");d.href=c,d.download=`agent-roster-${new Date().toISOString().split("T")[0]}.html`,d.click(),URL.revokeObjectURL(c)},className:"px-2.5 md:px-4 py-2 text-xs md:text-sm rounded transition-colors text-center bg-white border border-luxury-gray-5 text-luxury-gray-1 hover:border-luxury-black",children:"Export HTML"}),(0,b.jsx)("button",{onClick:()=>{let a=document.getElementById("agentTable");if(!a)return;let b="",c=a.querySelectorAll("tr");for(let a=0;a<c.length;a++){let d=c[a].querySelectorAll("th, td"),e=[];for(let a=0;a<d.length;a++){let b=d[a].textContent||"";9===a&&(b=Array.from(d[a].querySelectorAll("a")).map(a=>a.href).join("; ")),((b=b.replace(/"/g,'""')).includes(",")||b.includes("\n")||b.includes('"'))&&(b=`"${b}"`),e.push(b)}b+=e.join(",")+"\n"}let d=new Blob([b],{type:"text/csv;charset=utf-8;"}),e=URL.createObjectURL(d),f=document.createElement("a");f.href=e,f.download=`agent-roster-${new Date().toISOString().split("T")[0]}.csv`,f.click(),URL.revokeObjectURL(e)},className:"px-2.5 md:px-4 py-2 text-xs md:text-sm rounded transition-colors text-center bg-white border border-luxury-gray-5 text-luxury-gray-1 hover:border-luxury-black",children:"Export Excel"}),(0,b.jsx)("button",{onClick:k,className:"px-2.5 md:px-4 py-2 text-xs md:text-sm rounded transition-colors text-center bg-white border border-luxury-gray-5 text-luxury-gray-1 hover:border-luxury-black",children:"Export PDF"}),(0,b.jsx)("button",{onClick:()=>{g?(navigator.clipboard.writeText(g),alert("Public link copied to clipboard!")):alert("Public link not available")},className:"px-2.5 md:px-4 py-2 text-xs md:text-sm rounded transition-colors text-center bg-luxury-black text-white hover:opacity-90",children:"Share Link"})]}),g&&(0,b.jsx)("div",{className:"w-full md:w-auto md:flex-1 md:max-w-md mb-4 md:mb-0",children:(0,b.jsx)("input",{type:"text",readOnly:!0,value:g,className:"input-luxury text-xs w-full md:w-auto",onClick:a=>a.target.select()})})]})}),(0,b.jsx)("div",{className:"agent-roster-container",style:{margin:"0",padding:"0",width:"100%",overflowX:"hidden"},dangerouslySetInnerHTML:{__html:a}})]})}a.s(["default",()=>d])}];

//# sourceMappingURL=app_admin_agent-roster_page_tsx_e54e2009._.js.map