import {default as ConductorClient} from 'conductor-client'
import {config} from '../shared/utils';
import {taskDefName} from '../shared/defs';

const tenantId = config.TESTING_TENANT_ID;
let tenantIdPrefix = '';
if (tenantId != null) {
    console.log(`Using tenant Id ${tenantId}`);
    tenantIdPrefix = tenantId + '___';
}

const sampleWorkflowDef = {
    name: tenantIdPrefix + 'test_workflow',
    description: 'test workflow',
    version: 1,
    tasks: [
        {
            name: taskDefName,
            taskReferenceName: taskDefName,
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

const conductorClient = new ConductorClient({
    baseURL: config.CONDUCTOR_URL
});

const input = {
    http_request: {
        uri: 'https://httpbin.org/post',
        method: 'POST',
        headers: {'Content-Type': 'text/html; charset=UTF8', 'X-Test':'1'},
        body: `[1,20,2]`,
        timeout: 5000
    }
};

function assertEquals(a, b) {
    if (a!=b) {
        throw `Assertion error: ${a} != ${b}`;
    }
}

function checkResult(response) {
    assertEquals(response.headers['X-Test'], '1');
    const body = response.json;
    const expectedBody = [1, 20, 2];
    assertEquals(JSON.stringify(body), JSON.stringify(expectedBody));
    console.log('All OK');
}

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

async function main() {
    console.log('Sending workflow to Conductor');
    await conductorClient.updateWorkflowDefs([sampleWorkflowDef]);
    const workflowId = (await conductorClient.startWorkflow(sampleWorkflowDef.name, input)).data;
    console.log('workflow started, id: ', workflowId);
    for (let iterations = 0; ; iterations++) {
        if (iterations == 100) {
            throw 'Workflow did not complete';
        }
        let polled = await conductorClient.getWorkflow(workflowId);
        if (polled.data.status === 'COMPLETED') {
            console.log('Checking', polled.data.output.body);
            const body = JSON.parse(polled.data.output.body);
            checkResult(body);
            break;
        } else {
            console.log(iterations, polled.data.status);
        }
        await sleep(100);
    }
    console.log('Deleting the workflowdef', {name:sampleWorkflowDef.name});
    await conductorClient.unRegisterWorkflowDef(sampleWorkflowDef.name);
}

main();
