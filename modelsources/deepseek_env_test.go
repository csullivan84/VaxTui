package modelsources_test

import (
  "net/http"
  "testing"
  "shelley.exe.dev/models"
  "shelley.exe.dev/modelsources"
)

func TestEnvDeepSeekBuildsNativeModels(t *testing.T) {
  bs := modelsources.Build(models.All(), []modelsources.Source{
    modelsources.EnvDeepSeek("sk-test"),
    modelsources.Predictable(),
  }, &http.Client{}, nil)
  var flash, pro bool
  for _, b := range bs {
    if b.ID == "deepseek-v4-flash" {
      flash = true
      if b.Source != "$DEEPSEEK_API_KEY" {
        t.Errorf("flash source = %q", b.Source)
      }
      if b.Provider != models.ProviderDeepSeek {
        t.Errorf("flash provider = %q", b.Provider)
      }
    }
    if b.ID == "deepseek-v4-pro" {
      pro = true
    }
  }
  if !flash || !pro {
    t.Fatalf("flash=%v pro=%v among %d models", flash, pro, len(bs))
  }
}
