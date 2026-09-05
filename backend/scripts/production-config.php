<?php
// Generate configs in a private runtime directory. No application secrets are
// copied: FPM inherits the container environment with clear_env disabled.
declare(strict_types=1);

function number(string $name, int $fallback, int $min, int $max): int
{
    $value = getenv($name);
    $value = $value === false || $value === '' ? $fallback : filter_var($value, FILTER_VALIDATE_INT);
    if ($value === false || $value < $min || $value > $max) throw new RuntimeException("Invalid $name");
    return $value;
}
function quoted(string $value): string
{
    if (strpbrk($value, "\n\r\0\$") !== false) throw new RuntimeException('Invalid runtime path');
    return '"'.str_replace(['\\', '"'], ['\\\\', '\\"'], $value).'"';
}

$runtime = realpath(getenv('VIBYRA_RUNTIME_DIR') ?: '') ?: throw new RuntimeException('Runtime directory is missing');
$public = realpath(getenv('VIBYRA_PUBLIC_DIR') ?: __DIR__.'/../public') ?: throw new RuntimeException('Public directory is missing');
if (! is_file($public.'/index.php')) throw new RuntimeException('Public index.php is missing');
$port = number('PORT', 8000, 1, 65535);
$address = getenv('VIBYRA_BIND_ADDRESS') ?: '0.0.0.0';
if (! filter_var($address, FILTER_VALIDATE_IP, FILTER_FLAG_IPV4)) throw new RuntimeException('Invalid bind address');
$workers = number('VIBYRA_FPM_WORKERS', 4, 1, 64);
// Deep Research permits two 900-second provider attempts plus bookkeeping.
$timeout = number('VIBYRA_REQUEST_TIMEOUT', 2100, 60, 3600);
$spare = min(2, $workers);
$user = getenv('VIBYRA_FPM_USER') ?: throw new RuntimeException('FPM user is missing');
$group = getenv('VIBYRA_FPM_GROUP') ?: throw new RuntimeException('FPM group is missing');
foreach ([$user, $group] as $identity) {
    if (! preg_match('/^[a-zA-Z0-9_-]+$/D', $identity)) throw new RuntimeException('Invalid process identity');
}
$root = quoted($public);
$socket = $runtime.'/php.sock';
// Nginx has a smaller Unix socket path limit than the filesystem.
if (strlen($socket) > 100) throw new RuntimeException('Runtime socket path is too long');
$fastcgi = quoted('unix:'.$socket);
$pid = quoted($runtime.'/nginx.pid');
$temp = quoted($runtime.'/body');
$fastcgiTemp = quoted($runtime.'/fastcgi');
$proxyTemp = quoted($runtime.'/proxy');
$uwsgiTemp = quoted($runtime.'/uwsgi');
$scgiTemp = quoted($runtime.'/scgi');
$nginxUser = $user === 'root' ? "user $user $group;" : '';
$nginx = <<<CONF
$nginxUser
worker_processes auto;
pid $pid;
error_log stderr warn;
events { worker_connections 1024; }
http {
    access_log /dev/stdout;
    default_type application/octet-stream;
    types {
        text/html html; text/css css; application/javascript js mjs;
        application/json json; image/png png; image/jpeg jpg jpeg;
        image/svg+xml svg; image/webp webp; image/x-icon ico;
        font/woff woff; font/woff2 woff2; video/mp4 mp4; video/webm webm;
        application/wasm wasm; application/pdf pdf; text/plain txt;
    }
    sendfile on;
    keepalive_timeout 65;
    client_max_body_size 48m;
    client_body_temp_path $temp;
    fastcgi_temp_path $fastcgiTemp;
    proxy_temp_path $proxyTemp;
    uwsgi_temp_path $uwsgiTemp;
    scgi_temp_path $scgiTemp;
    gzip on;
    gzip_types text/css application/javascript application/json image/svg+xml;
    server {
        listen $address:$port;
        server_name _;
        root $root;
        index index.php;
        charset utf-8;
        location / { try_files \$uri \$uri/ /index.php?\$query_string; }
        location = /index.php {
            fastcgi_pass $fastcgi;
            fastcgi_buffering off;
            fastcgi_read_timeout {$timeout}s;
            fastcgi_param QUERY_STRING \$query_string;
            fastcgi_param REQUEST_METHOD \$request_method;
            fastcgi_param CONTENT_TYPE \$content_type;
            fastcgi_param CONTENT_LENGTH \$content_length;
            fastcgi_param SCRIPT_FILENAME \$document_root/index.php;
            fastcgi_param SCRIPT_NAME /index.php;
            fastcgi_param REQUEST_URI \$request_uri;
            fastcgi_param DOCUMENT_URI \$document_uri;
            fastcgi_param DOCUMENT_ROOT \$document_root;
            fastcgi_param SERVER_PROTOCOL \$server_protocol;
            fastcgi_param REQUEST_SCHEME \$scheme;
            fastcgi_param HTTPS \$https if_not_empty;
            fastcgi_param GATEWAY_INTERFACE CGI/1.1;
            fastcgi_param SERVER_SOFTWARE nginx;
            fastcgi_param REMOTE_ADDR \$remote_addr;
            fastcgi_param REMOTE_PORT \$remote_port;
            fastcgi_param SERVER_ADDR \$server_addr;
            fastcgi_param SERVER_PORT \$server_port;
            fastcgi_param SERVER_NAME \$server_name;
            fastcgi_param REDIRECT_STATUS 200;
            fastcgi_param HTTP_PROXY "";
        }
        location ~ \\.php(?:/|$) { return 404; }
        location ~ /\\.(?!well-known(?:/|$)) { deny all; }
    }
}
CONF;
$fpmSocket = quoted($socket);
$fpmPid = quoted($runtime.'/php-fpm.pid');
$fpm = <<<CONF
[global]
daemonize = no
pid = $fpmPid
error_log = /proc/self/fd/2
[vibyra]
user = $user
group = $group
listen = $fpmSocket
listen.mode = 0600
clear_env = no
catch_workers_output = yes
decorate_workers_output = no
pm = dynamic
pm.max_children = $workers
pm.start_servers = $spare
pm.min_spare_servers = 1
pm.max_spare_servers = $spare
pm.max_requests = 500
request_terminate_timeout = {$timeout}s
php_admin_value[upload_max_filesize] = 8M
php_admin_value[post_max_size] = 48M
php_admin_value[max_execution_time] = $timeout
php_admin_value[opcache.validate_timestamps] = 0
php_admin_flag[log_errors] = on
php_admin_flag[display_errors] = off
CONF;
file_put_contents($runtime.'/nginx.conf', $nginx);
file_put_contents($runtime.'/php-fpm.conf', $fpm);
