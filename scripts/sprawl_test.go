// Package scripts holds only this test: `go test ./...` (CI and test_ci.sh)
// runs check-no-sprawl.sh, so the sprawl check needs no workflow step.
package scripts

import (
	"os/exec"
	"testing"
)

func TestNoRunOutputSprawl(t *testing.T) {
	out, err := exec.Command("sh", "check-no-sprawl.sh").CombinedOutput()
	if err != nil {
		t.Fatalf("check-no-sprawl.sh failed:\n%s", out)
	}
}
