//! Bounded, order-preserving fan-out for the desktop's I/O-bound work.
//!
//! Deliberately not rayon. The parallel work here is a handful of
//! user-initiated fan-outs — vault search, launch preflight, vault discovery
//! — where a work-stealing pool earns nothing that scoped threads do not,
//! and where thread start-up cost is irrelevant next to the `stat`/`read`
//! syscalls being hidden. Staying dependency-free also keeps the crate's
//! `cargo audit` surface unchanged.

use std::num::NonZeroUsize;
use std::thread;

/// Upper bound on helper threads. The desktop is already running terminals,
/// preview servers and agent processes, so a background fan-out should hide
/// I/O latency without taking the machine over.
const MAX_THREADS: usize = 8;

fn thread_budget(items: usize) -> usize {
    let cores = thread::available_parallelism()
        .map(NonZeroUsize::get)
        .unwrap_or(1);
    cores.min(MAX_THREADS).min(items).max(1)
}

/// Applies `map` to every item, in parallel, returning results in input
/// order. Runs inline without spawning when there is nothing to gain.
///
/// A panic inside `map` is propagated to the caller after every helper
/// thread has been joined.
pub fn map_parallel<T, R, F>(items: &[T], map: F) -> Vec<R>
where
    T: Sync,
    R: Send,
    F: Fn(&T) -> R + Sync,
{
    let threads = thread_budget(items.len());
    if threads <= 1 {
        return items.iter().map(map).collect();
    }
    let chunk_size = items.len().div_ceil(threads);
    let map = &map;
    let mut results = Vec::with_capacity(items.len());
    thread::scope(|scope| {
        let handles: Vec<_> = items
            .chunks(chunk_size)
            .map(|chunk| scope.spawn(move || chunk.iter().map(map).collect::<Vec<R>>()))
            .collect();
        for handle in handles {
            match handle.join() {
                Ok(chunk) => results.extend(chunk),
                Err(payload) => std::panic::resume_unwind(payload),
            }
        }
    });
    results
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn preserves_input_order_across_chunk_boundaries() {
        let items: Vec<usize> = (0..1_000).collect();
        let doubled = map_parallel(&items, |value| value * 2);
        assert_eq!(doubled.len(), 1_000);
        assert!(doubled.iter().enumerate().all(|(i, v)| *v == i * 2));
    }

    #[test]
    fn handles_empty_and_single_item_inputs_without_spawning() {
        let empty: Vec<usize> = Vec::new();
        assert!(map_parallel(&empty, |value| *value).is_empty());
        assert_eq!(map_parallel(&[7usize], |value| *value + 1), vec![8]);
    }

    #[test]
    fn budget_never_exceeds_the_item_count_or_the_cap() {
        assert_eq!(thread_budget(0), 1);
        assert_eq!(thread_budget(1), 1);
        assert!(thread_budget(1_000) <= MAX_THREADS);
    }
}
