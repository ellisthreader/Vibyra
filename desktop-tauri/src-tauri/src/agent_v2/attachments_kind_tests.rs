use super::*;
use crate::agent_v2::attachments_support::{jpeg, pdf};

#[test]
fn only_photos_pdfs_and_text_are_accepted_and_the_bytes_must_match() {
    let (png, text) = (b"\x89PNG\r\n\x1a\n....".as_slice(), "héllo".as_bytes());
    assert_eq!(
        classify("IMAGE/PNG; x=y", png),
        Ok(Kind::Image("image/png"))
    );
    assert_eq!(classify("application/pdf", &pdf("hi")), Ok(Kind::Pdf));
    assert_eq!(classify("text/plain; charset=utf-8", text), Ok(Kind::Text));
    assert_eq!(
        classify("image/jpeg", &jpeg()),
        Ok(Kind::Image("image/jpeg"))
    );
    for (declared, bytes) in [
        ("application/zip", b"PK".as_slice()),
        ("image/svg+xml", b"<svg/>"),
        ("text/html", b"<p>"),
        ("", b"x"),
    ] {
        assert!(
            classify(declared, bytes)
                .unwrap_err()
                .contains("cannot read"),
            "{declared}"
        );
    }
    for (declared, bytes) in [
        ("image/png", &pdf("x")[..]),
        ("application/pdf", png),
        ("text/plain", b"a\0b"),
        ("text/plain", &[0xff, 0xfe, 0x41]),
        ("image/webp", b"RIFF1234WAVE"),
    ] {
        assert!(
            classify(declared, bytes)
                .unwrap_err()
                .contains("does not match"),
            "{declared}"
        );
    }
    assert_eq!(classify("text/plain", b""), Err("is empty"));
}

#[test]
fn labels_are_sanitized_and_disk_names_are_generated() {
    for (raw, shown) in [
        ("../../etc/passwd", "passwd"),
        ("C:\\Users\\me\\tax return (2).pdf", "tax return (2).pdf"),
        ("evil\u{202e}gpj.exe\n\"><b>", "evilgpj.exeb"),
        ("", "unnamed"),
        ("///", "unnamed"),
        ("   ...  ", "unnamed"),
    ] {
        assert_eq!(label(raw), shown, "{raw:?}");
    }
    assert_eq!(label(&"é".repeat(100)).chars().count(), 60);
    assert_eq!(
        file_name(1, "ABCDEF0123456789", Kind::Pdf),
        "attachment-2-ABCDEF01.pdf"
    );
    assert_eq!(
        file_name(0, "../../x", Kind::Text),
        "attachment-1-.txt",
        "no hex, no prefix, still no traversal"
    );
}
