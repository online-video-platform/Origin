import express from 'express';
import httpProxy from 'http-proxy';
import fs from 'fs';
import path from 'path';
import fetch from 'node-fetch'; // Ensure you have node-fetch installed

function djb2(str) {
    let hash = 5381;
    for (let i = 0; i < str.length; i++) {
        hash = (hash * 33) ^ str.charCodeAt(i);
    }
    return hash >>> 0;
}

let cachePath = '/cached/';
const app = express();
const target = 'http://nginx:80';
const proxy = httpProxy.createProxyServer({ target });

app.use(async (req, res) => {
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
            console.log('Downloading from', target + req.url);
            if (!fs.existsSync(cachePath)) {
                fs.mkdirSync(cachePath);
            }
            if (fs.existsSync(cachedDownloadPath)) {
                console.log('Downloaded file already exists, ', cachedDownloadPath);
            } else {
                let cachedDownloadStream = fs.createWriteStream(unfinishedDownloadPath);
                let fetching = await fetch(target + req.url);
                console.log('Downloading from', target + req.url);
                let arrayBuffer = await fetching.arrayBuffer();
                console.log('Downloaded', arrayBuffer.byteLength);
                let buffer = Buffer.from(arrayBuffer);
                cachedDownloadStream.write(buffer);
                cachedDownloadStream.end();
                fs.renameSync(unfinishedDownloadPath, cachedDownloadPath);
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
});

app.listen(3001, () => {
    console.log('Server is running on port 3001');
});
