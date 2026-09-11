package db

import (
	"context"
	"testing"

	"shelley.exe.dev/db/generated"
)

func TestSubagentUsageWithMigratedSchemaAndUnrelatedMessages(t *testing.T) {
	database := setupTestDB(t)
	ctx := context.Background()
	for _, id := range []string{"root", "child", "grandchild", "unrelated"} {
		err := database.WithTx(ctx, func(q *generated.Queries) error {
			_, err := q.CreateConversation(ctx, generated.CreateConversationParams{
				ConversationID: id, UserInitiated: true, ConversationOptions: "{}",
			})
			return err
		})
		if err != nil {
			t.Fatal(err)
		}
	}
	if err := database.pool.Tx(ctx, func(ctx context.Context, tx *Tx) error {
		_, err := tx.Conn().ExecContext(ctx,
			"UPDATE conversations SET parent_conversation_id = CASE conversation_id WHEN 'child' THEN 'root' WHEN 'grandchild' THEN 'child' END WHERE conversation_id IN ('child', 'grandchild')")
		return err
	}); err != nil {
		t.Fatal(err)
	}
	for _, id := range []string{"child", "grandchild", "unrelated"} {
		if _, err := database.CreateMessage(ctx, CreateMessageParams{
			ConversationID: id,
			Type:           MessageTypeAgent,
			UsageData:      map[string]any{"input_tokens": 10, "output_tokens": 2, "cost_usd": 0.1},
			ModelName:      "fixture-model",
			LLMAPIURL:      "https://fixture.invalid",
		}); err != nil {
			t.Fatal(err)
		}
	}
	rows, err := database.GetSubagentUsage(ctx, "root")
	if err != nil {
		t.Fatal(err)
	}
	if len(rows) != 1 || rows[0].LlmCalls != 2 || rows[0].InputTokens != 20 || rows[0].OutputTokens != 4 {
		t.Fatalf("descendant totals include wrong rows: %#v", rows)
	}
}
