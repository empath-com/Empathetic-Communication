/**
 * Discovers every Node.js `lambda.Function` defined under `cdk/lib/**` and
 * extracts its `{ code: fromAsset(...), handler: "..." }` pair by locating
 * the balanced `new lambda.Function( ... )` call and regex-matching inside
 * it — no CDK synth required, so this stays fast and needs no AWS context.
 */
import * as fs from "fs";
import * as path from "path";
import { builtinModules } from "module";

export interface LambdaTarget {
  /** File that defines the Lambda, relative to cdk/. */
  sourceFile: string;
  /** CDK construct id / variable context, for readable test names. */
  label: string;
  /** Value passed to lambda.Code.fromAsset(...), relative to cdk/. */
  assetPath: string;
  /** Value passed to `handler:`, e.g. "adminFunction/adminFunction.handler". */
  handler: string;
}

function walk(dir: string, extension: string): string[] {
  const results: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      results.push(...walk(full, extension));
    } else if (entry.name.endsWith(extension)) {
      results.push(full);
    }
  }
  return results;
}

function findMatchingParen(text: string, openIndex: number): number {
  let depth = 0;
  for (let i = openIndex; i < text.length; i++) {
    if (text[i] === "(") depth++;
    else if (text[i] === ")") {
      depth--;
      if (depth === 0) return i;
    }
  }
  throw new Error(`Unmatched parenthesis starting at index ${openIndex}`);
}

/**
 * Scans every .ts file under `<cdkRoot>/lib` for `new lambda.Function(...)`
 * calls and returns the Node.js ones that bundle code via `fromAsset`.
 */
export function discoverLambdaTargets(cdkRoot: string): LambdaTarget[] {
  const libDir = path.join(cdkRoot, "lib");
  const targets: LambdaTarget[] = [];

  for (const file of walk(libDir, ".ts")) {
    const text = fs.readFileSync(file, "utf8");
    const callRegex = /new\s+lambda\.Function\s*\(/g;
    let match: RegExpExecArray | null;
    while ((match = callRegex.exec(text))) {
      const openParen = text.indexOf("(", match.index);
      const closeParen = findMatchingParen(text, openParen);
      const block = text.slice(openParen, closeParen + 1);

      const runtimeMatch = block.match(/runtime:\s*lambda\.Runtime\.(\w+)/);
      const assetMatch = block.match(
        /code:\s*lambda\.Code\.fromAsset\(\s*["']([^"']+)["']/
      );
      const handlerMatch = block.match(/handler:\s*["']([^"']+)["']/);

      if (!runtimeMatch || !assetMatch || !handlerMatch) continue;
      if (!runtimeMatch[1].startsWith("NODEJS")) continue;

      // Best-effort readable label: the `scope, "<id>",` argument right after the open paren.
      const idMatch = block.match(/^\(\s*scope\s*,\s*[`"']([^`"']+)[`"']/);

      targets.push({
        sourceFile: path.relative(cdkRoot, file),
        label: idMatch ? idMatch[1] : handlerMatch[1],
        assetPath: assetMatch[1],
        handler: handlerMatch[1],
      });
    }
  }
  return targets;
}

/**
 * Collects every bare (non-relative, non-builtin) `require("...")` specifier
 * used anywhere under `<cdkRoot>/lambda`. These are packages the real Lambda
 * runtime/layers provide but that aren't installed locally — we stub them so
 * the smoke-require below only fails on the thing we actually care about:
 * relative requires that escape the bundled asset directory.
 */
export function collectBareRequireSpecifiers(lambdaDir: string): Set<string> {
  const builtins = new Set(builtinModules);
  const specifiers = new Set<string>();
  const requireRegex = /require\(\s*["']([^"']+)["']\s*\)/g;

  for (const file of walk(lambdaDir, ".js")) {
    const text = fs.readFileSync(file, "utf8");
    let match: RegExpExecArray | null;
    while ((match = requireRegex.exec(text))) {
      const spec = match[1];
      if (spec.startsWith(".") || spec.startsWith("/")) continue;
      const pkgName = spec.startsWith("@")
        ? spec.split("/").slice(0, 2).join("/")
        : spec.split("/")[0];
      if (builtins.has(pkgName)) continue;
      specifiers.add(pkgName);
    }
  }
  return specifiers;
}

/**
 * Writes a throwaway node_modules tree where every package resolves to a
 * Proxy that accepts any property access / call / `new` — enough for
 * top-level `require(...)` + client construction to succeed without the
 * real dependency (which normally comes from a Lambda layer or the AWS
 * Node.js runtime image, neither of which exist in this dev environment).
 */
export function createStubNodeModules(
  nodeModulesDir: string,
  packageNames: Iterable<string>
): void {
  fs.mkdirSync(nodeModulesDir, { recursive: true });
  const stubBody = `
    function stub() { return proxy; }
    const proxy = new Proxy(stub, {
      get(_target, prop) {
        if (prop === "__esModule") return true;
        if (prop === "then") return undefined; // don't look thenable
        return stub;
      },
      construct() { return proxy; },
      apply() { return proxy; },
    });
    module.exports = proxy;
  `;
  for (const pkgName of packageNames) {
    const pkgDir = path.join(nodeModulesDir, pkgName);
    fs.mkdirSync(pkgDir, { recursive: true });
    fs.writeFileSync(
      path.join(pkgDir, "package.json"),
      JSON.stringify({ name: pkgName, version: "0.0.0-stub", main: "index.js" })
    );
    fs.writeFileSync(path.join(pkgDir, "index.js"), stubBody);
  }
}

/** Splits an AWS Lambda handler string into its module path and export name. */
export function splitHandler(handler: string): { modulePath: string; exportName: string } {
  const lastDot = handler.lastIndexOf(".");
  if (lastDot === -1) {
    throw new Error(`Handler "${handler}" is missing a ".exportName" suffix`);
  }
  return {
    modulePath: handler.slice(0, lastDot),
    exportName: handler.slice(lastDot + 1),
  };
}
