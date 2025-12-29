module.exports = [
"[project]/app/admin/agent-roster/page.tsx [app-ssr] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "default",
    ()=>AgentRosterPage
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/dist/server/route-modules/app-page/vendored/ssr/react-jsx-dev-runtime.js [app-ssr] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/dist/server/route-modules/app-page/vendored/ssr/react.js [app-ssr] (ecmascript)");
'use client';
;
;
function AgentRosterPage() {
    const [htmlContent, setHtmlContent] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useState"])('');
    const [loading, setLoading] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useState"])(true);
    const [publicLink, setPublicLink] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useState"])(null);
    const [scriptsExecuted, setScriptsExecuted] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useState"])(false);
    (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useEffect"])(()=>{
        // Load the HTML from the dynamic route (not the static file)
        // Add cache-busting to ensure we get fresh data
        fetch(`/agent-roster.html?t=${Date.now()}`).then((res)=>{
            if (!res.ok) {
                throw new Error(`Failed to fetch roster: ${res.statusText}`);
            }
            return res.text();
        }).then((html)=>{
            // Extract body content and styles from the HTML
            const parser = new DOMParser();
            const doc = parser.parseFromString(html, 'text/html');
            // Get styles from head
            let styles = doc.querySelector('style')?.innerHTML || '';
            // Adjust body styles for admin layout - remove padding and adjust min-height
            styles = styles.replace(/body\s*\{[^}]*\}/g, `body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
            background: transparent;
            min-height: auto;
            padding: 0;
        }`);
            // Get scripts from body
            const scripts = doc.querySelectorAll('script');
            let scriptContent = '';
            scripts.forEach((script)=>{
                scriptContent += script.innerHTML + '\n';
            });
            // Get body content
            let bodyContent = doc.querySelector('body')?.innerHTML || '';
            // Remove the header div and page-title h1 from body content
            const bodyParser = new DOMParser();
            const wrapper = bodyParser.parseFromString(`<div>${bodyContent}</div>`, 'text/html');
            const wrapperDiv = wrapper.querySelector('div');
            if (wrapperDiv) {
                const header = wrapperDiv.querySelector('.header');
                if (header) {
                    header.remove();
                }
                const pageTitleH1 = wrapperDiv.querySelector('.page-title h1');
                if (pageTitleH1) {
                    pageTitleH1.remove();
                }
                bodyContent = wrapperDiv.innerHTML || '';
            }
            // Combine styles and body content with wrapper
            const combinedHtml = `
          <style>${styles}</style>
          <div style="padding: 24px; background: linear-gradient(to bottom right, #f9fafb, #f3f4f6, #f9fafb); min-height: calc(100vh - 80px);">
            ${bodyContent}
          </div>
        `;
            setHtmlContent(combinedHtml);
            window.__rosterScripts = scriptContent;
            setLoading(false);
        }).catch((error)=>{
            console.error('Error loading agent roster:', error);
            // Set error state to show user-friendly message
            setHtmlContent(`
          <div style="padding: 24px; text-align: center;">
            <h2 style="color: #dc2626; margin-bottom: 16px;">Error Loading Roster</h2>
            <p style="color: #6b7280; margin-bottom: 8px;">${error?.message || 'Failed to load agent roster'}</p>
            <p style="color: #9ca3af; font-size: 14px;">Please refresh the page or contact support if the issue persists.</p>
          </div>
        `);
            setLoading(false);
        });
    }, []);
    // Execute scripts after HTML content is rendered
    (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useEffect"])(()=>{
        if (!htmlContent || scriptsExecuted) return;
        const scriptContent = window.__rosterScripts;
        if (scriptContent && scriptContent.trim()) {
            // Wait for DOM to be ready
            setTimeout(()=>{
                try {
                    // Clean up the script content - remove any potential syntax issues
                    let cleanedScript = scriptContent.replace(/<script[^>]*>/gi, '').replace(/<\/script>/gi, '').trim();
                    if (!cleanedScript) {
                        setScriptsExecuted(true);
                        return;
                    }
                    // Wrap script in try-catch to handle any syntax errors gracefully
                    const wrappedScript = `(function() {
            try {
              ${cleanedScript}
            } catch (e) {
              console.warn('Roster script execution error:', e);
            }
          })();`;
                    // Create script element with proper type
                    const script = document.createElement('script');
                    script.type = 'text/javascript';
                    // Use a safer method: append directly to body
                    try {
                        script.textContent = wrappedScript;
                        const target = document.body;
                        if (target) {
                            // Simply append to body - this is the safest method
                            target.appendChild(script);
                            // Remove after execution
                            setTimeout(()=>{
                                try {
                                    if (script.parentNode) {
                                        script.parentNode.removeChild(script);
                                    }
                                } catch (e) {
                                // Ignore cleanup errors
                                }
                            }, 200);
                        } else {
                            // If body doesn't exist yet, wait a bit and try again
                            setTimeout(()=>{
                                try {
                                    if (document.body) {
                                        document.body.appendChild(script);
                                        setTimeout(()=>{
                                            try {
                                                if (script.parentNode) {
                                                    script.parentNode.removeChild(script);
                                                }
                                            } catch (e) {
                                            // Ignore
                                            }
                                        }, 200);
                                    }
                                } catch (e) {
                                    console.warn('Could not append script to body:', e);
                                }
                            }, 100);
                        }
                    } catch (appendError) {
                        // If appendChild fails, log but don't crash
                        console.warn('Script execution failed:', appendError);
                    }
                    setScriptsExecuted(true);
                } catch (error) {
                    console.error('Error executing roster scripts:', error);
                    setScriptsExecuted(true); // Mark as executed to prevent infinite retries
                }
            }, 500); // Increased timeout to ensure DOM is ready
        } else {
            setScriptsExecuted(true); // No scripts to execute
        }
    }, [
        htmlContent,
        scriptsExecuted
    ]);
    // Inject the filterTable function into the window when HTML content loads
    (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useEffect"])(()=>{
        if (!htmlContent) return;
        window.filterTable = function() {
            if (!document.getElementById('agentTable')) return;
            const searchInput = document.getElementById('searchInput')?.value.toLowerCase() || '';
            const officeFilter = document.getElementById('officeFilter')?.value || 'all';
            const teamFilter = document.getElementById('teamFilter')?.value || 'all';
            const divisionFilter = document.getElementById('divisionFilter')?.value || 'all';
            const table = document.getElementById('agentTable');
            if (!table) return;
            const rows = table.getElementsByTagName('tbody')[0]?.getElementsByTagName('tr') || [];
            let visibleCount = 0;
            for(let i = 0; i < rows.length; i++){
                const row = rows[i];
                const name = row.getAttribute('data-name') || '';
                const email = row.getAttribute('data-email') || '';
                const office = row.getAttribute('data-office') || '';
                const team = row.getAttribute('data-team') || '';
                const division = row.getAttribute('data-division') || '';
                const phone = row.getAttribute('data-phone') || '';
                const birthday = row.getAttribute('data-birthday') || '';
                const ig = row.getAttribute('data-ig') || '';
                const tiktok = row.getAttribute('data-tiktok') || '';
                const threads = row.getAttribute('data-threads') || '';
                const youtube = row.getAttribute('data-youtube') || '';
                const linkedin = row.getAttribute('data-linkedin') || '';
                const facebook = row.getAttribute('data-facebook') || '';
                // Check search term
                const matchesSearch = !searchInput || name.includes(searchInput) || email.includes(searchInput) || phone.includes(searchInput) || birthday.includes(searchInput) || ig.includes(searchInput) || tiktok.includes(searchInput) || threads.includes(searchInput) || youtube.includes(searchInput) || linkedin.includes(searchInput) || facebook.includes(searchInput);
                // Check filters
                const matchesOffice = officeFilter === 'all' || office === officeFilter;
                const matchesTeam = teamFilter === 'all' || team === teamFilter;
                const matchesDivision = divisionFilter === 'all' || division === divisionFilter;
                if (matchesSearch && matchesOffice && matchesTeam && matchesDivision) {
                    row.style.display = '';
                    visibleCount++;
                    // Update row number
                    const rowNumber = row.querySelector('.row-number');
                    if (rowNumber) {
                        rowNumber.textContent = String(visibleCount);
                    }
                } else {
                    row.style.display = 'none';
                }
            }
            // Update agent count
            const agentCount = document.getElementById('agent-count');
            if (agentCount) {
                agentCount.textContent = visibleCount + ' agent' + (visibleCount !== 1 ? 's' : '');
            }
            // Show/hide no results message
            const noResults = document.getElementById('noResults');
            if (noResults) {
                noResults.style.display = visibleCount === 0 ? 'block' : 'none';
            }
        };
        // Cleanup function
        return ()=>{
            try {
                if (window.filterTable) {
                    delete window.filterTable;
                }
            } catch (error) {
            // Ignore deletion errors
            }
        };
    }, [
        htmlContent
    ]);
    (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useEffect"])(()=>{
        // Generate or fetch public link
        const generatePublicLink = async ()=>{
            try {
                // Check if there's an existing public roster link in settings or generate one
                const baseUrl = ("TURBOPACK compile-time value", "http://localhost:3000") || window.location.origin;
                const link = `${baseUrl}/roster`;
                setPublicLink(link);
            } catch (error) {
                console.error('Error generating public link:', error);
            }
        };
        generatePublicLink();
    }, []);
    const exportHTML = ()=>{
        if (!htmlContent) return;
        const fullHtml = `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>CRC Agent Roster</title>
    ${document.querySelector('.agent-roster-container')?.querySelector('style')?.outerHTML || ''}
</head>
<body>
    ${document.querySelector('.agent-roster-container')?.querySelector('div')?.innerHTML || ''}
    <script>
        ${window.filterTable?.toString() || ''}
    </script>
</body>
</html>
    `;
        const blob = new Blob([
            fullHtml
        ], {
            type: 'text/html'
        });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `agent-roster-${new Date().toISOString().split('T')[0]}.html`;
        a.click();
        URL.revokeObjectURL(url);
    };
    const exportExcel = ()=>{
        const table = document.getElementById('agentTable');
        if (!table) return;
        let csv = '';
        const rows = table.querySelectorAll('tr');
        for(let i = 0; i < rows.length; i++){
            const row = rows[i];
            const cols = row.querySelectorAll('th, td');
            const rowData = [];
            for(let j = 0; j < cols.length; j++){
                let cellData = cols[j].textContent || '';
                // Remove social media icons/text, keep links if needed
                if (j === 9) {
                    const links = cols[j].querySelectorAll('a');
                    cellData = Array.from(links).map((a)=>a.href).join('; ');
                }
                // Escape quotes and wrap in quotes if contains comma
                cellData = cellData.replace(/"/g, '""');
                if (cellData.includes(',') || cellData.includes('\n') || cellData.includes('"')) {
                    cellData = `"${cellData}"`;
                }
                rowData.push(cellData);
            }
            csv += rowData.join(',') + '\n';
        }
        const blob = new Blob([
            csv
        ], {
            type: 'text/csv;charset=utf-8;'
        });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `agent-roster-${new Date().toISOString().split('T')[0]}.csv`;
        a.click();
        URL.revokeObjectURL(url);
    };
    const exportPDF = async ()=>{
        const printWindow = window.open('', '_blank');
        if (!printWindow) return;
        const fullHtml = `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>CRC Agent Roster</title>
    ${document.querySelector('.agent-roster-container')?.querySelector('style')?.outerHTML || ''}
</head>
<body>
    ${document.querySelector('.agent-roster-container')?.querySelector('div')?.innerHTML || ''}
</body>
</html>
    `;
        printWindow.document.write(fullHtml);
        printWindow.document.close();
        printWindow.onload = ()=>{
            printWindow.print();
        };
    };
    const sharePublicLink = ()=>{
        if (!publicLink) {
            alert('Public link not available');
            return;
        }
        navigator.clipboard.writeText(publicLink);
        alert('Public link copied to clipboard!');
    };
    if (loading) {
        return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
            className: "flex items-center justify-center min-h-[400px]",
            children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("p", {
                className: "text-luxury-gray-2",
                children: "Loading agent roster..."
            }, void 0, false, {
                fileName: "[project]/app/admin/agent-roster/page.tsx",
                lineNumber: 396,
                columnNumber: 9
            }, this)
        }, void 0, false, {
            fileName: "[project]/app/admin/agent-roster/page.tsx",
            lineNumber: 395,
            columnNumber: 7
        }, this);
    }
    return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
        children: [
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                className: "flex items-center justify-between mb-5 md:mb-8",
                children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("h2", {
                    className: "text-xl md:text-2xl font-semibold tracking-luxury",
                    style: {
                        fontWeight: '600'
                    },
                    children: "Agent Roster"
                }, void 0, false, {
                    fileName: "[project]/app/admin/agent-roster/page.tsx",
                    lineNumber: 404,
                    columnNumber: 9
                }, this)
            }, void 0, false, {
                fileName: "[project]/app/admin/agent-roster/page.tsx",
                lineNumber: 403,
                columnNumber: 7
            }, this),
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                className: "mb-4 md:mb-6 -mx-6 px-6 md:mx-0 md:px-0",
                children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                    className: "flex flex-col md:flex-row md:items-center gap-3",
                    children: [
                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                            className: "grid grid-cols-2 md:flex md:flex-row gap-2 md:gap-2",
                            children: [
                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("button", {
                                    onClick: exportHTML,
                                    className: "px-2.5 md:px-4 py-2 text-xs md:text-sm rounded transition-colors text-center bg-white border border-luxury-gray-5 text-luxury-gray-1 hover:border-luxury-black",
                                    children: "Export HTML"
                                }, void 0, false, {
                                    fileName: "[project]/app/admin/agent-roster/page.tsx",
                                    lineNumber: 411,
                                    columnNumber: 9
                                }, this),
                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("button", {
                                    onClick: exportExcel,
                                    className: "px-2.5 md:px-4 py-2 text-xs md:text-sm rounded transition-colors text-center bg-white border border-luxury-gray-5 text-luxury-gray-1 hover:border-luxury-black",
                                    children: "Export Excel"
                                }, void 0, false, {
                                    fileName: "[project]/app/admin/agent-roster/page.tsx",
                                    lineNumber: 417,
                                    columnNumber: 9
                                }, this),
                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("button", {
                                    onClick: exportPDF,
                                    className: "px-2.5 md:px-4 py-2 text-xs md:text-sm rounded transition-colors text-center bg-white border border-luxury-gray-5 text-luxury-gray-1 hover:border-luxury-black",
                                    children: "Export PDF"
                                }, void 0, false, {
                                    fileName: "[project]/app/admin/agent-roster/page.tsx",
                                    lineNumber: 423,
                                    columnNumber: 9
                                }, this),
                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("button", {
                                    onClick: sharePublicLink,
                                    className: "px-2.5 md:px-4 py-2 text-xs md:text-sm rounded transition-colors text-center bg-luxury-black text-white hover:opacity-90",
                                    children: "Share Link"
                                }, void 0, false, {
                                    fileName: "[project]/app/admin/agent-roster/page.tsx",
                                    lineNumber: 429,
                                    columnNumber: 9
                                }, this)
                            ]
                        }, void 0, true, {
                            fileName: "[project]/app/admin/agent-roster/page.tsx",
                            lineNumber: 410,
                            columnNumber: 11
                        }, this),
                        publicLink && /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                            className: "w-full md:w-auto md:flex-1 md:max-w-md mb-4 md:mb-0",
                            children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("input", {
                                type: "text",
                                readOnly: true,
                                value: publicLink,
                                className: "input-luxury text-xs w-full md:w-auto",
                                onClick: (e)=>e.target.select()
                            }, void 0, false, {
                                fileName: "[project]/app/admin/agent-roster/page.tsx",
                                lineNumber: 438,
                                columnNumber: 11
                            }, this)
                        }, void 0, false, {
                            fileName: "[project]/app/admin/agent-roster/page.tsx",
                            lineNumber: 437,
                            columnNumber: 13
                        }, this)
                    ]
                }, void 0, true, {
                    fileName: "[project]/app/admin/agent-roster/page.tsx",
                    lineNumber: 409,
                    columnNumber: 9
                }, this)
            }, void 0, false, {
                fileName: "[project]/app/admin/agent-roster/page.tsx",
                lineNumber: 408,
                columnNumber: 7
            }, this),
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                className: "agent-roster-container",
                style: {
                    margin: '0',
                    padding: '0',
                    width: '100%',
                    overflowX: 'hidden'
                },
                dangerouslySetInnerHTML: {
                    __html: htmlContent
                }
            }, void 0, false, {
                fileName: "[project]/app/admin/agent-roster/page.tsx",
                lineNumber: 450,
                columnNumber: 7
            }, this)
        ]
    }, void 0, true, {
        fileName: "[project]/app/admin/agent-roster/page.tsx",
        lineNumber: 402,
        columnNumber: 5
    }, this);
}
}),
];

//# sourceMappingURL=app_admin_agent-roster_page_tsx_e54e2009._.js.map