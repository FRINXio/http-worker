import {protoDescriptor, config} from '../shared/utils';
import grpc from 'grpc';

const httpproto = protoDescriptor().httpproto;

/**
 *
 * @param options HTTP options for the "http(s)" nodejs library
 * @param httpPayload body of the request (in case of POST/PUT...)
 */

export const sendGrpcRequest = (options, httpPayload, callback) => {
    const client = new httpproto.HttpWorker(config.HTTPWORKER_ADDRESS,
        grpc.credentials.createInsecure());

    client.executeHttp({requestOptions: JSON.stringify(options), httpPayload: httpPayload}, callback);
}

