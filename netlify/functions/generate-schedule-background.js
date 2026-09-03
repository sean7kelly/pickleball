const https = require('https');

// Use Netlify Blobs to store results
const { getStore } = require('@netlify/blobs');

exports.handler = async function(event) {
  const jobId = Date.now().toString();
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if(!apiKey) return {statusCode:500, body:JSON.stringify({error:'No API key'})};
  
  let body;
  try { body = JSON.parse(event.body); } catch(e) { return {statusCode:400}; }
  
  const { system, messages, max_tokens } = body;
  
  // Store job ID for polling
  const store = getStore('schedule-results');
  await store.set(jobId, JSON.stringify({status:'processing'}));
  
  // Return job ID immediately (202 response happens automatically for background functions)
  // The background function continues running after this point
  
  const postData = JSON.stringify({
    model: 'claude-sonnet-4-6',
    max_tokens: max_tokens || 3000,
    system,
    messages
  });
  
  try {
    const result = await new Promise((resolve, reject) => {
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
        res.on('end', () => resolve(data));
      });
      req.on('error', reject);
      req.write(postData);
      req.end();
    });
    
    await store.set(jobId, JSON.stringify({status:'done', result}));
  } catch(e) {
    await store.set(jobId, JSON.stringify({status:'error', error:e.message}));
  }
  
  return {statusCode:202, body:JSON.stringify({jobId})};
};
