use super::PlanLimits;

impl PlanLimits {
    /// Cached paid access ends for new admissions only. Existing terminals and
    /// saved projects are untouched. A malformed dated entitlement fails to
    /// Free; an undated entitlement and legacy unenforced payload stay open.
    pub fn effective_at(&self, now_millis: i64) -> Self {
        if self.enforced
            && self.paid_until.as_ref().is_some_and(|until| {
                chrono::DateTime::parse_from_rfc3339(until)
                    .map_or(true, |date| date.timestamp_millis() <= now_millis)
            })
        {
            Self::signed_out()
        } else {
            self.clone()
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    fn paid(trial: bool, until: Option<&str>) -> PlanLimits {
        PlanLimits {
            enforced: true,
            plan: "pro_v2".into(),
            trial,
            paid_until: until.map(str::to_owned),
            ..PlanLimits::default()
        }
    }
    #[test]
    fn cached_trial_and_subscription_expire_at_the_boundary_without_mutation() {
        let boundary = 1_800_000_000_000;
        let date = chrono::DateTime::from_timestamp_millis(boundary)
            .unwrap()
            .to_rfc3339();
        for trial in [true, false] {
            let original = paid(trial, Some(&date));
            assert!(original
                .effective_at(boundary - 1)
                .admit_terminal(20)
                .is_ok());
            let expired = original.effective_at(boundary);
            assert_eq!(expired, PlanLimits::signed_out());
            assert!(expired.admit_terminal(1).is_ok());
            assert!(expired.admit_terminal(2).is_err());
            assert!(expired.admit_project(0).is_ok());
            assert!(expired.admit_project(1).is_err());
            assert!(expired.admit_preview().is_err());
            assert!(expired.admit_review().is_err());
            assert!(expired.admit_safe_worktrees().is_err());
            assert!(original.preview && original.max_terminals.is_none());
        }
    }
    #[test]
    fn invalid_dated_entitlement_fails_closed_but_undated_and_legacy_are_preserved() {
        assert_eq!(
            paid(false, Some("bad-date")).effective_at(0),
            PlanLimits::signed_out()
        );
        let undated = paid(false, None);
        assert_eq!(undated.effective_at(i64::MAX), undated);
        let legacy = PlanLimits {
            enforced: false,
            ..paid(true, Some("bad-date"))
        };
        assert_eq!(legacy.effective_at(0), legacy);
    }
}
