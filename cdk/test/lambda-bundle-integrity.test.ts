/**
 * Regression test for the 2026-07-21 outage: a refactor moved shared Lambda
 * code (cdk/lambda/lib/shared/*.js) out from under the individual function
 * folders, but the CDK `lambda.Code.fromAsset(...)` scope for several
 * functions (adminFunction, admin/instructor/student authorizers) was never
 * widened to include it. The functions deployed fine, but every cold start
 * threw `Cannot find module '../lib/shared/...'` — which for the
 * authorizers meant API Gateway returned 500 for every protected request.
 *
 * This test packages each Node.js Lambda exactly the way `cdk deploy` does
 * (copy only the `fromAsset` directory), then requires the configured
 * `handler` from *that copy*. If a handler's require graph reaches outside
 * its bundled asset directory, Node's module resolution fails here exactly
 * like it fails in the real Lambda runtime — without needing `cdk synth`,
 * AWS credentials, or Docker.
 */
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import {
  discoverLambdaTargets,
  collectBareRequireSpecifiers,
  createStubNodeModules,
  splitHandler,
} from "./helpers/lambdaBundleDiscovery";

const cdkRoot = path.join(__dirname, "..");
const targets = discoverLambdaTargets(cdkRoot);

let stubNodeModules: string;

beforeAll(() => {
  const bareSpecifiers = collectBareRequireSpecifiers(path.join(cdkRoot, "lambda"));
  const stubRoot = fs.mkdtempSync(path.join(os.tmpdir(), "lambda-stub-deps-"));
  stubNodeModules = path.join(stubRoot, "node_modules");
  createStubNodeModules(stubNodeModules, bareSpecifiers);
});

test("discovered at least one Node.js Lambda function to check", () => {
  expect(targets.length).toBeGreaterThan(0);
});

describe.each(targets)(
  "$label ($sourceFile)",
  ({ assetPath, handler }) => {
    test(`handler "${handler}" loads from its bundled asset "${assetPath}"`, () => {
      const assetAbs = path.join(cdkRoot, assetPath);
      expect(fs.existsSync(assetAbs)).toBe(true);

      const sandbox = fs.mkdtempSync(path.join(os.tmpdir(), "lambda-asset-"));
      try {
        fs.cpSync(assetAbs, sandbox, { recursive: true });
        fs.cpSync(stubNodeModules, path.join(sandbox, "node_modules"), {
          recursive: true,
        });

        const { modulePath, exportName } = splitHandler(handler);
        const moduleAbsPath = path.join(sandbox, modulePath);

        let loaded: any;
        expect(() => {
          // eslint-disable-next-line @typescript-eslint/no-var-requires
          loaded = require(moduleAbsPath);
        }).not.toThrow();

        expect(typeof loaded[exportName]).toBe("function");
      } finally {
        fs.rmSync(sandbox, { recursive: true, force: true });
      }
    });
  }
);
