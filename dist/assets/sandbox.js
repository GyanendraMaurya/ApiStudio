import"./modulepreload-polyfill-B5Qt9EMX.js";window.addEventListener("message",async s=>{const r=s.data;if(!(!r||typeof r.requestId!="string"))try{const e=await t(r.payload,r.code);s.source?.postMessage({requestId:r.requestId,ok:!0,value:e},{targetOrigin:"*"})}catch(e){s.source?.postMessage({requestId:r.requestId,ok:!1,error:e instanceof Error?e.message:String(e)},{targetOrigin:"*"})}});async function t(s,r){return new Function("input",`"use strict";
${r}
//# sourceURL=api-studio-transform.js`)(s)}
//# sourceMappingURL=sandbox.js.map
