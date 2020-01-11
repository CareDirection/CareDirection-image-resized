// dependencies
const async = require('async')
const AWS = require('aws-sdk')
const gm = require('gm').subClass({ imageMagick: true })
const util = require('util')

let WIDTH
let HEIGHT

// get reference to S3 client
const s3 = new AWS.S3()

exports.handler = function (event, context, callback) {
    // Read options from the event.
    console.log('Reading options from event:\n', util.inspect(event, { depth: 5 }))
    const srcBucket = event.Records[0].s3.bucket.name
    // Object key may have spaces or unicode non-ASCII characters.
    const srcKey = decodeURIComponent(event.Records[0].s3.object.key.replace(/\+/g, ' '))
    const dstBucket = srcBucket
    let dstKey
    if (srcKey.substring(0, 14) === 'product/origin') {
        dstKey = `${'product/resize/resized-'}${srcKey.substr(15, srcKey.length)}`
        WIDTH = 100
        HEIGHT = 100
    } else if (srcKey.substring(0, 19) === 'article/main/origin') {
        dstKey = `${'article/main/resize/resized-'}${srcKey.substr(20, srcKey.length)}`
        WIDTH = 250
        HEIGHT = 200
    } else {
        console.log('no action resize')
        return
    }

    console.log(`가져올 위치 : ${srcKey}`)
    console.log(`저장 될 위치 : ${dstKey}`)
    // Infer the image type.
    const typeMatch = srcKey.match(/\.([^.]*)$/)
    if (!typeMatch) {
        callback('Could not determine the image type.')
        return
    }
    const imageType = typeMatch[1].toLowerCase()
    if (imageType != 'jpeg' && imageType != 'png' && imageType != 'jpg') {
        callback(`Unsupported image type: ${imageType}`)
        return
    }

    // Download the image from S3, transform, and upload to a different S3 bucket.
    async.waterfall([
        function download(next) {
            // Download the image from S3 into a buffer.
            s3.getObject({
                    Bucket: srcBucket,
                    Key: srcKey,
                },
                next)
        },
        function transform(response, next) {
            gm(response.Body).size(function (err, size) {
                // Infer the scaling factor to avoid stretching the image unnaturally.
                console.log('사이즈 입니다')
                // var scalingFactor = Math.min(
                //     MAX_WIDTH / size.width,
                //     MAX_HEIGHT / size.height
                // );
                // var width  = scalingFactor * size.width;
                // var height = scalingFactor * size.height;

                // Transform the image buffer in memory.
                this.resize(WIDTH, HEIGHT)
                    .toBuffer(imageType, (err, buffer) => {
                        if (err) {
                            next(err)
                        } else {
                            next(null, response.ContentType, buffer)
                        }
                    })
            })
        },
        function upload(contentType, data, next) {
            // Stream the transformed image to a different S3 bucket.
            s3.putObject({
                    Bucket: dstBucket,
                    Key: dstKey,
                    Body: data,
                    ContentType: contentType,
                },
                next)
        },
    ], (err) => {
        if (err) {
            console.error(
                `Unable to resize ${srcBucket}/${srcKey
                    } and upload to ${dstBucket}/${dstKey
                    } due to an error: ${err}`,
            )
        } else {
            console.log(
                `Successfully resized ${srcBucket}/origin/${srcKey
                    } and uploaded to ${dstBucket}/${dstKey}`,
            )
        }
        callback(null, 'message')
    })
}
