//! The menu bar glyph, drawn in code so there is no asset to keep in step.
//!
//! Black on transparent at 36 px (the menu bar is 18 pt, so this is the 2x
//! image); macOS treats it as a template and tints it for light, dark and
//! selected states itself. An empty ring is idle, a ring with a dot is working,
//! and a solid disc with an exclamation mark cut out of it needs you.

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Glyph {
    Idle,
    Working,
    Attention,
}

pub const SIZE: u32 = 36;
const SAMPLES: u32 = 4;

/// Whether a point (in pixels from the top-left) is ink for this glyph.
fn ink(glyph: Glyph, x: f32, y: f32) -> bool {
    let c = SIZE as f32 / 2.0;
    let (dx, dy) = (x - c, y - c);
    let r = (dx * dx + dy * dy).sqrt();
    let ring = (11.5..=14.5).contains(&r);
    match glyph {
        Glyph::Idle => ring,
        Glyph::Working => ring || r <= 6.0,
        Glyph::Attention => r <= 14.5 && !exclamation(dx, dy),
    }
}

/// The cut-out: a rounded bar above a dot, centred.
fn exclamation(dx: f32, dy: f32) -> bool {
    let bar = dx.abs() <= 1.9 && (-8.5..=2.5).contains(&dy);
    let cap = (dx * dx + (dy + 8.5) * (dy + 8.5)).sqrt() <= 1.9;
    let dot = (dx * dx + (dy - 7.0) * (dy - 7.0)).sqrt() <= 2.2;
    bar || cap || dot
}

/// RGBA pixels and the square size, antialiased by supersampling.
pub fn draw(glyph: Glyph) -> (Vec<u8>, u32) {
    let mut rgba = Vec::with_capacity((SIZE * SIZE * 4) as usize);
    let step = 1.0 / SAMPLES as f32;
    for py in 0..SIZE {
        for px in 0..SIZE {
            let mut hits = 0u32;
            for sy in 0..SAMPLES {
                for sx in 0..SAMPLES {
                    let x = px as f32 + (sx as f32 + 0.5) * step;
                    let y = py as f32 + (sy as f32 + 0.5) * step;
                    hits += u32::from(ink(glyph, x, y));
                }
            }
            let alpha = (hits * 255 / (SAMPLES * SAMPLES)) as u8;
            rgba.extend_from_slice(&[0, 0, 0, alpha]);
        }
    }
    (rgba, SIZE)
}
