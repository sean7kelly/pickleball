const https = require('https');

exports.handler = async function(event, context) {
  // Extend lambda timeout
  context.callbackWaitsForEmptyEventLoop = false;
  
  if(event.httpMethod === 'OPTIONS') {
    return {statusCode:200, headers:{'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'Content-Type','Access-Control-Allow-Methods':'POST'}};
  }
  if(event.httpMethod !== 'POST') {
    return {statusCode:405, headers:{'Content-Type':'application/json','Access-Control-Allow-Origin':'*'}, body:JSON.stringify({error:'Method Not Allowed'})};
  }
  
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if(!apiKey) return {statusCode:500, headers:{'Content-Type':'application/json','Access-Control-Allow-Origin':'*'}, body:JSON.stringify({error:'API key not configured'})};
  
  let body;
  try { body = JSON.parse(event.body); } 
  catch(e) { return {statusCode:400, headers:{'Content-Type':'application/json','Access-Control-Allow-Origin':'*'}, body:JSON.stringify({error:'Invalid JSON'})}; }
  
  const { system, messages, max_tokens } = body;
  
  const postData = JSON.stringify({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: max_tokens || 3000,
    system,
    messages
  });
  
  return new Promise((resolve) => {
    const req = https.request({
      hostname: 'api.anthropic.com',
      path: '/v1/messages',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'Content-Length': Buffer.byteLength(postData)
      },
      timeout: 25000
    }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        resolve({statusCode:200, headers:{'Content-Type':'application/json','Access-Control-Allow-Origin':'*'}, body:data});
      });
    });
    req.on('timeout', () => {
      req.destroy();
      resolve({statusCode:504, headers:{'Content-Type':'application/json','Access-Control-Allow-Origin':'*'}, body:JSON.stringify({error:'Request timed out - try fewer rounds or Standard generator'})});
    });
    req.on('error', (e) => {
      resolve({statusCode:500, headers:{'Content-Type':'application/json','Access-Control-Allow-Origin':'*'}, body:JSON.stringify({error:e.message})});
    });
    req.write(postData);
    req.end();
  });
};
