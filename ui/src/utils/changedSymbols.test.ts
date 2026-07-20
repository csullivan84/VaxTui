import { extractChangedSymbols } from "./changedSymbols";

const diff = `--- a/sample
+++ b/sample
-func (s *Server) oldRoute() {}
+func (s *Server) newRoute() {}
+export async function loadModels() {}
+class ModelHealth {}
+interface HealthEntry {}
+const STORAGE_KEY = "health"
 unchanged()
+func (s *Server) newRoute() {}`;

const actual = extractChangedSymbols(diff);
const expected = ["oldRoute", "newRoute", "loadModels", "ModelHealth", "HealthEntry", "STORAGE_KEY"];
if (JSON.stringify(actual) !== JSON.stringify(expected)) {
  throw new Error(`changed-symbol extraction: ${JSON.stringify(actual)}`);
}

if (extractChangedSymbols("+++ b/file\n--- a/file\n+ordinary call()\n-context").length !== 0) {
  throw new Error("diff headers and non-declarations must be ignored");
}

console.log("changedSymbols tests passed");
