//! Running a framework's own CLI when no package script does it cleanly, and
//! the other kinds of Node project a preview can show.

use std::collections::{HashMap, HashSet};
use std::path::Path;

use super::desktop_detect::exec_args;
use super::package_profile::{append_runtime_args, is_wrapper, safe_script};
use super::types::ProcessSpec;

/// The CLI a framework is started with, the arguments that make it serve, and
/// config files whose presence says the project really uses it.
fn recipe(
    framework: &str,
) -> Option<(
    &'static str,
    &'static [&'static str],
    &'static [&'static str],
)> {
    Some(match framework {
        "Vite" => (
            "vite",
            &[],
            &[
                "vite.config.ts",
                "vite.config.js",
                "vite.config.mjs",
                "vite.config.mts",
            ],
        ),
        "SvelteKit" => ("vite", &["dev"], &["svelte.config.js", "svelte.config.ts"]),
        "Next.js" => (
            "next",
            &["dev"],
            &["next.config.js", "next.config.mjs", "next.config.ts"],
        ),
        "Nuxt" => ("nuxt", &["dev"], &["nuxt.config.ts", "nuxt.config.js"]),
        "Astro" => (
            "astro",
            &["dev"],
            &["astro.config.mjs", "astro.config.ts", "astro.config.js"],
        ),
        "Angular" => ("ng", &["serve"], &["angular.json"]),
        "Gatsby" => (
            "gatsby",
            &["develop"],
            &["gatsby-config.js", "gatsby-config.ts"],
        ),
        "Expo web" => (
            "expo",
            &["start"],
            &["app.json", "app.config.js", "app.config.ts"],
        ),
        "Vue CLI" => (
            "vue-cli-service",
            &["serve"],
            &["vue.config.js", "package.json"],
        ),
        "React" => ("react-scripts", &["start"], &["package.json"]),
        _ => return None,
    })
}

/// The executable under `node_modules/.bin` that must exist for a run.
pub(crate) fn framework_tool(framework: &str) -> &'static str {
    recipe(framework).map_or("", |(tool, _, _)| tool)
}

/// The framework's own dev server, run directly. Used when the package's
/// scripts wrap it (a process manager, a build step with pipes, a mislabelled
/// name) but its config shows the project is really that framework.
pub(crate) fn direct_spec(manager: &str, framework: &str, app: &Path) -> Option<ProcessSpec> {
    let (tool, serve, configs) = recipe(framework)?;
    if !configs.iter().any(|file| app.join(file).is_file()) {
        return None;
    }
    let (program, mut args) = exec_args(manager, &[tool]);
    args.extend(serve.iter().map(|arg| (*arg).to_owned()));
    let mut env = Vec::new();
    append_runtime_args(framework, &serve.join(" "), &mut args, &mut env);
    Some(ProcessSpec {
        label: framework.into(),
        program: program.into(),
        args,
        env,
        cwd: app.to_owned(),
    })
}

const SERVER_DEPS: [&str; 7] = [
    "express",
    "fastify",
    "koa",
    "hono",
    "@nestjs/core",
    "restify",
    "@hapi/hapi",
];

/// A Node HTTP server: its start script is run with `PORT` and `HOST` set,
/// which nearly every server framework honours.
pub(crate) fn node_server<'a>(
    deps: &HashSet<String>,
    scripts: &'a HashMap<String, String>,
) -> Option<&'a str> {
    if !SERVER_DEPS.iter().any(|dep| deps.contains(*dep)) {
        return None;
    }
    ["dev", "start", "serve"].into_iter().find(|name| {
        scripts
            .get(*name)
            .is_some_and(|body| safe_script(body) && !is_wrapper(body))
    })
}
