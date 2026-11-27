// Package providerauth stores the OpenRouter API key the user typed into
// Shelley in ~/.config/shelley/providers.json. It never reads another tool's
// credential files.
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
	KindOpenRouter    = "openrouter-api-key"
	openRouterModel   = "openrouter/auto"
	openRouterBaseURL = "https://openrouter.ai/api/v1"
)

// Provider is one stored provider credential. AccessToken is persisted only
// in Shelley's private provider store and is never returned by the API.
type Provider struct {
	Kind        string `json:"kind"`
	AccessToken string `json:"access_token"`
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

// SaveOpenRouterKey stores a manually entered OpenRouter API key as the
// store's only entry, replacing whatever was there.
func SaveOpenRouterKey(path, key string) (Config, error) {
	config := Config{Providers: []Provider{{Kind: KindOpenRouter, AccessToken: strings.TrimSpace(key)}}}
	if err := Save(path, config); err != nil {
		return Config{}, err
	}
	return config, nil
}

// BuiltModels creates the OpenRouter model for a stored OpenRouter key.
func BuiltModels(config Config, httpc *http.Client) []models.Built {
	var built []models.Built
	for _, provider := range config.Providers {
		if provider.Kind != KindOpenRouter || provider.AccessToken == "" {
			continue
		}
		service := &oai.Service{
			APIKey:       provider.AccessToken,
			ModelURL:     openRouterBaseURL,
			Model:        oai.Model{ModelName: openRouterModel, SupportsImages: true},
			HTTPC:        httpc,
			ProviderName: "openrouter",
		}
		built = append(built, models.Built{
			ID:          openRouterModel,
			DisplayName: openRouterModel,
			Provider:    models.Provider("openrouter"),
			Source:      "OpenRouter",
			Service:     llm.Service(service),
			APIType:     models.APITypeOpenAIChat,
			BaseURL:     openRouterBaseURL,
		})
	}
	return built
}

// PreferredModel returns the model to default to for a stored OpenRouter
// key, or "" when none is stored.
func PreferredModel(config Config) string {
	for _, provider := range config.Providers {
		if provider.Kind == KindOpenRouter && provider.AccessToken != "" {
			return openRouterModel
		}
	}
	return ""
}
