const express = require('express');
const router = express.Router();
const fs = require('fs');
const path = require('path');
const mimeTypes = require('mime-types');
const fileTypeLib = require('file-type');
const whiteList = require('./whitelist');
const { v4: uuidv4 } = require('uuid');
const { Storage } = require('@google-cloud/storage');
const storage = new Storage();
const bin = require('ffmpeg-static');

const tmpDir = path.join(__dirname, './tmp');
if (!fs.existsSync(tmpDir)) {
    fs.mkdirSync(tmpDir);
}

const ffmpeg = require('fluent-ffmpeg');
ffmpeg.setFfmpegPath(bin);

async function ensureTenantBucketExists (id) {
    const [exists] = await storage.bucket(id).exists();

    if (!exists) {
        await storage.createBucket(id, {
            multiRegional: true,
            location: 'eu',
        });
    }
}

function convert (fileReadStream, tenantId, fileName, fileId, filePath, metadata, stderr) {
    fileName = path.parse(fileName).name + '.mp4'
    const uploadedFileName = Date.now().toString() + '.mp4';
    const convertedFileName = 'exported_' + uploadedFileName;
    const uploadedFilePath = path.join(tmpDir, uploadedFileName);
    const convertedFilePath = path.join(tmpDir, convertedFileName);

    console.info('Converting file', uploadedFilePath, convertedFilePath);

    return new Promise((resolve, reject) => {
        try {
            const fileWriteStream = fs.createWriteStream(uploadedFilePath);
            fileReadStream.pipe(fileWriteStream, { end: true });
            fileReadStream.on('end', () => {
                fs.stat(uploadedFilePath, (err, stats) => {
                    console.info('Uploaded file size', stats.size);
                });

                ffmpeg(uploadedFilePath)
                    .videoCodec('libx264')
                    .videoFilter({
                        filter: 'scale',
                        options: ['min(1280,iw)', 'min(1280,ih)', 'force_original_aspect_ratio=decrease']
                    })
                    .outputOptions([
                        "-crf 30",
                        "-preset ultrafast",
                        "-sws_flags fast_bilinear",
                        "-movflags +faststart"
                    ])
                    .outputFormat('mp4')
                    .save(convertedFilePath)
                    .on('stderr', (stderrLine) => {
                        if (stderr) {
                            console.info('Stderr output: ' + stderrLine);
                        }
                    })
                    .on('error', (err) => {
                        if (fs.existsSync(uploadedFilePath)) {
                            console.info('Deleting file', uploadedFilePath);
                            fs.unlinkSync(uploadedFilePath);
                        }

                        if (fs.existsSync(convertedFilePath)) {
                            console.info('Deleting file', convertedFilePath);
                            fs.unlinkSync(convertedFilePath);
                        }

                        reject(err);
                    })
                    .on('end', async () => {
                        try {
                            const { size } = fs.statSync(convertedFilePath);
                            console.info('Converted file size', size);

                            if (fs.existsSync(uploadedFilePath)) {
                                console.info('Deleting uploaded file', uploadedFilePath);
                                fs.unlinkSync(uploadedFilePath);
                            }

                            await bucketWrite(fs.createReadStream(convertedFilePath), tenantId, fileName, fileId, filePath, metadata);

                            if (fs.existsSync(convertedFilePath)) {
                                console.info('Deleting converted file', convertedFilePath);
                                fs.unlinkSync(convertedFilePath);
                            }

                            resolve();
                        }
                        catch (err) {
                            reject(err);
                        }
                    });
            });

            fileWriteStream.on('error', (err) => {
                reject(err);
            });
        }
        catch (err) {
            reject(err);
        }
    });
}

function bucketWrite (fileReadStream, tenantId, fileName, fileId, filePath, metadata) {
    console.info('Uploading file to bucket', fileName);

    return new Promise((resolve, reject) => {
        const bucket = storage.bucket(tenantId);
        const bucketFile = bucket.file(filePath);

        const bucketWriteStream = bucketFile.createWriteStream({
            resumable: false,
            gzip: true,
            metadata: {
                contentType: mimeTypes.contentType(fileName),
                contentDisposition: `attachment; filename=${fileName}`,
                cacheControl: 'public, max-age=31536000',
                metadata: Object.assign(metadata || {}, {
                    id: fileId,
                    name: fileName,
                    tenant_id: tenantId,
                })
            }
        });

        bucketWriteStream
            .on('error', (err) => {
                reject(err);
            })
            .on('finish', async () => {
                resolve();
            });

        fileReadStream.pipe(bucketWriteStream, { end: true });
    });
}

router.post('/upload', async (req, res) => {
    try {
        const stderr = !!req.query['stderr'];
        const fileName = req.headers['file-name'];
        const tenantId = 'vrs-fileupload-test';
        const fileId = uuidv4();
        const filePath = fileId;

        // Create tenant bucket if not found
        await ensureTenantBucketExists(tenantId);

        let fileExt = path.extname(fileName);

        if (!fileExt) {
            throw new Error('File extension not found');
        }

        // always lowerize extension
        fileExt = fileExt.toLowerCase();

        // validate with original file extension
        let fileInfo = whiteList.find((item) => item.ext.indexOf(fileExt) > -1);

        if (!fileInfo) {
            throw new Error('File extension is not valid: ' + fileExt);
        }

        const { mimeType } = fileInfo;
        const fileTypeStream = await fileTypeLib.stream(req);
        const { fileType } = fileTypeStream;

        if (fileType) {
            // revalidate with sniffed extension
            fileInfo = whiteList.find((item) => item.ext.indexOf(fileType.ext) > -1);

            if (!fileInfo) {
                throw new Error('Sniffed file extension is not valid: ' + fileType.ext);
            }

            // revalidate with sniffed mime type
            fileInfo = whiteList.find((item) => item.mimeType === fileType.mime);

            if (!fileInfo) {
                throw new Error('Sniffed file content is not valid: ' + fileType.mime);
            }
        }

        const isVideo = mimeType.indexOf('video') > -1;

        if (isVideo) {
            await convert(fileTypeStream, tenantId, fileName, fileId, filePath, null, stderr);
        }
        else {
            await bucketWrite(fileTypeStream, tenantId, fileName, fileId, filePath);
        }

        res.status(200);
        res.send(fileId);
        console.info('Upload complete', fileId, fileName);
    }
    catch (err) {
        res.status(500);
        res.send(err.message);
        console.error('Endpoint error', err.message);
    }
});

router.get('/healthcheck', (req, res) => {
    res.status(200);
    res.send('OK');
});

module.exports = router;