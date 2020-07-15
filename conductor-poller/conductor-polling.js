const ConductorClient = require('conductor-client').default
const {sendGrpcRequest} = require('./grpc-client');
const {conductorHttpParamsToNodejsHttpParams} = require('../shared/utils');
const {httpTaskDef} = require('../shared/defs');
const {createLogger, config} = require('../shared/utils');

const logger = createLogger('conductor-poller', config.poller_log, config.console_log_level, config.overall_log_level);

const conductorClient = new ConductorClient({
    baseURL: config.conductor_url
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

async function markWorkflowFailed(workflowInstanceId, taskId) {
    await conductorClient.updateTask({
        workflowInstanceId: workflowInstanceId,
        taskId: taskId,
        status: 'FAILED',
    });
}

/**
 * registers polling for the http worker task
 */
let registerHttpWorker = async () => conductorClient.registerWatcher(
    httpTaskDef.name,
    async (data, updater) => {
        const input = data.inputData.http_request;
        try {
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

            sendGrpcRequest(httpOptions, input.body,
                async (err, grpcResponse) => {
                    if (err != null) {
                        logger.warn('Error while sending grpc request', err);
                        await markWorkflowFailed(data.workflowInstanceId, data.taskId);
                    } else {
                        logger.info(`Response from HTTP worker was received with status code: ${grpcResponse.statusCode}`);
                        logger.debug('Response from HTTP worker was received', grpcResponse);
                        await updateWorkflowState(data.workflowInstanceId, data.taskId, grpcResponse);
                    }
                });
        } catch (error) {
            logger.error(`Unable to do HTTP request because: ${error}. I am failing the task with ID: ${data.taskId} in workflow with ID: ${data.workflowInstanceId}`);
            await markWorkflowFailed(data.workflowInstanceId, data.taskId);
        }
    },
    {pollingIntervals: 1000, autoAck: true, maxRunner: 1},
    true
);

const registerTaskDef = async() => await conductorClient.registerTaskDefs([httpTaskDef]);

exports.registerHttpWorker = registerHttpWorker;
exports.registerTaskDef = registerTaskDef;
