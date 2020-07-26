
vault {
        address = "https://127.0.0.1:8200"
}

auto_auth {
    method "jwt" {
        config {
            path = "vault/jwt.txt"
            role = "dev-role"
        }
    }
}

cache {
    use_auto_auth_token = true
}

listener "tcp" {
    address = "127.0.0.1:8201"
    tls_disable = true
}
