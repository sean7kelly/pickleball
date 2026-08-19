const https = require('https');

exports.handler = async function(event) {
  if(event.httpMethod === 'OPTIONS') {
    return {statusCode:200, headers:{'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'Content-Type','Access-Control-Allow-Methods':'POST'}};
  }
  if(event.httpMethod !== 'POST') {
    return {statusCode:405, headers:{'Content-Type':'application/json','Access-Control-Allow-Origin':'*'}, body:JSON.stringify({error:'Method Not Allowed'})};
  }
  
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if(!apiKey) {
    return {statusCode:500, headers:{'Content-Type':'application/json','Access-Control-Allow-Origin':'*'}, body:JSON.stringify({error:'API key not configured'})};
  }
  
  let body;
  try { body = JSON.parse(event.body); } 
  catch(e) { return {statusCode:400, headers:{'Content-Type':'application/json','Access-Control-Allow-Origin':'*'}, body:JSON.stringify({error:'Invalid JSON: '+e.message})}; }
  
  const { system, messages, max_tokens } = body;
  
  // Add assistant prefill to force JSON output
  const messagesWithPrefill = [
    ...messages,
    { role: 'assistant', content: '{' }
  ];
  
  const postData = JSON.stringify({
    model: 'claude-sonnet-4-6',
    max_tokens: max_tokens || 4000,
    system,
    messages: messagesWithPrefill
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
      }
    }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        // Parse response and prepend the { prefill to the text
        try {
          const parsed = JSON.parse(data);
          if(parsed.content && parsed.content[0] && parsed.content[0].text) {
            parsed.content[0].text = '{' + parsed.content[0].text;
          }
          resolve({
            statusCode: 200,
            headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
            body: JSON.stringify(parsed)
          });
        } catch(e) {
          resolve({
            statusCode: 200,
            headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
            body: data
          });
        }
      });
    });
    req.on('error', (e) => {
      resolve({ statusCode: 500, headers: {'Content-Type':'application/json','Access-Control-Allow-Origin':'*'}, body: JSON.stringify({ error: e.message }) });
    });
    req.write(postData);
    req.end();
  });
};
