use std::fs::File;
use std::io::{self, Read, Seek, SeekFrom, Write};
use std::net::TcpStream;
use std::path::Path;
use std::time::Duration;

use super::static_assets::{mime_type, requested_file};

const MAX_REQUEST_HEAD_BYTES: usize = 16 * 1024;

pub(crate) fn serve(mut stream: TcpStream, root: &Path, entry: &Path) -> io::Result<()> {
    stream.set_read_timeout(Some(Duration::from_secs(2)))?;
    stream.set_write_timeout(Some(Duration::from_secs(5)))?;
    let request = read_request_head(&mut stream)?;
    let head = String::from_utf8_lossy(&request);
    let Some(line) = head.lines().next() else {
        return Ok(());
    };
    let mut parts = line.split_whitespace();
    let method = parts.next().unwrap_or("");
    let uri = parts.next().unwrap_or("/");
    if method != "GET" && method != "HEAD" {
        return response(
            &mut stream,
            405,
            "text/plain",
            b"Method not allowed",
            method,
        );
    }
    let Some(path) = requested_file(root, entry, uri) else {
        return response(&mut stream, 404, "text/plain", b"Not found", method);
    };
    let mut file = File::open(&path)?;
    let size = file.metadata()?.len();
    let (status, start, length, content_range) = match requested_range(&head, size) {
        ByteRange::Full => ("200 OK", 0, size, String::new()),
        ByteRange::Partial { start, end } => (
            "206 Partial Content",
            start,
            end - start + 1,
            format!("Content-Range: bytes {start}-{end}/{size}\r\n"),
        ),
        ByteRange::Invalid => return range_not_satisfiable(&mut stream, size),
    };
    let header = format!(
        "HTTP/1.1 {status}\r\nContent-Type: {}\r\nContent-Length: {length}\r\nAccept-Ranges: bytes\r\n{content_range}Cache-Control: no-store\r\nX-Content-Type-Options: nosniff\r\nConnection: close\r\n\r\n",
        mime_type(&path)
    );
    stream.write_all(header.as_bytes())?;
    if method == "GET" {
        file.seek(SeekFrom::Start(start))?;
        io::copy(&mut file.take(length), &mut stream)?;
    }
    Ok(())
}

fn read_request_head(stream: &mut TcpStream) -> io::Result<Vec<u8>> {
    let mut request = vec![0_u8; MAX_REQUEST_HEAD_BYTES];
    let mut count = 0;
    while count < request.len() {
        let read = stream.read(&mut request[count..])?;
        if read == 0 {
            break;
        }
        count += read;
        if request[..count]
            .windows(4)
            .any(|bytes| bytes == b"\r\n\r\n")
        {
            break;
        }
    }
    request.truncate(count);
    Ok(request)
}

enum ByteRange {
    Full,
    Partial { start: u64, end: u64 },
    Invalid,
}

fn requested_range(head: &str, size: u64) -> ByteRange {
    let Some(value) = head.lines().skip(1).find_map(|line| {
        let (name, value) = line.split_once(':')?;
        name.eq_ignore_ascii_case("range").then(|| value.trim())
    }) else {
        return ByteRange::Full;
    };
    let Some((unit, value)) = value.split_once('=') else {
        return ByteRange::Invalid;
    };
    if !unit.eq_ignore_ascii_case("bytes") || size == 0 || value.contains(',') {
        return ByteRange::Invalid;
    }
    let Some((start, end)) = value.split_once('-') else {
        return ByteRange::Invalid;
    };
    if start.is_empty() {
        let Ok(suffix) = end.parse::<u64>() else {
            return ByteRange::Invalid;
        };
        if suffix == 0 {
            return ByteRange::Invalid;
        }
        let length = suffix.min(size);
        return ByteRange::Partial {
            start: size - length,
            end: size - 1,
        };
    }
    let Ok(start) = start.parse::<u64>() else {
        return ByteRange::Invalid;
    };
    if start >= size {
        return ByteRange::Invalid;
    }
    let end = if end.is_empty() {
        size - 1
    } else {
        let Ok(end) = end.parse::<u64>() else {
            return ByteRange::Invalid;
        };
        end.min(size - 1)
    };
    if end < start {
        ByteRange::Invalid
    } else {
        ByteRange::Partial { start, end }
    }
}

fn range_not_satisfiable(stream: &mut TcpStream, size: u64) -> io::Result<()> {
    write!(
        stream,
        "HTTP/1.1 416 Range Not Satisfiable\r\nContent-Range: bytes */{size}\r\nContent-Length: 0\r\nConnection: close\r\n\r\n"
    )
}

fn response(
    stream: &mut TcpStream,
    status: u16,
    mime: &str,
    body: &[u8],
    method: &str,
) -> io::Result<()> {
    let reason = if status == 404 {
        "Not Found"
    } else {
        "Method Not Allowed"
    };
    write!(
        stream,
        "HTTP/1.1 {status} {reason}\r\nContent-Type: {mime}\r\nContent-Length: {}\r\nConnection: close\r\n\r\n",
        body.len()
    )?;
    if method != "HEAD" {
        stream.write_all(body)?;
    }
    Ok(())
}
