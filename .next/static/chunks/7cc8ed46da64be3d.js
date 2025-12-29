(globalThis.TURBOPACK||(globalThis.TURBOPACK=[])).push(["object"==typeof document?document.currentScript:void 0,2459,e=>{"use strict";var t=e.i(43476),a=e.i(71645);function l({template:e,onSave:l}){let[i,n]=(0,a.useState)(e?.name||""),[r,s]=(0,a.useState)(e?.description||""),[o,c]=(0,a.useState)(e?.category||"campaign"),[d,m]=(0,a.useState)(e?.subject_line||""),[u,x]=(0,a.useState)(e?.html_content||""),[p,h]=(0,a.useState)(e?.variables||[]),[g,b]=(0,a.useState)(e?.logo_url||"/logo-white.png"),[y,v]=(0,a.useState)(e?.is_default||!1),[f,j]=(0,a.useState)(e?.is_active??!0);(0,a.useEffect)(()=>{e&&(console.log("Syncing template state:",{name:e.name,subject_line:e.subject_line,has_html:!!e.html_content,html_length:e.html_content?.length||0}),n(e.name||""),s(e.description||""),c(e.category||"campaign"),m(e.subject_line||""),x(e.html_content||""),h(e.variables||[]),b(e.logo_url||"/logo-white.png"),v(e.is_default||!1),j(e.is_active??!0),console.log("State synced. Current values:",{name:e.name||"",subjectLine:e.subject_line||"",htmlContentLength:e.html_content?.length||0}))},[e]),(0,a.useEffect)(()=>{console.log("EmailTemplateBuilder state:",{name:i?.substring(0,50),subjectLine:d?.substring(0,50),htmlContentLength:u?.length||0,buttonDisabled:!i?.trim()||!d?.trim()||!u?.trim()})},[i,d,u]);let[N,w]=(0,a.useState)("code"),[k,C]=(0,a.useState)(""),[_,S]=(0,a.useState)(!1),[E,T]=(0,a.useState)(""),[L,D]=(0,a.useState)(!1),[P,$]=(0,a.useState)(!1),H=(0,a.useRef)(null),O=(0,a.useRef)(""),[R,M]=(0,a.useState)(0);(0,a.useEffect)(()=>{if(u){let e=u.match(/\{\{(\w+)\}\}/g);e&&h(e.map(e=>e.replace(/[{}]/g,"")))}},[u]);let A=async()=>{if(!u)return void C("");try{let e=p.includes("logo_url")?p:[...p,"logo_url"],t=await fetch("/api/email-templates/preview",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({html_content:u,variables:e})}),a=await t.json();if(!t.ok)throw Error(a.error);let l=a.preview_html;P&&(l=l.replace(/window\.previewEditableInitialized = true/g,""),l=U(l)),C(l)}catch(e){console.error("Preview error:",e),T("Failed to generate preview")}},U=e=>{let t=`
      <style>
        .editable-text {
          outline: 1px dashed #C9A961 !important;
          outline-offset: 2px !important;
          min-height: 1em !important;
          display: inline-block !important;
          cursor: text !important;
        }
        .editable-text:hover {
          outline: 2px solid #C9A961 !important;
          background-color: rgba(201, 169, 97, 0.1) !important;
        }
        .editable-text:focus {
          outline: 2px solid #C9A961 !important;
          background-color: rgba(201, 169, 97, 0.15) !important;
        }
      </style>
      <script>
        (function() {
          if (window.previewEditableInitialized) return;
          window.previewEditableInitialized = true;
          
          function makeEditable() {
            const walker = document.createTreeWalker(
              document.body,
              NodeFilter.SHOW_TEXT,
              null,
              false
            );
            
            const textNodes = [];
            let node;
            while (node = walker.nextNode()) {
              const text = node.textContent || '';
              // Skip if text contains variable placeholders
              if (!/\\{\\{\\w+\\}\\}/.test(text) && text.trim()) {
                textNodes.push(node);
              }
            }
            
            textNodes.forEach(textNode => {
              const parent = textNode.parentNode;
              if (parent && parent.tagName !== 'SCRIPT' && parent.tagName !== 'STYLE') {
                const span = document.createElement('span');
                span.contentEditable = 'true';
                span.className = 'editable-text';
                span.setAttribute('data-editable', 'true');
                span.textContent = textNode.textContent;
                
                // Prevent editing variable placeholders on paste
                span.addEventListener('paste', (e) => {
                  e.preventDefault();
                  const text = (e.clipboardData || window.clipboardData).getData('text');
                  if (!/\\{\\{\\w+\\}\\}/.test(text)) {
                    span.textContent = text;
                  }
                });
                
                // Prevent inserting variables
                span.addEventListener('input', (e) => {
                  const text = span.textContent || '';
                  if (/\\{\\{\\w+\\}\\}/.test(text)) {
                    // Remove variable placeholders
                    span.textContent = text.replace(/\\{\\{\\w+\\}\\}/g, '');
                  }
                });
                
                parent.replaceChild(span, textNode);
              }
            });
          }
          
          // Wait for DOM to load
          if (document.body) {
            makeEditable();
          } else {
            document.addEventListener('DOMContentLoaded', makeEditable);
          }
        })();
      </script>
    `;return e.includes("</body>")?e.replace("</body>",t+"</body>"):e+t};(0,a.useEffect)(()=>{"preview"===N&&A()},[N,u,p,P]),(0,a.useEffect)(()=>{"preview"===N?D(!1):$(!1)},[N]);let q=(e,t,a)=>{let l=e.match(/\{\{(\w+)\}\}/g),i=l?l.map(e=>e.replace(/[{}]/g,"")).filter((e,t,a)=>a.indexOf(e)===t):[],n=t.match(/\{\{(\w+)\}\}/g),r=(n?n.map(e=>e.replace(/[{}]/g,"")).filter((e,t,a)=>a.indexOf(e)===t):[]).filter(e=>!i.includes(e));return!(r.length>0)||window.confirm(`Warning: You are about to delete variable placeholders from the ${a}: ${r.map(e=>`{{${e}}}`).join(", ")}

These variables are used in the email template. Deleting them may cause errors.

Do you want to continue?`)};(0,a.useEffect)(()=>{u&&(O.current=u)},[u]);let W=async()=>{if(!i||!d||!u)return void T("Name, subject line, and HTML content are required");T(""),S(!0);try{console.log("Saving template with data:",{name:i,description:r,category:o,subject_line:d,html_content:u.substring(0,100)+"...",variables:p,logo_url:g,is_default:y,is_active:f}),await l({name:i.trim(),description:r?.trim()||null,category:o,subject_line:d.trim(),html_content:u,variables:p,logo_url:g.trim()||"/logo-white.png",is_default:y,is_active:f}),console.log("Template saved successfully")}catch(e){console.error("Save error:",e),T(e?.message||"Failed to save template. Please check the console for details.")}finally{S(!1)}};return(0,t.jsxs)("div",{className:"space-y-6",children:[E&&(0,t.jsx)("div",{className:"p-4 bg-red-50 border border-red-200 text-red-800 rounded text-sm",children:E}),(0,t.jsxs)("div",{className:"card-section space-y-6",children:[(0,t.jsx)("h3",{className:"text-lg font-medium tracking-luxury",children:"Template Settings"}),(0,t.jsxs)("div",{className:"grid md:grid-cols-2 gap-6",children:[(0,t.jsxs)("div",{children:[(0,t.jsxs)("label",{className:"block text-sm font-medium mb-2",children:["Template Name ",(0,t.jsx)("span",{className:"text-red-500",children:"*"})]}),(0,t.jsx)("input",{type:"text",value:i,onChange:e=>n(e.target.value),className:"input-luxury",placeholder:"Campaign Email Template",required:!0})]}),(0,t.jsxs)("div",{children:[(0,t.jsx)("label",{className:"block text-sm font-medium mb-2",children:"Category"}),(0,t.jsxs)("select",{value:o,onChange:e=>c(e.target.value),className:"select-luxury",children:[(0,t.jsx)("option",{value:"campaign",children:"Campaign"}),(0,t.jsx)("option",{value:"notification",children:"Notification"}),(0,t.jsx)("option",{value:"welcome",children:"Welcome"}),(0,t.jsx)("option",{value:"custom",children:"Custom"})]})]}),(0,t.jsxs)("div",{className:"md:col-span-2",children:[(0,t.jsx)("label",{className:"block text-sm font-medium mb-2",children:"Description (Optional)"}),(0,t.jsx)("input",{type:"text",value:r,onChange:e=>s(e.target.value),className:"input-luxury",placeholder:"Template description"})]}),(0,t.jsxs)("div",{className:"md:col-span-2",children:[(0,t.jsxs)("label",{className:"block text-sm font-medium mb-2",children:["Subject Line ",(0,t.jsx)("span",{className:"text-red-500",children:"*"})]}),(0,t.jsx)("input",{type:"text",value:d,onChange:e=>{let t=e.target.value;q(t,d,"subject line")&&m(t)},className:"input-luxury",placeholder:"Action Required: {{campaign_name}}",required:!0}),(0,t.jsxs)("p",{className:"text-xs text-luxury-gray-2 mt-1",children:["Use variables like ","{{campaign_name}}"," in your subject line"]})]}),(0,t.jsxs)("div",{className:"md:col-span-2",children:[(0,t.jsx)("label",{className:"block text-sm font-medium mb-2",children:"Logo URL"}),(0,t.jsx)("input",{type:"text",value:g,onChange:e=>b(e.target.value),className:"input-luxury",placeholder:"/logo-white.png"})]}),(0,t.jsx)("div",{className:"flex items-center space-x-4",children:(0,t.jsxs)("label",{className:"flex items-center space-x-3 cursor-pointer",children:[(0,t.jsx)("input",{type:"checkbox",checked:y,onChange:e=>v(e.target.checked),className:"w-4 h-4"}),(0,t.jsx)("span",{className:"text-sm font-medium",children:"Set as default for category"})]})}),(0,t.jsx)("div",{className:"flex items-center space-x-4",children:(0,t.jsxs)("label",{className:"flex items-center space-x-3 cursor-pointer",children:[(0,t.jsx)("input",{type:"checkbox",checked:f,onChange:e=>j(e.target.checked),className:"w-4 h-4"}),(0,t.jsx)("span",{className:"text-sm font-medium",children:"Template is active"})]})})]})]}),(0,t.jsxs)("div",{className:"card-section",children:[(0,t.jsx)("h3",{className:"text-lg font-medium tracking-luxury mb-4",children:"Available Variables"}),(0,t.jsx)("p",{className:"text-sm text-luxury-gray-2 mb-4",children:"Click a variable to insert it into your HTML content at the cursor position"}),(0,t.jsx)("div",{className:"grid md:grid-cols-2 gap-3",children:[{name:"first_name",label:"First Name",description:"Agent preferred first name"},{name:"last_name",label:"Last Name",description:"Agent preferred last name"},{name:"campaign_name",label:"Campaign Name",description:"Name of the campaign"},{name:"campaign_link",label:"Campaign Link",description:"Full URL to campaign form"},{name:"deadline",label:"Deadline",description:"Campaign deadline date"},{name:"logo_url",label:"Logo URL",description:"URL to logo image"}].map(e=>(0,t.jsxs)("button",{onClick:()=>{var t;let a;return t=e.name,a=`{{${t}}}`,void x(e=>e+a)},className:"text-left p-3 border border-luxury-gray-5 rounded hover:bg-luxury-light transition-colors",children:[(0,t.jsx)("div",{className:"font-mono text-sm text-luxury-black mb-1",children:`{{${e.name}}}`}),(0,t.jsx)("div",{className:"text-xs text-luxury-gray-2",children:e.description})]},e.name))}),p.length>0&&(0,t.jsxs)("div",{className:"mt-4 pt-4 border-t border-luxury-gray-5",children:[(0,t.jsx)("p",{className:"text-sm font-medium mb-2",children:"Variables used in template:"}),(0,t.jsx)("div",{className:"flex flex-wrap gap-2",children:p.map((e,a)=>(0,t.jsx)("span",{className:"text-xs px-2 py-1 bg-luxury-light rounded font-mono",children:`{{${e}}}`},`var-${a}-${e}`))})]})]}),(0,t.jsxs)("div",{className:"card-section",children:[(0,t.jsxs)("div",{className:"flex items-center justify-between mb-4",children:[(0,t.jsx)("h3",{className:"text-lg font-medium tracking-luxury",children:"Email Content"}),(0,t.jsxs)("div",{className:"flex gap-2",children:[(0,t.jsx)("button",{onClick:()=>w("code"),className:`px-4 py-2 text-sm rounded transition-colors ${"code"===N?"bg-luxury-black text-white":"bg-luxury-light text-luxury-black hover:bg-luxury-gray-5"}`,children:"HTML Code"}),(0,t.jsx)("button",{onClick:()=>w("preview"),className:`px-4 py-2 text-sm rounded transition-colors ${"preview"===N?"bg-luxury-black text-white":"bg-luxury-light text-luxury-black hover:bg-luxury-gray-5"}`,children:"Preview"})]})]}),"code"===N?(0,t.jsx)("div",{children:L?(0,t.jsxs)("div",{children:[(0,t.jsxs)("div",{className:"flex items-center justify-between mb-2",children:[(0,t.jsxs)("p",{className:"text-xs text-luxury-gray-2",children:["Editing HTML code. Use ","{{variable_name}}"," syntax for dynamic content"]}),(0,t.jsx)("button",{type:"button",onClick:()=>D(!1),className:"text-xs text-luxury-gray-2 hover:text-luxury-black underline",children:"Hide Editor"})]}),(0,t.jsx)("textarea",{value:u,onChange:e=>{let t=e.target.value;(O.current||(O.current=u),q(t,u,"HTML content"))?(O.current=t,x(t)):M(e=>e+1)},className:"textarea-luxury font-mono text-sm",rows:20,placeholder:"<!DOCTYPE html>...",required:!0},`html-editor-${R}`)]}):(0,t.jsxs)("div",{className:"border border-luxury-gray-5 rounded p-6 bg-luxury-light",children:[(0,t.jsx)("p",{className:"text-sm text-luxury-gray-2 mb-4",children:"HTML content is protected to prevent accidental edits."}),(0,t.jsx)("button",{type:"button",onClick:()=>D(!0),className:"px-3 md:px-4 py-2.5 md:py-2 text-xs md:text-sm rounded transition-colors text-center bg-luxury-black text-white hover:opacity-90",children:"Edit HTML"})]})}):(0,t.jsxs)("div",{className:"border border-luxury-gray-5 rounded p-4 bg-white",children:[(0,t.jsxs)("div",{className:"flex items-center justify-between mb-2",children:[(0,t.jsx)("p",{className:"text-xs text-luxury-gray-2",children:P?"Edit mode enabled - click on text to edit (variable placeholders are protected)":'Preview mode - click "Edit Preview" to make text editable'}),(0,t.jsx)("button",{type:"button",onClick:()=>{$(!P),P&&(()=>{if(H.current)try{let e=H.current;if(!e.contentWindow)return;let t=e.contentDocument||e.contentWindow.document;if(!t||!t.body)return;let a=t.body.innerHTML;p.forEach(e=>{let t={first_name:"John",last_name:"Doe",campaign_name:"2026 Plan Selection",campaign_link:"https://example.com/campaign/2026?token=sample-token",deadline:"December 31, 2025",logo_url:"https://agent.collectiverealtyco.com/logo-white.png"}[e]||"",l=RegExp(t.replace(/[.*+?^${}()|[\]\\]/g,"\\$&"),"g");a=a.replace(l,`{{${e}}}`)});let l=u.match(/<body[^>]*>([\s\S]*)<\/body>/i);if(l){let e=u.replace(/<body[^>]*>[\s\S]*<\/body>/i,l[0].replace(l[1],a));x(e)}}catch(e){console.error("Error syncing preview changes:",e),alert("Some changes from preview edit may not have synced. Please verify in HTML code view.")}})()},className:`text-xs px-3 py-1 rounded transition-colors ${P?"bg-luxury-black text-white":"bg-luxury-light text-luxury-black hover:bg-luxury-gray-5"}`,children:P?"Done Editing":"Edit Preview"})]}),k?(0,t.jsx)("div",{className:"relative",children:(0,t.jsx)("iframe",{ref:H,srcDoc:k,className:"w-full border-0",style:{height:"800px",minHeight:"400px"},title:"Email Preview"},P?"editable":"preview")}):(0,t.jsx)("div",{className:"text-center py-12 text-luxury-gray-2",children:"Generate preview..."})]})]}),(0,t.jsxs)("div",{className:"flex items-center gap-4",children:[(0,t.jsx)("button",{type:"button",onClick:e=>{e.preventDefault(),W()},disabled:_||!i?.trim()||!d?.trim()||!u?.trim(),className:"px-3 md:px-4 py-2.5 md:py-2 text-xs md:text-sm rounded transition-colors text-center bg-luxury-black text-white hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed",children:_?"Saving...":e?"Update Template":"Save Template"}),(!i?.trim()||!d?.trim()||!u?.trim())&&(0,t.jsxs)("p",{className:"text-xs text-luxury-gray-3",children:[!i?.trim()&&"Name required. ",!d?.trim()&&"Subject line required. ",!u?.trim()&&"HTML content required."]})]})]})}e.s(["default",()=>l])},58409,e=>{"use strict";var t=e.i(43476),a=e.i(18566),l=e.i(22016),i=e.i(2459);function n(){let e=(0,a.useRouter)(),n=async t=>{try{let a=await fetch("/api/email-templates",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(t)}),l=await a.json();if(!a.ok)throw Error(l.error||"Failed to save template");e.push(`/admin/email-templates/${l.template.id}`)}catch(e){console.error("Error saving template:",e),alert(e?.message||"Failed to save template")}};return(0,t.jsxs)("div",{className:"max-w-7xl mx-auto",children:[(0,t.jsxs)("div",{className:"mb-8",children:[(0,t.jsx)(l.default,{href:"/admin/email-templates",className:"text-sm text-luxury-gray-2 hover:text-luxury-black transition-colors mb-4 inline-block",children:"← Back to Templates"}),(0,t.jsx)("h2",{className:"text-xl md:text-2xl font-semibold tracking-luxury mb-5 md:mb-8",style:{fontWeight:"600"},children:"Create New Email Template"})]}),(0,t.jsx)(i.default,{onSave:n})]})}e.s(["default",()=>n])}]);