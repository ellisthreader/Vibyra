#[cfg(test)]
mod tests {
    use glib::{variant::ToVariant, Variant};

    #[test]
    fn optimized_string_iterator_reads_every_mutating_ffi_path() {
        let value = Variant::array_from_iter::<String>(
            ["zero", "one", "two", "three", "four", "five"].map(|item| item.to_variant()),
        );
        assert_eq!(value.array_iter_str().unwrap().next(), Some("zero"));
        assert_eq!(value.array_iter_str().unwrap().nth(2), Some("two"));
        assert_eq!(value.array_iter_str().unwrap().last(), Some("five"));
        assert_eq!(value.array_iter_str().unwrap().next_back(), Some("five"));
        assert_eq!(value.array_iter_str().unwrap().nth_back(2), Some("three"));

        let mut mixed = value.array_iter_str().unwrap();
        assert_eq!(mixed.next(), Some("zero"));
        assert_eq!(mixed.next_back(), Some("five"));
        assert_eq!(mixed.nth(1), Some("two"));
        assert_eq!(mixed.nth_back(1), Some("three"));
        assert_eq!(mixed.next(), None);
        assert_eq!(mixed.next_back(), None);
    }
}
