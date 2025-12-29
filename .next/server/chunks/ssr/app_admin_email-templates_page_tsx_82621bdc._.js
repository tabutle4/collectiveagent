module.exports=[69971,a=>{"use strict";var b=a.i(87924),c=a.i(72131),d=a.i(38246),e=a.i(78560);let f=(0,a.i(70106).default)("eye",[["path",{d:"M2.062 12.348a1 1 0 0 1 0-.696 10.75 10.75 0 0 1 19.876 0 1 1 0 0 1 0 .696 10.75 10.75 0 0 1-19.876 0",key:"1nclc0"}],["circle",{cx:"12",cy:"12",r:"3",key:"1v7zrd"}]]);function g(a){return`https://agent.collectiverealtyco.com/seller/${a}`}function h(){let[a,g]=(0,c.useState)([]),[h,j]=(0,c.useState)(!0),[k,l]=(0,c.useState)(null);(0,c.useEffect)(()=>{m()},[]);let m=async()=>{try{let{data:a,error:b}=await e.supabase.from("email_templates").select("*").order("created_at",{ascending:!1});if(b)throw b;g(a||[])}catch(a){console.error("Error fetching templates:",a)}finally{j(!1)}};return h?(0,b.jsx)("div",{className:"text-center py-12 text-luxury-gray-2",children:"Loading..."}):(0,b.jsxs)("div",{children:[(0,b.jsxs)("div",{className:"flex items-center justify-between mb-5 md:mb-8",children:[(0,b.jsx)("h2",{className:"text-xl md:text-2xl font-semibold tracking-luxury",style:{fontWeight:"600"},children:"Email Templates"}),(0,b.jsx)(d.default,{href:"/admin/email-templates/new",className:"px-3 md:px-4 py-2.5 md:py-2 text-xs md:text-sm rounded transition-colors text-center bg-luxury-black text-white hover:opacity-90 inline-block",children:"New Template"})]}),(0,b.jsxs)("div",{className:"mb-8",children:[(0,b.jsx)("h3",{className:"text-lg font-medium mb-4",children:"Listing Coordination Emails"}),(0,b.jsxs)("div",{className:"grid md:grid-cols-2 lg:grid-cols-3 gap-4 mb-6",children:[(0,b.jsxs)("div",{className:"card-section hover:shadow-md transition-shadow relative group",children:[(0,b.jsx)("div",{className:"flex items-start justify-between mb-3",children:(0,b.jsx)("h3",{className:"text-lg font-medium tracking-luxury flex-1",children:"Welcome Email"})}),(0,b.jsx)("p",{className:"text-sm text-luxury-gray-2 mb-3 line-clamp-2",children:"Sent when listing coordination is activated"}),(0,b.jsxs)("div",{className:"flex items-center gap-4 text-xs text-luxury-gray-3 mb-3",children:[(0,b.jsx)("span",{className:"capitalize",children:"Listing Coordination"}),(0,b.jsx)("span",{className:"text-green-600",children:"Active"})]}),(0,b.jsxs)("div",{className:"mt-3 pt-3 border-t border-luxury-gray-5",children:[(0,b.jsx)("p",{className:"text-xs text-luxury-gray-3 mb-1",children:"Email Details:"}),(0,b.jsxs)("div",{className:"text-xs text-luxury-gray-2 space-y-1",children:[(0,b.jsxs)("p",{children:[(0,b.jsx)("strong",{children:"Subject:"})," Collective Realty Co. - Welcome to Weekly Listing Coordination - [Property Address]"]}),(0,b.jsxs)("p",{children:[(0,b.jsx)("strong",{children:"To:"})," Seller Email"]}),(0,b.jsxs)("p",{children:[(0,b.jsx)("strong",{children:"CC:"})," Agent Email"]}),(0,b.jsxs)("p",{children:[(0,b.jsx)("strong",{children:"BCC:"})," tcandcompliance@collectiverealtyco.com"]}),(0,b.jsxs)("p",{children:[(0,b.jsx)("strong",{children:"From:"})," Leah Parpan - Listing & Transaction Coordinator"]})]})]}),(0,b.jsx)("div",{className:"mt-3 pt-3 border-t border-luxury-gray-5",children:(0,b.jsxs)("button",{onClick:()=>l("welcome"),className:"w-full px-3 py-2 text-xs rounded transition-colors bg-white border border-luxury-gray-5 text-luxury-gray-1 hover:border-luxury-black flex items-center justify-center gap-2",children:[(0,b.jsx)(f,{className:"w-3 h-3"}),"Preview"]})})]}),(0,b.jsxs)("div",{className:"card-section hover:shadow-md transition-shadow relative group",children:[(0,b.jsx)("div",{className:"flex items-start justify-between mb-3",children:(0,b.jsx)("h3",{className:"text-lg font-medium tracking-luxury flex-1",children:"Weekly Report Email"})}),(0,b.jsx)("p",{className:"text-sm text-luxury-gray-2 mb-3 line-clamp-2",children:"Sent every Monday at 6:00 PM with activity reports"}),(0,b.jsxs)("div",{className:"flex items-center gap-4 text-xs text-luxury-gray-3 mb-3",children:[(0,b.jsx)("span",{className:"capitalize",children:"Listing Coordination"}),(0,b.jsx)("span",{className:"text-green-600",children:"Active"})]}),(0,b.jsxs)("div",{className:"mt-3 pt-3 border-t border-luxury-gray-5",children:[(0,b.jsx)("p",{className:"text-xs text-luxury-gray-3 mb-1",children:"Email Details:"}),(0,b.jsxs)("div",{className:"text-xs text-luxury-gray-2 space-y-1",children:[(0,b.jsxs)("p",{children:[(0,b.jsx)("strong",{children:"Subject:"})," Collective Realty Co. - Weekly Report - [Property Address] | [Date Sent]"]}),(0,b.jsxs)("p",{children:[(0,b.jsx)("strong",{children:"To:"})," Seller Email"]}),(0,b.jsxs)("p",{children:[(0,b.jsx)("strong",{children:"CC:"})," Agent Email"]}),(0,b.jsxs)("p",{children:[(0,b.jsx)("strong",{children:"BCC:"})," tcandcompliance@collectiverealtyco.com"]}),(0,b.jsxs)("p",{children:[(0,b.jsx)("strong",{children:"From:"})," Leah Parpan - Listing & Transaction Coordinator"]})]})]}),(0,b.jsx)("div",{className:"mt-3 pt-3 border-t border-luxury-gray-5",children:(0,b.jsxs)("button",{onClick:()=>l("weekly"),className:"w-full px-3 py-2 text-xs rounded transition-colors bg-white border border-luxury-gray-5 text-luxury-gray-1 hover:border-luxury-black flex items-center justify-center gap-2",children:[(0,b.jsx)(f,{className:"w-3 h-3"}),"Preview"]})})]})]})]}),(0,b.jsx)("div",{className:"mb-6",children:(0,b.jsx)("h3",{className:"text-lg font-medium mb-4",children:"Campaign Email Templates"})}),0===a.length?(0,b.jsxs)("div",{className:"card-section text-center py-12",children:[(0,b.jsx)("p",{className:"text-luxury-gray-2 mb-6",children:"No email templates found"}),(0,b.jsx)(d.default,{href:"/admin/email-templates/new",className:"px-3 md:px-4 py-2.5 md:py-2 text-xs md:text-sm rounded transition-colors text-center bg-luxury-black text-white hover:opacity-90 inline-block",children:"New Template"})]}):(0,b.jsx)("div",{className:"grid md:grid-cols-2 lg:grid-cols-3 gap-4",children:a.map(a=>(0,b.jsxs)("div",{className:"card-section hover:shadow-md transition-shadow relative group",children:[(0,b.jsxs)(d.default,{href:`/admin/email-templates/${a.id}`,className:"block",children:[(0,b.jsxs)("div",{className:"flex items-start justify-between mb-3",children:[(0,b.jsx)("h3",{className:"text-lg font-medium tracking-luxury flex-1",children:a.name}),a.is_default&&(0,b.jsx)("span",{className:"ml-2 px-2 py-1 text-xs bg-luxury-gold text-white rounded",children:"Default"})]}),a.description&&(0,b.jsx)("p",{className:"text-sm text-luxury-gray-2 mb-3 line-clamp-2",children:a.description}),(0,b.jsxs)("div",{className:"flex items-center gap-4 text-xs text-luxury-gray-3",children:[(0,b.jsx)("span",{className:"capitalize",children:a.category}),!1===a.is_active&&(0,b.jsx)("span",{className:"text-red-500",children:"Inactive"}),!0===a.is_active&&(0,b.jsx)("span",{className:"text-green-600",children:"Active"})]}),a.variables&&a.variables.length>0&&(0,b.jsxs)("div",{className:"mt-3 pt-3 border-t border-luxury-gray-5",children:[(0,b.jsx)("p",{className:"text-xs text-luxury-gray-3 mb-1",children:"Variables:"}),(0,b.jsxs)("div",{className:"flex flex-wrap gap-1",children:[a.variables.slice(0,3).map((c,d)=>(0,b.jsx)("span",{className:"text-xs px-2 py-0.5 bg-luxury-light rounded",children:`{{${c}}}`},`${a.id}-var-${d}`)),a.variables.length>3&&(0,b.jsxs)("span",{className:"text-xs text-luxury-gray-3",children:["+",a.variables.length-3," more"]})]})]})]}),(0,b.jsxs)("div",{className:"mt-3 pt-3 border-t border-luxury-gray-5 flex gap-2",children:[(0,b.jsx)("button",{onClick:async b=>{b.preventDefault(),b.stopPropagation();try{let b=await fetch(`/api/email-templates/${a.id}/duplicate`,{method:"POST"}),c=await b.json();if(!b.ok)throw Error(c.error||"Failed to duplicate template");alert("Template duplicated successfully"),m()}catch(a){alert(a.message||"Failed to duplicate template")}},className:"px-3 md:px-4 py-2.5 md:py-2 text-xs md:text-sm rounded transition-colors text-center bg-white border border-luxury-gray-5 text-luxury-gray-1 hover:border-luxury-black",children:"📋 Duplicate"}),(0,b.jsx)("button",{onClick:async b=>{if(b.preventDefault(),b.stopPropagation(),a.is_default)return void alert("Cannot delete default template. Please set another template as default first.");if(confirm(`Are you sure you want to delete "${a.name}"? This action cannot be undone.`))try{let b=await fetch(`/api/email-templates/${a.id}`,{method:"DELETE"}),c=await b.json();if(!b.ok)throw Error(c.error||"Failed to delete template");alert("Template deleted successfully"),m()}catch(a){alert(a.message||"Failed to delete template")}},disabled:a.is_default,className:`px-3 md:px-4 py-2.5 md:py-2 text-xs md:text-sm rounded transition-colors text-center ${a.is_default?"text-luxury-gray-3 cursor-not-allowed bg-luxury-light border border-luxury-gray-5":"bg-white border border-red-600 text-red-600 hover:bg-red-50"}`,children:a.is_default?"Cannot Delete (Default)":"🗑️ Delete"})]})]},a.id))}),k&&(0,b.jsx)("div",{className:"fixed inset-0 z-50 bg-black bg-opacity-50 flex items-center justify-center p-4",children:(0,b.jsxs)("div",{className:"bg-white rounded-lg max-w-4xl w-full max-h-[90vh] overflow-hidden flex flex-col",children:[(0,b.jsxs)("div",{className:"flex items-center justify-between p-4 border-b",children:[(0,b.jsx)("h3",{className:"text-lg font-medium",children:"welcome"===k?"Welcome Email Preview":"Weekly Report Email Preview"}),(0,b.jsx)("button",{onClick:()=>l(null),className:"text-luxury-gray-2 hover:text-luxury-black",children:"✕"})]}),(0,b.jsx)("div",{className:"flex-1 overflow-auto p-4",children:(0,b.jsx)(i,{type:k})})]})})]})}function i({type:a}){var c,d;let e={id:"sample",listing_id:"sample",agent_id:"sample-agent",seller_name:"John Smith",seller_email:"john@example.com",seller_magic_link:"sample-token-123",start_date:new Date().toISOString(),is_active:!0,service_fee:250,service_paid:!1,payment_method:"agent_pays",payment_date:null,onedrive_folder_url:"https://example.com",welcome_email_sent:!0,welcome_email_sent_at:new Date().toISOString(),last_email_sent_at:new Date().toISOString(),total_emails_sent:1,end_date:null,email_schedule_day:"monday",email_schedule_time:"18:00",next_email_scheduled_for:null,onedrive_folder_id:null,payment_due_date:null,notes:[],created_at:new Date().toISOString(),updated_at:new Date().toISOString()},f={id:"sample",agent_id:"sample-agent",property_address:"123 Main Street, Houston, TX 77002",pre_listing_token:null,just_listed_token:null,status:"active",transaction_type:"sale",agent_name:"Jane Agent",client_names:"John Smith",client_phone:null,client_email:null,mls_link:null,mls_login_info:null,estimated_launch_date:null,actual_launch_date:null,lead_source:null,pre_listing_form_completed:!1,just_listed_form_completed:!1,dotloop_file_created:!1,photography_requested:!1,photography_scheduled_date:null,listing_input_requested:!1,listing_input_paid:!1,listing_input_fee:0,listing_website_url:null,created_at:new Date().toISOString(),updated_at:new Date().toISOString(),closed_date:null,notes:[]},h=new Date().toLocaleDateString("en-US",{weekday:"long",month:"long",day:"numeric",year:"numeric"}),i="";if("welcome"===a){let a;a=g(e.seller_magic_link),i=`
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
    
    <p>Welcome to Collective Realty Co.'s Weekly Listing Coordination service for your property at <strong>${f.property_address}</strong>!</p>
    
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
        <a href="${a}" class="button">Access Your Dashboard</a>
      </p>
      <p style="font-size: 12px; color: #666666;">Bookmark this link for easy access to your reports anytime.</p>
    </div>
    
    <div class="info-box">
      <h3>Your Team</h3>
      <p><strong>Listing Agent:</strong><br>
      Jane Agent<br>
      jane@example.com<br>
      (281) 555-1234</p>
      
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
  `}else{let a;c="https://example.com/report1.pdf",d="https://example.com/report2.pdf",a=g(e.seller_magic_link),i=`
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
    <p>${f.property_address}</p>
    <p>Sent ${h}</p>
  </div>
  
  <div class="content">
    <p class="greeting">Hi ${e.seller_name},</p>
    
    <p>Your weekly activity report for <strong>${f.property_address}</strong> is ready.</p>
    
    ${c||d?`
    <div class="info-box">
      <h3>This Week's Reports</h3>
      <p style="text-align: center;">
        ${c?`<a href="${c}" class="button" style="margin: 5px;">Download Showing Report</a>`:""}
        ${d?`<a href="${d}" class="button" style="margin: 5px;">Download Traffic Report</a>`:""}
      </p>
    </div>
    `:""}
    
    <div class="dashboard-link">
      <p style="margin: 0 0 10px 0; font-size: 14px; font-weight: 600;">Access Your Dashboard</p>
      <p style="margin: 0; font-size: 12px; color: #666666;">View all your reports and listing details anytime:</p>
      <p style="margin: 15px 0 0 0;">
        <a href="${a}" class="button">Your Listing Dashboard</a>
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
  `}return(0,b.jsx)("iframe",{srcDoc:i,className:"w-full h-full min-h-[600px] border",title:"Email Preview"})}a.i(54799),a.s(["default",()=>h],69971)}];

//# sourceMappingURL=app_admin_email-templates_page_tsx_82621bdc._.js.map