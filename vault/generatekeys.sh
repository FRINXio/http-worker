# based on https://github.com/hashicorp/vault/issues/5106#issuecomment-415897824
openssl genrsa -out private.pem 2048
openssl rsa -in private.pem -outform PEM -pubout -out pubkey.pem
vault write auth/jwt/config jwt_validation_pubkeys=@pubkey.pem
