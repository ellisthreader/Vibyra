//! Canonical 16 kHz mono PCM keeps a two-minute recording below the API upload limit.
use super::CapturedAudio;

pub(super) fn canonical(audio: CapturedAudio) -> Result<CapturedAudio, String> {
    const OUTPUT: usize = 16_000;
    let rate = audio.sample_rate as usize;
    if !(8_000..=192_000).contains(&rate) || !audio.raw.len().is_multiple_of(2) {
        return Err("The microphone returned an unsupported audio format.".into());
    }
    if rate == OUTPUT {
        return Ok(audio);
    }
    let count = (audio.raw.len() / 2).min(rate * 120);
    let output_count = count * OUTPUT / rate;
    let mut raw = Vec::with_capacity(output_count * 2);
    // Area-weighted samples suppress high-frequency aliasing when downsampling;
    // exact integer interval boundaries avoid duration drift at 44.1 kHz.
    for index in 0..output_count {
        let start = index * rate;
        let end = (index + 1) * rate;
        let mut sum: i64 = 0;
        for sample in start / OUTPUT..end.div_ceil(OUTPUT) {
            let overlap = end.min((sample + 1) * OUTPUT) - start.max(sample * OUTPUT);
            let value = i16::from_le_bytes([audio.raw[sample * 2], audio.raw[sample * 2 + 1]]);
            sum += i64::from(value) * overlap as i64;
        }
        raw.extend_from_slice(&((sum / rate as i64) as i16).to_le_bytes());
    }
    Ok(CapturedAudio {
        raw,
        sample_rate: OUTPUT as u32,
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn common_microphone_rates_preserve_duration_and_constant_amplitude() {
        for rate in [8_000, 16_000, 44_100, 48_000, 96_000, 192_000] {
            let raw = 1234i16.to_le_bytes().repeat(rate);
            let result = canonical(CapturedAudio {
                raw,
                sample_rate: rate as u32,
            })
            .unwrap();
            assert_eq!(result.sample_rate, 16_000);
            assert_eq!(result.raw, 1234i16.to_le_bytes().repeat(16_000));
        }
    }
    #[test]
    fn invalid_formats_and_partial_samples_are_refused() {
        assert!(canonical(CapturedAudio {
            raw: vec![0],
            sample_rate: 16_000
        })
        .is_err());
        assert!(canonical(CapturedAudio {
            raw: vec![0; 10],
            sample_rate: 0
        })
        .is_err());
    }
}
