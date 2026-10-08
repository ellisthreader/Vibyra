use super::SharedChats;
use vibyra_engine::{Engine, PreviewRunProvider, PreviewStatusProvider};

#[derive(Clone)]
pub(super) struct Providers {
    status: PreviewStatusProvider,
    run: PreviewRunProvider,
}

impl SharedChats {
    /// Gives every conversation, now and later, the host's Preview status and
    /// desktop-app run integration, whether or not a phone ever opened it.
    pub fn set_default_preview_providers(
        &self,
        status: PreviewStatusProvider,
        run: PreviewRunProvider,
    ) {
        let providers = Providers { status, run };
        *self.preview.lock() = Some(providers.clone());
        // Never hold `preview` while taking `slots`: creation takes them the
        // other way round.
        for slot in self.slots.lock().iter() {
            install(&slot.engine, &providers);
        }
    }

    pub(super) fn apply_preview(&self, engine: &Engine) {
        let providers = self.preview.lock().clone();
        if let Some(providers) = providers {
            install(engine, &providers);
        }
    }
}

fn install(engine: &Engine, providers: &Providers) {
    engine.set_preview_status_provider(providers.status.clone());
    engine.set_preview_run_provider(providers.run.clone());
}
