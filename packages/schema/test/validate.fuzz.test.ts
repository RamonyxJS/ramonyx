import assert from "node:assert/strict";
import { test } from "node:test";
import fc from "fast-check";
import type { StandardIssue, StandardResult, StandardSchema } from "../src/index.ts";
import { validate } from "../src/index.ts";

const pathSegmentArb = fc.oneof(fc.string(), fc.integer(), fc.record({ key: fc.string() }));
const issueArb = fc.record({
  message: fc.string(),
  path: fc.option(fc.array(pathSegmentArb, { maxLength: 5 }), { nil: undefined }),
});

test("fuzz: validate menormalkan issues apa pun tanpa melempar", async () => {
  await fc.assert(
    fc.asyncProperty(
      fc.array(issueArb, { maxLength: 10 }),
      fc.anything(),
      async (issues, value) => {
        const schema: StandardSchema<unknown, unknown> = {
          "~standard": {
            version: 1,
            vendor: "fuzz",
            validate: (): StandardResult<unknown> => ({
              issues: issues as readonly StandardIssue[],
            }),
          },
        };

        const result = await validate(schema, value);
        assert.equal(result.ok, false);
        if (!result.ok) {
          assert.equal(result.issues.length, issues.length);
          for (const issue of result.issues) {
            assert.equal(typeof issue.message, "string");
            assert.ok(Array.isArray(issue.path));
            for (const segment of issue.path) {
              assert.ok(["string", "number", "symbol", "undefined"].includes(typeof segment));
            }
          }
        }
      },
    ),
    { numRuns: 100 },
  );
});

test("fuzz: nilai sukses diteruskan apa adanya", async () => {
  await fc.assert(
    fc.asyncProperty(fc.anything(), async (value) => {
      const schema: StandardSchema<unknown, unknown> = {
        "~standard": {
          version: 1,
          vendor: "fuzz",
          validate: (): StandardResult<unknown> => ({ value }),
        },
      };

      const result = await validate(schema, null);
      assert.equal(result.ok, true);
      if (result.ok) {
        assert.equal(result.value, value);
      }
    }),
    { numRuns: 100 },
  );
});
