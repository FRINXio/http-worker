const {protoDescriptor, config} = require('../shared/utils');
const grpc = require('grpc');

const httpproto = protoDescriptor().httpproto;

/**
 *
 * @param options HTTP options for the "http(s)" nodejs library
 * @param httpPayload body of the request (in case of POST/PUT...)
 */

let sendGrpcRequest = (options, httpPayload, callback) => {
    const client = new httpproto.HttpWorker(config.httpworker_address,
        grpc.credentials.createInsecure());

    client.executeHttp({requestOptions: JSON.stringify(options), httpPayload: httpPayload}, callback);
}

exports.sendGrpcRequest = sendGrpcRequest;
