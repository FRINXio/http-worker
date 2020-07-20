import {config} from './utils';

export const httpTaskDef = {
    name: 'HTTP_task',
    retryCount: config.CONDUCTOR_TASK_RETRY_COUNT,
    timeoutSeconds: config.CONDUCTOR_TASK_TIMEOUT_IN_SECS,
    inputKeys: ['http_request'],
    outputKeys: ['statusCode', 'response', 'body', 'cookies'],
    timeoutPolicy: 'TIME_OUT_WF',
    retryLogic: 'FIXED',
    retryDelaySeconds: 60,
    responseTimeoutSeconds: 3600
};

export const sampleWorkflowDef = {
    name: 'test_workflow',
    description: 'test workflow',
    version: 1,
    tasks: [
        {
            name: httpTaskDef.name,
            taskReferenceName: httpTaskDef.name,
            inputParameters: {
                http_request: '${workflow.input.http_request}'
            },
            type: 'SIMPLE',
            startDelay: 0,
            optional: false
        }
    ],
    inputParameters: ['http_request'],
    failureWorkflow: 'fail_rollback',
    schemaVersion: 2
}
