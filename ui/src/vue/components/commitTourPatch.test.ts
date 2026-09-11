import assert from "node:assert/strict";
import { analyzeTourPatch } from "./commitTourPatch";

const unicode = analyzeTourPatch(
  'diff --git "a/caf\\303\\251.txt" "b/caf\\303\\251.txt"\n' +
    '--- "a/caf\\303\\251.txt"\n+++ "b/caf\\303\\251.txt"\n@@ -1 +1 @@\n-old\n+new\n',
);
assert.equal(unicode.fileLabel, "café.txt");
assert.deepEqual(unicode.displayRange, [1, 1]);

const rename = analyzeTourPatch(
  "diff --git a/old.txt b/new.txt\nsimilarity index 100%\nrename from old.txt\nrename to new.txt\n",
);
assert.equal(rename.fileLabel, "new.txt");
assert.equal(rename.isHunk, false);

const binary = analyzeTourPatch(
  "diff --git a/image.png b/image.png\nBinary files a/image.png and b/image.png differ\n",
);
assert.equal(binary.isBinary, true);
assert.equal(binary.fileLabel, "image.png");

const modeOnly = analyzeTourPatch(
  "diff --git a/run.sh b/run.sh\nold mode 100644\nnew mode 100755\n",
);
assert.equal(modeOnly.fileLabel, "run.sh");
assert.equal(modeOnly.isHunk, false);

const deletion = analyzeTourPatch(
  "diff --git a/gone.txt b/gone.txt\n--- a/gone.txt\n+++ /dev/null\n@@ -10,2 +10,0 @@\n-a\n-b\n",
);
assert.equal(deletion.deletedFile, true);
assert.deepEqual(deletion.displayRange, [10, 11]);

console.log("commitTourPatch: 5 passed");
