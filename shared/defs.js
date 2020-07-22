import {config} from './utils';

export const taskDefName = 'GLOBAL___HTTP_task';

export const httpTaskDef = {
    name: taskDefName,
    retryCount: config.CONDUCTOR_TASK_RETRY_COUNT,
    timeoutSeconds: config.CONDUCTOR_TASK_TIMEOUT_IN_SECS,
    inputKeys: ['http_request'],
    outputKeys: ['statusCode', 'response', 'body', 'cookies'],
    timeoutPolicy: 'TIME_OUT_WF',
    retryLogic: 'FIXED',
    retryDelaySeconds: 60,
    // must be less or equal to timeoutSeconds
    responseTimeoutSeconds: config.CONDUCTOR_TASK_TIMEOUT_IN_SECS
};
