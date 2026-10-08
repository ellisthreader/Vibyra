use super::*;

impl<P: Port, E: Env> Worker<P, E> {
    pub fn new(port: P, env: E, board: Board, clock: Box<dyn Fn() -> u64 + Send>) -> Self {
        let now = clock();
        Worker {
            port,
            env,
            board,
            sched: Scheduler::new(now),
            clock,
            session: None,
            registered: false,
            cloud: None,
            phone: None,
            phone_at: None,
            ack: None,
            notified: HashSet::new(),
            absent_since: HashMap::new(),
            seen: HashSet::new(),
            prune_at: 0,
            roots: Vec::new(),
            login: LoginTrack::new(now),
            access: Access::Unknown,
            refused: HashSet::new(),
            codex_blocked: false,
        }
    }
    pub(super) fn reset_session(&mut self, session: Option<String>, now: u64) {
        *self.board.lock() = Default::default();
        self.session = session;
        self.registered = false;
        self.cloud = None;
        (self.phone, self.phone_at) = (None, None);
        self.access = Access::Unknown;
        self.sched.resume();
        self.sched.forget_all();
        self.login = LoginTrack::new(now);
        self.notified.clear();
        self.absent_since.clear();
        self.seen.clear();
        self.refused.clear();
        self.codex_blocked = false;
        self.roots.clear();
        // A pending quit flush is acknowledged after this session reaches idle or
        // a closed gate, never before its first scheduled work has run.
    }
}
