const https = require('https');

exports.handler = async function(event) {
  if(event.httpMethod !== 'POST') return {statusCode:405,body:'Method Not Allowed'};
  
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if(!apiKey) return {statusCode:500,body:JSON.stringify({error:'API key not configured'})};
  
  let body;
  try { body = JSON.parse(event.body); } catch(e) { return {statusCode:400,body:JSON.stringify({error:'Invalid JSON'})}; }
  
  const { system, messages, max_tokens } = body;
  
  const postData = JSON.stringify({
    model: 'claude-sonnet-4-6',
    max_tokens: max_tokens || 4000,
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
      }
    }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        resolve({
          statusCode: res.statusCode,
          headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
          body: data
        });
      });
    });
    req.on('error', (e) => {
      resolve({ statusCode: 500, body: JSON.stringify({ error: e.message }) });
    });
    req.write(postData);
    req.end();
  });
};
