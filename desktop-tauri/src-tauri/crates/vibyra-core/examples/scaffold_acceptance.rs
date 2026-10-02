//! Runs one exact catalogue plan in a caller-created disposable acceptance root.
use std::sync::atomic::AtomicBool;
use vibyra_core::scaffold::{git_init, prepare, run_step, ScaffoldPlan, StepOutcome};
fn main() -> Result<(), Box<dyn std::error::Error>> {
    let input = std::env::args().nth(1).ok_or("plan file required")?;
    if input == "--tools" {
        let names = [
            "node", "npm", "npx", "cargo", "python3", "composer", "rails", "go", "flutter",
        ];
        println!(
            "{}",
            serde_json::to_string(&vibyra_core::scaffold::installed_tools(
                &names.map(String::from)
            ))?
        );
        return Ok(());
    }
    let plan: ScaffoldPlan = serde_json::from_slice(&std::fs::read(input)?)?;
    let root = std::env::var("VIBYRA_SCAFFOLD_ACCEPTANCE_ROOT")?;
    let parent = std::path::Path::new(&plan.dir)
        .parent()
        .ok_or("parent required")?;
    if parent.canonicalize()? != std::path::Path::new(&root).canonicalize()?
        || !root.contains("vibyra-scaffold-acceptance-")
    {
        return Err("Only a disposable scaffold acceptance directory is allowed".into());
    }
    let steps = prepare(&plan)?;
    for (index, step) in steps.iter().enumerate() {
        println!("STEP {} {:?}", step.program, step.args);
        let result = run_step(step, &|line| println!("{line}"), &AtomicBool::new(false))?;
        if result == StepOutcome::Finished(0) && index == 0 && !plan.create_dir {
            vibyra_core::scaffold::apply_seeds(&plan)?;
        }
        if result != StepOutcome::Finished(0) {
            return Err(format!("{}: {result:?}", step.label).into());
        }
    }
    if plan.git_init && !git_init(&plan.dir) {
        return Err("git init failed".into());
    }
    if !std::path::Path::new(&plan.dir).is_dir() {
        return Err("Creator reported success without creating its project".into());
    }
    println!("PASS scaffold {}", plan.dir);
    Ok(())
}
