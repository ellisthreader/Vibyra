use vibyra_transport::{answer_challenge, device_public_key, generate_keypair};

fn hex(value: &str) -> Vec<u8> {
    value
        .as_bytes()
        .chunks_exact(2)
        .map(|pair| u8::from_str_radix(std::str::from_utf8(pair).unwrap(), 16).unwrap())
        .collect()
}

#[test]
fn php_sodium_challenge_round_trip_and_tampering_rejection() {
    // Generated with sodium_crypto_box_seal, using a public test key and nonce.
    let private = [7; 32];
    let mut sealed = hex("483acb73afd035ab8fa28a72851c4a255910a76f73b9e9eb487183684a055038de4a8d839d8ed794bd08262b91f14d17a4bd5c5405ddab7f92e795eac2289ba5e83a93d7e1ce9dbd80a1e5ebb39b502b");
    assert_eq!(
        device_public_key(&private).unwrap(),
        hex("13be4feaeaf204c7fd3358fc9c00721881d174278128227ec674f37f7fe97b6d")
    );
    assert_eq!(answer_challenge(&private, &sealed).unwrap(), vec![42; 32]);
    assert!(answer_challenge(&[8; 32], &sealed).is_err());
    sealed[50] ^= 1;
    assert!(answer_challenge(&private, &sealed).is_err());
    assert!(answer_challenge(&private, &[0; 81]).is_err());
    assert!(device_public_key(&[0; 31]).is_err());
}

#[test]
fn device_proof_public_key_matches_existing_noise_identity() {
    let pair = generate_keypair().unwrap();
    assert_eq!(device_public_key(&pair[..32]).unwrap(), pair[32..]);
}
