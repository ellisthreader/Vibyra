use serde::{Deserialize, Serialize};
use std::collections::VecDeque;

const MAX_AGE: u64 = 24 * 60 * 60;
const MAX_PENDING: usize = 32;

/// IDs and an opaque native account scope only. No task text, token or email is stored by macOS.
#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct NotificationRoute {
    pub id: String,
    pub owner: String,
    pub agent_id: String,
    pub run_id: String,
    pub issued_at: u64,
}

impl NotificationRoute {
    pub fn valid(&self, now: u64) -> bool {
        [&self.id, &self.agent_id, &self.run_id]
            .iter()
            .all(|id| uuid::Uuid::parse_str(id).is_ok())
            && !self.owner.is_empty()
            && self.owner.len() <= 80
            && self
                .owner
                .bytes()
                .all(|c| c.is_ascii_alphanumeric() || c == b'_')
            && self.issued_at <= now + 30
            && now.saturating_sub(self.issued_at) <= MAX_AGE
    }
}

#[derive(Default)]
pub struct ActivationQueue {
    pending: VecDeque<NotificationRoute>,
    seen: VecDeque<(String, u64)>,
}

impl ActivationQueue {
    pub fn push(&mut self, route: NotificationRoute, now: u64) -> bool {
        self.seen
            .retain(|(_, at)| now.saturating_sub(*at) <= MAX_AGE);
        if !route.valid(now) || self.seen.iter().any(|(id, _)| id == &route.id) {
            return false;
        }
        self.seen.push_back((route.id.clone(), now));
        while self.seen.len() > 256 {
            self.seen.pop_front();
        }
        self.pending.push_back(route);
        while self.pending.len() > MAX_PENDING {
            self.pending.pop_front();
        }
        true
    }

    pub fn drain(&mut self, owner: &str, now: u64) -> Vec<NotificationRoute> {
        self.pending
            .drain(..)
            .filter(|route| route.owner == owner && route.valid(now))
            .collect()
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    fn route(id: u128, owner: &str) -> NotificationRoute {
        NotificationRoute {
            id: uuid::Uuid::from_u128(id).to_string(),
            owner: owner.into(),
            agent_id: uuid::Uuid::from_u128(100).to_string(),
            run_id: uuid::Uuid::from_u128(id + 1000).to_string(),
            issued_at: 100,
        }
    }
    #[test]
    fn actual_callbacks_keep_each_exact_task_and_are_consumed_once() {
        let mut queue = ActivationQueue::default();
        assert!(queue.push(route(1, "owner"), 101));
        assert!(queue.push(route(2, "owner"), 101));
        assert!(!queue.push(route(1, "owner"), 102));
        let got = queue.drain("owner", 102);
        assert_eq!(
            got.iter().map(|r| r.run_id.clone()).collect::<Vec<_>>(),
            vec![route(1, "owner").run_id, route(2, "owner").run_id]
        );
        assert!(queue.drain("owner", 102).is_empty());
    }
    #[test]
    fn account_change_and_expiry_never_open_the_old_task() {
        let mut queue = ActivationQueue::default();
        queue.push(route(1, "old_owner"), 101);
        assert!(queue.drain("new_owner", 102).is_empty());
        queue.push(route(2, "owner"), 101);
        assert!(queue.drain("owner", 100 + MAX_AGE + 1).is_empty());
    }
    #[test]
    fn malformed_future_and_unbounded_callbacks_are_rejected() {
        let mut queue = ActivationQueue::default();
        let mut bad = route(1, "owner");
        bad.run_id = "../../other".into();
        assert!(!queue.push(bad, 101));
        assert!(!queue.push(route(1, "owner"), 1));
        for id in 1..100 {
            queue.push(route(id, "owner"), 101);
        }
        assert_eq!(queue.drain("owner", 101).len(), MAX_PENDING);
    }
}
