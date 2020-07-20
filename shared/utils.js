import winston from 'winston';
import grpc from 'grpc';
import {loadSync} from '@grpc/proto-loader';
import dotenv from "dotenv";

// retrieve config boilerplate
dotenv.config();
const config = process.env;

const PROTO_PATH = __dirname + '/http.proto';

// gRPC boilerplate
const packageDefinition = loadSync(
    PROTO_PATH,
    {keepCase: true,
        longs: String,
        enums: String,
        defaults: true,
        oneofs: true
    });

const protoDescriptor = _ => grpc.loadPackageDefinition(packageDefinition);

// logger config
const createLogger = (serviceName, overallLogLevel) => {
    return winston.createLogger({
        level: overallLogLevel,
        format: winston.format.simple(),
        defaultMeta: { service: serviceName },
        transports: [
            new winston.transports.Console()
        ],
    });
}

const conductorHttpParamsToNodejsHttpParams = (
    uri,
    method,
    body,
    timeout,
    verifyCertificate,
    headers,
    basicAuth,
    contentType,
    cookies ) => {
    let httpOptions = {};
    const parsedUrl = new URL(uri);
    httpOptions['method'] = method;
    httpOptions['protocol'] = parsedUrl.protocol;
    httpOptions['hostname'] = parsedUrl.hostname;

    if (parsedUrl.port) {
        httpOptions['port'] = parsedUrl.port;
    }

    httpOptions['path'] = parsedUrl.pathname + parsedUrl.search;
    httpOptions['insecure'] = !verifyCertificate;

    if (!headers) {
        headers = {};
    }

    if (contentType) {
        headers['Content-Type'] = contentType;
    }

    if (cookies) {
        headers['Set-Cookie'] = cookies;
    }

    if (basicAuth) {
        const auth = 'Basic ' + Buffer.from(basicAuth.username + ':' + basicAuth.password).toString('base64');
        headers['Authorization'] = auth;
    }

    if (Object.keys(headers).length !== 0) {
        httpOptions['headers'] = headers;
    }

    if (timeout) {
        httpOptions['timeout'] = timeout;
    }

    return httpOptions;
}

let createGrpcResponse = (status, statusCode, body, cookies, headers) => {
    if (statusCode) {
        return {status: status, statusCode: statusCode, body: body, cookies: JSON.stringify(cookies), headers: headers};
    } else {
        return {status: status};
    }
}

const supportedEncodings = ["ascii", "utf8", "utf-8", "utf16le", "ucs2", "ucs-2", "base64", "latin1", "binary", "hex"];

const getEncoding = function(headers) {
    let result = 'utf-8'; //default encoding

    Object.keys(headers).forEach(function (key) {
        if (key.toLowerCase() === 'content-type') {
            let split = headers[key].toLowerCase().split('charset=');
            result = split.length === 2 ? split[1] : result;
        }
    });

    return result;
}

let parseOptions = options => {
    const result = JSON.parse(options);

    if (result.timeout && (typeof result.timeout === 'string' || result.timeout instanceof String)) {
        result.timeout = parseInt(result.timeout); //timeout comes as string from conductor, we need a number
    }

    return result;
}

export {conductorHttpParamsToNodejsHttpParams, createLogger, supportedEncodings, createGrpcResponse, getEncoding, protoDescriptor, config, parseOptions}
