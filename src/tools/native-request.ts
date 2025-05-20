import https from 'https';
import http from 'http';
import { URL } from 'url';

// Utility to send curl-like HTTP GET requests with an access token in the body
export function makeNativeHttpRequest(url: string, apiToken: string): Promise<any> {
  return new Promise((resolve, reject) => {
    const parsedUrl = new URL(url);

    // Prepare token body data
    const postData = `access_token=${encodeURIComponent(apiToken)}`;

    const options = {
      hostname: parsedUrl.hostname,
      port: parsedUrl.port || (parsedUrl.protocol === 'https:' ? 443 : 80),
      path: `${parsedUrl.pathname}${parsedUrl.search}`,
      method: 'GET',
      headers: {
        'User-Agent': 'curl/8.7.1',
        'Accept': '*/*',
        'Content-Type': 'application/x-www-form-urlencoded',
        'Content-Length': Buffer.byteLength(postData),
      },
    };

    const protocol = parsedUrl.protocol === 'https:' ? https : http;
    const req = protocol.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => {
        data += chunk.toString();
      });

      res.on('end', () => {
        if (res.statusCode && res.statusCode >= 200 && res.statusCode < 300) {
          try {
            resolve(JSON.parse(data));
          } catch (error) {
            reject(new Error(`Failed to parse JSON: ${error instanceof Error ? error.message : String(error)}`));
          }
        } else {
          reject(new Error(`HTTP Error: ${res.statusCode} ${res.statusMessage || ''} - ${data}`));
        }
      });
    });

    req.on('error', (error) => reject(error));

    req.write(postData);
    req.end();
  });
}
