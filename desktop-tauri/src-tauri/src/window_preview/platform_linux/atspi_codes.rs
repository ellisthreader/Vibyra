//! AT-SPI state and role numbers, and the bit words the bus carries them in.

pub(crate) mod state {
    pub const EDITABLE: u32 = 7;
    pub const FOCUSED: u32 = 12;
    pub const MULTI_LINE: u32 = 17;
    pub const SHOWING: u32 = 25;
    pub const READ_ONLY: u32 = 43;
}

pub(crate) mod role {
    pub const COMBO_BOX: u32 = 11;
    pub const PASSWORD_TEXT: u32 = 40;
    pub const TERMINAL: u32 = 60;
    pub const TEXT: u32 = 61;
    pub const ENTRY: u32 = 79;
}

/// A set of AT-SPI numbers as the bit words the bus uses.
pub(crate) fn bits(values: &[u32], words: usize) -> Vec<i32> {
    let mut out = vec![0u32; words];
    for value in values
        .iter()
        .filter(|value| (**value as usize) < words * 32)
    {
        out[*value as usize / 32] |= 1 << (value % 32);
    }
    out.into_iter().map(|word| word as i32).collect()
}

pub(crate) fn has(words: &[u32], value: u32) -> bool {
    words
        .get(value as usize / 32)
        .is_some_and(|word| word & (1 << (value % 32)) != 0)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn states_and_roles_travel_as_bit_words() {
        let words = bits(&[state::EDITABLE, state::FOCUSED, state::READ_ONLY], 2);
        assert_eq!(words, vec![(1 << 7) | (1 << 12), 1 << 11]);
        let raw: Vec<u32> = words.iter().map(|word| *word as u32).collect();
        assert!(has(&raw, state::FOCUSED) && has(&raw, state::READ_ONLY));
        assert!(!has(&raw, state::MULTI_LINE) && !has(&[], state::FOCUSED));
        assert_eq!(bits(&[role::ENTRY], 4), vec![0, 0, 1 << 15, 0]);
        assert_eq!(
            bits(&[500], 2),
            vec![0, 0],
            "out-of-range numbers are ignored"
        );
    }
}
