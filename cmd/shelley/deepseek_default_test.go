package main

import (
	"context"
	"io"
	"log/slog"
	"net/http"
	"testing"

	"shelley.exe.dev/modelsources"
)

func TestDeepSeekKeySelectsFlashWhenDefaultUnset(t *testing.T) {
	t.Setenv("DEEPSEEK_API_KEY", "test-key")
	t.Setenv("ANTHROPIC_API_KEY", "")
	t.Setenv("OPENAI_API_KEY", "")
	t.Setenv("GEMINI_API_KEY", "")
	t.Setenv("FIREWORKS_API_KEY", "")
	original := discoverLLMIntegrations
	discoverLLMIntegrations = func(context.Context, *http.Client, *slog.Logger) modelsources.LLMIntegrationDiscoveryResult {
		return modelsources.LLMIntegrationDiscoveryResult{}
	}
	t.Cleanup(func() { discoverLLMIntegrations = original })

	logger := slog.New(slog.NewTextHandler(io.Discard, nil))
	got, _ := buildLLMModelSources(context.Background(), GlobalConfig{DisableGateway: true}, shelleyConfig{}, logger)
	if got != "deepseek-v4-flash" {
		t.Fatalf("default model = %q, want deepseek-v4-flash", got)
	}
}

func TestConfiguredDefaultBeatsDeepSeekProfile(t *testing.T) {
	t.Setenv("DEEPSEEK_API_KEY", "test-key")
	logger := slog.New(slog.NewTextHandler(io.Discard, nil))
	got, _ := buildLLMModelSources(context.Background(), GlobalConfig{
		DefaultModel:          "predictable",
		DisableGateway:        true,
		DisableLLMIntegration: true,
	}, shelleyConfig{}, logger)
	if got != "predictable" {
		t.Fatalf("default model = %q, want predictable", got)
	}
}
