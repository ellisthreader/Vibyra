import test from "node:test";
import assert from "node:assert/strict";
import { createProject, initialProjects, projectReducer, makeChange, checkProject, validateConfig, encode } from "./projectState.js";

test("sample edits stay isolated and discard restores the last kept revision", () => {
    let projects = initialProjects();
    const original = projects[1].files["app.json"];
    const edit = makeChange(projects[0], "Add a reading habit");
    projects = projectReducer(projects, { type: "file", id: "orbit", name: "app.json", value: edit.value });
    projects = projectReducer(projects, { type: "keep", id: "orbit" });
    const dark = makeChange(projects[0], "Switch to dark theme");
    projects = projectReducer(projects, { type: "file", id: "orbit", name: "app.json", value: dark.value });
    projects = projectReducer(projects, { type: "discard", id: "orbit" });
    assert.equal(projects[0].files["app.json"], edit.value);
    assert.equal(projects[0].commits, 1);
    assert.equal(projects[1].files["app.json"], original);
});
test("malformed configuration cannot reach the preview", () => {
    for (const text of ["{", "null", "[]", '{"title":""}', '{"title":"x","theme":"dark","summary":false,"habits":[null]}']) assert.ok(validateConfig(text));
    const project = createProject("test", "Test");
    const config = JSON.parse(project.files["app.json"]);
    assert.equal(validateConfig(encode(config)), null);
    for (const patch of [{ habits: [] }, { theme: "unknown" }, { summary: "true" }, { title: "x".repeat(81) }]) assert.ok(validateConfig(encode({ ...config, ...patch })));
});
test("unsupported instructions return guidance and never manufacture code", () => {
    const project = createProject("test", "Test");
    assert.equal(makeChange(project, "Deploy this to production").value, undefined);
    assert.equal(makeChange(project, 'Add a habit called "A little movement"').value, undefined);
    assert.equal(JSON.parse(makeChange(project, 'Rename the title to "Hello world"').value).title, "Hello world");
    assert.equal(JSON.parse(makeChange(project, "Add a weekly summary").value).summary, true);
});
test("terminal checks detect actual bad sample data and reset clears edits", () => {
    const project = createProject("test", "Test");
    assert.equal(checkProject(project).split("PASS").length - 1, 3);
    const config = JSON.parse(project.files["app.json"]);
    config.habits.push({ ...config.habits[0] });
    project.files["app.json"] = encode(config);
    project.files["README.md"] = "";
    assert.match(checkProject(project), /FAIL  Habit names are unique/);
    assert.match(checkProject(project), /FAIL  Project readme has content/);
    assert.deepEqual(projectReducer([project], { type: "reset" }), initialProjects());
});
