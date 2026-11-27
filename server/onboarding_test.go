package server

import (
	"context"
	"encoding/json"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"path/filepath"
	"strings"
	"testing"

	"shelley.exe.dev/llm/predictable"
	"shelley.exe.dev/models"
	"shelley.exe.dev/providerauth"
)

func TestOnboardingSavesOpenRouterKeyAndRefreshesProviders(t *testing.T) {
	storePath := filepath.Join(t.TempDir(), "shelley", "providers.json")
	database, cleanup := setupTestDB(t)
	defer cleanup()
	mgr, err := models.NewManager(&models.Config{
		Models: []models.Built{{
			ID:       "predictable",
			Provider: models.ProviderBuiltIn,
			Service:  predictable.NewService(),
		}},
		Logger: slog.Default(),
	})
	if err != nil {
		t.Fatal(err)
	}
	s := &Server{
		db:                database,
		llmManager:        mgr,
		logger:            slog.Default(),
		defaultModel:      "predictable",
		providerStorePath: storePath,
		refreshBuiltModels: func(context.Context) ([]models.Built, error) {
			config, loadErr := providerauth.Load(storePath)
			if loadErr != nil {
				return nil, loadErr
			}
			return append([]models.Built{{
				ID:       "predictable",
				Provider: models.ProviderBuiltIn,
				Service:  predictable.NewService(),
			}}, providerauth.BuiltModels(config, nil)...), nil
		},
	}

	getRecorder := httptest.NewRecorder()
	s.handleGetOnboarding(getRecorder, httptest.NewRequest(http.MethodGet, "/api/onboarding", nil))
	if getRecorder.Code != http.StatusOK {
		t.Fatalf("GET status = %d, body = %q", getRecorder.Code, getRecorder.Body.String())
	}
	var initial onboardingResponse
	if err := json.NewDecoder(getRecorder.Body).Decode(&initial); err != nil {
		t.Fatal(err)
	}
	if initial.Complete || initial.HasReadyModels {
		t.Fatalf("initial response = %#v", initial)
	}

	postRequest := httptest.NewRequest(http.MethodPost, "/api/onboarding", strings.NewReader(`{"openrouter_api_key":"secret-openrouter-key"}`))
	postRecorder := httptest.NewRecorder()
	s.handleCompleteOnboarding(postRecorder, postRequest)
	if postRecorder.Code != http.StatusOK {
		t.Fatalf("POST status = %d, body = %q", postRecorder.Code, postRecorder.Body.String())
	}
	if strings.Contains(postRecorder.Body.String(), "secret-openrouter-key") {
		t.Fatal("POST response leaked provider key")
	}
	var completed onboardingResponse
	if err := json.NewDecoder(postRecorder.Body).Decode(&completed); err != nil {
		t.Fatal(err)
	}
	if !completed.Complete || !completed.HasReadyModels || !mgr.HasModel("openrouter/auto") {
		t.Fatalf("completed response = %#v", completed)
	}
	if s.defaultModel != "openrouter/auto" {
		t.Fatalf("default model = %q", s.defaultModel)
	}
}

func TestOnboardingPredictableOnlySkipsSetup(t *testing.T) {
	mgr, err := models.NewManager(&models.Config{
		Models: []models.Built{{
			ID:       "predictable",
			Provider: models.ProviderBuiltIn,
			Service:  predictable.NewService(),
		}},
		Logger: slog.Default(),
	})
	if err != nil {
		t.Fatal(err)
	}
	s := &Server{
		llmManager:      mgr,
		logger:          slog.Default(),
		predictableOnly: true,
		defaultModel:    "predictable",
	}

	request := httptest.NewRequest(http.MethodGet, "/api/onboarding", nil)
	recorder := httptest.NewRecorder()
	s.handleGetOnboarding(recorder, request)
	if recorder.Code != http.StatusOK {
		t.Fatalf("status = %d, body = %q", recorder.Code, recorder.Body.String())
	}
	var response onboardingResponse
	if err := json.NewDecoder(recorder.Body).Decode(&response); err != nil {
		t.Fatal(err)
	}
	if !response.Complete || len(response.Models) != 1 {
		t.Fatalf("response = %#v", response)
	}
}
