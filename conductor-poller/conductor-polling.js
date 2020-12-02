import {default as ConductorClient} from 'conductor-client';
import {sendGrpcRequest} from './grpc-client';
import {conductorHttpParamsToNodejsHttpParams} from '../shared/utils';
import {httpTaskDef} from '../shared/defs';
import {createLogger, config} from '../shared/utils';
import {default as VaultClient} from 'node-vault';

const logger = createLogger('conductor-poller', config.OVERALL_LOG_LEVEL);

// This is used to separate tenant id from name in workflowdefs and taskdefs
export const INFIX_SEPARATOR = '___';

function extractTenantId(workflowName) {
    const idx = workflowName.indexOf(INFIX_SEPARATOR);
    if (idx === -1) {
        logger.error(`Value '${workflowName}' must contain '${INFIX_SEPARATOR}'`);
        throw new Error('Value must contain INFIX_SEPARATOR');
    }
    if (workflowName.substr(idx + 1).indexOf(INFIX_SEPARATOR) > -1) {
        logger.error(`Value '${workflowName}' must contain '${INFIX_SEPARATOR}' exactly once`);
        throw new Error('Value must contain INFIX_SEPARATOR exactly once');
    }
    return workflowName.substr(0, idx);
}

const vault = VaultClient({
    "apiVersion": "v1",
    "endpoint": config.VAULT_ADDR,
    "token": config.VAULT_TOKEN,
});

const conductorClient = new ConductorClient({
    baseURL: config.CONDUCTOR_URL
});

/**
 * Updates the conductor with results
 * @param workflowInstanceId worfkflow to be updated
 * @param taskId task which does the update
 * @param grpcResponse data received from the HTTP worker
 */
async function updateWorkflowState(workflowInstanceId, taskId, grpcResponse) {
    await conductorClient.updateTask({
        workflowInstanceId: workflowInstanceId,
        taskId: taskId,
        status: grpcResponse.status,
        outputData: {
            response: {headers: grpcResponse.headers},
            body: grpcResponse.body,
            statusCode: grpcResponse.statusCode,
            cookies: grpcResponse.cookies
        },
        logs: ['HTTP request finished with status ' + grpcResponse.status]
    });
}

async function markWorkflowFailed(workflowInstanceId, taskId, errMsg) {
    await conductorClient.updateTask({
        workflowInstanceId: workflowInstanceId,
        taskId: taskId,
        status: 'FAILED',
        logs: ['HTTP request failed: ' + errMsg]
    });
}

// Vault itself does not impose those rules on paths and fields.
// UI should follow those rules in order to make parsing easy.
const SECRET_PREFIX = '___SECRET_';
const SECRET_PATH_REGEX = '([a-zA-Z0-9/]+)';
const SECRET_VAR_FIELD_SEPARATOR = ':';
const SECRET_FIELD_REGEX = '([a-zA-Z0-9]+)';
const SECRET_SUFFIX = '___';
const SECRET_REGEX = new RegExp(SECRET_PREFIX + SECRET_PATH_REGEX + SECRET_VAR_FIELD_SEPARATOR + SECRET_FIELD_REGEX + SECRET_SUFFIX);

async function obtainSecretFromVault(tenantId, path, field) {
    const pathPrefix = replaceAll(config.VAULT_PATH_PREFIX, '%TENANT_ID%', tenantId);
    if (pathPrefix == config.VAULT_PATH_PREFIX) {
        logger.error('Security error: VAULT_PATH_PREFIX does not contain %TENANT_ID%');
        throw new Error('Security error: VAULT_PATH_PREFIX does not contain %TENANT_ID%');
    }
    const finalPath = pathPrefix + path;
    logger.verbose('obtainSecretFromVault', {path, field, finalPath});
    try {
        const response = await vault.read(finalPath);
        if (config.VAULT_VERSIONED_KV==='true') {
            return response.data.data[field];
        } else {
            return response.data[field];
        }
    } catch (error) {
        logger.warn(`Cannot obtain secret: ${error}, path '${path}' field '${field}'`);
        throw new Error('Cannot obtain secret');
    }
}

function replaceAll(str, toBeReplaced, newSubstr) {
    let newStr = str;
    do {
        str = newStr;
        newStr = str.replace(toBeReplaced, newSubstr);
    } while (str != newStr);
    return str;
}

async function replaceSecretsInString(str, tenantId) {
    let r;
    while(r = SECRET_REGEX.exec(str)) {
        const toBeReplaced = r[0];
        const path = r[1];
        const field = r[2];
        const payload = await obtainSecretFromVault(tenantId, path, field);
        str = replaceAll(str, toBeReplaced, payload);
    }
    return str;
}

async function replaceSecrets(input, tenantId) {
    for (const key in input) {
        const val = input[key];
        if (typeof val === 'object') {
            input[key] = await replaceSecrets(val, tenantId);
        } else if (typeof val === 'string') {
            input[key] = await replaceSecretsInString(val, tenantId);
        }
    }
    return input;
}

/**
 * registers polling for the http worker task
 */
export const registerHttpWorker = async () => conductorClient.registerWatcher(
    httpTaskDef.name,
    async (data, updater) => {
        const tenantId = extractTenantId(data.workflowType);
        // must contain exactly once ___ infix separator, extract name of tenant
        const rawInput = data.inputData.http_request;
        try {
            logger.verbose('Received task',  { data: rawInput, tenantId } );
            const input = await replaceSecrets(rawInput, tenantId);
            const httpOptions = conductorHttpParamsToNodejsHttpParams(
                input.uri,
                input.method,
                input.body,
                input.timeout,
                input.verifyCertificate,
                input.headers,
                input.basicAuth,
                input.contentType,
                input.cookies,
            );
            let body = input.body;
            try {
                body = JSON.stringify(body);
            }catch {
                // not a valid json, use default string value
            }
            sendGrpcRequest(httpOptions, body,
                async (err, grpcResponse) => {
                    if (err != null) {
                        logger.warn('Error while sending grpc request', err);
                        await markWorkflowFailed(data.workflowInstanceId, data.taskId, err.message);
                    } else {
                        logger.info(`Response from HTTP worker was received with status code: ${grpcResponse.statusCode}`);
                        await updateWorkflowState(data.workflowInstanceId, data.taskId, grpcResponse);
                    }
                });
        } catch (error) {
            logger.error(`Unable to do HTTP request because: ${error}. I am failing the task with ID: ${data.taskId} in workflow with ID: ${data.workflowInstanceId}`);
            await markWorkflowFailed(data.workflowInstanceId, data.taskId, error.message);
        }
    },
    {pollingIntervals: 1000, autoAck: true, maxRunner: 1},
    true
);

export const registerTaskDef = async() => {
    try {
        await conductorClient.registerTaskDefs([httpTaskDef]);
    } catch (err) {
        logger.error('Cannot register taskdef', err, err?.response?.data);
        throw err;
    }
}

