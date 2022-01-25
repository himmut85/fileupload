const http = require('http');
const https = require('https');

module.exports = async function (config) {
    const dataString = JSON.stringify(config.data || {});
    const protocol = config.url.startsWith('https') ? https : http;
    const options = Object.assign({
        method: 'POST',
        timeout: 5000, // in ms
        responseType: 'json',
        headers: {
            'Content-Type': 'application/json',
            'Content-Length': dataString.length,
        }
    }, config.options || {});

    return new Promise((resolve, reject) => {
        const req = protocol.request(config.url, options, (res) => {
            if (res.statusCode < 200 || res.statusCode > 299) {
                return reject(new Error(`HTTP status code ${res.statusCode}`));
            }

            const body = [];
            res.on('data', (chunk) => body.push(chunk));
            res.on('end', () => {
                try {
                    const resString = Buffer.concat(body).toString();

                    if (options.responseType === 'json') {
                        const resJson = JSON.parse(resString);
                        resolve(resJson);
                    }
                    else {
                        resolve(resString);
                    }
                }
                catch (err) {
                    reject(err);
                }
            });
        });

        req.on('error', (err) => {
            reject(err);
        });

        req.on('timeout', () => {
            req.destroy();
            reject(new Error('Request time out'));
        });

        req.write(dataString);
        req.end();
    });
}