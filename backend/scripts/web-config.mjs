import { join } from 'node:path';

export function webConfig({ root, runtime, port, general = 8, control = 2, user, group }) {
  for (const value of [port, general, control]) {
    if (!Number.isInteger(value) || value < 1 || value > 65535) throw new Error('Invalid web capacity configuration');
  }
  for (const value of [root, runtime]) if (!/^\/[A-Za-z0-9_./-]+$/.test(value)) throw new Error('Unsafe server path');
  for (const value of [user, group]) if (!/^[A-Za-z0-9_-]+$/.test(value)) throw new Error('Unsafe pool identity');
  const params = `fastcgi_param QUERY_STRING $query_string;
    fastcgi_param REQUEST_METHOD $request_method;
    fastcgi_param CONTENT_TYPE $content_type;
    fastcgi_param CONTENT_LENGTH $content_length;
    fastcgi_param SCRIPT_FILENAME ${root}/public/index.php;
    fastcgi_param SCRIPT_NAME /index.php;
    fastcgi_param REQUEST_URI $request_uri;
    fastcgi_param DOCUMENT_URI /index.php;
    fastcgi_param DOCUMENT_ROOT ${root}/public;
    fastcgi_param SERVER_PROTOCOL $server_protocol;
    fastcgi_param REQUEST_SCHEME $scheme;
    fastcgi_param GATEWAY_INTERFACE CGI/1.1;
    fastcgi_param SERVER_SOFTWARE nginx;
    fastcgi_param REMOTE_ADDR $remote_addr;
    fastcgi_param REMOTE_PORT $remote_port;
    fastcgi_param SERVER_ADDR $server_addr;
    fastcgi_param SERVER_PORT $server_port;
    fastcgi_param SERVER_NAME $host;
    fastcgi_param REDIRECT_STATUS 200;
    fastcgi_pass $vibyra_pool;
    fastcgi_buffering off;
    fastcgi_read_timeout 1250s;
    fastcgi_hide_header X-Powered-By;`;
  const nginx = `daemon off;
user ${user} ${group};
pid ${runtime}/nginx.pid;
error_log stderr warn;
events { worker_connections 1024; }
http {
  access_log off;
  server_tokens off;
  types {
    text/html html; text/css css; application/javascript js mjs;
    application/json json; application/wasm wasm; image/svg+xml svg;
    image/png png; image/jpeg jpg jpeg; image/webp webp; image/avif avif;
    image/gif gif; image/x-icon ico; font/woff2 woff2; font/woff woff;
  }
  default_type application/octet-stream;
  client_body_temp_path ${runtime}/body;
  fastcgi_temp_path ${runtime}/fastcgi;
  map $uri $vibyra_pool {
    default unix:${runtime}/general.sock;
    ~^/api/remote/ unix:${runtime}/control.sock;
    /up unix:${runtime}/control.sock;
    /ready unix:${runtime}/control.sock;
  }
  server {
    listen ${port};
    root ${root}/public;
    client_max_body_size 32m;
    location ~ /\\. { deny all; }
    location ~* \\.php(?:/|$) { return 404; }
    location / { try_files $uri @laravel; }
    location @laravel { ${params} }
  }
}`;
  const pool = (name, children) => `[${name}]
user = ${user}
group = ${group}
listen = ${join(runtime, name + '.sock')}
listen.owner = ${user}
listen.group = ${group}
listen.mode = 0660
pm = dynamic
pm.max_children = ${children}
pm.start_servers = 1
pm.min_spare_servers = 1
pm.max_spare_servers = ${children}
pm.max_requests = 500
clear_env = no
catch_workers_output = yes
request_terminate_timeout = 1300s
php_admin_flag[expose_php] = off
php_admin_flag[display_errors] = off
php_admin_flag[log_errors] = on
php_admin_value[upload_max_filesize] = 8M
php_admin_value[post_max_size] = 32M
`;
  return { nginx, fpm: `[global]\nerror_log = /dev/stderr\ndaemonize = no\n${pool('general', general)}\n${pool('control', control)}` };
}
