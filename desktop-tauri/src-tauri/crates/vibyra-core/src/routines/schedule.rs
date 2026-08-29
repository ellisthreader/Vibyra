//! When a routine next runs.
//!
//! A schedule is a *civil-time* rule — "09:00 on weekdays" — and civil time is
//! not a fixed offset from UTC. Twice a year the answer to "what instant is
//! 09:00 tomorrow" changes, and a scheduler that stores an offset instead of a
//! rule silently drifts an hour and stays wrong until someone notices. So the
//! rule is stored and the instant is recomputed, through a real timezone
//! database, every time.
//!
//! The two awkward days are handled explicitly rather than by luck:
//!
//! * **Spring forward** — 02:30 does not exist. A routine set for it runs at
//!   the first instant that does, rather than being skipped for the year.
//! * **Fall back** — 01:30 happens twice. The routine runs at the *first*
//!   one, and having run, its next occurrence is tomorrow — so it fires once,
//!   not twice.

use chrono::{DateTime, Datelike, Duration, NaiveDate, NaiveTime, TimeZone, Utc};
use chrono_tz::Tz;
use serde::{Deserialize, Serialize};

/// A recurrence rule.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(tag = "kind", rename_all = "camelCase")]
pub enum Schedule {
    /// Every day at a wall-clock time.
    Daily { minute_of_day: u32 },
    /// On chosen days of the week. `days` holds 0 = Monday … 6 = Sunday.
    Weekdays { days: Vec<u32>, minute_of_day: u32 },
    /// Every N minutes from whenever it was last saved. The one rule that is
    /// not civil time, and so the one DST cannot move.
    Every { minutes: u32 },
}

impl Schedule {
    /// Rejects a rule that could never fire, which is the only way to make
    /// "next run" a total function below.
    pub fn valid(&self) -> Result<(), String> {
        match self {
            Schedule::Daily { minute_of_day } => bounded_minute(*minute_of_day),
            Schedule::Weekdays {
                days,
                minute_of_day,
            } => {
                if days.is_empty() {
                    return Err("choose at least one day".into());
                }
                if days.iter().any(|day| *day > 6) {
                    return Err("days run 0 (Monday) to 6 (Sunday)".into());
                }
                bounded_minute(*minute_of_day)
            }
            Schedule::Every { minutes } => {
                if *minutes < 5 {
                    Err("the shortest interval is every 5 minutes".into())
                } else if *minutes > 60 * 24 * 30 {
                    Err("that interval is longer than a month".into())
                } else {
                    Ok(())
                }
            }
        }
    }

    /// The first firing strictly after `after`, in `zone`.
    ///
    /// Strictly after, so calling this with the time a run just happened gives
    /// tomorrow rather than the same instant forever.
    pub fn next_after(&self, zone: Tz, after: DateTime<Utc>) -> Option<DateTime<Utc>> {
        self.valid().ok()?;
        match self {
            Schedule::Every { minutes } => Some(after + Duration::minutes(*minutes as i64)),
            Schedule::Daily { minute_of_day } => scan(zone, after, *minute_of_day, &|_| true),
            Schedule::Weekdays {
                days,
                minute_of_day,
            } => scan(zone, after, *minute_of_day, &|date| {
                days.contains(&date.weekday().num_days_from_monday())
            }),
        }
    }

    /// A sentence a person can check before saving. The plan asks for a
    /// resolved, human-readable schedule, and this is it.
    pub fn describe(&self) -> String {
        match self {
            Schedule::Every { minutes } if *minutes % 60 == 0 => {
                let hours = minutes / 60;
                if hours == 1 {
                    "Every hour".into()
                } else {
                    format!("Every {hours} hours")
                }
            }
            Schedule::Every { minutes } => format!("Every {minutes} minutes"),
            Schedule::Daily { minute_of_day } => format!("Every day at {}", clock(*minute_of_day)),
            Schedule::Weekdays {
                days,
                minute_of_day,
            } => {
                let mut ordered = days.clone();
                ordered.sort_unstable();
                ordered.dedup();
                let named = if ordered == [0, 1, 2, 3, 4] {
                    "weekdays".to_string()
                } else if ordered == [5, 6] {
                    "weekends".to_string()
                } else {
                    ordered
                        .iter()
                        .map(|day| day_name(*day))
                        .collect::<Vec<_>>()
                        .join(", ")
                };
                format!("{named} at {}", clock(*minute_of_day))
            }
        }
    }
}

/// Walks forward day by day until a date matches and its time resolves.
///
/// Bounded at 400 days so a rule that somehow never matches returns `None`
/// rather than spinning — an unfireable schedule is a bug to surface, not a
/// loop to hang in.
fn scan(
    zone: Tz,
    after: DateTime<Utc>,
    minute_of_day: u32,
    matches: &dyn Fn(NaiveDate) -> bool,
) -> Option<DateTime<Utc>> {
    let local = after.with_timezone(&zone);
    let mut date = local.date_naive();
    for _ in 0..400 {
        if matches(date) {
            if let Some(instant) = resolve(zone, date, minute_of_day) {
                if instant > after {
                    return Some(instant);
                }
            }
        }
        date = date.succ_opt()?;
    }
    None
}

/// Turns a civil date and time into a real instant, coping with the two days a
/// year on which that is not a straightforward question.
fn resolve(zone: Tz, date: NaiveDate, minute_of_day: u32) -> Option<DateTime<Utc>> {
    let time = NaiveTime::from_hms_opt(minute_of_day / 60, minute_of_day % 60, 0)?;
    let naive = date.and_time(time);
    match zone.from_local_datetime(&naive) {
        // The ordinary case.
        chrono::LocalResult::Single(found) => Some(found.with_timezone(&Utc)),
        // Fall back: this wall-clock time happens twice. Take the first, so
        // the routine fires once rather than being eligible twice in an hour.
        chrono::LocalResult::Ambiguous(first, _) => Some(first.with_timezone(&Utc)),
        // Spring forward: this wall-clock time does not exist today. Step
        // forward a minute at a time to the first one that does, rather than
        // skipping the routine for the year.
        chrono::LocalResult::None => (1..=180).find_map(|offset| {
            let shifted = naive + Duration::minutes(offset);
            if shifted.day() != naive.day() {
                return None;
            }
            zone.from_local_datetime(&shifted)
                .single()
                .map(|found| found.with_timezone(&Utc))
        }),
    }
}

fn bounded_minute(minute_of_day: u32) -> Result<(), String> {
    if minute_of_day < 24 * 60 {
        Ok(())
    } else {
        Err("that is not a time of day".into())
    }
}

fn clock(minute_of_day: u32) -> String {
    format!("{:02}:{:02}", minute_of_day / 60, minute_of_day % 60)
}

fn day_name(day: u32) -> &'static str {
    ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"][(day % 7) as usize]
}
