//! A pass/fail summary read from a test run's output and exit status. The raw
//! output is always shown next to it; counts are only what the runner printed.

use regex::Regex;
use serde::Serialize;
use std::sync::OnceLock;

#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Counts {
    pub passed: Option<u32>,
    pub failed: Option<u32>,
}

fn patterns() -> &'static (Regex, Regex) {
    static P: OnceLock<(Regex, Regex)> = OnceLock::new();
    P.get_or_init(|| {
        (
            // "12 passed", "ok. 5 passed;", "# pass 4", "Passed: 3", "3 passing"
            Regex::new(r"(?i)(?:#\s*pass\s+(\d+))|(?:\b(\d+)\s+(?:passed|passing)\b)|(?:\bpassed:\s*(\d+))").unwrap(),
            Regex::new(r"(?i)(?:#\s*fail\s+(\d+))|(?:\b(\d+)\s+(?:failed|failing|failures?)\b)|(?:\bfailed:\s*(\d+))").unwrap(),
        )
    })
}

fn total(re: &Regex, text: &str) -> Option<u32> {
    let mut sum: Option<u32> = None;
    for caps in re.captures_iter(text) {
        let n = (1..=3)
            .find_map(|i| caps.get(i))
            .and_then(|m| m.as_str().parse::<u32>().ok());
        if let Some(n) = n {
            sum = Some(sum.unwrap_or(0).saturating_add(n));
        }
    }
    sum
}

/// Totals every "N passed" / "N failed" the runner printed (cargo prints one
/// per test binary). `None` when nothing recognisable was printed.
pub fn counts(output: &str) -> Counts {
    let (pass, fail) = patterns();
    Counts {
        passed: total(pass, output),
        failed: total(fail, output),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn reads_the_common_runners() {
        let cargo = "test result: ok. 5 passed; 0 failed; 0 ignored\ntest result: FAILED. 2 passed; 1 failed;";
        assert_eq!(
            counts(cargo),
            Counts {
                passed: Some(7),
                failed: Some(1)
            }
        );
        assert_eq!(
            counts("Tests:       1 failed, 12 passed, 13 total"),
            Counts {
                passed: Some(12),
                failed: Some(1)
            }
        );
        assert_eq!(
            counts("# pass 4\n# fail 0"),
            Counts {
                passed: Some(4),
                failed: Some(0)
            }
        );
        assert_eq!(
            counts("===== 3 passed, 2 failed in 0.4s ====="),
            Counts {
                passed: Some(3),
                failed: Some(2)
            }
        );
    }

    #[test]
    fn unknown_output_has_no_counts() {
        assert_eq!(counts("ok  \texample.com/x\t0.2s"), Counts::default());
    }
}
