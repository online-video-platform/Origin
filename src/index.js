import express from 'express';
import httpProxy from 'http-proxy';
import fs from 'fs';
import path from 'path';
import fetch from 'node-fetch'; // Ensure you have node-fetch installed
import memoize from 'memoizee';

function djb2(str) {
    let hash = 5381;
    for (let i = 0; i < str.length; i++) {
        hash = (hash * 33) ^ str.charCodeAt(i);
    }
    return hash >>> 0;
}

let serverPort = process.env.PORT || 3001;
let cachePath = process.env.CACHE_PATH || '/cached/';
const app = express();
const target = process.env.TARGET || 'http://nginx:80';
const proxy = httpProxy.createProxyServer({ target });
async function downloadRemoteFile(unfinishedDownloadPath, cachedDownloadPath, targetUrl) {
    console.log('Checking if file exists', cachedDownloadPath);
    if (fs.existsSync(unfinishedDownloadPath)) {
        fs.unlinkSync(unfinishedDownloadPath);
    }
    console.log('Creating download stream');
    let cachedDownloadStream = fs.createWriteStream(unfinishedDownloadPath);
    let headed = await fetch(targetUrl, { method: 'HEAD' });
    let contentLength = headed.headers.get('content-length');
    let interval = setInterval(() => {
        let stats = fs.statSync(unfinishedDownloadPath);
        let downloaded = stats.size;
        console.log('Downloaded', downloaded, 'out of', contentLength);
        if (downloaded >= contentLength) {
            clearInterval(interval);
        }
    }, 1000);
    let fetching = await fetch(targetUrl);
    console.log('Downloading from', targetUrl);
    // pipe the result stream into cachedDownloadStream
    fetching.body.pipe(cachedDownloadStream);
    // wait for the stream to finish
    await new Promise((resolve, reject) => {
        fetching.body.on('end', () => {
            clearInterval(interval);
            resolve();
        });
    });
    fs.renameSync(unfinishedDownloadPath, cachedDownloadPath);
};
let downloadRemoteFileMemoized = memoize(downloadRemoteFile, { maxAge: 1000 * 60 * 60 * 1 }); // 1 hours
let pendingRequests = [];
(async function () {
    while (true) {
        while (pendingRequests.length > 0) {
            console.log('Pending requests', pendingRequests.length);
            let { req, res } = pendingRequests.shift();
            if (req.url.startsWith('/stream/')) {
                let filename = djb2(req.url);
                let cachedPath = path.join(cachePath, filename + '.mp4');
                if (fs.existsSync(cachedPath)) {
                    console.log('Serving from cache');
                    res.sendFile(cachedPath);
                } else {
                    console.log('Transcoding');
                    let cachedDownloadPath = path.join(cachePath, "downloaded_" + filename + '.mkv');
                    let unfinishedDownloadPath = cachedDownloadPath + '.part';
                    console.log('Will downloading from', target + req.url);
                    if (!fs.existsSync(cachePath)) {
                        fs.mkdirSync(cachePath);
                    }
                    if (fs.existsSync(cachedDownloadPath)) {
                        console.log('Downloaded file already exists, ', cachedDownloadPath);
                    } else {
                        await downloadRemoteFileMemoized(unfinishedDownloadPath, cachedDownloadPath, target + req.url);
                    }
                    res.sendFile(cachedDownloadPath);
                }
            } else {
                if (req.url === '/health') {
                    res.send('OK');
                } else {
                    proxy.web(req, res);
                }
            }
        }
        await new Promise((resolve) => setTimeout(resolve, 100));
    }
})();

app.use((req, res) => {
    pendingRequests.push({ req, res });
});

app.listen(serverPort, () => {
    console.log('Server is running on port 3001');
});
