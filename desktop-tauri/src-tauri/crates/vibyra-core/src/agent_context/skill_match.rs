//! Which skills apply to a prompt, and how one is named afterwards.
//!
//! Split from the assembly next door because it is the half with a rule in it.
//! Trigger matching is word overlap deliberately biased toward expanding: a
//! false positive costs one procedure in the prompt, a false negative costs
//! the skill entirely. That bias is only tunable if the matches are visible,
//! which is why `AppliedSkill` exists at all rather than the list being
//! computed and dropped.

use crate::skills::Skill;

/// One skill that shaped a turn, named at the version that ran.
///
/// The version matters: `SkillHistory` keeps every earlier text and rolls back
/// by writing a new version, so an audit line naming v3 stays readable after
/// v4 exists.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct AppliedSkill {
    pub id: String,
    pub name: String,
    pub version: i64,
}

impl AppliedSkill {
    pub fn of(skill: &Skill) -> Self {
        Self {
            id: skill.id.clone(),
            name: skill.name.clone(),
            version: skill.version,
        }
    }
}

/// Whether a skill's trigger looks like it matches this request.
///
/// Word overlap, not a model call: deciding which skill applies must not cost
/// a round trip, and a false positive costs one expanded procedure while a
/// false negative costs the skill. Erring toward expanding is the cheaper
/// mistake, so the bar is one shared significant word.
pub fn applies(skill: &Skill, prompt: &str) -> bool {
    let trigger = crate::agent_memory::reflect::significant_words(&skill.trigger);
    if trigger.is_empty() {
        return false;
    }
    let asked = crate::agent_memory::reflect::significant_words(prompt);
    trigger.iter().any(|word| asked.contains(word))
}
