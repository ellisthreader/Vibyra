//! Model logos for the menu bar item and its rows: Claude's spark and Gemini's star in their
//! own colours, OpenAI's knot as a template image so macOS tints it for light and dark.
//! 36 px RGBA (18 pt at 2x), rendered from the pinned @lobehub/icons-static-svg@1.91.0 marks.
use tauri::image::Image;

const SIZE: u32 = 36;
static CLAUDE: &[u8] = include_bytes!("../icons/agents/claude-36.rgba");
static GEMINI: &[u8] = include_bytes!("../icons/agents/gemini-36.rgba");
static OPENAI: &[u8] = include_bytes!("../icons/agents/openai-36.rgba");

/// The logo and whether macOS should tint it (template), for an agent id.
pub fn logo(agent: &str) -> Option<(Image<'static>, bool)> {
    let (bytes, template) = match agent {
        "claude" => (CLAUDE, false),
        "gemini" => (GEMINI, false),
        "codex" => (OPENAI, true),
        _ => return None,
    };
    Some((Image::new(bytes, SIZE, SIZE), template))
}
