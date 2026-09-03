const { getStore } = require('@netlify/blobs');

exports.handler = async function(event) {
  const jobId = event.queryStringParameters && event.queryStringParameters.jobId;
  if(!jobId) return {statusCode:400, body:JSON.stringify({error:'No jobId'})};
  
  const store = getStore('schedule-results');
  const raw = await store.get(jobId);
  if(!raw) return {statusCode:404, body:JSON.stringify({status:'not_found'})};
  
  const data = JSON.parse(raw);
  
  // Clean up if done
  if(data.status === 'done' || data.status === 'error') {
    await store.delete(jobId);
  }
  
  return {
    statusCode:200,
    headers:{'Content-Type':'application/json','Access-Control-Allow-Origin':'*'},
    body:JSON.stringify(data)
  };
};
