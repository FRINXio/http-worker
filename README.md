# http-worker

This worker is split to two containers:
* poller
* downloader
Conductor API uses pull model - wokers issue HTTP request periodically to obtain tasks to work on.
This poses a security issue because an attacker could point the http task request to conductor itself
and obtain tasks of other tenants.

To mitigate the issue, `downloader` exposes a gRPC server with one RPC: `ExecuteHttp`.
In production deployment `downloader` should not be able to connect to the rest of cluster.
Instead, `poller` is responsible for issuing HTTP requests to `conductor-server` and then
push those tasks to `downloader`.

## Testing
To create a sample workflow with http task and execute it, run
```sh
docker-compose exec http-worker-poller node conductor-poller/httpworker-sample-workflow.js
```
