import assert from "node:assert/strict";
import test from "node:test";
import { terminalTeamProviderOutputSchema } from "./terminalTeamProviderSchema.mjs";

test("provider Team schema is constrained to the selected topology", () => {
  const schema = terminalTeamProviderOutputSchema(["builder", "reviewer"]);
  const assignments = schema.properties.assignments;

  assert.equal(assignments.minItems, 2);
  assert.equal(assignments.maxItems, 2);
  assert.deepEqual(
    assignments.items.properties.role_key.enum,
    ["builder", "reviewer"]
  );
});
