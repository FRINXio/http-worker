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

## Note about reconnect
Current behavior is that failure to comunicate with Conductor results in
shutdown of the process. Orchestrator must restart the process.

## Vault Integration

### Using Vault clients
Currently there is not UI for managing Vault and creating test data.
Following steps require `vault` (client) to be available,
```sh
export VAULT_ADDR=http://localhost:8200
export VAULT_TOKEN=myroot
vault status
```
however one can use the binary that the Vault container provides:
```sh
docker-compose exec -e VAULT_TOKEN=myroot \
 -e VAULT_ADDR=http://localhost:8200 vault /bin/vault status
```

Third option is to use [Web UI](http://127.0.0.1:8200/ui/).

### Setting up Vault dev server
Since setting up Vault is a complex task, docker-compose starts Vault in
[Dev mode](https://learn.hashicorp.com/vault/getting-started/dev-server).
This mainly means that the token `myroot` is hardcoded in `docker-compose.override.yml`,
which makes it trivial to interact with Vault. For more production ready approach
with authentication please read section about using Vault Agent.
Dev mode also turns on
[Versioned KV store](https://learn.hashicorp.com/vault/secrets-management/sm-versioned-kv).

### KV store versions

#### Versioned KV store
It is possible to use the `node-vault` library to read the secrets
from v2 keystore by prepending `data/` to the path. Poller can insert this prefix
automatically to each Vault request. Configuration can be set via environemt variable:
```
VAULT_PATH_PREFIX=secret/data/mypath/%TENANT_ID%/
VAULT_VERSIONED_KV=true
```

or via `.env` file.

Note that writing to the versioned datastore is
[not supported](https://github.com/kr1sp1n/node-vault/issues/82).

#### Legacy KV store (v1)
For testing the old KV store API, we need to switch `secrets/` store back to v1.
```sh
vault secrets disable secret/
vault secrets enable --version=1 -path=secret kv
```
Make sure Poller is configured for the old KV store API:
```
VAULT_PATH_PREFIX=secret/mypath/%TENANT_ID%/
VAULT_VERSIONED_KV=false
```

## Testing

To test multi tenancy support, create a tenant and set the variable.
```sh
export TEST_TENANT_ID=fb-test
```
Following data must be inserted to Valut before the test no matter which KV version is used:
```sh
vault kv put secret/mypath/${TEST_TENANT_ID}/key1 f1=1 f2=2
vault kv put secret/mypath/${TEST_TENANT_ID}/key2 f1=10 f2=20
```

### Automated testing
To create a sample workflow with http task and execute it, in `integration` folder run
```sh
docker-compose exec -e TEST_TENANT_ID=$TEST_TENANT_ID http-worker-poller yarn run integration-test
```
or locally in current folder
```sh
TEST_DELTE_WORKFLOW=true VAULT_ADDR=http://localhost:8200 CONDUCTOR_URL=http://localhost:8050/api yarn run integration-test
```
Last line should read `All OK`.

The test executes a workflow with http task that POSTs some data
with secret variables to httpbin.org and then checks response.

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

# Vault Agent
Vault Agent is a 'sidecar' process which does auth and token renewal & rotation. This is not handled in poller app.
Vault agent acts as a proxy to Vault. There is no need to send `VAULT_TOKEN`, however if present, the agent will
forward it instead of the locally maintained one.

### Using Vault Agent with JWT auth
For simplicity's sake we are enabling JWT auth in Vault. This demonstrates using the login API and token handling
by Vault Agent.

1. Generate RSA keypair:
```sh
openssl genrsa -out vault/private.pem 2048
openssl rsa -in vault/private.pem -outform PEM -pubout -out vault/pubkey.pem
```

2. Enable jwt authentication at path `/jwt`:
```sh
vault auth enable jwt
```

3. Create named role `dev-role`:
```sh
vault write auth/jwt/role/dev-role \
    role_type="jwt" \
    bound_audiences="myaud" \
    user_claim="sub" \
    policies="default" \
    ttl=10m
```

See `vault/agent.hcl` for configuration of the role.

Note that those settings are for development only and should not be used in production!
We are using `default` policy here.

4. Add following to the policy to allow reading all secrets:
```sh
echo '
# Allow reading all secrets - FOR TESTING ONLY
path "secret/*" {
    capabilities = ["read"]
}

' > default.policy
vault policy read default >> default.policy
vault policy write default default.policy
rm default.policy
```

5. Configure Vault to trust the generated public key for JWT auth
```sh
vault write auth/jwt/config jwt_validation_pubkeys=@vault/pubkey.pem
```

6. Generate JWT
Generate JWT token using [jwt.io](https://jwt.io) with method RS256,
payload:
```json
{
  "sub": "1234567890",
  "aud": "myaud",
  "iat": 1516239022,
  "exp": 1716239022
}
```
Put the result in the `JWT` variable, e.g.:
```sh
JWT='eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwiYXVkIjoibXlhdWQiLCJpYXQiOjE1MTYyMzkwMjIsImV4cCI6MTcxNjIzOTAyMn0.wJtm7RBUC27x4CHVwonu5rRTJEsxSiBPWo9Mv46texkvlNGTto9_cOdb7AuSgEujY1uBphwvo8v_6fJg3LjtraxNZRA5xgAgPGGv9T3VbEnwSM8l3tE_XaoXVdyCZa1AGXbewgoOmOkYsYECKU9i2jJWzASy_8KZaQwcM3hkdBrp02-H49QDumFvq4VhdqwLpiSRDvmTHpGEU_FUL-Q1JIgVRypwAu9pI3e3NPC3wn4HHAbD8VRhrBs2nyo3706I_AXpF_NgFrAQ9_PvZYBf7CtHk6UjR3tLVKq_YGxHzkKUHLh2hPaipJ7I_W9n7OLbM1vuf5txbaCrPHG3-KR6NQ'
```

7. Verify JWT Auth
To check that everything is working, login to Vault:
```sh
vault write auth/jwt/login role=dev-role jwt=$JWT
```
Sample result:
```
Key                  Value
---                  -----
token                s.GneIghyM9SIOeqCnccPZDHRZ
token_accessor       xi4qD2VLA1pQKPjLhK6cFXJD
token_duration       24h
token_renewable      true
token_policies       ["default"]
identity_policies    []
policies             ["default"]
token_meta_role      dev-role
```

8. Run Vault Agent

```sh
# this file will be deleted by Vault Agent immediately
echo $JWT > vault/jwt.txt
vault agent -config vault/agent.hcl
```
Check that you can get the secrets from agent without any token:
```sh
VAULT_ADDR=http://localhost:8201 vault kv get secret/key1
```

9. Start poller connected to the Vault Agent

If poller is running in docker, stop it.
```sh
docker-compose up -d --scale poller=0
```
To start poller locally, run
```sh
VAULT_ADDR=http://localhost:8201 VAULT_TOKEN= node conductor-poller/start-conductor-poller.js
```
Run the test mentioned above, it should succeed when Vault Agent is up.

# More info about Vault
* [Getting started - Auth using HTTP API](https://learn.hashicorp.com/vault/getting-started/apis)
* [Vault Agent](https://www.vaultproject.io/docs/agent)
* [Generating RSA keypair](https://github.com/hashicorp/vault/issues/5106#issuecomment-415897824)
* [Vault Agent auto-auth using JWT](https://www.vaultproject.io/docs/agent/autoauth/methods/jwt)
* [Vault JWT auth](https://www.vaultproject.io/docs/auth/jwt)
* [Vault JWT API](https://www.vaultproject.io/api/auth/jwt)
* [Web UI for JWT configuration](http://localhost:8200/ui/vault/access/jwt/configuration)
