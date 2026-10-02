package skills

import (
	"encoding/json"
	"strings"
	"testing"
)

func TestEmbeddedCommitTourSkillTeachesMediaAndReviewItems(t *testing.T) {
	for _, skill := range BuiltinSkills() {
		if skill.Name != "commit-tour" {
			continue
		}
		_, example, found := strings.Cut(skill.Body, "```json")
		if !found {
			t.Fatal("embedded commit-tour skill lacks its JSON example")
		}
		example, _, _ = strings.Cut(example, "```")
		var tour struct {
			Decisions []json.RawMessage `json:"decisions"`
			Questions []json.RawMessage `json:"questions"`
			Chunks    []struct {
				Media string `json:"media"`
			} `json:"chunks"`
		}
		if err := json.Unmarshal([]byte(example), &tour); err != nil {
			t.Fatalf("embedded example is not usable JSON: %v", err)
		}
		if len(tour.Decisions) == 0 || len(tour.Questions) == 0 {
			t.Fatal("embedded example does not teach the shipped decisions/questions entries")
		}
		for _, chunk := range tour.Chunks {
			if chunk.Media != "" {
				return
			}
		}
		t.Fatal("embedded example does not teach the shipped media entry")
	}
	t.Fatal("embedded commit-tour skill missing")
}
