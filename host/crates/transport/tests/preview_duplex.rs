use vibyra_transport::preview::{
    Frame, ReceiveWindow, SendWindow, StreamKey, MAX_CHUNK, WINDOW_BYTES,
};

#[test]
fn opaque_full_duplex_upgrade_and_upload_remain_credit_bounded() {
    let key = StreamKey::new(17, 31).unwrap();
    let mut phone_to_mac = SendWindow::new(key);
    let mut mac_inbound = ReceiveWindow::new(key);
    let mut mac_to_phone = SendWindow::new(key);
    let mut phone_inbound = ReceiveWindow::new(key);
    phone_to_mac
        .apply_credit(&mac_inbound.initial_credit())
        .unwrap();
    mac_to_phone
        .apply_credit(&phone_inbound.initial_credit())
        .unwrap();

    let mut uploaded = 0usize;
    let mut downloaded = 0usize;
    for index in 0..642 {
        // Metadata occupies sequence zero. Subsequent chunks have no HTTP
        // interpretation at this layer; WebSocket framing stays end to end.
        let upload = if index == 0 {
            br#"{"v":1,"kind":"upgrade"}"#.to_vec()
        } else {
            vec![0x81 ^ index as u8; MAX_CHUNK]
        };
        let download = if index == 0 {
            br#"{"v":1,"status":101}"#.to_vec()
        } else {
            vec![0x82 ^ index as u8; MAX_CHUNK]
        };
        for (sender, receiver, bytes, total) in [
            (&mut phone_to_mac, &mut mac_inbound, upload, &mut uploaded),
            (
                &mut mac_to_phone,
                &mut phone_inbound,
                download,
                &mut downloaded,
            ),
        ] {
            if sender.available() < bytes.len() {
                let (drained, credit) = receiver.pop().unwrap();
                *total += drained.len();
                sender.apply_credit(&credit).unwrap();
            }
            let on_wire = sender.data(bytes).unwrap().encode().unwrap();
            receiver.accept(Frame::decode(&on_wire).unwrap()).unwrap();
            assert!(receiver.queued_bytes() <= WINDOW_BYTES);
        }
    }
    mac_inbound.accept(phone_to_mac.end().unwrap()).unwrap();
    phone_inbound.accept(mac_to_phone.end().unwrap()).unwrap();
    while let Some((bytes, _)) = mac_inbound.pop() {
        uploaded += bytes.len();
    }
    while let Some((bytes, _)) = phone_inbound.pop() {
        downloaded += bytes.len();
    }
    assert!(uploaded > 10 * 1024 * 1024);
    assert!(downloaded > 10 * 1024 * 1024);
    assert!(mac_inbound.ended() && phone_inbound.ended());
    assert!(phone_to_mac.data(vec![1]).is_err());
}
