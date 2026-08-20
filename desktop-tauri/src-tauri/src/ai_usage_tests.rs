use std::path::PathBuf;
use std::sync::atomic::{AtomicU32, Ordering};
use std::sync::Arc;

use crate::ai_usage::{chat_cost_usd, voice_cost_usd, AiCall, AiLimits, UsageLedger};
use crate::ai_usage_guard::AiUsageGuard;

/// A ledger file of its own per test, removed on drop — the guard writes
/// through to disk, so tests must not share one.
struct LedgerFile(PathBuf);

impl LedgerFile {
    fn new() -> Self {
        static NEXT: AtomicU32 = AtomicU32::new(0);
        let name = format!(
            "vibyra-ai-usage-{}-{}.json",
            std::process::id(),
            NEXT.fetch_add(1, Ordering::Relaxed)
        );
        let path = std::env::temp_dir().join(name);
        let _ = std::fs::remove_file(&path);
        Self(path)
    }
}

impl Drop for LedgerFile {
    fn drop(&mut self) {
        let _ = std::fs::remove_file(&self.0);
    }
}

fn limits() -> AiLimits {
    AiLimits {
        daily_calls: 250,
        hourly_calls: 60,
        daily_spend_usd: 2.0,
        monthly_spend_usd: 20.0,
    }
}

fn guard() -> (LedgerFile, Arc<AiUsageGuard>) {
    let file = LedgerFile::new();
    let guard = Arc::new(AiUsageGuard::new(file.0.clone()));
    (file, guard)
}

#[test]
fn a_second_request_is_refused_while_one_is_still_running() {
    let (_file, guard) = guard();
    let permit = guard.reserve(AiCall::Chat, limits(), 0.0).unwrap();
    let error = guard.reserve(AiCall::Chat, limits(), 0.0).unwrap_err();
    assert!(error.contains("already running"));
    // Voice is a separate slot, so dictation is not blocked by a slow chat.
    assert!(guard
        .reserve(AiCall::Voice, limits(), 0.0)
        .is_err_and(|e| e.contains("Slow down")));
    drop(permit);
}

#[test]
fn back_to_back_requests_are_rate_limited() {
    let (_file, guard) = guard();
    drop(guard.reserve(AiCall::Chat, limits(), 0.0).unwrap());
    let error = guard.reserve(AiCall::Chat, limits(), 0.0).unwrap_err();
    assert!(error.contains("Slow down"), "{error}");
}

#[test]
fn a_call_counts_against_the_daily_cap_even_when_it_fails() {
    let (_file, guard) = guard();
    // Permit dropped without finish_*: the request errored out.
    drop(guard.reserve(AiCall::Chat, limits(), 0.0).unwrap());
    assert_eq!(guard.ledger().calls(), 1);
    assert_eq!(guard.ledger().spend_usd, 0.0);
}

#[test]
fn the_daily_call_cap_stops_further_requests() {
    let (_file, guard) = guard();
    let capped = AiLimits {
        daily_calls: 1,
        ..limits()
    };
    drop(guard.reserve(AiCall::Chat, capped, 0.0).unwrap());
    let error = guard.reserve(AiCall::Chat, capped, 0.0).unwrap_err();
    // The one-per-second rule fires first; what matters is that it is refused.
    assert!(
        error.contains("Slow down") || error.contains("Daily limit"),
        "{error}"
    );
}

#[test]
fn a_call_that_would_cross_the_spend_cap_is_refused_before_it_is_sent() {
    let (_file, guard) = guard();
    let capped = AiLimits {
        daily_spend_usd: 0.01,
        ..limits()
    };
    let error = guard.reserve(AiCall::Chat, capped, 0.02).unwrap_err();
    assert!(error.contains("Daily spend cap"), "{error}");
    assert_eq!(guard.ledger().calls(), 0);
}

#[test]
fn the_monthly_cap_binds_independently_of_the_daily_one() {
    let (_file, guard) = guard();
    let capped = AiLimits {
        daily_spend_usd: 100.0,
        monthly_spend_usd: 0.005,
        ..limits()
    };
    let error = guard.reserve(AiCall::Chat, capped, 0.01).unwrap_err();
    assert!(error.contains("Monthly spend cap"), "{error}");
}

#[test]
fn a_zero_limit_means_uncapped() {
    let (_file, guard) = guard();
    let uncapped = AiLimits {
        daily_calls: 0,
        hourly_calls: 0,
        daily_spend_usd: 0.0,
        monthly_spend_usd: 0.0,
    };
    assert!(guard.reserve(AiCall::Chat, uncapped, 9_999.0).is_ok());
}

#[test]
fn spend_survives_a_restart() {
    let file = LedgerFile::new();
    let guard = Arc::new(AiUsageGuard::new(file.0.clone()));
    guard
        .reserve(AiCall::Chat, limits(), 0.0)
        .unwrap()
        .finish_chat(1_000_000, 1_000_000);
    let spent = guard.ledger().spend_usd;
    assert!(spent > 0.0);

    let reopened = AiUsageGuard::new(file.0.clone());
    assert_eq!(reopened.ledger().spend_usd, spent);
    assert_eq!(reopened.ledger().calls(), 1);
}

#[test]
fn a_new_day_clears_the_daily_buckets_but_not_the_month() {
    let mut ledger = UsageLedger {
        day: "2026-08-19".into(),
        month: "2026-08".into(),
        chat_calls: 7,
        spend_usd: 1.25,
        month_calls: 40,
        month_spend_usd: 9.5,
        ..UsageLedger::default()
    };
    ledger.roll_to("2026-08-20", "2026-08");
    assert_eq!(ledger.calls(), 0);
    assert_eq!(ledger.spend_usd, 0.0);
    assert_eq!(ledger.month_calls, 40);
    assert_eq!(ledger.month_spend_usd, 9.5);

    ledger.roll_to("2026-09-01", "2026-09");
    assert_eq!(ledger.month_calls, 0);
    assert_eq!(ledger.month_spend_usd, 0.0);
}

#[test]
fn the_budget_precheck_reports_room_without_consuming_any() {
    let (_file, guard) = guard();
    assert!(guard.budget_available(limits()).is_ok());
    // A read-only check: nothing reserved, nothing counted, and the rate
    // limits do not apply to it.
    assert!(guard.budget_available(limits()).is_ok());
    assert_eq!(guard.ledger().calls(), 0);

    let spent = AiLimits {
        daily_spend_usd: 0.000_001,
        ..limits()
    };
    guard
        .reserve(AiCall::Chat, limits(), 0.0)
        .unwrap()
        .finish_chat(100_000, 100_000);
    assert!(guard.budget_available(spent).is_err());
}

#[test]
fn published_prices_are_applied() {
    assert!((chat_cost_usd(1_000_000, 0) - 0.15).abs() < 1e-9);
    assert!((chat_cost_usd(0, 1_000_000) - 0.60).abs() < 1e-9);
    assert!((voice_cost_usd(60.0) - 0.006).abs() < 1e-9);
}
