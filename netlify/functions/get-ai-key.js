exports.handler = async function(event) {
  return {
    statusCode: 200,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*'
    },
    body: JSON.stringify({ key: process.env.ANTHROPIC_API_KEY || '' })
  };
};
