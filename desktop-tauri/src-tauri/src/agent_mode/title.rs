//! Naming a chat from the first thing said in it.
//!
//! A chat nobody renamed still has to be findable a week later, and "New chat
//! (7)" is not a name. The first sentence of the first prompt is what a person
//! would have called it anyway, so it is used until they say otherwise — and
//! once they rename it, this never runs again.

/// A short title from the opening prompt.
pub fn from_prompt(prompt: &str) -> String {
    let first = prompt
        .lines()
        .map(str::trim)
        // Skip a leading @mention: "@Rae have a look at the parser" is a chat
        // about the parser, not a chat called "@Rae".
        .find(|line| !line.is_empty() && !line.starts_with('@'))
        .unwrap_or("New chat");
    let sentence = first
        .split_inclusive(['.', '?', '!'])
        .next()
        .unwrap_or(first)
        .trim_end_matches(['.', ' '])
        .trim();
    let clipped: String = sentence.chars().take(60).collect();
    if clipped.trim().is_empty() {
        "New chat".into()
    } else if sentence.chars().count() > 60 {
        format!("{}…", clipped.trim_end())
    } else {
        clipped
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn takes_the_first_sentence_of_the_first_real_line() {
        assert_eq!(
            from_prompt("Fix the parser. Then ship it."),
            "Fix the parser"
        );
        assert_eq!(
            from_prompt("\n\n  Write the release notes  "),
            "Write the release notes"
        );
        assert_eq!(
            from_prompt("Why is the build red?"),
            "Why is the build red?"
        );
    }

    /// A handoff opens with a mention, and the chat is about what follows it.
    #[test]
    fn skips_a_leading_mention() {
        assert_eq!(
            from_prompt("@Rae\nHave a look at the parser"),
            "Have a look at the parser"
        );
    }

    #[test]
    fn a_long_opening_is_clipped_rather_than_wrapped() {
        let title = from_prompt(&"a very long request ".repeat(20));
        assert!(title.chars().count() <= 61, "{title}");
        assert!(title.ends_with('…'));
    }

    #[test]
    fn an_empty_prompt_still_produces_a_name() {
        assert_eq!(from_prompt(""), "New chat");
        assert_eq!(from_prompt("   \n  "), "New chat");
    }
}
