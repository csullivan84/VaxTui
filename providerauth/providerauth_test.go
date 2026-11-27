package providerauth

import (
	"os"
	"path/filepath"
	"testing"
)

func TestSaveOpenRouterKeyReplacesStore(t *testing.T) {
	storePath := filepath.Join(t.TempDir(), "shelley", "providers.json")
	if err := Save(storePath, Config{Providers: []Provider{
		{Kind: "retired-kind", AccessToken: "stale-token"},
		{Kind: KindOpenRouter, AccessToken: "old-key"},
	}}); err != nil {
		t.Fatal(err)
	}

	if _, err := SaveOpenRouterKey(storePath, " new-key "); err != nil {
		t.Fatal(err)
	}
	config, err := Load(storePath)
	if err != nil {
		t.Fatal(err)
	}
	if len(config.Providers) != 1 || config.Providers[0].AccessToken != "new-key" {
		t.Fatalf("providers = %#v", config.Providers)
	}
	if got := PreferredModel(config); got != "openrouter/auto" {
		t.Fatalf("preferred model = %q", got)
	}
	built := BuiltModels(config, nil)
	if len(built) != 1 || built[0].ID != "openrouter/auto" {
		t.Fatalf("built models = %#v", built)
	}
	if info, err := os.Stat(storePath); err != nil {
		t.Fatal(err)
	} else if info.Mode().Perm() != 0o600 {
		t.Fatalf("provider store mode = %o", info.Mode().Perm())
	}
}

func TestStaleStoredKindsAreIgnored(t *testing.T) {
	config := Config{Providers: []Provider{{Kind: "retired-kind", AccessToken: "token"}}}
	if got := PreferredModel(config); got != "" {
		t.Fatalf("preferred model = %q", got)
	}
	if got := len(BuiltModels(config, nil)); got != 0 {
		t.Fatalf("built models = %d, want 0", got)
	}
}

func TestLoadMissingStore(t *testing.T) {
	config, err := Load(filepath.Join(t.TempDir(), "providers.json"))
	if err != nil {
		t.Fatal(err)
	}
	if config.Version != 1 || len(config.Providers) != 0 {
		t.Fatalf("config = %#v", config)
	}
}
