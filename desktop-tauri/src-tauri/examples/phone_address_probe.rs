#[path = "../src/phone/address.rs"]
mod address;

fn main() {
    let selected = address::default_address();
    let ip =
        address::connection_address(&selected).expect("No reachable phone connection interface");
    let url = address::pairing_url(&selected).expect("Invalid phone connection URL");
    println!(
        "Selected address family: {}",
        if ip.is_ipv6() { "IPv6" } else { "IPv4" }
    );
    println!("Pairing endpoint: {url}");
}
