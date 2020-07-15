const grpc = require('grpc');
const http = require('http');
const https = require('https');
const setCookie = require('set-cookie-parser');

const {protoDescriptor, config, createLogger, supportedEncodings, createGrpcResponse, getEncoding, parseOptions} = require('../shared/utils');

const completed = 'COMPLETED', failed = 'FAILED';

const logger = createLogger('http-worker', config.overall_log_level);

const httpproto = protoDescriptor().httpproto;

//TODO how handle mismatch between real-world and nodejs http(s) supported encodings?
let verifyEncoding = suggestedEncoding => {
    if (!supportedEncodings.includes(suggestedEncoding)) {
        const defaultEncoding = getEncoding({}); // get the default
        logger.warn(`The response encoding is ${suggestedEncoding} but it is not supported, defaulting to ${defaultEncoding}`);
        return defaultEncoding;
    }

    return suggestedEncoding;
}

/**
 *
 * @param grpcCallback callback for the gRPC response
 * @returns function callback which handles HTTP responses
 */
let HttpResponseHandler = grpcCallback => {
    return (res) => {
       const responseEncoding = verifyEncoding(getEncoding(res.headers));

       res.setEncoding(responseEncoding);

       let chunks = []; // for storing response 'chunks' as they arrive one by one
       res.on('data', chunk => {
           chunks.push(Buffer.from(chunk, responseEncoding)); //store incoming data
       });
       res.on('close', chunk => { // we are done, http is closed
           if (chunk) {
               chunks.push(Buffer.from(chunk, responseEncoding));
           }
           grpcCallback(null, createGrpcResponse(
               completed,
               res.statusCode,
               Buffer.concat(chunks).toString(responseEncoding),
               setCookie.parse(res),
               JSON.stringify(res.headers)))
       });
        res.on('aborted', _ => grpcCallback(null, createGrpcResponse(failed)));
    }
}

let pickLibrary = protocol => 'https:' === protocol ? https : http;

/**
 * gRPC callback function which handles gRPC request data, invokes HTTP and returns
 * the HTTP response back via the gRPC
 * @param workerHttpRequest the gRPC request with HTTP options
 * @param grpcCallback callback which makes the gRPC response
 */
function executeHttp(workerHttpRequest, grpcCallback) {
    // prepare HTTP request parameters from the data received via the gRPC call
    const options = parseOptions(workerHttpRequest.request.requestOptions);

    let req;
    try{
        req = pickLibrary(options.protocol).request(options, HttpResponseHandler(grpcCallback));
    } catch (e) {
        logger.error(`Unable to complete the HTTP request for ${options.uri}, finished with exception ${e}`);
        grpcCallback(null, createGrpcResponse(failed));
        return;
    }

    req.on('error', (e) => {
        logger.error(`Error occurred while executing the HTTP request for ${options.uri}, finished with error ${e}`);
        grpcCallback(null, createGrpcResponse(failed));
    });

    // when socket times out we need to abort manually ..
    req.on('timeout', () => {
        logger.error('Timeout occurred while doing a HTTP request, aborting request');
        req.abort();
    });

    req.on('abort', () => {
        logger.error(`The request to ${options.uri} was aborted`);
        grpcCallback(null, createGrpcResponse(failed));
    });

    req.on('response', () => {
        logger.verbose(`The HTTP response from ${options.uri} was received`);
    });

    //write POST or PUT content
    if (workerHttpRequest.request.httpPayload) {
        req.write(workerHttpRequest.request.httpPayload, getEncoding(options.headers));
    }

    req.end(); //send http request
}

let getServer = function () {
    let server = new grpc.Server();
    server.addService(httpproto.HttpWorker.service, {executeHttp: executeHttp});
    return server;
}

const routeServer = getServer();
logger.info(`Starting http-worker on ${config.httpworker_bind_address}`)
routeServer.bind(config.httpworker_bind_address, grpc.ServerCredentials.createInsecure());
routeServer.start();
