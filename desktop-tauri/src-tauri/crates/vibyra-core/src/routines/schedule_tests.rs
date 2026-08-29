//! Schedule tests, written against the two days a year that break schedulers.

use chrono::{DateTime, Utc};
use chrono_tz::Tz;

use super::schedule::Schedule;

fn utc(text: &str) -> DateTime<Utc> {
    DateTime::parse_from_rfc3339(text)
        .unwrap()
        .with_timezone(&Utc)
}

fn london() -> Tz {
    "Europe/London".parse().unwrap()
}

/// The ordinary case, and the one that must be strictly *after*: asking for
/// the next run at the exact moment one just fired gives tomorrow, not the
/// same instant forever.
#[test]
fn a_daily_routine_moves_to_tomorrow_once_it_has_fired() {
    let daily = Schedule::Daily {
        minute_of_day: 9 * 60,
    };
    let fired = utc("2026-06-15T08:00:00Z"); // 09:00 London, BST
    let next = daily.next_after(london(), fired).unwrap();
    assert_eq!(next, utc("2026-06-16T08:00:00Z"));
}

/// The rule is civil time, so the instant it lands on changes across a DST
/// boundary. A scheduler that stored an offset would drift an hour here and
/// stay wrong until someone noticed.
#[test]
fn nine_am_stays_nine_am_across_the_dst_boundary() {
    let daily = Schedule::Daily {
        minute_of_day: 9 * 60,
    };
    let zone = london();

    // The clocks go back at 02:00 on 25 October 2026.
    // Before it, 09:00 London is BST, an hour ahead of UTC.
    let before = daily.next_after(zone, utc("2026-10-23T12:00:00Z")).unwrap();
    assert_eq!(before, utc("2026-10-24T08:00:00Z"));

    // After it, 09:00 London is GMT. A different instant, the same wall clock
    // — which is the whole reason the rule is stored rather than the offset.
    let after = daily.next_after(zone, utc("2026-10-26T12:00:00Z")).unwrap();
    assert_eq!(after, utc("2026-10-27T09:00:00Z"));

    for instant in [before, after] {
        assert_eq!(
            instant.with_timezone(&zone).format("%H:%M").to_string(),
            "09:00"
        );
    }
}

/// Spring forward: 01:30 does not exist on the changeover day in London. A
/// routine set for it must run at the first instant that does, not be skipped
/// for the year.
#[test]
fn a_time_that_does_not_exist_runs_at_the_next_one_that_does() {
    let zone = london();
    // The clocks go forward on 29 March 2026: 01:00 becomes 02:00.
    let nonexistent = Schedule::Daily {
        minute_of_day: 60 + 30,
    };
    let next = nonexistent
        .next_after(zone, utc("2026-03-28T12:00:00Z"))
        .unwrap();

    let local = next.with_timezone(&zone);
    assert_eq!(local.date_naive().to_string(), "2026-03-29");
    assert_eq!(
        local.format("%H:%M").to_string(),
        "02:00",
        "stepped to the first real minute"
    );
}

/// Fall back: 01:30 happens twice. The routine takes the first, so it fires
/// once rather than being eligible twice inside an hour.
#[test]
fn an_ambiguous_time_fires_once_on_the_earlier_occurrence() {
    let zone = london();
    let ambiguous = Schedule::Daily {
        minute_of_day: 60 + 30,
    };
    let next = ambiguous
        .next_after(zone, utc("2026-10-24T12:00:00Z"))
        .unwrap();

    // 01:30 BST on 25 October is 00:30 UTC; the second 01:30 is 01:30 UTC.
    assert_eq!(next, utc("2026-10-25T00:30:00Z"));

    // Having fired, the next one is the following day — not the repeat hour.
    let following = ambiguous.next_after(zone, next).unwrap();
    assert!(
        following > utc("2026-10-25T12:00:00Z"),
        "fired twice in one night"
    );
}
