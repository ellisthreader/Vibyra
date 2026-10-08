use super::*;

const MAC: &str = "Active Internet connections (including servers)
Proto Recv-Q Send-Q  Local Address          Foreign Address        (state)          rxbytes      txbytes  rhiwat  shiwat          process:pid    state  options
tcp6       0      0  *.60859                *.*                    LISTEN                 0            0  131072  131072         rapportd:633    00100 00000006
tcp4       0      0  127.0.0.1.4318         *.*                    LISTEN                 0            0  131072  131072             node:6071   00100 00000106
tcp4       0      0  127.0.0.1.50000        127.0.0.1.4318         ESTABLISHED            0            0  131072  131072             node:6071   00100 00000106
tcp46      0      0  *.5173                 *.*                    LISTEN                 0            0  131072  131072      Google Chrome:777  00100 00000006
";

const LINUX: &str = "Active Internet connections (only servers)
Proto Recv-Q Send-Q Local Address           Foreign Address         State       PID/Program name
tcp        0      0 0.0.0.0:3000            0.0.0.0:*               LISTEN      1234/node
tcp6       0      0 :::5173                 :::*                    LISTEN      4321/vite dev
tcp        0      0 127.0.0.53:53           0.0.0.0:*               LISTEN      -
";

const WINDOWS: &str = "Active Connections

  Proto  Local Address          Foreign Address        State           PID
  TCP    0.0.0.0:135            0.0.0.0:0              LISTENING       1060
  TCP    [::]:3000              [::]:0                 LISTENING       4321
  TCP    127.0.0.1:3000         127.0.0.1:50000        ESTABLISHED     4321
";

fn l(port: u16, address: &str, pid: u32, process: &str) -> Listener {
    Listener {
        port,
        address: address.into(),
        pid,
        process: process.into(),
    }
}

#[test]
fn macos_lines_give_port_pid_and_the_process_name_even_with_spaces() {
    assert_eq!(
        parse_macos(MAC),
        vec![
            l(60859, "*", 633, "rapportd"),
            l(4318, "127.0.0.1", 6071, "node"),
            l(5173, "*", 777, "Google Chrome")
        ]
    );
}

#[test]
fn linux_lines_skip_sockets_with_no_owner() {
    assert_eq!(
        parse_linux(LINUX),
        vec![
            l(3000, "0.0.0.0", 1234, "node"),
            l(5173, "::", 4321, "vite dev")
        ]
    );
}

#[test]
fn windows_lines_keep_only_listening_sockets() {
    assert_eq!(
        parse_windows(WINDOWS),
        vec![l(135, "0.0.0.0", 1060, ""), l(3000, "::", 4321, "")]
    );
}

#[test]
fn dual_stack_duplicates_collapse() {
    let both = vec![
        l(3000, "::", 9, "node"),
        l(3000, "0.0.0.0", 9, "node"),
        l(80, "*", 1, "x"),
    ];
    let found = dedupe(both);
    assert_eq!(found.iter().map(|f| f.port).collect::<Vec<_>>(), [80, 3000]);
}

#[test]
fn ownership_follows_whole_path_components() {
    let root = Path::new("/work/app");
    assert!(owned_by(root, Path::new("/work/app")));
    assert!(owned_by(root, Path::new("/work/app/packages/web")));
    assert!(!owned_by(root, Path::new("/work/app-two")));
    assert!(!owned_by(root, Path::new("/work")));
}

#[test]
fn garbage_parses_to_nothing() {
    assert!(parse_macos("nonsense\n\ntcp4 x y").is_empty());
    assert!(parse_linux("").is_empty());
}
