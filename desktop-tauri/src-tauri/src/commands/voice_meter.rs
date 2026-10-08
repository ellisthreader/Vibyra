//! The same S16LE level window drives dictation and spoken turns on every OS.
use std::time::Duration;

pub fn level(raw: &[u8], sample_rate: u32, window: Duration) -> (f32, f64) {
    let raw = &raw[..raw.len() & !1];
    let per_second = sample_rate as usize * 2;
    let seconds = raw.len() as f64 / per_second as f64;
    let span = ((window.as_secs_f64() * per_second as f64) as usize).max(2) & !1;
    let tail = &raw[raw.len().saturating_sub(span)..];
    let mut total = 0f64;
    let mut count = 0usize;
    for pair in tail.chunks_exact(2) {
        let sample = f64::from(i16::from_le_bytes([pair[0], pair[1]])) / f64::from(i16::MAX);
        total += sample * sample;
        count += 1;
    }
    let rms = if count == 0 {
        0.0
    } else {
        (total / count as f64).sqrt()
    };
    (rms as f32, seconds)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_pause_is_measured_from_the_tail_at_each_platform_sample_rate() {
        for rate in [16_000, 48_000] {
            let mut raw: Vec<u8> = (0..rate).flat_map(|_| 16_384i16.to_le_bytes()).collect();
            raw.extend(vec![0; rate as usize * 2]);
            let (quiet, seconds) = level(&raw, rate, Duration::from_millis(350));
            assert_eq!((quiet, seconds), (0.0, 2.0));
            assert!(level(&raw, rate, Duration::from_secs(2)).0 > 0.3);
        }
    }

    #[test]
    fn empty_or_partial_pipe_samples_do_not_produce_invalid_levels() {
        assert_eq!(level(&[], 16_000, Duration::from_secs(1)), (0.0, 0.0));
        assert_eq!(level(&[255], 16_000, Duration::from_secs(1)), (0.0, 0.0));
        assert_eq!(
            level(&[0, 0, 255], 16_000, Duration::from_secs(1)),
            (0.0, 1.0 / 16_000.0)
        );
    }
}
