// Package providerauth stores model provider credentials that belong to
// Shelley itself in ~/.config/shelley/providers.json. It never reads another
// tool's credential files.
package providerauth

import (
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"os"
	"path/filepath"
	"strings"

	"shelley.exe.dev/llm"
	"shelley.exe.dev/llm/oai"
	"shelley.exe.dev/models"
)

const (
	// KindOpenAICodex is a ChatGPT OAuth session for the Codex Responses API.
	KindOpenAICodex = "openai-codex"
	KindOpenRouter  = "openrouter-api-key"
	openRouterModel = "openrouter/auto"
	codexModel      = "gpt-5.6-luna"
)

// Provider is one stored provider credential. Secret fields are persisted
// only in Shelley's private provider store and are never returned by the API.
type Provider struct {
	Kind         string `json:"kind"`
	Label        string `json:"label"`
	AccessToken  string `json:"access_token"`
	RefreshToken string `json:"refresh_token,omitempty"`
	AccountID    string `json:"account_id,omitempty"`
	BaseURL      string `json:"base_url,omitempty"`
	ModelID      string `json:"model_id,omitempty"`
	ModelName    string `json:"model_name,omitempty"`
}

type Config struct {
	Version   int        `json:"version"`
	Providers []Provider `json:"providers"`
}

func DefaultPath() (string, error) {
	home, err := os.UserHomeDir()
	if err != nil {
		return "", err
	}
	return filepath.Join(home, ".config", "shelley", "providers.json"), nil
}

func Load(path string) (Config, error) {
	if path == "" {
		var err error
		path, err = DefaultPath()
		if err != nil {
			return Config{}, err
		}
	}
	data, err := os.ReadFile(path)
	if errors.Is(err, os.ErrNotExist) {
		return Config{Version: 1}, nil
	}
	if err != nil {
		return Config{}, err
	}
	var config Config
	if err := json.Unmarshal(data, &config); err != nil {
		return Config{}, fmt.Errorf("parse provider credentials: %w", err)
	}
	if config.Version == 0 {
		config.Version = 1
	}
	return config, nil
}

func Save(path string, config Config) error {
	if path == "" {
		var err error
		path, err = DefaultPath()
		if err != nil {
			return err
		}
	}
	config.Version = 1
	data, err := json.MarshalIndent(config, "", "  ")
	if err != nil {
		return err
	}
	if err := os.MkdirAll(filepath.Dir(path), 0o700); err != nil {
		return err
	}
	tmp, err := os.CreateTemp(filepath.Dir(path), ".providers-*.json")
	if err != nil {
		return err
	}
	tmpName := tmp.Name()
	defer os.Remove(tmpName)
	if err := tmp.Chmod(0o600); err != nil {
		tmp.Close()
		return err
	}
	if _, err := tmp.Write(data); err != nil {
		tmp.Close()
		return err
	}
	if err := tmp.Sync(); err != nil {
		tmp.Close()
		return err
	}
	if err := tmp.Close(); err != nil {
		return err
	}
	return os.Rename(tmpName, path)
}

// SaveOpenRouterKey stores a manually entered OpenRouter API key,
// replacing any previous one.
func SaveOpenRouterKey(path, key string) (Config, error) {
	config, err := Load(path)
	if err != nil {
		return Config{}, err
	}
	provider := Provider{
		Kind:        KindOpenRouter,
		Label:       "OpenRouter",
		AccessToken: strings.TrimSpace(key),
		BaseURL:     "https://openrouter.ai/api/v1",
		ModelID:     openRouterModel,
		ModelName:   openRouterModel,
	}
	providers := config.Providers[:0]
	for _, existing := range config.Providers {
		if existing.Kind != KindOpenRouter {
			providers = append(providers, existing)
		}
	}
	config.Providers = append(providers, provider)
	if err := Save(path, config); err != nil {
		return Config{}, err
	}
	return config, nil
}

// BuiltModels creates OpenAI-compatible models for stored providers that do
// not map to Shelley's first-party catalog. Stored OpenAI Codex sessions are
// materialized through modelsources by the command package instead.
func BuiltModels(config Config, httpc *http.Client) []models.Built {
	var built []models.Built
	for _, provider := range config.Providers {
		if provider.Kind != KindOpenRouter || provider.AccessToken == "" {
			continue
		}
		service := &oai.Service{
			APIKey:       provider.AccessToken,
			ModelURL:     strings.TrimRight(provider.BaseURL, "/"),
			Model:        oai.Model{ModelName: provider.ModelName, SupportsImages: true},
			HTTPC:        httpc,
			ProviderName: "openrouter",
		}
		built = append(built, models.Built{
			ID:          provider.ModelID,
			DisplayName: provider.ModelID,
			Provider:    models.Provider("openrouter"),
			Source:      provider.Label,
			Service:     llm.Service(service),
			APIType:     models.APITypeOpenAIChat,
			BaseURL:     provider.BaseURL,
		})
	}
	return built
}

// PreferredModel returns the model to default to for the stored providers,
// or "" when none is stored.
func PreferredModel(config Config) string {
	for _, provider := range config.Providers {
		if provider.Kind == KindOpenRouter {
			return provider.ModelID
		}
	}
	for _, provider := range config.Providers {
		if provider.Kind == KindOpenAICodex {
			return codexModel
		}
	}
	return ""
}
