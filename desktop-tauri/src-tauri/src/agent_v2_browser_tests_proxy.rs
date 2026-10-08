//! F-23: the loopback proxy forwards a plain request with the Host of the
//! vetted target (a client-forged Host cannot steer a virtual host), and the
//! policy still refuses other names. No browser needed.

use super::super::policy::Policy;
use super::super::proxy::Proxy;
use super::server;
use std::collections::HashMap;
use std::io::{Read, Write};
use std::net::{IpAddr, TcpStream};
use std::sync::Arc;

fn through(proxy: u16, request: &str) -> String {
    let mut stream = TcpStream::connect(("127.0.0.1", proxy)).unwrap();
    stream.write_all(request.as_bytes()).unwrap();
    let mut reply = String::new();
    let _ = stream.read_to_string(&mut reply);
    reply
}

#[test]
fn a_forged_host_header_is_replaced_by_the_vetted_target() {
    let site = server::start();
    let local: IpAddr = "127.0.0.1".parse().unwrap();
    let hosts = HashMap::from([
        ("allowed.test".to_owned(), (vec![local], true)),
        ("blocked.test".to_owned(), (vec![local], true)),
    ]);
    let origins = [format!("http://allowed.test:{}", site.port)];
    let proxy = Proxy::start(Arc::new(Policy::new(&origins).with_hosts(hosts))).unwrap();
    let port = site.port;
    let forged =
        format!("GET http://allowed.test:{port}/x HTTP/1.1\r\nHost: blocked.test:{port}\r\n\r\n");
    assert!(through(proxy.port, &forged).starts_with("HTTP/1.1 200"));
    let hit = site.find("GET", "/x").expect("the request arrived");
    assert_eq!(
        hit.host,
        format!("allowed.test:{port}"),
        "the forged Host was replaced"
    );
    let other =
        format!("GET http://blocked.test:{port}/y HTTP/1.1\r\nHost: allowed.test:{port}\r\n\r\n");
    assert!(through(proxy.port, &other).starts_with("HTTP/1.1 403"));
    let tunnel = format!("CONNECT blocked.test:{port} HTTP/1.1\r\n\r\n");
    assert!(through(proxy.port, &tunnel).starts_with("HTTP/1.1 403"));
    assert_eq!(
        site.hits_to("blocked.test"),
        0,
        "no request reached a name that is not granted"
    );
}
