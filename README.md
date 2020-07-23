# http-worker

This worker is split to two containers:
* poller
* downloader

## Security
Conductor API uses pull model - wokers issue HTTP request periodically to obtain tasks to work on.
This poses a security issue because an attacker could point the http task request to conductor itself
and obtain tasks of other tenants.

To mitigate the issue, `downloader` exposes a gRPC server with one RPC: `ExecuteHttp`.
In production deployment `downloader` should not be able to connect to the rest of cluster.
Instead, `poller` is responsible for issuing HTTP requests to `conductor-server` and then
push those tasks to `downloader`.

In docker-compose we create new network `http-worker` that is shared between Poller and Downloader.
Poller must be also connected to `private` to be able to connect to Conductor.
Downloader must me connected to `public` to access internet.

## Testing
### Automated testing
To create a sample workflow with http task and execute it, run
```sh
docker-compose exec http-worker-poller yarn run integration-test
```

## Manual testing
After starting all containers, create new workflow with following raw task:
```json
{
    "name": "GLOBAL___HTTP_task",
    "taskReferenceName": "httpRequestTaskRef_FG32",
    "inputParameters": {
    "http_request": {
        "uri": "${workflow.input.uri}",
        "method": "GET",
        "body": "",
        "contentType": "application/json",
        "headers": {},
        "timeout": "3600"
    }
    },
    "type": "SIMPLE",
    "startDelay": 0,
    "optional": false
}
```
Run the workflow with an URL, output of the task will contain the download result.
