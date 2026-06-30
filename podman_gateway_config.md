[openshell]
version = 1

[openshell.gateway]
bind_address    = "127.0.0.1:17670"
log_level       = "info"
compute_drivers = ["podman"]

[openshell.drivers.podman]
# Rootless socket path. For root Podman use /run/podman/podman.sock.
socket_path             = "/run/user/1000/podman/podman.sock"
default_image           = "ghcr.io/nvidia/openshell/sandbox:latest"
image_pull_policy       = "missing"   # always | missing | never | newer
grpc_endpoint           = "https://host.containers.internal:17670"
# The gateway overwrites gateway_port from bind_address at runtime.
gateway_port            = 17670
network_name            = "openshell"
sandbox_ssh_socket_path = "/run/openshell/ssh.sock"
stop_timeout_secs       = 10
supervisor_image        = "ghcr.io/nvidia/openshell/supervisor:latest"
guest_tls_ca            = "/etc/openshell/certs/ca.pem"
guest_tls_cert          = "/etc/openshell/certs/client.pem"
guest_tls_key           = "/etc/openshell/certs/client-key.pem"
# Set to 0 to leave Podman's runtime default unchanged.
sandbox_pids_limit      = 2048
