const https = require('https');
const url = require('url');

exports.handler = async (event) => {
  console.log('Event:', JSON.stringify(event));

  try {
    const targetApiEndpoint = process.env.TARGET_API_ENDPOINT;
    if (!targetApiEndpoint) {
      return {
        statusCode: 500,
        headers: getCorsHeaders(event),
        body: JSON.stringify({ error: 'Target API endpoint not configured' }),
      };
    }

    let targetPath = event.pathParameters?.proxy || event.path || '';
    if (targetPath.startsWith('/')) {
      targetPath = targetPath.substring(1);
    }

    const fullUrl = `${targetApiEndpoint}/${targetPath}`;
    console.log('Proxying request to:', fullUrl);

    const method = event.httpMethod || 'GET';
    const body = event.body
      ? event.isBase64Encoded
        ? Buffer.from(event.body, 'base64').toString()
        : event.body
      : null;

    const headers = { ...(event.headers || {}) };
    delete headers.host;
    delete headers.Host;

    const response = await makeRequest(fullUrl, method, headers, body);

    return {
      statusCode: response.statusCode,
      headers: { ...response.headers, ...getCorsHeaders(event) },
      body: response.body,
    };
  } catch (error) {
    console.error('Error:', error);
    return {
      statusCode: 500,
      headers: getCorsHeaders(event),
      body: JSON.stringify({
        error: 'Internal server error',
        message: error.message,
      }),
    };
  }
};

function getCorsHeaders(event) {
  const origin = event.headers && (event.headers.Origin || event.headers.origin);
  const allowedOrigins = process.env.ALLOWED_ORIGINS ? process.env.ALLOWED_ORIGINS.split(',') : [];

  const allowOrigin =
    origin && (allowedOrigins.includes('*') || allowedOrigins.includes(origin))
      ? origin
      : allowedOrigins[0] || '*';

  return {
    'Access-Control-Allow-Origin': allowOrigin,
    'Access-Control-Allow-Headers':
      'Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token,Access-Control-Allow-Origin,Access-Control-Allow-Headers,Access-Control-Allow-Methods,Origin,Accept',
    'Access-Control-Allow-Methods': 'OPTIONS,GET,PUT,POST,DELETE,PATCH,HEAD',
    'Access-Control-Allow-Credentials': 'true',
    'Access-Control-Max-Age': '600',
  };
}

function makeRequest(targetUrl, method, headers, body) {
  return new Promise((resolve, reject) => {
    const parsedUrl = new url.URL(targetUrl);

    const options = {
      hostname: parsedUrl.hostname,
      port: parsedUrl.port || 443,
      path: `${parsedUrl.pathname}${parsedUrl.search}`,
      method,
      headers,
    };

    const req = https.request(options, (res) => {
      let responseBody = '';
      res.on('data', (chunk) => { responseBody += chunk; });
      res.on('end', () => {
        resolve({ statusCode: res.statusCode, headers: res.headers, body: responseBody });
      });
    });

    req.on('error', reject);
    if (body) req.write(body);
    req.end();
  });
}
