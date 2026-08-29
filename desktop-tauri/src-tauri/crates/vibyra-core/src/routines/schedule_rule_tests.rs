//! Rule tests that are not about the clock changing.
//!
//! Which days a rule lands on, which rules are refused before they can be
//! saved, and whether a rule can describe itself in words a person can check.
//! The DST cases live next door in `schedule_tests`.

use chrono::{DateTime, TimeZone, Utc};
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

/// Weekday rules skip the days they were not given.
#[test]
fn weekday_rules_land_only_on_their_days() {
    let zone = london();
    // Monday to Friday at 09:00.
    let weekdays = Schedule::Weekdays {
        days: vec![0, 1, 2, 3, 4],
        minute_of_day: 9 * 60,
    };

    // Friday 12 June 2026, after the run: next is Monday, not Saturday.
    let next = weekdays
        .next_after(zone, utc("2026-06-12T12:00:00Z"))
        .unwrap();
    assert_eq!(
        next.with_timezone(&zone).date_naive().to_string(),
        "2026-06-15"
    );

    let weekends = Schedule::Weekdays {
        days: vec![5, 6],
        minute_of_day: 10 * 60,
    };
    let saturday = weekends
        .next_after(zone, utc("2026-06-12T12:00:00Z"))
        .unwrap();
    assert_eq!(
        saturday.with_timezone(&zone).date_naive().to_string(),
        "2026-06-13"
    );
}

/// Intervals are the one rule DST cannot move, because they are not civil time.
#[test]
fn an_interval_is_unaffected_by_the_clocks_changing() {
    let hourly = Schedule::Every { minutes: 60 };
    let across = hourly
        .next_after(london(), utc("2026-10-25T00:30:00Z"))
        .unwrap();
    assert_eq!(across, utc("2026-10-25T01:30:00Z"));
}

/// A rule that could never fire is refused at save time, which is what makes
/// `next_after` total.
#[test]
fn unfireable_rules_are_refused_before_they_are_saved() {
    assert!(Schedule::Weekdays {
        days: vec![],
        minute_of_day: 540
    }
    .valid()
    .is_err());
    assert!(Schedule::Weekdays {
        days: vec![9],
        minute_of_day: 540
    }
    .valid()
    .is_err());
    assert!(Schedule::Daily {
        minute_of_day: 24 * 60
    }
    .valid()
    .is_err());
    assert!(Schedule::Every { minutes: 1 }.valid().is_err());
    assert!(Schedule::Every { minutes: 60 }.valid().is_ok());
}

/// A person has to be able to check the rule before saving it.
#[test]
fn every_rule_describes_itself_in_words() {
    assert_eq!(
        Schedule::Daily {
            minute_of_day: 9 * 60 + 30
        }
        .describe(),
        "Every day at 09:30"
    );
    assert_eq!(
        Schedule::Weekdays {
            days: vec![0, 1, 2, 3, 4],
            minute_of_day: 9 * 60
        }
        .describe(),
        "weekdays at 09:00"
    );
    assert_eq!(
        Schedule::Weekdays {
            days: vec![5, 6],
            minute_of_day: 10 * 60
        }
        .describe(),
        "weekends at 10:00"
    );
    assert_eq!(
        Schedule::Weekdays {
            days: vec![2],
            minute_of_day: 14 * 60
        }
        .describe(),
        "Wed at 14:00"
    );
    assert_eq!(Schedule::Every { minutes: 60 }.describe(), "Every hour");
    assert_eq!(Schedule::Every { minutes: 180 }.describe(), "Every 3 hours");
    assert_eq!(
        Schedule::Every { minutes: 45 }.describe(),
        "Every 45 minutes"
    );
}

/// A routine stores its zone rather than following the laptop, so a trip does
/// not move the user's standup.
#[test]
fn a_stored_zone_is_used_rather_than_the_machines() {
    let daily = Schedule::Daily {
        minute_of_day: 9 * 60,
    };
    let tokyo: Tz = "Asia/Tokyo".parse().unwrap();
    let next = daily
        .next_after(tokyo, utc("2026-06-15T12:00:00Z"))
        .unwrap();
    assert_eq!(
        next.with_timezone(&tokyo).format("%H:%M").to_string(),
        "09:00"
    );
    assert_eq!(
        next,
        tokyo
            .with_ymd_and_hms(2026, 6, 16, 9, 0, 0)
            .unwrap()
            .with_timezone(&Utc)
    );
}
